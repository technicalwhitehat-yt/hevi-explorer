/* ═══════════════════════════════════════════════════════════════════════════
   AeroGrab v1.0  —  Gesture-Controlled P2P File Transfer
   by Technical White Hat (TWH)
   TWH Eco System Technology — Hevi Explorer
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

(function AeroGrab() {

  // ── Constants ──────────────────────────────────────────────────────────────
  const CHUNK_SIZE       = 512 * 1024;       // 512 KB per WebRTC chunk (auto-clamped to SCTP max)
  const BUFFER_HIGH_WATER = 8 * 1024 * 1024;  // 8 MB in-flight — fast yet RAM-friendly on phones
  const BUFFER_LOW_WATER  = 4 * 1024 * 1024;  // resume earlier so the pipe never goes dry
  const FOLDER_MAX_BYTES = 1024 * 1024 * 1024; // 1 GB
  const FOLDER_MAX_FILES = 20;

  // ── State ──────────────────────────────────────────────────────────────────
  let _enabled           = false;
  let _socket            = null;
  let _sessionId         = null;          // active AeroGrab session
  let _myRole            = null;          // 'sender' | 'receiver' | null
  let _peerConn          = null;          // RTCPeerConnection
  let _dataChannel       = null;          // RTCDataChannel
  let _recvBuffer        = [];            // incoming chunks
  let _recvMeta          = null;          // { name, size, type }
  let _recvReceived      = 0;             // bytes received so far
  let _targetSocketId    = null;          // if set, only this device gets WAKE_UP
  let _heartbeatTimer    = null;          // setInterval handle for HEVI_HEARTBEAT
  let _heartbeatVisHooked = false;        // visibilitychange listener attached?
  let _capturedPhotoFile = null;          // photo taken via native <input type="file">
  let _activeOpenFile    = null;          // set by Hevi Explorer when a file is opened
  let _wakePayload       = null;          // sender's metadata received via WAKE_UP_CAMERAS
  let _recognizer        = null;          // MediaPipe Tasks Vision GestureRecognizer
  let _camStream         = null;
  let _rafId             = null;
  let _processingHands   = false;
  let _frameCount        = 0;
  let _detectCount       = 0;
  let _lastGestureAt     = 0;
  let _lastGesture       = null;
  let _candidateGesture  = null;
  let _candidateStreak   = 0;
  let _neutralStreak     = 0;
  let _lastVideoTs       = -1;
  let _lastHandSeenAt    = 0;     // ms — used by adaptive-fps idle tier
  let _transferActive    = false;
  let _transferStartedAt = 0;
  let _lastSenderUiAt    = 0;
  let _videoTrack        = null;     // for pause/resume during transfer

  // ML thresholds — Tasks Vision returns labelled gestures with confidence
  // scores. We accept ONLY two gestures, and only above a strict threshold.
  // Per-gesture confidence floors. Closed_Fist routinely scores 0.75–0.90 in
  // MediaPipe (esp. with motion / partial occlusion), so a flat 0.92 floor
  // basically blocked it. Open_Palm is easy to detect reliably so it stays high.
  const ML_MIN_CONFIDENCE_FIST = 0.72;
  const ML_MIN_CONFIDENCE_PALM = 0.85;
  const FIRE_FRAME_COUNT   = 8;           // hold ~0.65s @ 12fps  (was 14)
  const NEUTRAL_FRAMES_BEFORE_RETRIGGER = 6;
  const GESTURE_COOLDOWN_MS = 3000;
  const NEUTRAL_ARM_FRAMES = 4;           // need this many neutral frames before any new fire (was 6)
  const MIN_HAND_BBOX      = 0.18;        // hand must occupy >=18% of frame on its longer axis (was 0.22)
  // After a WAKE_UP arrives, force the receiver to actively re-arm: the camera
  // must first see "no hand" or sustained neutral before any OPEN_PALM is
  // accepted. Prevents auto-receive when a relaxed hand is already in frame.
  const WAKE_REARM_NEUTRAL_FRAMES = 10;
  let _wakeArmed             = false;     // becomes true only after re-arm rule is met
  let _wakeRearmNeutralCount = 0;
  const TASKS_VISION_VERSION = '0.10.14';
  const TASKS_VISION_BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/vision_bundle.mjs`;
  const TASKS_VISION_WASM   = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
  const GESTURE_MODEL_URL   = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
  let _sawNeutralSinceHandAppeared = false;

  // Expose the active-file hook so app.js can set it
  window.aeroGrabSetOpenFile = (fileMeta) => { _activeOpenFile = fileMeta; };

  // ── DOM helpers ────────────────────────────────────────────────────────────
  const $  = id => document.getElementById(id);
  const qs = s  => document.querySelector(s);

  // ── Initialise Socket.io connection ────────────────────────────────────────
  // ── Device Identity (persisted in localStorage) ───────────────────────────
  function getOrCreateDeviceId() {
    let id = localStorage.getItem('ag_device_id');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('ag_device_id', id); }
    return id;
  }
  function getDeviceName() {
    const saved = localStorage.getItem('ag_device_name');
    if (saved) return saved;
    const ua = navigator.userAgent;
    if (/android/i.test(ua))   return 'Android Device';
    if (/iphone|ipad/i.test(ua)) return 'iPhone/iPad';
    if (/mac/i.test(ua))       return 'Mac';
    if (/win/i.test(ua))       return 'Windows PC';
    return 'Hevi Device';
  }
  function getDeviceAvatar() {
    const saved = localStorage.getItem('ag_device_avatar');
    if (saved) return saved;
    const ua = navigator.userAgent;
    if (/android/i.test(ua))     return '📱';
    if (/iphone|ipad/i.test(ua)) return '📱';
    if (/mac/i.test(ua))         return '💻';
    if (/win/i.test(ua))         return '🖥';
    return '📡';
  }

  // ── Network announce + heartbeat ──────────────────────────────────────────
  function announceToNetwork() {
    if (!_socket) return;
    _socket.emit('HEVI_ANNOUNCE', {
      deviceId:   getOrCreateDeviceId(),
      deviceName: getDeviceName(),
      avatar:     getDeviceAvatar(),
    });
  }
  function startHeartbeat() {
    clearInterval(_heartbeatTimer);
    // Adaptive: 15s when tab is visible & in-use, 60s when hidden/background.
    // Saves wake-ups → less CPU/radio chatter → less battery drain.
    const tick = () => {
      if (_socket && _socket.connected) _socket.emit('HEVI_HEARTBEAT');
    };
    const schedule = () => {
      clearInterval(_heartbeatTimer);
      const gap = (typeof document !== 'undefined' && document.hidden) ? 60000 : 15000;
      _heartbeatTimer = setInterval(tick, gap);
    };
    schedule();
    if (typeof document !== 'undefined' && !_heartbeatVisHooked) {
      _heartbeatVisHooked = true;
      document.addEventListener('visibilitychange', schedule);
    }
  }
  function stopHeartbeat() {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }

  // ── Socket.io connection ───────────────────────────────────────────────────
  function initSocket() {
    if (_socket) return;
    // Use default transport negotiation (polling → websocket upgrade)
    // so it works on Replit proxy, LAN, and all network configs
    _socket = io(window.location.origin, {
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    _socket.on('connect', () => {
      console.log('[AeroGrab] socket connected:', _socket.id);
      announceToNetwork();
      startHeartbeat();
    });

    _socket.on('connect_error', (err) => {
      console.warn('[AeroGrab] socket connect_error:', err.message);
    });

    _socket.on('reconnect', () => {
      console.log('[AeroGrab] socket reconnected, re-announcing...');
      announceToNetwork();
    });

    // ── Hevi Network: peer list updated
    _socket.on('HEVI_PEERS_UPDATE', ({ devices, total }) => {
      if (typeof window.onHeviPeersUpdate === 'function') {
        window.onHeviPeersUpdate(devices, total, _socket.id);
      }
    });

    // ── Receiver: someone grabbed a file on another device
    _socket.on('WAKE_UP_CAMERAS', ({ sessionId, senderId, senderName, metadata }) => {
      if (_myRole === 'sender') return;
      _wakePayload = { sessionId, senderId, metadata };
      // Force the receiver to deliberately re-show their open palm. Reset
      // re-arm state so a hand already in frame can't accidentally fire.
      _wakeArmed             = false;
      _wakeRearmNeutralCount = 0;
      _candidateGesture      = null;
      _candidateStreak       = 0;
      _neutralStreak         = 0;
      _sawNeutralSinceHandAppeared = false;
      showWakeUpNotification(metadata, senderName);
    });

    // ── Sender: a receiver has confirmed they want the file
    _socket.on('TRANSFER_APPROVED', ({ receiverId, sessionId }) => {
      _sessionId = sessionId;
      _myRole    = 'sender';
      openP2PBridge(receiverId, 'sender');
    });

    // ── Receiver: server confirmed we are the catcher
    _socket.on('YOU_ARE_RECEIVER', ({ senderId, sessionId, metadata }) => {
      _sessionId = sessionId;
      _myRole    = 'receiver';
      _recvMeta  = metadata;
      openP2PBridge(senderId, 'receiver');
      aeroAnim.showReceiverLanding(metadata);
    });

    // ── Someone else caught the file first
    _socket.on('TRANSFER_TAKEN', () => {
      if (_myRole !== 'sender') {
        showToast('File was caught by another device', 'info');
        hideWakeUpNotification();
      }
    });

    // ── Session timed out (no receiver in 60s)
    _socket.on('SESSION_EXPIRED', () => {
      showToast('No one caught it. File is still on your device.', 'warn');
      resetSession();
    });

    // ── Peer cancelled the transfer (relayed via socket as backup)
    _socket.on('TRANSFER_CANCELLED_REMOTE', ({ sessionId } = {}) => {
      // Bulletproof: kill the cancel button + reset whenever the server tells
      // us the other side cancelled. Don't gate on local state — if there's
      // any role/session/cancel button, we want it gone.
      console.log('[AeroGrab] remote cancel received', sessionId, _sessionId);
      _transferActive = false;
      _recvBuffer = []; _recvMeta = null; _recvReceived = 0;
      if (aeroAnim && aeroAnim.hideCancelButton) aeroAnim.hideCancelButton();
      if (aeroAnim && aeroAnim.onCancelled) aeroAnim.onCancelled('Cancelled');
      showToast('Other side cancelled the transfer.', 'warn');
      setTimeout(resetSession, 600);
    });

    // ── Session ended — everyone go to sleep
    _socket.on('SLEEP_CAMERAS', ({ sessionId }) => {
      if (sessionId === _sessionId) resetSession();
      hideWakeUpNotification();
    });

    // ── WebRTC signaling relay
    _socket.on('webrtc_signal', async ({ from, signal }) => {
      if (!_peerConn) return;
      try {
        if (signal.sdp) {
          await _peerConn.setRemoteDescription(new RTCSessionDescription(signal));
          if (signal.type === 'offer') {
            const answer = await _peerConn.createAnswer();
            await _peerConn.setLocalDescription(answer);
            _socket.emit('webrtc_signal', { to: from, signal: _peerConn.localDescription });
          }
        } else if (signal.candidate) {
          await _peerConn.addIceCandidate(new RTCIceCandidate(signal));
        }
      } catch (e) {
        console.warn('[AeroGrab] webrtc_signal error:', e.message);
      }
    });
  }

  // ── Toggle AeroGrab on/off ─────────────────────────────────────────────────
  async function toggleAeroGrab(enable) {
    if (enable === _enabled) return;
    if (enable) {
      // First-time users: show the 3-step tutorial BEFORE we ask for camera
      // permission. This way they understand WHY camera is needed before the
      // browser prompt appears.
      if (!hasSeenTutorial()) {
        const proceed = await showTutorial();
        if (!proceed) return;            // user skipped → don't activate
      }
      _enabled = true;
      showGreenDot(true);
      const ok = await initMediaPipe();
      if (!ok) {
        deactivateAeroGrab();
        return;
      }
      if (_socket) announceToNetwork();
      showToast('AeroGrab active — make a fist to grab, open palm to catch', 'info');
    } else {
      deactivateAeroGrab();
    }
  }

  function showPermissionDialog() {
    const dlg = $('aeroPermDialog');
    if (!dlg) return Promise.resolve(true);
    dlg.classList.remove('hidden');
    return new Promise(resolve => {
      const yes = $('aeroPermEnable');
      const no = $('aeroPermCancel');
      const done = value => {
        dlg.classList.add('hidden');
        if (yes) yes.onclick = null;
        if (no) no.onclick = null;
        resolve(value);
      };
      if (yes) yes.onclick = () => done(true);
      if (no) no.onclick = () => done(false);
    });
  }

  function showCameraMessage(message, type = 'warn') {
    const lbl = $('aeroGestureLbl');
    if (lbl) lbl.textContent = message;
    showToast(message, type);
  }

  async function initMediaPipe() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCameraMessage('Camera not available in this browser', 'error');
      return false;
    }
    if (!window.isSecureContext) {
      showCameraMessage('Camera needs HTTPS or localhost. Open this device on localhost for gestures.', 'error');
      return false;
    }
    if (localStorage.getItem('ag_camera_ok') !== '1') {
      const approved = await showPermissionDialog();
      if (!approved) return false;
    }
    try {
      const videoEl = $('aeroVideoEl');
      const canvas  = $('aeroGestureCanvas');
      if (!videoEl || !canvas) throw new Error('Camera preview missing');
      _camStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          // 256x192 is plenty for hand-landmark detection and ~35% lower
          // ISP/encoder load vs 320x240 — measurably less heating.
          width:     { ideal: 256 },
          height:    { ideal: 192 },
          frameRate: { ideal: 12, max: 15 },
        },
        audio: false,
      });
      _videoTrack = _camStream.getVideoTracks()[0] || null;
      localStorage.setItem('ag_camera_ok', '1');
      videoEl.srcObject = _camStream;
      videoEl.muted = true;
      videoEl.playsInline = true;
      await videoEl.play();

      // ── Load real on-device ML gesture recogniser (MediaPipe Tasks Vision)
      // ~7.5 MB model, downloaded once then served from browser cache.
      showCameraMessage('Loading hand AI model (~7 MB, one-time)…', 'info');
      const vision = await import(TASKS_VISION_BUNDLE);
      const { GestureRecognizer, FilesetResolver } = vision;
      const fileset = await FilesetResolver.forVisionTasks(TASKS_VISION_WASM);
      _recognizer = await GestureRecognizer.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: GESTURE_MODEL_URL, delegate: 'GPU' },
        numHands: 1,
        runningMode: 'VIDEO',
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });

      // Adaptive frame loop — saves battery & heat:
      //  • Mid-transfer: skip ML entirely (camera still on but no GPU work)
      //  • Idle (no candidate, no wake): 5 fps (200 ms)
      //  • Active arming or wake-pending: 15 fps (66 ms)
      let _tickAccum = 0;
      const tick = () => {
        if (!_enabled || !_recognizer || !_camStream || _processingHands) return;
        if (videoEl.readyState < 2) return;
        // Pause inference when tab/screen is hidden — phone in pocket / app
        // backgrounded → zero ML work, big battery save.
        if (typeof document !== 'undefined' && document.hidden) return;
        // Pause inference during transfer — saves significant CPU/GPU and heat.
        if (_transferActive || _myRole) return;
        // Adaptive throttling — three tiers for max battery save:
        //   • Active arming/wake-pending → 12 fps  (~83 ms)
        //   • Hand visible but neutral   → 5 fps   (200 ms)
        //   • Idle (no hand for a while) → 2 fps   (500 ms) — phone barely warms
        const isActive  = _candidateStreak > 0 || _wakePayload || _neutralStreak < NEUTRAL_ARM_FRAMES;
        const isIdle    = !isActive && _frameCount > 30 && (performance.now() - (_lastHandSeenAt || 0)) > 4000;
        const minGap    = isActive ? 83 : (isIdle ? 500 : 200);
        const now = performance.now();
        if (now - _tickAccum < minGap) return;
        _tickAccum = now;
        const ts = now;
        if (ts === _lastVideoTs) return;
        _lastVideoTs = ts;
        _processingHands = true;
        try {
          const result = _recognizer.recognizeForVideo(videoEl, ts);
          processGestureResults(result);
        } catch (e) {
          console.warn('[AeroGrab] recognise error:', e.message);
        } finally {
          _processingHands = false;
        }
      };
      clearInterval(_rafId);
      _rafId = setInterval(tick, 50);   // poll fast, but tick body throttles itself
      showCameraMessage('Hand AI ready — show your hand', 'success');
      return true;
    } catch (e) {
      let msg = `Camera/AI error: ${e.message}`;
      if (e && e.name === 'NotAllowedError') msg = 'Camera permission denied. Allow camera in browser settings.';
      if (e && e.name === 'NotReadableError') msg = 'Camera is busy in another app. Close it and retry.';
      showCameraMessage(msg, 'error');
      return false;
    }
  }

  // Map MediaPipe Tasks Vision gesture labels to our internal vocabulary.
  // Anything else (Pointing_Up, Thumb_Up, Victory, ILoveYou, None) is ignored.
  function mapMlGesture(label) {
    if (label === 'Closed_Fist') return 'FIST';
    if (label === 'Open_Palm')   return 'OPEN_PALM';
    return null;
  }

  function drawGesturePreview(results, lm) {
    const canvas = $('aeroGestureCanvas');
    const videoEl = $('aeroVideoEl');
    if (!canvas || !videoEl) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!lm) return;
    const lines = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
    ctx.save();
    ctx.strokeStyle = '#25f4d0';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#ffffff';
    // Video is CSS-mirrored (selfie view) but Tasks Vision returns raw pixel
    // coords — flip x so landmarks line up with what the user sees.
    const fx = p => (1 - p.x) * w;
    lines.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(fx(lm[a]), lm[a].y * h);
      ctx.lineTo(fx(lm[b]), lm[b].y * h);
      ctx.stroke();
    });
    lm.forEach(p => {
      ctx.beginPath();
      ctx.arc(fx(p), p.y * h, 2.4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function processGestureResults(results) {
    _frameCount += 1;
    const lm = results && results.landmarks && results.landmarks[0];
    if (lm) _lastHandSeenAt = performance.now();
    drawGesturePreview(results, lm);
    const lbl = $('aeroGestureLbl');
    if (!lm) {
      if (lbl) lbl.textContent = `👁 ${_frameCount} | no hand`;
      _candidateGesture = null;
      _candidateStreak = 0;
      _neutralStreak  = 0;     // hand left frame — must rebuild neutral run again
      _sawNeutralSinceHandAppeared = false;
      // Receiver re-arm: a "no hand" state (user lowered their hand after the
      // wake) is the strongest possible arm signal — flip immediately.
      if (_wakePayload && !_wakeArmed) {
        _wakeArmed = true;
      }
      return;
    }
    // Block any gesture firing while we are mid-session (already sender or
    // already receiver). Wake-pending alone does NOT block — the receiver
    // still has to actively show Open_Palm to its own camera.
    if (_myRole) {
      if (lbl) lbl.textContent = `🔒 ${_myRole} mode`;
      _candidateGesture = null;
      _candidateStreak = 0;
      return;
    }
    // Hand-size guard: reject when hand is too small in frame (far away,
    // partial fingers, or random body part misclassified as a hand).
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (let i = 0; i < lm.length; i++) {
      const p = lm[i];
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const handBbox = Math.max(maxX - minX, maxY - minY);
    if (handBbox < MIN_HAND_BBOX) {
      if (lbl) lbl.textContent = `🔍 hand too small ${(handBbox * 100).toFixed(0)}%`;
      _candidateGesture = null;
      _candidateStreak = 0;
      // Tiny detection counts as neutral — we don't reset _neutralStreak.
      return;
    }
    _detectCount += 1;
    const top = (results.gestures && results.gestures[0] && results.gestures[0][0]) || null;
    const rawLabel = top ? top.categoryName : 'None';
    const score    = top ? top.score : 0;
    let gesture = mapMlGesture(rawLabel);
    if (gesture === 'FIST'      && score < ML_MIN_CONFIDENCE_FIST) gesture = null;
    if (gesture === 'OPEN_PALM' && score < ML_MIN_CONFIDENCE_PALM) gesture = null;
    if (lbl) {
      const armed = _candidateGesture === gesture ? _candidateStreak : 0;
      const pct = Math.round(score * 100);
      lbl.textContent = gesture
        ? `${gesture === 'FIST' ? '✊' : '✋'} ${rawLabel} ${pct}% (${armed}/${FIRE_FRAME_COUNT})`
        : `· ${rawLabel || 'neutral'} ${pct}% (n${_neutralStreak}/${NEUTRAL_ARM_FRAMES})`;
    }
    if (!gesture) {
      // Hand visible but not a confident FIST/OPEN_PALM — count as neutral.
      _candidateGesture = null;
      _candidateStreak = 0;
      _neutralStreak += 1;
      _sawNeutralSinceHandAppeared = true;
      // Receiver re-arm: a sustained neutral hand also counts toward arming
      // after a wake — but only if a hand is actively in view (not "no hand").
      if (_wakePayload && !_wakeArmed) {
        _wakeRearmNeutralCount += 1;
        if (_wakeRearmNeutralCount >= WAKE_REARM_NEUTRAL_FRAMES) {
          _wakeArmed = true;
        } else if (lbl) {
          lbl.textContent = `↺ re-arm catch (${_wakeRearmNeutralCount}/${WAKE_REARM_NEUTRAL_FRAMES})`;
        }
      }
      return;
    }
    // Require a fresh neutral run BEFORE every fire, not just the first one.
    // This forces the user to deliberately go: relax → close (or relax → open).
    // A snap from FIST→OPEN or OPEN→FIST without a neutral in between is
    // ignored — major source of false triggers in v3 testing.
    if (_neutralStreak < NEUTRAL_ARM_FRAMES) {
      if (lbl) lbl.textContent = `↺ relax hand first (${_neutralStreak}/${NEUTRAL_ARM_FRAMES})`;
      _candidateGesture = null;
      _candidateStreak = 0;
      return;
    }
    // Receiver guard: after a WAKE_UP, OPEN_PALM cannot fire until the user
    // has actively re-armed (showed sustained neutral / lowered hand). This
    // prevents auto-receive when a hand happens to already be in view.
    if (gesture === 'OPEN_PALM' && _wakePayload && !_wakeArmed) {
      if (lbl) lbl.textContent = `✋ relax hand first to arm catch (${_wakeRearmNeutralCount}/${WAKE_REARM_NEUTRAL_FRAMES})`;
      _candidateGesture = null;
      _candidateStreak = 0;
      return;
    }
    if (_candidateGesture !== gesture) {
      _candidateGesture = gesture;
      _candidateStreak = 1;
      return;
    }
    _candidateStreak += 1;
    if (_candidateStreak < FIRE_FRAME_COUNT) return;
    const now = Date.now();
    if (now - _lastGestureAt < GESTURE_COOLDOWN_MS) return;
    if (_lastGesture === gesture && _neutralStreak < NEUTRAL_FRAMES_BEFORE_RETRIGGER) return;
    _lastGesture = gesture;
    _lastGestureAt = now;
    _neutralStreak = 0;
    onGestureDetected(gesture);
  }

  function onGestureDetected(gesture) {
    if (!_enabled) return;
    if (gesture === 'FIST' && _myRole === null) {
      initiateGrab();
      return;
    }
    if (gesture === 'OPEN_PALM' && _myRole === null) {
      // Receiver-side rule: only catch if a wake notification is currently
      // pending (someone has actually grabbed something). Without a pending
      // wake, an Open_Palm is just a hand wave — do nothing.
      if (!_wakePayload) {
        showToast('Nobody is sending right now. Open palm ignored.', 'info');
        return;
      }
      signalReadyToReceive();
    }
  }

  // ── Native camera capture via <input type="file" accept="image/*;capture=camera"> ──
  // Works on HTTP LAN — no HTTPS or getUserMedia needed. Opens the device's
  // native camera app. Photo is then held as the AeroGrab payload.
  function wireCameraCapture() {
    let inp = document.getElementById('aeroCameraInput');
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'file';
      inp.id   = 'aeroCameraInput';
      inp.setAttribute('accept', 'image/*;capture=camera');
      inp.setAttribute('capture', 'environment');
      inp.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(inp);
    }

    inp.addEventListener('change', () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      _capturedPhotoFile = file;
      inp.value = '';  // reset so same file can be re-selected again

      // Show thumbnail preview where the old video feed used to appear
      let preview = document.getElementById('aeroCapturedPreview');
      if (preview) {
        const url = URL.createObjectURL(file);
        preview.src = url;
        preview.style.display = 'block';
        // Revoke after a while to free memory
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }

      showToast(`📷 Photo ready (${(file.size / 1024).toFixed(0)} KB) — tap a device in Hevi Network to send!`, 'success');
      if (!_enabled) toggleAeroGrab(true);
    });

    // Camera button click → open native camera
    const btn = document.getElementById('aeroCameraBtn');
    if (btn) btn.addEventListener('click', () => inp.click());
  }

  // ── Sender: initiate grab ──────────────────────────────────────────────────
  async function initiateGrab() {
    if (!_socket || _myRole) return;
    const payload = await getAeroGrabPayload();
    if (!payload) {
      showToast('No file to grab. Open or select a file first.', 'warn');
      return;
    }
    _myRole = 'sender';
    const meta = {
      name: payload.name,
      size: payload.size,
      type: payload.type || 'application/octet-stream',
      isFolder: !!payload.isFolder,
    };
    const targetId = _targetSocketId;
    _targetSocketId = null;   // reset after use
    _socket.emit('FILE_GRABBED', { metadata: meta, targetId });
    if (targetId) {
      const targetName = window._heviPeerName && window._heviPeerName(targetId);
      showToast(`Grabbing → ${targetName || 'targeted device'}...`, 'info');
    } else {
      showToast('File grabbed — waiting for a receiver...', 'info');
    }
    aeroAnim.showSenderLaunch(payload);
  }

  // ── Determine what to grab based on Hevi Explorer state ───────────────────
  async function getAeroGrabPayload() {
    if (_capturedPhotoFile) {
      return {
        name: _capturedPhotoFile.name || `aerograb-photo-${Date.now()}.jpg`,
        size: _capturedPhotoFile.size,
        type: _capturedPhotoFile.type || 'image/jpeg',
        fileBlob: _capturedPhotoFile,
      };
    }

    // Priority 1: file currently open in viewer (_activeOpenFile set by app.js)
    if (_activeOpenFile) return _activeOpenFile;

    // Priority 2: selected files in select mode
    const selectedPaths = [...document.querySelectorAll('.file-card.selected, .file-row.selected')]
      .map(el => el.dataset.path).filter(Boolean);
    if (selectedPaths.length > 0) {
      if (selectedPaths.length === 1) {
        const info = await fetchFileMeta(selectedPaths[0]);
        return info;
      }
      // Multiple selected — we'll create a virtual batch
      return { name: `${selectedPaths.length} files`, size: 0, isMulti: true, paths: selectedPaths };
    }

    // Priority 3: folder card highlighted/targeted
    const folderEl = document.querySelector('.file-card.folder-targeted, .file-row.folder-targeted');
    if (folderEl && folderEl.dataset.path) {
      const info = await fetchFileMeta(folderEl.dataset.path);
      if (info) return { ...info, isFolder: true };
    }

    // Priority 4: last opened file (from prefs)
    try {
      const lastPath = localStorage.getItem('ag_last_file');
      if (lastPath) return await fetchFileMeta(lastPath);
    } catch (_) {}

    return null;
  }

  async function fetchFileMeta(filePath) {
    try {
      const r = await fetch(`/api/info?path=${encodeURIComponent(filePath)}`);
      if (!r.ok) return null;
      const d = await r.json();
      return { name: d.name, size: d.size, type: d.mimeType || 'application/octet-stream', path: d.path };
    } catch (_) { return null; }
  }

  // ── Receiver: signal ready to catch ───────────────────────────────────────
  function signalReadyToReceive() {
    if (!_socket || !_wakePayload) return;
    _socket.emit('DROP_HERE', { sessionId: _wakePayload.sessionId });
    hideWakeUpNotification();
  }

  // ── WebRTC P2P Bridge ──────────────────────────────────────────────────────
  function openP2PBridge(peerId, role) {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };
    _peerConn = new RTCPeerConnection(config);

    _peerConn.onicecandidate = ({ candidate }) => {
      if (candidate) _socket.emit('webrtc_signal', { to: peerId, signal: candidate });
    };

    _peerConn.onconnectionstatechange = () => {
      const s = _peerConn.connectionState;
      if (s === 'failed' || s === 'disconnected') {
        showToast('Connection lost. File remains on sender.', 'error');
        resetSession();
      }
    };

    if (role === 'sender') {
      _dataChannel = _peerConn.createDataChannel('aerograb', { ordered: true });
      _dataChannel.binaryType = 'arraybuffer';
      _dataChannel.onopen = () => startFileTransfer();
      _dataChannel.onclose = () => console.log('[AeroGrab] data channel closed');
      // CRITICAL: sender must also listen for messages from receiver, so that
      // a __TRANSFER_CANCEL__ from the receiver actually halts the sender.
      _dataChannel.onmessage = onSenderControlMessage;
    } else {
      _peerConn.ondatachannel = ({ channel }) => {
        _dataChannel = channel;
        _dataChannel.binaryType = 'arraybuffer';
        _dataChannel.onmessage = onChunkReceived;
        _dataChannel.onclose   = () => console.log('[AeroGrab] recv channel closed');
      };
    }

    if (role === 'sender') {
      _peerConn.createOffer()
        .then(offer => _peerConn.setLocalDescription(offer))
        .then(() => _socket.emit('webrtc_signal', { to: peerId, signal: _peerConn.localDescription }))
        .catch(e => console.error('[AeroGrab] offer error:', e));
    }
  }

  // ── File Transfer — Sender side ────────────────────────────────────────────
  async function startFileTransfer() {
    const payload = await getAeroGrabPayload();
    if (!payload) { showToast('Could not find file to send.', 'error'); resetSession(); return; }

    let blob;
    try {
      if (payload.isFolder) {
        blob = await zipFolder(payload);
      } else if (payload.isMulti) {
        blob = await zipMultipleFiles(payload.paths);
      } else if (payload.fileBlob) {
        blob = payload.fileBlob;
      } else {
        const resp = await fetch(`/file?path=${encodeURIComponent(payload.path)}`);
        if (!resp.ok) throw new Error('File fetch failed');
        blob = await resp.blob();
      }
    } catch (e) {
      showToast(`Transfer failed: ${e.message}`, 'error');
      resetSession();
      return;
    }

    streamFileOverBridge(blob, payload.name);
  }

  function streamFileOverBridge(blob, name) {
    const totalSize = blob.size;
    let offset      = 0;
    _transferActive = true;
    _transferStartedAt = Date.now();

    // Reset the sticky cancel-button guard so this fresh transfer can show it.
    if (aeroAnim && aeroAnim.armCancelButton) aeroAnim.armCancelButton();
    // Show cancel button IMMEDIATELY (don't wait for first progress chunk)
    if (aeroAnim && aeroAnim.showCancelButton) aeroAnim.showCancelButton();

    // Power-saver: disable the camera video track while bytes fly. Inference
    // is already paused; turning off the track frees the ISP/encoder pipeline
    // and noticeably reduces device heating during long transfers.
    try { if (_videoTrack) _videoTrack.enabled = false; } catch (_) {}

    // Determine the SAFE max chunk size for this peer connection. Some mobile
    // browsers cap SCTP messages at 64 KB; sending larger fails silently and
    // tanks the transfer. Honour the negotiated limit, capped at 256 KB.
    let chunkSize = CHUNK_SIZE;
    try {
      const sctpMax = _peerConn && _peerConn.sctp && _peerConn.sctp.maxMessageSize;
      if (sctpMax && sctpMax > 0) {
        // Leave 1 KB headroom for SCTP framing overhead
        chunkSize = Math.min(CHUNK_SIZE, Math.max(16 * 1024, sctpMax - 1024));
      }
    } catch (_) {}
    console.log(`[AeroGrab] transfer start: ${(totalSize/1024/1024).toFixed(2)} MB · chunk=${(chunkSize/1024).toFixed(0)} KB · sctpMax=${_peerConn && _peerConn.sctp ? _peerConn.sctp.maxMessageSize : '?'}`);

    // Send metadata header first
    const headerStr = JSON.stringify({ name, size: totalSize, type: blob.type });
    _dataChannel.send(headerStr);

    // Use proper SCTP backpressure: pause sending when buffer fills, resume
    // via the bufferedamountlow event. Way faster than setTimeout polling.
    _dataChannel.bufferedAmountLowThreshold = BUFFER_LOW_WATER;
    _dataChannel.onbufferedamountlow = () => { if (_transferActive) pump(); };

    // Big-read optimisation: read 4 MB at a time from the Blob, then send
    // as many SCTP-sized sub-chunks as possible synchronously. This removes
    // the per-chunk Blob.arrayBuffer() await that was the main bottleneck.
    const SUPER_CHUNK = 4 * 1024 * 1024; // 4 MB read window
    let superBuf      = null;            // ArrayBuffer for current window
    let superBufStart = 0;               // file offset where superBuf begins
    async function pump() {
      while (_transferActive && offset < totalSize) {
        if (!_dataChannel || _dataChannel.readyState !== 'open') return;
        if (_dataChannel.bufferedAmount > BUFFER_HIGH_WATER) return; // wait for low event
        // Refill the super-buffer if we've drained it
        if (!superBuf || offset >= superBufStart + superBuf.byteLength) {
          const sliceEnd = Math.min(offset + SUPER_CHUNK, totalSize);
          try {
            superBuf      = await blob.slice(offset, sliceEnd).arrayBuffer();
            superBufStart = offset;
          } catch (e) {
            console.warn('[AeroGrab] read error:', e.message);
            return;
          }
          if (!_transferActive || !_dataChannel || _dataChannel.readyState !== 'open') return;
        }
        try {
          const end       = Math.min(offset + chunkSize, superBufStart + superBuf.byteLength, totalSize);
          const subOffset = offset - superBufStart;
          const subEnd    = end    - superBufStart;
          const buf       = superBuf.slice(subOffset, subEnd);
          _dataChannel.send(buf);
          offset += buf.byteLength;
          // Throttle progress UI to ~10 fps — enough for smooth perception,
          // way less layout thrash on phones during multi-GB transfers.
          const now = performance.now();
          if (now - _lastSenderUiAt > 100) {
            _lastSenderUiAt = now;
            const pct = Math.round((offset / totalSize) * 100);
            aeroAnim.updateSenderProgress(pct);
          }
        } catch (e) {
          console.warn('[AeroGrab] send error:', e.message);
          return;
        }
      }
      if (offset >= totalSize) finishSenderTransfer();
    }

    function finishSenderTransfer() {
      try { _dataChannel.send('__TRANSFER_DONE__'); } catch (_) {}
      aeroAnim.updateSenderProgress(100);
      const drainAndClose = () => {
        if (_dataChannel && _dataChannel.bufferedAmount > 0) {
          setTimeout(drainAndClose, 80);
          return;
        }
        const elapsed = (Date.now() - _transferStartedAt) / 1000;
        const mbps = ((totalSize / (1024 * 1024)) / Math.max(elapsed, 0.01)).toFixed(1);
        showToast(`File sent (${mbps} MB/s)`, 'success');
        if (_socket && _sessionId) _socket.emit('SESSION_END', { sessionId: _sessionId });
        aeroAnim.onSenderComplete();
        _transferActive = false;
        setTimeout(resetSession, 800);
      };
      drainAndClose();
    }

    pump();
  }

  // ── Sender-side control message handler (receiver → sender notifications) ──
  function onSenderControlMessage(event) {
    const data = event.data;
    if (typeof data !== 'string') return;
    if (data === '__TRANSFER_CANCEL__') {
      // Receiver pressed Cancel mid-transfer.
      _transferActive = false;
      showToast('Receiver cancelled the transfer.', 'warn');
      if (aeroAnim && aeroAnim.onCancelled) aeroAnim.onCancelled('Receiver cancelled');
      if (_socket && _sessionId) _socket.emit('SESSION_END', { sessionId: _sessionId });
      setTimeout(resetSession, 600);
    }
  }

  // ── File Transfer — Receiver side ──────────────────────────────────────────
  function onChunkReceived(event) {
    const data = event.data;
    if (typeof data === 'string') {
      if (data === '__TRANSFER_DONE__') {
        finaliseReceivedFile();
        return;
      }
      if (data === '__TRANSFER_CANCEL__') {
        showToast('Sender cancelled the transfer.', 'warn');
        _recvBuffer = []; _recvMeta = null; _recvReceived = 0;
        _transferActive = false;
        if (aeroAnim && aeroAnim.onCancelled) aeroAnim.onCancelled('Sender cancelled');
        if (_socket && _sessionId) _socket.emit('SESSION_END', { sessionId: _sessionId });
        setTimeout(resetSession, 600);
        return;
      }
      // JSON header with metadata
      try {
        _recvMeta     = JSON.parse(data);
        _recvBuffer   = [];
        _recvReceived = 0;
        _transferActive = true;
        // Reset the sticky cancel-button guard for the new incoming transfer.
        if (aeroAnim && aeroAnim.armCancelButton) aeroAnim.armCancelButton();
        // Show cancel button on receiver IMMEDIATELY when transfer starts
        if (aeroAnim && aeroAnim.showCancelButton) aeroAnim.showCancelButton();
        // Power-saver: pause camera track on receiver too while bytes arrive.
        try { if (_videoTrack) _videoTrack.enabled = false; } catch (_) {}
      } catch (_) {}
      return;
    }
    // Binary chunk
    _recvBuffer.push(data);
    _recvReceived += data.byteLength;
    if (_recvMeta && _recvMeta.size > 0) {
      const pct = (_recvReceived / _recvMeta.size) * 100;
      aeroAnim.updateReceiverProgress(pct);
      // Auto-finalise once all bytes are in, even if the DONE marker was
      // dropped because the sender tore down the channel too fast.
      if (_recvReceived >= _recvMeta.size) {
        setTimeout(() => {
          if (_recvMeta && _recvBuffer.length) finaliseReceivedFile();
        }, 250);
      }
    }
  }

  function finaliseReceivedFile() {
    if (!_recvMeta || !_recvBuffer.length) return;
    const meta = _recvMeta;
    const chunks = _recvBuffer;
    _recvBuffer = [];
    _recvMeta = null;
    const blob = new Blob(chunks, { type: meta.type || 'application/octet-stream' });

    // Stream the blob to THIS device's own Hevi server, which writes it into
    // ROOT_DIR/HeviExplorer/<name>. Then open it inside Hevi Explorer's own
    // viewer (image / video / audio / pdf / archive / text) — no popup, no
    // new tab. This solves both the popup-block problem and the "new tab
    // doesn't have Hevi UI" problem in one shot.
    saveAndOpenInHevi(blob, meta);

    if (_socket && _sessionId) _socket.emit('SESSION_END', { sessionId: _sessionId });
    resetSession();
  }

  async function saveAndOpenInHevi(blob, meta) {
    const fileName = meta.name || `aerograb-${Date.now()}`;
    const mimeType = meta.type || 'application/octet-stream';
    let savedItem  = null;
    try {
      const qs = `?name=${encodeURIComponent(fileName)}&type=${encodeURIComponent(mimeType)}`;
      const resp = await fetch('/api/aerograb/save' + qs, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: blob,
      });
      if (resp.ok) {
        const json = await resp.json().catch(() => null);
        if (json && json.item) savedItem = json.item;
      }
    } catch (e) {
      console.warn('[AeroGrab] save to HeviExplorer failed:', e && e.message);
    }

    if (savedItem && typeof window.openFile === 'function') {
      // Saved to disk + open inside Hevi Explorer using its native viewer.
      showToast(`Saved to HeviExplorer · ${fileName}`, 'success');
      recordReceiveHistory(savedItem);
      try { window.openFile(savedItem); } catch (e) { console.warn('[AeroGrab] openFile error:', e.message); }
      // Animation: success card without any button.
      aeroAnim.onReceiverComplete(meta, null);
      return;
    }

    // ── Fallback path (server save failed or openFile missing) ──────────────
    // Behave like the old flow: trigger a browser download + try to auto-open.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); }, 1000);
    let opened = false;
    try { const w = window.open(url, '_blank', 'noopener'); if (w) opened = true; } catch (_) {}
    if (!opened) {
      try {
        const oa = document.createElement('a');
        oa.href = url; oa.target = '_blank'; oa.rel = 'noopener';
        document.body.appendChild(oa); oa.click();
        setTimeout(() => { oa.remove(); }, 1000);
        opened = true;
      } catch (_) {}
    }
    showToast(`Received: ${fileName}`, 'success');
    aeroAnim.onReceiverComplete(meta, opened ? null : url);
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 60000);
  }

  // ── Folder zip using JSZip ─────────────────────────────────────────────────
  async function zipFolder(payload) {
    const resp = await fetch(`/api/list?path=${encodeURIComponent(payload.path)}`);
    if (!resp.ok) throw new Error('Cannot read folder');
    const files = await resp.json();
    const allFiles = files.filter(f => f.type === 'file');
    if (allFiles.length === 0)          throw new Error('AeroGrab: Cannot transfer an empty folder');
    if (payload.size > FOLDER_MAX_BYTES) throw new Error('AeroGrab Limit: Folder exceeds 1GB maximum');
    if (allFiles.length > FOLDER_MAX_FILES) throw new Error(`AeroGrab Limit: Folder contains more than ${FOLDER_MAX_FILES} files`);

    const zip = new JSZip();
    for (const f of allFiles) {
      const fr = await fetch(`/file?path=${encodeURIComponent(f.path)}`);
      const ab = await fr.arrayBuffer();
      zip.file(f.name, ab);
    }
    return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }

  async function zipMultipleFiles(paths) {
    const zip = new JSZip();
    for (const p of paths) {
      const name = p.split('/').pop();
      const fr   = await fetch(`/file?path=${encodeURIComponent(p)}`);
      const ab   = await fr.arrayBuffer();
      zip.file(name, ab);
    }
    return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }

  // ── Wake-up notification for receivers ────────────────────────────────────
  function showWakeUpNotification(metadata, senderName) {
    const panel  = $('aeroWakePanel');
    const label  = $('aeroWakeFileName');
    const device = $('aeroWakeSender');
    if (!panel) return;
    if (label)  label.textContent  = metadata.name || 'a file';
    if (device) device.textContent = senderName ? `From: ${senderName}` : '';
    panel.classList.remove('hidden');
    panel.classList.add('ag-wake-enter');
  }

  function hideWakeUpNotification() {
    const panel = $('aeroWakePanel');
    if (panel) panel.classList.add('hidden');
    _wakePayload = null;
    _wakeArmed = false;
    _wakeRearmNeutralCount = 0;
  }

  // ── Green dot + camera overlay ────────────────────────────────────────────
  function showGreenDot(visible) {
    const dot = $('aeroGreenDot');
    if (dot) dot.classList.toggle('hidden', !visible);
    const overlay = $('agCamOverlay');
    if (overlay) overlay.classList.toggle('hidden', !visible);
  }

  // ── Reset session state ────────────────────────────────────────────────────
  function resetSession() {
    _sessionId   = null;
    _myRole      = null;
    _wakePayload = null;
    _recvBuffer  = [];
    _recvMeta    = null;
    _recvReceived = 0;
    _transferActive = false;
    // Re-enable the camera track so the next gesture session can see hands.
    try { if (_videoTrack) _videoTrack.enabled = true; } catch (_) {}
    if (_peerConn) { try { _peerConn.close(); } catch (_) {} _peerConn = null; }
    _dataChannel = null;
    _lastGesture = null;
    _candidateGesture = null;
    _candidateStreak = 0;
    _neutralStreak = NEUTRAL_FRAMES_BEFORE_RETRIGGER;
  }

  // ── Cancel an in-progress transfer (sender or receiver) ───────────────────
  function cancelTransfer() {
    if (!_transferActive && !_myRole && !_dataChannel) return;
    // Stop pumping IMMEDIATELY so we don't keep stuffing the buffer.
    _transferActive = false;
    try {
      if (_dataChannel && _dataChannel.readyState === 'open') {
        _dataChannel.send('__TRANSFER_CANCEL__');
      }
    } catch (_) {}
    // BACKUP path: also relay the cancel via socket.io. The data-channel
    // message can sit behind megabytes of queued chunks and never reach the
    // peer before we tear the connection down — the socket message goes
    // through instantly and guarantees the other side hides its UI.
    try {
      if (_socket && _sessionId) {
        _socket.emit('TRANSFER_CANCEL_RELAY', { sessionId: _sessionId });
      }
    } catch (_) {}
    if (aeroAnim && aeroAnim.onCancelled) aeroAnim.onCancelled('Cancelled');
    if (_socket && _sessionId) _socket.emit('SESSION_END', { sessionId: _sessionId });
    showToast('Transfer cancelled.', 'warn');
    setTimeout(resetSession, 400);
  }
  window.aeroGrabCancel = cancelTransfer;

  // ── Deactivate AeroGrab completely ────────────────────────────────────────
  function deactivateAeroGrab() {
    _enabled = false;
    showGreenDot(false);
    hideWakeUpNotification();
    resetSession();

    if (_rafId)     { clearInterval(_rafId); _rafId = null; }
    if (_camStream) { _camStream.getTracks().forEach(t => t.stop()); _camStream = null; }
    if (_recognizer) { try { _recognizer.close(); } catch (_) {} _recognizer = null; }
    _lastVideoTs = -1;
    _processingHands = false;
    _frameCount = 0; _detectCount = 0;
    // NOTE: Socket + heartbeat stay alive for Hevi Network discovery

    // Reset video element to hidden
    const videoEl = $('aeroVideoEl');
    if (videoEl) {
      videoEl.srcObject = null;
    }
    const canvas = $('aeroGestureCanvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    const lbl = $('aeroGestureLbl');
    if (lbl) lbl.textContent = '—';

    const toggle = $('aeroGrabToggle');
    if (toggle) toggle.checked = false;
  }

  // ── Toast helper (uses Hevi Explorer toast if available) ──────────────────
  function showToast(msg, type) {
    if (typeof toast === 'function') { toast(msg, type === 'warn' ? 'warn' : type); return; }
    console.log(`[AeroGrab] ${type}: ${msg}`);
  }

  // ── Context-menu AeroGrab button wiring ───────────────────────────────────
  function wireContextMenuButton() {
    const btn = $('ctxAeroGrab');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const ctxItem = window._aeroCtxItem;
      if (!ctxItem) return;
      _activeOpenFile = { name: ctxItem.name, size: ctxItem.size, path: ctxItem.path, type: ctxItem.mimeType || 'application/octet-stream' };
      localStorage.setItem('ag_last_file', ctxItem.path);
      if (!_enabled) {
        toggleAeroGrab(true).then(() => { setTimeout(() => initiateGrab(), 500); });
      } else {
        initiateGrab();
      }
    });
  }

  // ── Wake-up catch button ───────────────────────────────────────────────────
  function wireWakePanel() {
    const btn = $('aeroWakeCatchBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (!_enabled) {
        await toggleAeroGrab(true);
      }
      signalReadyToReceive();
    });
    const dismissBtn = $('aeroWakeDismiss');
    if (dismissBtn) dismissBtn.addEventListener('click', hideWakeUpNotification);
  }

  // ── Sidebar toggle wiring ──────────────────────────────────────────────────
  function wireToggle() {
    const toggle = $('aeroGrabToggle');
    if (!toggle) return;
    toggle.addEventListener('change', () => toggleAeroGrab(toggle.checked));
  }

  // ── Manual grab button (bypasses gesture detection) ──────────────────────
  function wireManualGrab() {
    const btn = $('aeroManualGrab');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!_enabled) return;
      if (_myRole !== null) return;
      initiateGrab();
    });
  }

  // ── Close button on the live camera preview ───────────────────────────────
  function wireCamCloseBtn() {
    const btn = $('agCamClose');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deactivateAeroGrab();
      showToast('Camera closed. AeroGrab turned off — toggle it back on from the sidebar anytime.', 'info');
    });
  }

  // ── Draggable camera preview ──────────────────────────────────────────────
  // Persists position to localStorage so it survives reloads.
  function wireDraggablePreview() {
    const overlay = $('agCamOverlay');
    const handle  = $('agDragHandle');
    if (!overlay || !handle) return;
    const STORE_KEY = 'ag_preview_pos';
    const apply = pos => {
      if (!pos) return;
      overlay.style.left   = `${pos.x}px`;
      overlay.style.top    = `${pos.y}px`;
      overlay.style.right  = 'auto';
      overlay.style.bottom = 'auto';
    };
    try { apply(JSON.parse(localStorage.getItem(STORE_KEY) || 'null')); } catch (_) {}

    let dragging = false, startX = 0, startY = 0, baseX = 0, baseY = 0;
    const start = e => {
      const t = e.touches ? e.touches[0] : e;
      const r = overlay.getBoundingClientRect();
      dragging = true;
      startX = t.clientX; startY = t.clientY;
      baseX  = r.left;    baseY  = r.top;
      overlay.classList.add('ag-dragging');
      e.preventDefault();
    };
    const move = e => {
      if (!dragging) return;
      const t = e.touches ? e.touches[0] : e;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const w  = overlay.offsetWidth;
      const h  = overlay.offsetHeight;
      const nx = Math.max(4, Math.min(window.innerWidth  - w - 4, baseX + dx));
      const ny = Math.max(4, Math.min(window.innerHeight - h - 4, baseY + dy));
      apply({ x: nx, y: ny });
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      overlay.classList.remove('ag-dragging');
      const r = overlay.getBoundingClientRect();
      try { localStorage.setItem(STORE_KEY, JSON.stringify({ x: r.left, y: r.top })); } catch (_) {}
    };
    handle.addEventListener('mousedown',  start);
    handle.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('mousemove',  move);
    window.addEventListener('touchmove',  move, { passive: false });
    window.addEventListener('mouseup',    end);
    window.addEventListener('touchend',   end);
    window.addEventListener('touchcancel', end);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  function boot() {
    wireToggle();
    wireContextMenuButton();
    wireWakePanel();
    wireManualGrab();
    wireCamCloseBtn();
    wireCameraCapture();
    wireDraggablePreview();
    // Connect socket immediately for Hevi Network discovery (even if AeroGrab is OFF)
    initSocket();
    console.log('[AeroGrab] ready — by TWH (v6 / ML)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIRST-RUN TUTORIAL — 3-step overlay shown before first AeroGrab activation
  // ═══════════════════════════════════════════════════════════════════════════
  // Returns Promise<boolean>: true if user completed/got-it, false if skipped.
  // Persistence: localStorage['aerograb_tutorial_seen'] = '1'
  // Replay: window.aeroGrab.replayTutorial() (also re-runs from settings later).
  // ─────────────────────────────────────────────────────────────────────────
  const TUT_KEY = 'aerograb_tutorial_seen';
  const TUT_TOTAL = 3;

  function hasSeenTutorial() {
    try { return localStorage.getItem(TUT_KEY) === '1'; }
    catch (_) { return false; }
  }
  function markTutorialSeen() {
    try { localStorage.setItem(TUT_KEY, '1'); } catch (_) {}
  }

  function showTutorial() {
    return new Promise(resolve => {
      const overlay = document.getElementById('aeroTutorial');
      const nextBtn = document.getElementById('aeroTutNext');
      const skipBtn = document.getElementById('aeroTutSkip');
      if (!overlay || !nextBtn || !skipBtn) { markTutorialSeen(); return resolve(true); }

      let step = 1;
      const showStep = (n) => {
        overlay.querySelectorAll('.ag-tut-step').forEach(el => {
          el.classList.toggle('hidden', Number(el.dataset.step) !== n);
        });
        overlay.querySelectorAll('.ag-tut-dot').forEach(d => {
          d.classList.toggle('is-active', Number(d.dataset.dot) === n);
        });
        nextBtn.textContent = (n === TUT_TOTAL) ? 'Got it ✓' : 'Next →';
      };

      const cleanup = (proceed) => {
        overlay.classList.add('hidden');
        nextBtn.onclick = null;
        skipBtn.onclick = null;
        markTutorialSeen();
        resolve(proceed);
      };

      nextBtn.onclick = () => {
        if (step < TUT_TOTAL) { step += 1; showStep(step); }
        else                  { cleanup(true);  }
      };
      skipBtn.onclick = () => cleanup(false);

      // Reset to step 1 every time we show
      showStep(1);
      overlay.classList.remove('hidden');
    });
  }

  // Public replay (also lets us add a "Replay tutorial" button later from settings)
  function replayTutorial() {
    try { localStorage.removeItem(TUT_KEY); } catch (_) {}
    return showTutorial();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECENT RECEIVES — persistent history panel below Cloud Storage
  // ═══════════════════════════════════════════════════════════════════════════
  // Stored in localStorage so it survives reloads. Capped at 30 entries.
  // Each entry is a Hevi-shaped item ({name, path, type, size, ext, category,
  // mimeType, modified}) plus our own `receivedAt` timestamp. Clicking an
  // entry calls window.openFile(item) — same as clicking the file inside the
  // HeviExplorer/ folder.
  // ─────────────────────────────────────────────────────────────────────────
  const HIST_KEY     = 'aerograb_history';
  const HIST_MAX     = 30;

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HIST_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }

  function saveHistory(arr) {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(arr.slice(0, HIST_MAX))); }
    catch (_) {}
  }

  function recordReceiveHistory(item) {
    if (!item || !item.path) return;
    const list = loadHistory();
    // De-dupe by path — newest wins.
    const filtered = list.filter(x => x.path !== item.path);
    filtered.unshift({ ...item, receivedAt: Date.now() });
    saveHistory(filtered);
    renderAeroHistory();
  }

  function clearAeroHistory() {
    try { localStorage.removeItem(HIST_KEY); } catch (_) {}
    renderAeroHistory();
  }

  function fmtRelative(ts) {
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 60)        return 'just now';
    if (s < 3600)      return `${Math.floor(s / 60)}m ago`;
    if (s < 86400)     return `${Math.floor(s / 3600)}h ago`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  function fmtSize(bytes) {
    if (bytes == null || isNaN(bytes)) return '';
    const u = ['B','KB','MB','GB','TB'];
    let i = 0, n = bytes;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
  }

  function iconForItem(item) {
    const name = (item.name || '').toLowerCase();
    if (/\.(mp4|mkv|avi|mov|webm)$/.test(name))           return '🎬';
    if (/\.(mp3|flac|ogg|wav|aac|opus)$/.test(name))      return '🎵';
    if (/\.(jpg|jpeg|png|gif|webp|heic|svg)$/.test(name)) return '🖼️';
    if (/\.(pdf)$/.test(name))                             return '📄';
    if (/\.(zip|rar|7z|tar|gz)$/.test(name))              return '🗜️';
    if (/\.(apk)$/.test(name))                             return '📱';
    if (/\.(doc|docx|txt|md)$/.test(name))                return '📝';
    return '📦';
  }

  function renderAeroHistory() {
    const sec  = document.getElementById('aeroHistorySection');
    const list = document.getElementById('aeroHistoryList');
    if (!sec || !list) return;
    const items = loadHistory();
    if (!items.length) { sec.classList.add('hidden'); list.innerHTML = ''; return; }
    sec.classList.remove('hidden');
    list.innerHTML = items.map((it, i) => `
      <div class="ag-hist-item" data-idx="${i}">
        <div class="ag-hist-icon">${iconForItem(it)}</div>
        <div class="ag-hist-meta">
          <div class="ag-hist-name">${escAtt(it.name || 'file')}</div>
          <div class="ag-hist-sub">
            <span>${fmtRelative(it.receivedAt || Date.now())}</span>
            ${it.size ? `<span class="dot"></span><span>${fmtSize(it.size)}</span>` : ''}
          </div>
        </div>
        <div class="ag-hist-arrow">›</div>
      </div>
    `).join('');
    // Wire up clicks — open via Hevi's own viewer.
    list.querySelectorAll('.ag-hist-item').forEach(el => {
      el.addEventListener('click', async () => {
        const idx = Number(el.dataset.idx);
        const item = loadHistory()[idx];
        if (!item) return;
        // Verify the file still exists on disk before trying to open
        // (HEAD against /file is cheap — server returns 404 if missing).
        try {
          const r = await fetch(`/file?path=${encodeURIComponent(item.path)}`, { method: 'HEAD' });
          if (!r.ok) {
            el.classList.add('ag-hist-missing');
            showToast('File no longer exists on disk', 'error');
            return;
          }
        } catch (_) { /* network error — try opening anyway */ }
        if (typeof window.openFile === 'function') {
          try { window.openFile(item); } catch (e) { console.warn('[AeroGrab] openFile error:', e.message); }
        }
      });
    });
  }

  function escAtt(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                    .replace(/"/g,'&quot;');
  }

  // Wire the Clear button + initial render once DOM is ready.
  function initAeroHistory() {
    const btn = document.getElementById('aeroHistoryClearBtn');
    if (btn) btn.addEventListener('click', () => {
      if (!loadHistory().length) return;
      if (confirm('Clear AeroGrab receive history? (Files on disk are NOT deleted.)')) clearAeroHistory();
    });
    renderAeroHistory();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAeroHistory);
  } else {
    initAeroHistory();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.aeroGrab = {
    toggle:    toggleAeroGrab,
    isOn:      () => _enabled,
    grab:      initiateGrab,
    catch:     signalReadyToReceive,
    setTarget: (socketId) => { _targetSocketId = socketId || null; },
    mySocketId: () => _socket ? _socket.id : null,
    replayTutorial,
  };

  // Helper used by initiateGrab to look up peer names (populated by Network tab)
  window._heviPeerName = null;

})();

# AeroGrab Master Prompt — AI Handoff Document
## For Any AI Assistant Continuing This Project

**Project:** AeroGrab inside Hevi Explorer (TWH Eco System Technology)
**Author:** Technical White Hat (TWH)
**Last Updated:** April 22, 2026 (latest stable: v10)
**Language with developer:** Hinglish (Hindi + English mixed, casual tone — use "bhai", "yaar", "karo", "aaja", etc.)
**Brand accent color:** `#25f4d0` (CSS variable: `--accent`)

---

## PART 1: PROJECT OVERVIEW

**Hevi Explorer** is a local-first file manager and media server in Node.js.
- Runs on any device (Android Termux, PC, Mac, Replit) on port 5000
- Serves a full web UI: browse/view/upload/manage local files
- Stack: Node.js + Express + Socket.io + plain HTML/CSS/JS (no frontend framework)

**AeroGrab** is a gesture-controlled P2P file transfer feature BUILT INSIDE Hevi Explorer.
- **Closed fist ✊** = "Grab this file" (sender)
- **Open palm ✋** = "I'll catch it" (receiver)
- File travels **device-to-device via WebRTC DataChannel** — server never sees file bytes
- Gesture detection uses **Google MediaPipe Tasks Vision `GestureRecognizer`** running 100% on-device (since v5; replaces the legacy custom curl-ratio classifier)
- Camera feed NEVER leaves the device (privacy first-class requirement)
- Works on same WiFi LAN only (no TURN server yet, so no 4G/5G)

**Full technical spec:** Read `AeroGrab_Blueprint.md` in project root.

---

## PART 2: THE v1 → v2 EVOLUTION

### v1 Flaw (Why v1 Was Useless)
In v1, ALL devices connected to ONE shared Hevi Explorer server. So Device A and Device B were both browsing the SAME files from the SAME server. AeroGrab transferring a file was pointless — Device B could just download it directly from the shared server.

**v1 model: 1 kitchen, N waiters. Everyone eats from the same pot.**

### v2 Vision (Real Value)
Each device runs its OWN Hevi Explorer instance, serving its OWN local files.
- Phone A → `localhost:5000` → Phone A's files
- Phone B → `localhost:5000` → Phone B's files
- All connect to a **shared signaling server** (one Hevi instance, or Replit-deployed) for coordination only

When Phone A grabs a file:
1. Fetches from ITS OWN `/file?path=...` endpoint
2. Streams via WebRTC DataChannel to Phone B
3. Phone B's browser saves it as a download

**v2 model: N kitchens, 1 coordinator. Every chef owns their own food.**

**The WebRTC transfer logic was already correct for v2.** The missing piece was auto-discovery — devices needed to find each other automatically.

---

## PART 3: WHAT HAS BEEN BUILT (COMPLETE STATUS — April 20, 2026)

### ✅ Server Side (`server.js`, around line 3190+)

```
const heviDevices = new Map();  // socket.id → device info
```

Events implemented:
- `HEVI_ANNOUNCE` — device registers itself on connect; triggers `broadcastPeersUpdate()`
- `HEVI_HEARTBEAT` — keeps device `lastSeen` fresh (every 15s from client)
- `HEVI_PEERS_UPDATE` — server broadcasts full device list to ALL sockets on any join/leave
- `FILE_GRABBED` — creates session, broadcasts `WAKE_UP_CAMERAS`; supports `targetId` for targeted send (wake only one device)
- `DROP_HERE` — First-Confirmed-Receiver-Wins rule; initiates WebRTC signaling
- `webrtc_signal` — pure relay (forwards SDP offers/answers/ICE between peers)
- `SESSION_END` — clears session
- `disconnect` — removes device from `heviDevices`, broadcasts update; cleans up any active sessions

Session data is 100% in-memory. Never written to disk.

`broadcastPeersUpdate()` sends:
```javascript
{ devices: [...heviDevices.values()], total: heviDevices.size }
```

Device shape in registry:
```javascript
{
  socketId:   socket.id,
  deviceId:   'uuid-v4',           // from localStorage, stable per install
  deviceName: 'Rahul Ka Phone',    // UA-detected or user-set
  avatar:     '📱',               // emoji
  joinedAt:   Date.now(),
  lastSeen:   Date.now(),
}
```

### ✅ Client Side (`public/aerograb.js`) — Self-Contained IIFE

**Device Identity (localStorage-persisted):**
```javascript
getOrCreateDeviceId()  // crypto.randomUUID(), stored in 'ag_device_id'
getDeviceName()        // UA-detected: Android/iPhone/Mac/Windows, stored in 'ag_device_name'
getDeviceAvatar()      // 📱💻🖥📡, stored in 'ag_device_avatar'
```

**Socket Connection:**
```javascript
_socket = io(window.location.origin, {
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity,
});
```
- Socket connects on page BOOT (not just when AeroGrab toggle is ON)
- `connect` → `announceToNetwork()` + `startHeartbeat()`
- `reconnect` → re-announces to network
- `connect_error` → logged to console
- Heartbeat every 15 seconds

**IMPORTANT: Why `window.location.origin` and NOT `io()`?**
Using `io()` alone can fail on some proxy setups. Explicit origin is more reliable.

**IMPORTANT: Why NOT `transports: ['websocket']`?**
WebSocket-only mode fails on some browsers/proxies. Default (polling → WebSocket upgrade) is more reliable and was the fix for the v2 connection bug.

**Gesture Classification:**
```javascript
classifyGesture(lm):
  handSize = wrist(0) → middleMCP(9) distance (2D x,y ONLY — never z)
  curlRatio[i] = dist(tip[i], mcp[i]) / handSize
  FIST      = all curlRatios < 0.65
  OPEN_PALM = all curlRatios > 0.65
```
**NEVER use z-axis** — MediaPipe z is relative depth, not same scale as normalized x,y.

**MediaPipe setup:**
- `setInterval` at 12fps (NOT Camera utility — too slow)
- `_processingHands` flag prevents concurrent `hands.send()` calls
- `getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 } })`

**Camera Permission guard (fixed in April 20 session):**
```javascript
if (!window.isSecureContext) → show HTTPS error, return false
if (!navigator.mediaDevices) → show browser error, return false
```
On HTTP origins (e.g., `http://192.168.x.x:5000`), browsers block camera access.
AeroGrab now shows a clear error: "Camera needs HTTPS. Use the Replit URL or localhost."

**File Transfer:**
- `getAeroGrabPayload()` priority: (1) open viewer file, (2) selected files, (3) targeted folder, (4) last opened (localStorage)
- `initiateGrab()` → `emit('FILE_GRABBED', { metadata, targetId })`
- `startFileTransfer()` → fetches file from OWN `/file?path=...`
- `streamFileOverBridge(blob)` → 64KB chunks via FileReader, respects bufferedAmount
- `finaliseReceivedFile()` → assembles chunks → Blob → `<a download>` → browser saves
- `zipFolder()` → JSZip for folder transfers

**Targeted Transfer:**
```javascript
window.aeroGrab.setTarget(socketId)  // set before grab
_targetSocketId = null               // auto-reset after use
```
When target is set, `FILE_GRABBED` includes `targetId`, server wakes only that device.

**Public API (window.aeroGrab):**
```javascript
window.aeroGrab = {
  toggle:    toggleAeroGrab,     // bool
  isOn:      () => _enabled,
  grab:      initiateGrab,
  catch:     signalReadyToReceive,
  setTarget: (socketId) => { _targetSocketId = socketId || null; },
  mySocketId: () => _socket ? _socket.id : null,
};
window.aeroGrabSetOpenFile = (fileMeta) => { _activeOpenFile = fileMeta; };
```

**Hooks from `app.js`:**
```javascript
window.aeroGrabSetOpenFile({ name, size, path, type })  // called when file opens
window._aeroCtxItem                                       // set by right-click menu handler
```

### ✅ UI (`public/index.html`)

**In sidebar (between AeroGrab toggle and sidebar-footer):**
```html
<div class="hevi-net-section" id="heviNetSection">
  <button class="hevi-net-header" id="heviNetHeader">
    🌐 Hevi Network
    <div id="heviNetCount">Searching...</div>
  </button>
  <div class="hevi-net-list hidden" id="heviNetList">
    <div id="heviNetEmpty">No other devices found</div>
    <!-- .hevi-peer-card elements injected dynamically -->
  </div>
</div>
```

**Wake-up panel (shown on receiver when someone grabs):**
```html
<div id="aeroWakePanel">
  <div id="aeroWakeSender">From: Device Name</div>  <!-- shows sender name -->
  <div id="aeroWakeFileName">filename.pdf</div>
  <button id="aeroWakeCatchBtn">✋ Catch</button>
  <button id="aeroWakeDismiss">Dismiss</button>
</div>
```

**Permission dialog:**
```html
<div class="modal hidden" id="aeroPermDialog">
  <!-- Shows before browser camera prompt — explains what AeroGrab does -->
  <button id="aeroPermEnable">Enable AeroGrab</button>
  <button id="aeroPermCancel">Not Now</button>
</div>
```

**Camera overlay (visible bottom-right when AeroGrab ON):**
```html
<video id="aeroVideoEl" .../>
<div id="agCamOverlay">
  <span id="aeroGestureLbl">—</span>  <!-- live debug: gesture + curl ratios -->
  <button id="aeroManualGrab">✊ Grab</button>  <!-- manual fallback -->
</div>
<div id="aeroGreenDot"></div>  <!-- top-right dot, green when ON -->
```

### ✅ Hevi Network Inline Script (`public/index.html` — at bottom, after aerograb.js)

```javascript
(function() {
  const _peerMap = new Map();          // socketId → deviceName
  let _prevOtherCount = 0;

  window._heviPeerName = function(socketId) { return _peerMap.get(socketId) || null; };

  window.onHeviPeersUpdate = function(devices, total, mySocketId) {
    // Called from aerograb.js when HEVI_PEERS_UPDATE arrives
    // Renders peer cards, updates count, auto-expands panel on first peer
    // Pulses section border with .hevi-net-pulse class when new peer joins
  };

  window.heviSendTo = function(socketId, deviceName) {
    // Called by "Send →" button on each peer card
    // Sets aeroGrab.setTarget(), closes sidebar, shows toast
  };
})();
```

**Count text behavior:**
- `total === 0` → "Connecting..."
- `n (others) === 0` → "Connected — waiting for other devices" (dim color)
- `n > 0` → "N device(s) nearby" (accent color)
- Auto-expands panel when first peer appears
- Pulses border animation (`.hevi-net-pulse`) on new peer

### ✅ Animation Layer (`public/aerograb-animation.js`)
- Rocket Launch animation (sender)
- Box Landing animation (receiver)
- Progress ring during transfer
- Uses anime.js from CDN

### ✅ Styles (`public/style.css` — all AeroGrab styles appended at end)
Classes: `.hevi-net-section`, `.hevi-net-header`, `.hevi-peer-card`, `.hevi-peer-send`, `.hevi-peer-dot`, `.ag-wake-panel`, `.ag-wake-sender`, `.ag-perm-card`, `.ag-toggle-switch`, `@keyframes heviNetPulse`

### ✅ Privacy
- `.gitignore` excludes: `files/`, `uploads/`, `thumbnails/`, `*.db`, `*.sqlite`, `.env`
- Server never writes session/device data to disk
- Server never touches file bytes (only signaling metadata)
- Camera processed entirely on-device

---

## PART 4: BUGS THAT WERE FIXED (April 20, 2026 Session)

### Bug 1: Socket WebSocket-Only Transport
**Was:** `io({ transports: ['websocket'] })`
**Fix:** `io(window.location.origin, { reconnectionDelay: 1000, reconnectionAttempts: Infinity })`
**Why:** WebSocket-only fails on some Replit proxy configs and mobile browsers. Default negotiation (polling → WebSocket upgrade) is more reliable.

### Bug 2: Camera Blocked on HTTP Origins
**Was:** `getUserMedia` called without checking `isSecureContext`
**Fix:** Added `if (!window.isSecureContext) { showCameraHttpsError(); return null; }`
**Why:** Browsers block camera access on `http://` origins except `localhost`. When a device accesses via LAN IP (`http://192.168.x.x:5000`), camera is blocked. Now shows clear error: "Camera needs HTTPS. Access via your Replit URL (https://...)."

### Bug 3: Camera Denied Error Not Specific
**Was:** Generic toast "AeroGrab needs camera access."
**Fix:** Named error handling:
- `NotAllowedError` → "Camera access denied. Go to browser Settings → Site permissions → Camera → Allow."
- `NotFoundError` → "No camera found on this device."
- `NotReadableError` → "Camera is being used by another app. Close it and try again."
- `OverconstrainedError` → Auto-retry without `facingMode` constraint (desktop cameras may not support 'user' facing mode)
- Other → "Camera error: [message]"
- Also: `localStorage.removeItem(PERM_KEY)` on error so next time dialog shows again

### Bug 4: Socket Reconnect Didn't Re-Announce
**Was:** No reconnect handler
**Fix:** `_socket.on('reconnect', () => announceToNetwork())`

### Bug 5: `onHeviPeersUpdate` Count Text Was Confusing
**Was:** "1 device online (you)" when alone — user thought nothing was working
**Fix:** "Connected — waiting for other devices" when no peers, "N device(s) nearby" when peers exist

### Bug 6: No Auto-Expand on Peer Discovery
**Was:** User had to manually click to expand the Hevi Network panel
**Fix:** Panel auto-expands + border pulse animation when first peer joins

---

## PART 4B: ADDITIONAL BUGS FIXED (April 20, 2026 — Second Session)

### Bug 7: Double `getUserMedia` Call — "Device In Use" Error
**Was:** `requestCameraPermission()` called `getUserMedia({ video: true })` → immediately stopped the stream → returned `true` (boolean). Then `initMediaPipe()` called `getUserMedia` AGAIN with actual constraints.
**Fix:** `requestCameraPermission()` now returns the `MediaStream` directly (or `null` on failure). The stream is passed to `initMediaPipe(stream)` which reuses it — only ONE `getUserMedia` call total.
**Why:** Two rapid `getUserMedia` calls can cause `NotReadableError` on some mobile browsers ("device in use"). Also wastes resources by starting camera twice.

### Bug 8: `Permissions-Policy` Header Missing on Server
**Was:** Server responses had no `Permissions-Policy` header.
**Fix:** Added `app.use((req, res, next) => { res.setHeader('Permissions-Policy', 'camera=*, microphone=()'); next(); });` in `server.js` before static file serving.
**Why:** Modern Chrome may block camera access silently on some proxy/iframe setups without explicit `Permissions-Policy: camera=*` header from the server.

### Bug 9: HTTPS Error Message Useless for LAN Users (SUPERSEDED by Feature 11)
**Was:** `showCameraHttpsError()` showed `https://192.168.x.x:5000` (no SSL cert = useless URL).
**Original Fix:** Detects LAN IP pattern, shows: "Camera needs HTTPS. Access via your Replit URL..."
**Superseded by Feature 11:** Server now runs HTTPS on `httpPort + 443`, so the error now shows the actual working HTTPS URL.

### Feature 11: LAN HTTPS Server (AeroGrab Camera on Any LAN Device) ✅
**Problem:** Browsers block `getUserMedia` (camera) on HTTP origins, except localhost. Users accessing via LAN IP (`http://192.168.x.x:5000`) could not use AeroGrab camera.
**Fix:** Added automatic self-signed SSL certificate generation at startup + HTTPS server on `PORT + 443` (e.g. 5443 when HTTP is on 5000).

**Files changed:**
- `server.js` — added `selfsigned` require, `ensureSslCert()` async function, HTTPS server startup, banner update
- `public/aerograb.js` — updated `showCameraHttpsError()` to compute `https://${hostname}:${httpPort + 443}` and copy it to clipboard

**Certificate details:**
- Generated once at `data/ssl/{cert,key,ips}.pem/json`
- 10-year validity (`notAfterDate` = now + 10 years)
- RSA 2048-bit, SHA-256 signed
- SAN includes: `DNS:localhost`, `IP:127.0.0.1`, all current LAN IPs
- Regenerated automatically when LAN IPs change (detected via `data/ssl/ips.json`)
- Uses `selfsigned` npm package v5 (`generate()` is async/Promise-based)

**User setup (one-time per device):**
1. Server prints the HTTPS URL in startup banner: `https://192.168.x.x:5443`
2. User opens that URL in browser
3. Browser shows security warning (self-signed cert) → click "Advanced" → "Proceed"
4. Camera permission prompt appears → allow → AeroGrab works!
5. Next visits: no warning (cert cached by browser)

**Socket.io:** HTTPS server uses `io.attach(httpsServer)` so HTTP and HTTPS clients share the same device registry and can AeroGrab with each other.

### Bug 10: No Stale Device Cleanup Timer on Server
**Was:** `heviDevices` Map was only cleared on `socket.disconnect` events. If a browser crashed or network cut without clean disconnect, device stayed in registry forever.
**Fix:** Added `setInterval` sweep every 15 seconds that removes devices with `lastSeen > 45s` and calls `broadcastPeersUpdate()` if any were removed.
**Why:** Devices that crash or lose network don't always fire a clean socket disconnect. Without the sweep, ghost devices accumulate in the Hevi Network panel.

---

## PART 5: ARCHITECTURE — HOW NETWORK DISCOVERY WORKS

```
Device A (Replit URL)          Server (Replit)          Device B (same Replit URL)
        |                           |                           |
        |-- HEVI_ANNOUNCE --------->|                           |
        |<-- HEVI_PEERS_UPDATE {A} -|                           |
        |                           |<-- HEVI_ANNOUNCE ---------
        |<-- HEVI_PEERS_UPDATE{A,B}-|-- HEVI_PEERS_UPDATE{A,B}->|
        |                           |                           |
        | [sees Device B in list]   |        [sees Device A in list]
```

**CRITICAL REQUIREMENT FOR LAN DISCOVERY:**
Both devices MUST open the SAME URL to connect to the SAME server.
- ✅ Both devices open `https://your-repl.replit.dev` → SAME server → can see each other
- ❌ Device A on Replit URL, Device B on `http://192.168.x.x:5000` → DIFFERENT server instances → CANNOT see each other
- ❌ Both on LAN IP with HTTP → camera blocked (no HTTPS)

**For Termux/LAN deployment:**
One device runs the server. Others access via that device's LAN IP. But they need HTTPS for camera — this requires either:
- A self-signed cert (complex setup)
- Deploy to Replit (recommended for now) and ALL devices use the Replit URL

---

## PART 6: IMPORTANT RULES (Do NOT Violate These)

1. **Never break Hevi Explorer** — AeroGrab is an overlay. If AeroGrab crashes, file manager must still work.
2. **`aerograb.js` must stay a self-contained IIFE** — `(function AeroGrab() { ... })()`
3. **No file bytes on server** — Server is pure signaling relay. WebRTC DataChannel handles actual bytes.
4. **2D gesture math only** — Never use z-axis in landmark distance calculations.
5. **Camera controlled only by `aerograb.js`** — No other code touches camera.
6. **Socket.io on server has `cors: { origin: '*' }`** — Do not restrict to specific origins.
7. **All device/session data in-memory only** — Never write to disk.
8. **Toast function:** `toast(message, 'success' | 'error' | 'warn' | '')` — available globally in `app.js`.
9. **CSS var `--accent: #25f4d0`** — All AeroGrab UI elements use this color.

---

## PART 7: CDN SCRIPTS (in `index.html`)

```html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>
<script src="/iv.js?v=11"></script>
<script src="/app.js?v=12"></script>
<script src="/aerograb-animation.js?v=1"></script>
<script src="/aerograb.js?v=1"></script>
<script>
  // service worker + Hevi Network inline IIFE (onHeviPeersUpdate, heviSendTo, etc.)
</script>
```

Server socket.io version: `^4.8.3`

---

## PART 8: KEY FILE MAP

| File | Purpose | Important Lines |
|---|---|---|
| `server.js` | AeroGrab signaling + Hevi Network | ~3190–3285 |
| `public/aerograb.js` | All AeroGrab client logic | Full file (~780 lines) |
| `public/aerograb-animation.js` | Rocket/box animations | Full file |
| `public/index.html` | UI markup + inline Hevi Network script | Wake panel ~2424, Network section ~168–183, inline script ~2466+ |
| `public/style.css` | All styles | AeroGrab styles appended at end |
| `public/app.js` | Hevi Explorer main app | openFile hook ~3581, ctxMenu ~3974 |
| `AeroGrab_Blueprint.md` | Full engineering spec | Full file |

---

## PART 9: WHAT IS STILL REMAINING / KNOWN GAPS

### ❌ NOT YET DONE — Next AI Should Tackle These

1. **Real multi-device test** — Need two physical devices on same WiFi, both opening Replit URL, to verify end-to-end: see each other → send file → receive file.

2. **~~Stale device cleanup~~** — ✅ FIXED (April 20, second session). `setInterval` sweep runs every 15s, removes devices with `lastSeen > 45s`.

3. **Device Name Customization** — Currently auto-detected from userAgent. User should be able to set a custom name. Add a small input field in the Network section or Settings.

4. **WebRTC TURN server** — For devices NOT on same WiFi (4G/5G cross-network). Not needed for LAN use case but required for full P2P. Use free TURN from `openrelay.metered.ca` or deploy coturn.

5. **Transfer Progress UI** — `aeroAnim.updateReceiverProgress(pct)` exists in animation layer but progress % is not wired to the actual DataChannel receive tracking. Wire `_recvReceived / _recvMeta.size` to the animation progress.

6. **Multiple File Select** — `getAeroGrabPayload()` supports selected files but currently only grabs first selected file if multiple are selected. Add zip for multi-select.

7. **Receive History** — No log of received files. Add a simple received-files list in the AeroGrab UI showing last N transfers.

8. **Offline/HTTPS on LAN** — For Termux deployment with camera working on LAN without Replit, need HTTPS. Could add a `--https` flag to `server.js` that generates a self-signed cert on first run.

9. **AeroGrab Device Name Display** — In the "🌐 Hevi Network" panel, the user's OWN device name/avatar is not displayed anywhere. Show "This device: 📱 Android Device" at top of the panel.

---

## PART 10: TESTING CHECKLIST

When two devices are available, verify ALL of these:

- [ ] Device A opens Replit URL → Network panel shows "Connected — waiting for other devices"
- [ ] Device B opens same Replit URL → both A and B see each other in Network panel
- [ ] Network panel on A shows Device B's name + avatar + green dot
- [ ] "Send →" button on Device B's card in A's sidebar → toast shows "Targeted: [B name]"
- [ ] AeroGrab toggle ON → permission dialog appears → click Enable → browser camera prompt appears
- [ ] Camera shows in bottom-right → gesture label shows live curl ratios
- [ ] Make fist → FIST detected → WAKE_UP_CAMERAS sent to B
- [ ] Device B shows wake-up notification with "From: [A name]" + filename
- [ ] Device B opens palm OR clicks Catch → file transfer starts → file downloads on B
- [ ] AeroGrab toggle OFF → camera stops → Hevi Network panel still works
- [ ] Device C joins → counter updates → all three see each other
- [ ] Device C closes browser → counter updates within seconds (socket disconnect)
- [ ] Existing Hevi Explorer works perfectly (browse/upload/view/etc.)

---

*Document maintained by Technical White Hat (TWH).*
*Communicate with developer in casual Hinglish — bhai, yaar, chill tone.*
*Always read `AeroGrab_Blueprint.md` for detailed engineering spec.*

---

## v3 — Auto LAN Discovery + Stable Gestures + Reliable Transfer (April 21, 2026)

### Problems reported in v2 testing
1. **Receiver catch animation atak jata hai** — file transfer "complete" dikhta but actual file download/open nahi hota tha. WebRTC DataChannel sender immediately `peerConn.close()` kar raha tha after `send('__TRANSFER_DONE__')`, jiske karan bufferedAmount drain hone se pehle channel close ho jata tha aur last chunks + DONE marker silently drop ho jate the.
2. **Grab gesture apne aap fire ho raha tha** — har thoda hand movement par FIST trigger ho jata. Threshold loose tha (`< 0.65`), sirf 1 frame chahiye tha, aur same-gesture cooldown sirf 1200ms tha — jab user neutral hand show karta to bhi 1.2s baad fir trigger ho jata.
3. **Cross-server signalling missing** — har device apna server chala raha hai, lekin signalling sirf same-server sockets tak limited thi.

### Solutions added in v3

**1. Auto LAN discovery (server.js)**
- UDP broadcast on port `45555` (env override `AEROGRAB_DISCOVERY_PORT`, disable via `AEROGRAB_LAN_DISCOVERY=0`).
- Each server announces `{ serverId, name, port, ts }` every 3s; peer TTL 12s.
- Cross-server HTTP relays: `/api/aerograb/lan/{wake,drop,signal,end}` — a remote server can POST a signalling event addressed to one of our local sockets.
- Composite peer IDs `lan:<serverId>:<socketId>` carried inside `webrtc_signal`, `WAKE_UP_CAMERAS`, `DROP_HERE`, `SESSION_END`, `TRANSFER_APPROVED` payloads.
- Combined device list endpoint exposes `source: 'local' | 'lan'` so the UI can label cards.

**2. Stable gesture engine (public/aerograb.js)**
- Tighter thresholds with neutral gap: FIST `<0.55`, OPEN_PALM `>0.78`, in-between = neutral (no firing).
- Frame debounce: gesture must be detected on **4 consecutive frames** (`FIRE_FRAME_COUNT`) before firing.
- Re-trigger gate: same gesture cannot fire twice in a row until **3 neutral frames** seen (`NEUTRAL_FRAMES_BEFORE_RETRIGGER`).
- Cooldown raised to `2000ms` (`GESTURE_COOLDOWN_MS`).
- Live debug label now shows `✊ FIST 2/4 [0.42,0.39,0.41,0.45]` so user can see arming progress.

**3. Reliable WebRTC file transfer**
- **Sender drain-and-close:** after `__TRANSFER_DONE__` is queued, sender now polls `_dataChannel.bufferedAmount` until it hits 0, then waits an extra 800ms before closing the peer connection. This guarantees the receiver actually gets the last bytes + the DONE marker.
- **Receiver auto-finalise:** if `_recvReceived >= _recvMeta.size`, receiver calls `finaliseReceivedFile()` after a 250ms grace, even if the DONE marker never arrives (belt-and-suspenders).
- **Receiver double-output:** in addition to `<a download>`, the file blob URL is also `window.open()`-ed in a new tab so phone browsers (Chrome on Android, Termux WebView) show the file immediately even when the silent-download path doesn't surface a notification.
- Snapshot of `_recvMeta` + `_recvBuffer` before clearing them prevents the empty-buffer early-return race when finalise runs twice.

**4. Live gesture HUD restored**
- `aeroGesturePreview` (168×126) bottom-right with `<video>` mirror + landmark overlay canvas.
- 12 fps MediaPipe loop with `_processingHands` concurrency guard.
- Live curl-ratio numbers shown so user can self-calibrate hand distance from camera.

**5. Cache busting**
- `index.html` bumped `aerograb.js?v=4` so phones don't keep stale gesture/transfer code.
- Service worker `lhost-shell-v13` already covers `/aerograb.js` via network-first.

### v3 testing checklist
- [ ] Two devices on same WiFi each start their own Hevi → both auto-discover within ~5s.
- [ ] Devices appear in Hevi Network panel labelled "Online · Auto LAN".
- [ ] Hand at rest in front of camera does NOT auto-fire grab (label stays at `0/4` or `1/4`).
- [ ] Closing fist for ~0.5s consistently triggers grab; opening palm for ~0.5s triggers catch.
- [ ] After a transfer, receiver's downloaded file actually opens (or new tab shows preview); animation closes within ~3s of progress hitting 100%.
- [ ] No duplicate trigger when hand briefly disappears and reappears in same pose (must pass through neutral first).


---

## v4 — Tap-to-Open + Hardened Gesture Gate (April 21, 2026)

### Problems reported in v3 testing
1. **File downloaded but never opened** — receiver got the file in Downloads, but the auto-`window.open()` I added in v3 was being **blocked as a popup** by the mobile browser (Chrome/Termux WebView treat any `window.open()` not directly tied to a user click as a popup). The user only saw a "popup blocked" notification.
2. **AeroGrab "in-air" window suddenly appeared on BOTH phones without intent** — gesture detection still misfired on hand entering frame in a partially-curled pose, and once a stray fist was detected on phone A, it sent WAKE_UP to phone B; phone B's hand happened to be near a palm pose, so it auto-caught immediately.

### Solutions added in v4

**1. Tap-to-Open receiver UI (no more popup blocker)**
- Removed the auto `window.open()` call entirely.
- The receiver-complete animation now renders a real `<button class="ag-open-btn">Open file</button>` along with the file emoji + name.
- The button click *is* a user gesture, so `window.open(blobUrl)` succeeds without being flagged as a popup. Falls back to `location.href` if the popup is still blocked.
- Animation stage stays visible for **12 s** instead of 2.5 s so the user has time to tap.
- Blob URL is revoked after 60 s instead of 8 s — gives the user real time to actually open the file.

**2. Hardened gesture gate (prevents accidental triggers)**
- `FIST_MAX_RATIO` 0.55 → `0.50`, `PALM_MIN_RATIO` 0.78 → `0.85` — wider neutral band, harder to satisfy by accident.
- `FIRE_FRAME_COUNT` 4 → `6` — gesture must be held visibly steady for half a second.
- `NEUTRAL_FRAMES_BEFORE_RETRIGGER` 3 → `5`.
- `GESTURE_COOLDOWN_MS` 2000 → `3500`.
- New gate `_sawNeutralSinceHandAppeared` — when hand first enters frame, label shows `↺ relax hand first` and **no gesture can fire** until the user passes through a neutral pose. This kills the "hand walks in already curled → auto-fist" failure mode.
- New session-lock: while `_myRole` or `_wakePayload` is set, gesture detection is frozen and label shows `🔒 session in progress`. Prevents a second gesture firing mid-transfer.

**3. Cache busting**
- Bumped `aerograb.js?v=5` and `aerograb-animation.js?v=2` in `index.html`.

### v4 testing checklist
- [ ] Hand enters frame curled → label shows `↺ relax hand first` → no auto-fire.
- [ ] Open palm fully, then close fist for ~0.6 s → grab fires; label shows `✊ FIST 6/6` before firing.
- [ ] During a transfer, neither device's UI re-fires a gesture (label shows `🔒 session in progress`).
- [ ] After receiver progress hits 100 %, a centred green "Open file" button appears for 12 s on the receiver.
- [ ] Tapping "Open file" opens the file in a new tab without a popup-blocked banner.
- [ ] File is also already in Downloads (silent-save still works in parallel).


---

## v5 — Real On-Device ML + Draggable Preview + Strict Receiver Gate (April 21, 2026)

### Problems reported in v4 testing
1. **Phone B started receiving the moment Phone A made a fist** — i.e. the wake notification arrived and the receiver's UI auto-fired the catch. Root cause: the ratio-based math classifier on Phone B's camera was misreading the user's idle hand as `OPEN_PALM`, and because `_wakePayload` was set, it immediately fired `signalReadyToReceive()`.
2. **File would download but never auto-open**, or sometimes never even reach the Downloads folder — symptom of the silent finalise path racing the WebRTC tear-down.
3. **The "in-air" transfer window appeared on both phones without user intent** — same root cause as #1: false-positive palm on receiver as soon as a wake fired.
4. **Live camera preview hides the AeroGrab toggle** — fixed bottom-right position blocks the toggle button on smaller phones; user wants to drag it anywhere.

### Solutions added in v5

**1. Real on-device ML model (MediaPipe Tasks Vision GestureRecognizer)**
- Removed the old hand-rolled `classifyGesture()` that used finger-tip / knuckle distance ratios.
- Removed CDN script tags for `@mediapipe/hands` and `@mediapipe/camera_utils`.
- `aerograb.js` now lazy-imports `@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs` as ESM, then constructs a `GestureRecognizer` with the official `gesture_recognizer.task` model (~7.5 MB float16, served from Google's CDN, browser-cached after first load).
- Recogniser runs in `VIDEO` mode at ~12 FPS via `recognizeForVideo()`. Returns labelled gestures with confidence scores.
- Only `Closed_Fist` is mapped to `FIST`; only `Open_Palm` is mapped to `OPEN_PALM`. Every other label (`Pointing_Up`, `Thumb_Up`, `Thumb_Down`, `Victory`, `ILoveYou`, `None`) is ignored.
- Hard threshold: `score >= 0.80` required before a gesture even becomes a candidate. Frame-debounce (`6/6`) and cool-down (`3500 ms`) preserved on top.

**2. Strict receiver gate**
- Receiver branch in `onGestureDetected` no longer fires just because `_wakePayload` is set. The receiver MUST see `Open_Palm` on its OWN camera, with ML confidence ≥ 0.80, for 6 consecutive frames.
- Added explicit toast `"Nobody is sending right now. Open palm ignored."` if the user opens a palm without an active wake.
- Removed the `_wakePayload` block from the session-lock so a pending wake doesn't freeze gesture detection — receiver still needs to actively palm-open.

**3. Draggable camera preview**
- New `<div class="ag-drag-handle" id="agDragHandle">⋮⋮ drag</div>` above the preview.
- `wireDraggablePreview()` adds mouse + touch listeners, clamps to viewport, and persists `{x,y}` to `localStorage['ag_preview_pos']` so position survives reloads.
- Overlay style sets `touch-action: none` and switches to absolute `left/top` once dragged. Default position remains bottom-right `12px / 154px`.

**4. Landmark overlay alignment**
- Tasks Vision returns raw (non-mirrored) landmarks. Video element is CSS-mirrored (`transform: scaleX(-1)`). Now drawing flips landmark x via `(1 - p.x)` so the skeleton overlay matches what the user sees.

**5. Cache busting**
- Bumped `aerograb.js?v=6`, kept `aerograb-animation.js?v=2`, removed unused MediaPipe Hands script tags from `index.html`.
- Service worker bumped to `lhost-shell-v14` / `lhost-thumbs-v14` and registration query string `sw.js?v=14` so old shell caches are evicted.

**6. No server / start.sh changes required**
- The ML model is fetched directly by the browser from Google's `storage.googleapis.com` CDN. `server.js`, UDP discovery, and `start.sh` need no changes.

### v5 testing checklist
- [ ] First time turning AeroGrab on, label shows `Loading hand AI model (~7 MB, one-time)…` then `Hand AI ready`.
- [ ] Showing a `Thumb_Up`, `Victory`, or `Pointing_Up` does NOT fire grab or catch (label shows e.g. `Thumb_Up 91%` but no firing).
- [ ] Closed fist held for ~0.5 s → grab fires; label progresses `(0/6) → (6/6) → fire`.
- [ ] Open palm on RECEIVER (with a wake pending) → catch fires; on RECEIVER without wake → toast "Nobody is sending right now."
- [ ] Drag the live preview by the `⋮⋮ drag` handle — moves freely, sticks where dropped, position survives a refresh.
- [ ] Receiver completes → green "Open file" button appears; file is also in Downloads.
- [ ] Closing AeroGrab releases camera + recogniser; turning it on again loads from cache (instant).


---

## v6 — In-App Open + Hardened Gestures (April 21, 2026)

### Problems reported in v5 testing

**1. Receiver opened the file in a NEW BROWSER TAB**
- v5 receiver flow finished by triggering a download AND calling `window.open(blobUrl, '_blank')`.
- That new tab is a **raw blob viewer** — no Hevi Explorer UI, no sidebar, no AeroGrab. Just the bytes.
- On mobile, `window.open()` outside a fresh user gesture is also frequently popup-blocked, so even the bare blob page sometimes did not appear and the user was left with only the silent download.
- Net effect: the receive flow felt "complete but lost" — file landed somewhere outside the app and the user had to leave Hevi to view it.

**2. Gestures fired without a deliberate hand pose**
- During real-device testing, FIST/OPEN_PALM sometimes fired when the user was just holding the phone and walking around — hand not even pointed at the camera, sometimes barely visible.
- Three contributing causes:
  a. ML confidence floor was 0.80 — Tasks Vision occasionally hits 0.80–0.87 on stray fingers, partial palms, or face/clothing patches.
  b. Hold time was only 6 frames (~0.5 s @ 12 fps) — too short to require deliberate intent.
  c. The "neutral pose required first" guard (`_sawNeutralSinceHandAppeared`) only triggered the first time the hand entered frame. After one fire, the user could snap straight from FIST→OPEN or OPEN→FIST without passing through neutral — easy false re-trigger.
  d. No hand-size guard at all — a 5%-of-frame "fist" detection from far away counted the same as a deliberate close-up fist.

### Solutions added in v6

#### 1. Save into `HeviExplorer/` and open INSIDE Hevi (no new tab, no popup)

**Server (`server.js`, ~line 1581):** new endpoint
```
POST /api/aerograb/save?name=<encoded>&type=<encoded>
body: raw bytes (Content-Type: application/octet-stream)
```
- Writes the body to `${ROOT_DIR}/HeviExplorer/<safeName>`.
- Auto-creates the folder on first use.
- Filename collision resolution: `foo.jpg` → `foo (1).jpg` → `foo (2).jpg` … → `foo-<ts>.jpg` after 9999.
- Sanitises name with `path.basename` + strips `\\/:*?"<>|` and control chars.
- Enforces `MAX_UPLOAD_BYTES` (2 GB) by counting `req.on('data')` bytes and aborting/cleaning up on overflow.
- On finish, returns `{ ok: true, item, folder: 'HeviExplorer' }` where `item` matches Hevi's normal browse shape: `{ name, path, type:'file', size, ext, category, mimeType, modified }`.
- Calls `incrementalUpdateDir(folderAbs)` so the file appears in the index immediately.
- Privacy: this only ever runs on the receiver's OWN local Hevi server (same device the browser is on). The bytes never leave that device — they go from RAM to local disk only.

**Client (`public/aerograb.js`, `finaliseReceivedFile` + new `saveAndOpenInHevi`):**
- After WebRTC assembly, the blob is POSTed to `/api/aerograb/save` on the same origin.
- On success: `window.openFile(item)` is called → Hevi's native viewer opens in the SAME window (image viewer, video player, audio player, PDF viewer, archive viewer, text viewer — picked by category/ext).
- Animation layer is called with `openUrl=null`, so the success card has NO "Open file" button — the file is already open.
- Fallback chain (only used if `/api/aerograb/save` fails or `window.openFile` is missing): old behaviour — download via anchor, then `window.open(blobUrl)`, then `<a target="_blank">` click. The "Open file" button still appears here as last resort.

**Client (`public/app.js`, ~line 3584):**
- Explicitly `window.openFile = openFile` so the function is reliably accessible from `aerograb.js` regardless of strict-mode top-level binding behaviour.

#### 2. Stricter, more deliberate gesture detection

**Constants (`public/aerograb.js`, top of IIFE):**
| Constant | v5 | v6 | Purpose |
|---|---|---|---|
| `ML_MIN_CONFIDENCE` | 0.80 | **0.88** | Reject low-confidence noise from Tasks Vision. |
| `FIRE_FRAME_COUNT` | 6 (~0.5 s) | **10 (~0.8 s)** | Force a longer deliberate hold. |
| `NEUTRAL_FRAMES_BEFORE_RETRIGGER` | 5 | **6** | More gap between consecutive same-gesture fires. |
| `GESTURE_COOLDOWN_MS` | 3500 | 3500 | (unchanged) absolute lockout after fire. |
| `NEUTRAL_ARM_FRAMES` | — | **4** | NEW — required neutral run before EVERY fire (not just the first). |
| `MIN_HAND_BBOX` | — | **0.18** | NEW — hand bounding box must cover ≥18 % of frame. |

**Logic changes in `processGestureResults`:**
- `if (!lm)` now sets `_neutralStreak = 0` (was `+= 1`) — when the hand leaves and re-enters, the neutral run must be rebuilt from scratch.
- New hand-size guard: compute bbox `(maxX-minX, maxY-minY)` from landmarks, reject if `Math.max(w, h) < MIN_HAND_BBOX`. Tiny detections are also treated as neutral (don't reset `_neutralStreak`).
- The neutral guard is now `if (_neutralStreak < NEUTRAL_ARM_FRAMES)` and runs BEFORE every fire — not just on first hand appearance. This blocks the FIST→OPEN snap and OPEN→FIST snap re-trigger paths.
- Live debug label updated: shows `🔍 hand too small NN%`, `↺ relax hand first (k/4)`, `· neutral PP% (nN/4)`, and `✊ Closed_Fist PP% (k/10)` so the user can see exactly which gate is blocking.

**Behavioural rule the user must follow now (deliberately):**
1. Bring hand reasonably close to camera (≥18 % of frame).
2. Show a relaxed/spread hand for ~0.3 s (4 neutral frames at 12 fps).
3. Hold the target gesture (FIST or OPEN_PALM) at ≥88 % confidence for ~0.8 s (10 frames).
4. Only then does the gesture fire.

### Files changed in v6
- `server.js` — added `POST /api/aerograb/save` endpoint with stream write, collision handling, byte-cap enforcement.
- `public/aerograb.js` — rewrote `finaliseReceivedFile`, added `saveAndOpenInHevi`, retuned gesture constants, added hand-bbox guard, made `NEUTRAL_ARM_FRAMES` apply before every fire.
- `public/aerograb-animation.js` — `onReceiverComplete` now hides the "Open file" button and switches sub-text to "opened automatically" + auto-hides in 4 s when `openUrl` is null.
- `public/app.js` — explicit `window.openFile = openFile` export.
- `public/index.html` — bumped `app.js?v=13`, `aerograb.js?v=8`, `aerograb-animation.js?v=3`.

### v6 testing checklist
- [ ] Receive a file on B → file appears under `ROOT_DIR/HeviExplorer/<name>` on B's disk.
- [ ] On the same screen, Hevi's own viewer opens the received file (image / video / pdf / etc.) — no new tab, no popup, no Open button.
- [ ] Browse to the `HeviExplorer/` folder via the sidebar — file is listed and openable normally.
- [ ] Send the same filename twice → second copy lands as `<name> (1).<ext>`, not overwritten.
- [ ] Hand far away (small in frame) → label shows `🔍 hand too small` and gesture never arms.
- [ ] Snap from open → fist → open without pausing → only the FIRST gesture (open) fires; the snap-fist is rejected with `↺ relax hand first`.
- [ ] Holding fist solidly for ~0.8 s → label counter goes `(0/10) → (10/10) → fire`.
- [ ] Walking with closed hand visible to camera → no spurious receive triggers as long as hand bbox stays small or confidence stays below 0.88.

---

## v7 — Premium Animation Engine v2.0 (April 21, 2026)

### Why
v1 animations were emoji-based (🚀, ✅) and felt cheap relative to the rest of Hevi's polish. The "send" was a flying emoji; the "receive" was a bouncing emoji + green tick. No coherent visual story, no use of the brand accent (#25f4d0), no "wow" moment.

### Concept
A single coherent **energy-transfer narrative**:
- **Sender** "compresses" the file into pure energy → "shoots it as a comet" upward.
- **Receiver** sees the "comet descend from sky" → "decompress on impact" → file unfolds at centre with progress.

### Scenes (top to bottom of the engine)

**1. Sender — Energy Compression** (`showSenderLaunch`)
- File card lands at centre with conic-gradient rotating glow border (`.ag-card-glow`) and dropshadow.
- 14 energy "strings" (`.ag-string`) fly INTO the card from random angles around the perimeter — gives a tactile "the file is being grabbed and condensed" feel.
- Card pulses (1.0 → 1.05 → 0.92 → 1.18) during compression.

**2. Sender — Comet Launch** (`morphAndLaunch`)
- Card collapses into a glowing white-cyan **orb** (`.ag-orb`) with radial-gradient highlight.
- Brief white **flash** with `mix-blend-mode: screen` for the "ignition" moment.
- Custom **SVG rocket** (`rocketSVG()`): linear-gradient body (`#7afbe5 → #25f4d0 → #0a8c79`), radial-gradient flame ellipse with a 0.18s `agFlame` flicker keyframe, port-hole window with reflection, fins. Drop-shadow glow.
- Comet has a **multi-layer blurred trail** (`.ag-comet-trail`) — linear-gradient from transparent to white at the rocket end, blurred with `filter: blur(4px)`.
- Travels `-window.innerHeight * 0.85` upward in 1200 ms with `easeInCubic`.

**3. Sender — Radar Waiting** (`showSenderRadar`)
- 280 × 280 px **radar dish**: 3 staggered concentric **pulse rings** (`.ag-radar-pulse`, 3.6 s loop, 1.2 s stagger via inline `animation-delay`).
- Rotating **conic sweep cone** (`.ag-radar-sweep`) — masked with `radial-gradient` to create a hollow ring.
- Centre **core** (`.ag-radar-core`) with the file emoji, 2.2 s breathing pulse (`agBreathe`).
- Status label below: "In flight…" + dynamic "Sending… X%" once bytes start flowing.

**4. Receiver — Sky Beam + Landing** (`showReceiverLanding`)
- Sky **beam** (`.ag-sky-beam`) descends from top with `scaleY` 0 → 1, fades from 0.6 → 0.2 opacity.
- **Landing pad**: 2 dashed/solid concentric rings rotating in opposite directions, glowing core dot in centre with breathing pulse.
- **Inverted rocket** (`ag-comet-rocket-down`) descends from `-window.innerHeight * 0.65` with white motion-blur trail above it (instead of below).

**5. Receiver — Impact Shockwave** (`onLandingImpact`)
- **Shockwave ring** (`.ag-shockwave`): cyan 3 px border + 30 px box-shadow, scales 0 → 4.5 in 750 ms with `easeOutExpo`.
- **28-particle 360° burst** in two cyan tones (`#25f4d0`, `#7afbe5`) — even arc spacing with random ±10° jitter, 80–160 px throw distance.
- Comet + landing pad fade out simultaneously.

**6. Receiver — File Card Unfold** (`revealReceiverCard`)
- Card with embedded **progress ring** wrapping the file emoji.
- Progress ring is an SVG (`progressRingSVG`):
  - Background circle (rgba(37,244,208,0.15) stroke).
  - Foreground arc with `linearGradient #7afbe5 → #25f4d0`, `stroke-linecap: round`, drop-shadow glow.
  - Tiny white **shine cap** dot (`.ag-pring-shine`) that rotates around the ring 1.6 s/turn — gives a "data-streaming" feel.
- Subtitle updates "Receiving X%" → "Saving…" at 100%.

**7. Success Bloom** (`onSenderComplete` / `onReceiverComplete`)
- Custom **SVG checkmark** with stroke-dash draw-on:
  - Circle: `stroke-dasharray:176`, draws over 0.7 s.
  - Tick: `stroke-dasharray:60`, draws over 0.5 s, starts at 0.65 s (after circle is mostly drawn).
- 32-piece **3-color confetti** burst (`#25f4d0`, `#7afbe5`, `#ffffff`) with arc trajectory: shoots up 120–240 px then falls 280–380 px with rotation. `box-shadow: 0 0 6px currentColor` gives glow.
- Card auto-hides after 2.2 s (sender) / 4.2 s (receiver auto-opened) / 12 s (receiver with manual open button).

### Files changed in v7
- `public/aerograb-animation.js` — full rewrite to v2.0 (321 → ~330 lines but now SVG-driven, six new scene functions, three particle helpers).
- `public/style.css` — replaced AeroGrab animation block (lines 6627–6802 area) with v2.0 styles. New keyframes: `agSpin`, `agFlame`, `agRadarPulse`, `agBreathe`, `agDrawCircle`, `agDrawTick`. Added `prefers-reduced-motion` opt-out.
- `public/index.html` — bumped `aerograb-animation.js?v=4`.

### API surface (unchanged from v1 → v2)
`window.aeroAnim` still exposes `showSenderLaunch`, `showReceiverLanding`, `updateSenderProgress`, `updateReceiverProgress`, `onSenderComplete`, `onReceiverComplete`. So `aerograb.js` needs zero changes.

### v7 testing checklist
- [ ] Trigger send → centre card appears with rotating conic glow, energy strings flow in, card morphs to orb, white flash, custom SVG rocket comet streaks up with blurred trail.
- [ ] After launch → radar scene appears with 3 pulsing rings + rotating sweep + breathing core; sub-label updates with live "Sending… X%".
- [ ] On receiver → sky beam descends, landing pad rings rotate, inverted rocket falls with trail above it, shockwave + burst on impact, card unfolds with shimmer-cap progress ring.
- [ ] Progress ring fills smoothly from 0 → 100, white shine cap orbits continuously while filling.
- [ ] On completion → SVG check draws on (circle then tick), 3-color confetti rains, card auto-hides.
- [ ] On a device with `prefers-reduced-motion: reduce` → ambient loops disable but transitions still play.

---

## v8 — Live Receiver Progress + Recent Receives Panel (April 21, 2026)

### Bug fix: receiver progress ring stuck at 0 % on small/medium files

**Root cause** (in v2 animation engine):
The receiver landing scene takes ~1.2 s to play (sky beam → comet descent → impact shockwave → card unfold). The progress card containing `#agPringFill` and `#agRecvPct` is only mounted into the DOM at the end of that sequence (inside `revealReceiverCard`).

But WebRTC chunks start arriving as soon as the data channel is open — often within 100–300 ms of `showReceiverLanding` being called. During that 1.2 s window, every call to `aeroAnim.updateReceiverProgress(pct)` was hitting `document.getElementById('agPringFill')` which returned `null`, and the update was silently dropped. By the time the card mounted, transfers ≤ 2 s had already finished and the ring never animated — it would jump straight from "not visible" to "Saving…".

**Fix** (`public/aerograb-animation.js`):
- Added module-scope `_pendingRecvPct` cache.
- `updateReceiverProgress(pct)` now stores pct AND attempts the DOM update.
- `showReceiverLanding` resets `_pendingRecvPct = 0` at scene start.
- `revealReceiverCard` calls `applyRecvPct(_pendingRecvPct)` immediately after mounting the card → any pct that arrived during the landing sequence is replayed onto the freshly-mounted ring, and the ring now animates from the correct starting %.

### Feature: "Recent AeroGrab" history panel

Located **directly below Cloud Storage** on the home view, hidden when the history is empty. Activates the moment the user successfully receives their first file.

**Storage** (`localStorage['aerograb_history']`):
- Capped at 30 entries (oldest dropped at write time).
- De-duped by `path` — receiving the same file again moves it to the top instead of duplicating.
- Each entry is a Hevi-shaped item (`{name, path, type, size, ext, category, mimeType, modified}`) plus our own `receivedAt: Date.now()` field.

**Hooks added in `public/aerograb.js`:**
- `recordReceiveHistory(savedItem)` — called from inside `saveAndOpenInHevi` right after the server confirms the save and returns the item, BEFORE the openFile call. Ensures even if openFile fails the item still appears in history.
- `renderAeroHistory()` — re-renders the section. Hidden when empty.
- `clearAeroHistory()` — wired to the section's "Clear" button (with confirm dialog noting that disk files are NOT deleted).
- `initAeroHistory()` — runs on DOMContentLoaded; binds Clear button + does first render.

**Click behaviour:**
- `HEAD /file?path=...` first to verify the file still exists on disk (cheap — server returns 404 if missing without streaming any bytes).
- If 404 → the row gets `.ag-hist-missing` class (dimmed, grey arrow) + toast "File no longer exists on disk".
- If 200 → `window.openFile(item)` opens it in Hevi's native viewer (image / video / audio / pdf / archive / text — same flow as receiving fresh).

**UI** (`public/index.html` + `public/style.css`):
- Section ID `aeroHistorySection`, header reads "📥 Recent AeroGrab" with a "Clear" button (matches `view-all-btn` style of the Cloud header).
- Each row: 38 px square cyan-tinted icon (auto-picked emoji by extension) → name + relative time + size → cyan chevron.
- Hover: row gets stronger cyan glow + border. Tap: 0.98 scale.
- Sub-line uses `fmtRelative(ts)` → "just now / 5m ago / 3h ago / 2d ago / DD/MM/YYYY".

### Files changed in v8
- `public/aerograb-animation.js` — added `_pendingRecvPct` cache + `applyRecvPct()` helper; `updateReceiverProgress` now caches; `showReceiverLanding` resets cache; `revealReceiverCard` replays cached pct on mount.
- `public/aerograb.js` — added `recordReceiveHistory()` call inside `saveAndOpenInHevi`; appended ~130 lines of history module (`loadHistory`, `saveHistory`, `recordReceiveHistory`, `clearAeroHistory`, `fmtRelative`, `fmtSize`, `iconForItem`, `renderAeroHistory`, `escAtt`, `initAeroHistory`).
- `public/index.html` — new `<section id="aeroHistorySection">` after `cloudSection`; bumped `aerograb-animation.js?v=5`, `aerograb.js?v=9`.
- `public/style.css` — new `.ag-history-list` + `.ag-hist-item` + `.ag-hist-icon` + `.ag-hist-meta` + `.ag-hist-name` + `.ag-hist-sub` + `.ag-hist-arrow` + `.ag-hist-missing` blocks (added before the Animation Engine v2.0 section).

### v8 testing checklist
- [ ] Send a 50–200 MB file → on receiver, ring fills smoothly from 0 → 100 (not stuck at 0 then jumping to 100).
- [ ] Send a tiny 100 KB file → ring shows at least one intermediate value before "Saving…".
- [ ] After first received file → "Recent AeroGrab" section appears below Cloud Storage.
- [ ] Click a history row → file opens in Hevi's native viewer (same as browsing into HeviExplorer/).
- [ ] Receive the same file twice → only one row, moved to top, with updated timestamp.
- [ ] Manually delete the file from disk via browser → click that history row → row dims, toast "File no longer exists".
- [ ] Click "Clear" → confirm dialog → section disappears, files on disk untouched.
- [ ] Reload the page → history persists (localStorage).

---

## v9 — First-Run Tutorial Overlay (April 21, 2026)

### Why
Brand-new users had no idea what to do when they tapped the AeroGrab toggle. They got hit with a camera-permission prompt with zero context, and even after granting they had to guess that "fist = send" and "open palm = receive." The toast on activation said as much, but it disappeared in 3 seconds and many users missed it. Net result: lots of failed first-attempt grabs, a couple of "what is this thing?" reactions.

### What it does
A 3-step overlay that auto-shows the **very first time** a user toggles AeroGrab on, BEFORE the camera permission prompt. Persists in `localStorage['aerograb_tutorial_seen'] = '1'`. Skippable, replayable.

### Steps
1. **Step 1 — "Make a Fist to GRAB"** — large ✊ emoji centered with two staggered cyan pulse rings expanding outward + gentle bob animation. Body: "Pick a file, then close your hand into a fist for ~1 second. The file launches into the air, ready to catch."
2. **Step 2 — "Open Palm to CATCH"** — same art frame with 🖐️. Body: "When a friend grabs nearby, show your open palm for ~1 second. The file lands inside Hevi automatically."
3. **Step 3 — "Quick Tips"** — three icon-tip rows (📷 close to camera, ⏱️ hold ~1 s, 👀 watch the live status label). Body: "That's it! AeroGrab will guide you with on-screen hints whenever it can't read your gesture."

### UX details
- **Backdrop**: radial-gradient dark + 16 px backdrop-blur, `z-index: 950` (sits above the animation stage but below toasts).
- **Card**: max 380 px, gradient background, cyan accent border + glow shadow.
- **Skip pill** top-right ("Skip"), greyed text → cyan on hover. Tapping skip → marks seen + resolves with `false` → AeroGrab does NOT activate (user clearly isn't ready).
- **Next button** bottom-right: cyan gradient pill, advances steps. Reads "Next →" for steps 1–2, "Got it ✓" on step 3. Tapping "Got it ✓" → marks seen + resolves with `true` → AeroGrab continues to camera permission flow.
- **Progress dots** bottom-left: 3 pills, active one stretches to 24 px width with full cyan fill (matches Hevi's overall pill-progress visual language).
- **Step transition** — `agTutSlide` keyframe (12 px upward fade-in over 0.4 s with `cubic-bezier(0.16, 1, 0.3, 1)`).
- **Reduced motion** — pulse + bob disabled under `prefers-reduced-motion: reduce`; transitions still play.

### Hook point
`toggleAeroGrab(enable)` in `public/aerograb.js`:
```js
if (enable) {
  if (!hasSeenTutorial()) {
    const proceed = await showTutorial();
    if (!proceed) return;        // user skipped → don't activate
  }
  // ... existing activation flow (camera permission, MediaPipe init, etc.)
}
```
Order is intentional: tutorial → camera permission → MediaPipe init. Users understand WHY the camera is needed before the browser prompt appears.

### Public API
`window.aeroGrab.replayTutorial()` — wipes the localStorage flag and re-shows the overlay. Can be wired to a future "Replay tutorial" button in Settings → AeroGrab without code changes here.

### Files changed in v9
- `public/index.html` — added `<div id="aeroTutorial">` overlay with 3 step blocks, skip + next buttons, progress dots. Bumped `aerograb.js?v=10`.
- `public/style.css` — added ~140 lines of `.ag-tut*` styles (overlay, card, art zone, pulse, emoji bob, tips list, kicker/title/body, dots, next/skip buttons). Five new keyframes: `agTutFade`, `agTutSlide`, `agTutPulse`, `agTutBob`. Reduced-motion respected.
- `public/aerograb.js` — added `hasSeenTutorial`, `markTutorialSeen`, `showTutorial` (returns `Promise<boolean>`), `replayTutorial`. Hooked into `toggleAeroGrab` ahead of camera permission. Exposed `replayTutorial` on `window.aeroGrab`.

### v9 testing checklist
- [ ] Fresh browser (or `localStorage.removeItem('aerograb_tutorial_seen')`) → tap AeroGrab toggle → tutorial appears BEFORE camera prompt.
- [ ] Steps advance with Next button; dots indicate position; final button reads "Got it ✓".
- [ ] Tap "Got it ✓" → overlay closes → camera permission prompt appears → AeroGrab activates.
- [ ] Tap "Skip" on any step → overlay closes → AeroGrab does NOT activate (toggle stays off).
- [ ] Reload the page → tap AeroGrab toggle again → tutorial does NOT show, AeroGrab activates directly.
- [ ] In console: `aeroGrab.replayTutorial()` → overlay shows again from step 1.
- [ ] On a device with `prefers-reduced-motion: reduce` → pulse rings + emoji bob stop, but step slide transitions still work.

---

## v10 — Cancel Hardening + Heating Optimisations + Auto-Update (April 22, 2026)

### Why
Real-device launch testing surfaced three issues that needed to ship before public release:
1. **Cancel button only worked on one side** — pressing Cancel on the receiver did not stop the sender, and pressing Cancel on the sender sometimes left a phantom receiver UI alive that re-mounted itself when the last few late chunks arrived.
2. **Phones got hot during long idle periods with AeroGrab on** — even when no transfer was happening, the camera + ML loop kept running at full 12 fps, the WebRTC keep-alive used a fat 16 MB buffer, and the music UI fed the audio visualiser at 60 fps RAF.
3. **End-users on `git clone`-based installs had no way to receive bug fixes** — they had to manually `git pull` to pick up new releases.

### Solutions added in v10

**1. Cancel button — both-sides reliable**
- `_cancelDisabled` is now a sticky boolean. Set to `true` the moment cancel is pressed; any late `onmessage` data chunks that arrive after that point are dropped on the floor without re-instantiating the receiver UI. Without this guard, late chunks were calling `showReceiverLanding()` again 1–2 s after cancel, recreating the animation stage from scratch.
- New `armCancelButton()` helper resets `_cancelDisabled = false` at the start of every new transfer (`initiateGrab` + `signalReadyToReceive`). Without this, the second transfer in a session would never be cancellable because the sticky guard from the previous transfer was still latched.
- New socket event **`TRANSFER_CANCEL_RELAY`** — when either side presses cancel, the client emits this with the `sessionId`. Server forwards it to the other peer (works across local sockets AND cross-server LAN peers via the `/api/aerograb/lan/end` relay). This is the backup in case the WebRTC channel is already torn down by the cancelling side.
- Symmetric teardown on cancel: both sides close `RTCPeerConnection`, null out `_dataChannel` / `_recvBuffer` / `_recvMeta`, hide animation stage, toast "Transfer cancelled".

**2. Heating + battery optimisations (the big sweep)**

*Camera + ML loop (`public/aerograb.js`):*
- Camera resolution dropped from 320×240 to **256×192** (50  0.000000ewer pixels per frame for the recogniser to chew on).
- Adaptive 3-tier ML loop: **12 fps** when a hand is detected, **5 fps** after 3 s no-hand, **2 fps** after 10 s no-hand or when tab is hidden.
- `visibilitychange` listener now sets `track.enabled = false` on the camera track when tab is hidden — sensor parks completely. Re-enables on visibility-true and ramps back to active tier on first hand detection.

*WebRTC (`public/aerograb.js`):*
- `BUFFER_HIGH_WATER` lowered **16 MB → 8 MB**. RAM pressure on phones was causing GC stalls during 100+ MB transfers.

*Sender UI (`public/aerograb.js`):*
- The "Sending… X
---

## v10 — Cancel Hardening + Heating Optimisations + Auto-Update (April 22, 2026)

### Why
Real-device launch testing surfaced three issues that needed to ship before public release:
1. **Cancel button only worked on one side** — pressing Cancel on the receiver did not stop the sender, and pressing Cancel on the sender sometimes left a phantom receiver UI alive that re-mounted itself when the last few late chunks arrived.
2. **Phones got hot during long idle periods with AeroGrab on** — even when no transfer was happening, the camera + ML loop kept running at full 12 fps, the WebRTC keep-alive used a fat 16 MB buffer, and the music UI fed the audio visualiser at 60 fps RAF.
3. **End-users on `git clone`-based installs had no way to receive bug fixes** — they had to manually `git pull` to pick up new releases.

### Solutions added in v10

**1. Cancel button — both-sides reliable**
- `_cancelDisabled` is now a sticky boolean. Set to `true` the moment cancel is pressed; any late `onmessage` data chunks that arrive after that point are dropped on the floor without re-instantiating the receiver UI. Without this guard, late chunks were calling `showReceiverLanding()` again 1–2 s after cancel, recreating the animation stage from scratch.
- New `armCancelButton()` helper resets `_cancelDisabled = false` at the start of every new transfer (`initiateGrab` + `signalReadyToReceive`). Without this, the second transfer in a session would never be cancellable because the sticky guard from the previous transfer was still latched.
- New socket event **`TRANSFER_CANCEL_RELAY`** — when either side presses cancel, the client emits this with the `sessionId`. Server forwards it to the other peer (works across local sockets AND cross-server LAN peers via the `/api/aerograb/lan/end` relay). This is the backup in case the WebRTC channel is already torn down by the cancelling side.
- Symmetric teardown on cancel: both sides close `RTCPeerConnection`, null out `_dataChannel` / `_recvBuffer` / `_recvMeta`, hide animation stage, toast "Transfer cancelled".

**2. Heating + battery optimisations (the big sweep)**

*Camera + ML loop (`public/aerograb.js`):*
- Camera resolution dropped from 320×240 to **256×192** (50 % fewer pixels per frame for the recogniser to chew on).
- Adaptive 3-tier ML loop: **12 fps** when a hand is detected, **5 fps** after 3 s no-hand, **2 fps** after 10 s no-hand or when tab is hidden.
- `visibilitychange` listener now sets `track.enabled = false` on the camera track when tab is hidden — sensor parks completely. Re-enables on visibility-true and ramps back to active tier on first hand detection.

*WebRTC (`public/aerograb.js`):*
- `BUFFER_HIGH_WATER` lowered **16 MB → 8 MB**. RAM pressure on phones was causing GC stalls during 100+ MB transfers.

*Sender UI (`public/aerograb.js`):*
- The "Sending… X%" label was being repainted at ~30 fps. Throttled to **10 fps** — visually identical, way less main-thread work.

*Service worker (`public/sw.js`):*
- Bumped `lhost-shell-v17` → `v18` → `v19` to evict the old caches.
- Added LRU cap of **200 entries** on the thumbnail cache (`lhost-thumbs-v19`). Previously unbounded — long Hevi Explorer sessions could accumulate hundreds of MB of cached thumbnails.

*Music page (separate fix, mentioned for completeness):*
- Audio visualiser RAF loop now stops when tab is hidden. Was burning ~10 % CPU even when the user was on a different tab.

*Project size (`public/img/`):*
- `twh-logo.png` recompressed 1.25 MB → 21 KB.
- Avatar + background PNGs recompressed.
- Deleted duplicate `twh-logo.jpeg` and `creator/twh-logo.png`.
- Total payload cut by ~5.7 MB — huge cold-start improvement on slow LAN.

**3. Auto-update wrapper (`start.sh`)**
- On startup, runs `git pull --ff-only origin <current-branch>` against the configured remote.
- Internet check (ping `1.1.1.1` with 2 s timeout) — if offline, skips the pull silently and continues to boot.
- Dirty-tree guard — if `git status --porcelain` shows local changes, skips the pull and warns the user, so dev work is never clobbered.
- If `package.json` changed during the pull, automatically runs `npm install` before starting the server.
- Honours `HEVI_NO_UPDATE=1` env var to skip the entire update step (useful for offline / pinned deployments).
- End-users who installed via `git clone https://github.com/technicalwhitehat-yt/hevi-explorer` now receive every release automatically the next time they restart the app — no manual `git pull` required.

**4. YouTube Subscribe pill (small UX add)**
- Replaced the static "Made by TWH" watermark with a clickable Subscribe pill in the corner.
- Dark glass background + red YouTube icon chip + red "Subscribe" text. Blends with the teal aesthetic instead of fighting it (full red would have looked cheap).
- Links to `youtube.com/@technicalwhitehat?sub_confirmation=1` so the subscribe dialog opens directly.

### Files changed in v10
- `public/aerograb.js` — sticky `_cancelDisabled` guard, `armCancelButton()`, `TRANSFER_CANCEL_RELAY` emit + handler, adaptive 3-tier ML loop, camera 256×192, sender label throttle 30→10 fps, `visibilitychange` track parking.
- `server.js` — `TRANSFER_CANCEL_RELAY` socket relay (local + LAN cross-server), `BUFFER_HIGH_WATER` constant updated.
- `public/sw.js` — bumped to `lhost-shell-v19` / `lhost-thumbs-v19`, added 200-entry LRU thumb cache cap.
- `public/index.html` — Subscribe pill markup, bumped `aerograb.js?v=10` and `sw.js?v=19`.
- `public/style.css` — Subscribe pill styles.
- `start.sh` — auto-update wrapper with internet check, dirty-tree guard, npm reinstall trigger, `HEVI_NO_UPDATE` skip flag.
- `public/img/*` — twh-logo + avatars + background recompressed; duplicates deleted.
- `package.json` — version bumped (so the in-app "Check for update" button has a new tag to compare against).

### v10 testing checklist
- [ ] Press Cancel on the SENDER mid-transfer → sender hides, receiver hides within ~500 ms (via `TRANSFER_CANCEL_RELAY`), no phantom UI re-appears even if late chunks arrive.
- [ ] Press Cancel on the RECEIVER mid-transfer → same behaviour, sender stops sending, both UIs gone.
- [ ] Cancel a transfer, then immediately start a second transfer → second transfer is fully cancellable (no latched sticky guard from the previous one).
- [ ] Turn AeroGrab on, hold phone idle facing wall for 30 s → label transitions to idle then standby tier; phone temperature stays normal.
- [ ] Switch to another tab for 1 minute → `visibilitychange` fires, camera track parks, ML loop drops to 2 fps. Switch back → ramps up.
- [ ] Run `git tag v1.0.X && git push --tags` → user with auto-update enabled restarts their server → `start.sh` pulls the new release on boot, runs `npm install` if `package.json` changed, then starts.
- [ ] Set `HEVI_NO_UPDATE=1` and restart → `start.sh` prints "Skipping auto-update (HEVI_NO_UPDATE set)" and starts immediately.
- [ ] Subscribe pill bottom-right opens YouTube with `?sub_confirmation=1` → subscribe dialog appears.

### Notes for the next AI
- The git remote inside the Replit dev environment still points to the old `hiddeneyes99/l-host` repo (left untouched — destructive to change). End-users clone from `technicalwhitehat-yt/hevi-explorer` so their `start.sh` auto-update points at the right place. The in-app "Check for update" button uses the correct repo regardless.
- To ship a new auto-update release: bump `package.json` `"version"` AND create a GitHub Release with a matching tag (e.g. `v1.0.1`). The "Check" button compares against the latest release tag.
- The Blueprint (`AeroGrab_Blueprint.md`) was fully refreshed to v3.0 in this same session and now reflects everything from v1 through v10 in its main body — phased rollout, function reference, tech stack, and gesture/transfer/cancel/discovery sections all describe the current stable code, not historical state.

/* ═══════════════════════════════════════════════════════════════════════════
   AeroGrab Fly  —  Animation Engine v2.0
   by Technical White Hat (TWH)
   Premium SVG-based scenes:
     Phase 1: Energy Compression  — particle strings collapse into file orb
     Phase 2: Comet Launch         — file orb stretches & streaks upward
     Phase 3: Radar Waiting        — rotating sweep + concentric pulses
     Phase 4: Sky Landing          — beam + comet descent + impact shockwave
     Phase 5: Shimmer Progress     — animated arc with orbiting shine
     Phase 6: Success Bloom        — SVG check draw-on + 3-color confetti
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

(function AeroGrabAnimation() {
  const $  = id => document.getElementById(id);

  // ── Overlay stage helper ───────────────────────────────────────────────────
  function getStage() { return $('aeroAnimStage'); }
  function clearStage() {
    const s = getStage();
    if (s) s.innerHTML = '';
  }
  function showStage()  { const s = getStage(); if (s) s.classList.remove('hidden'); }
  function hideStage()  { const s = getStage(); if (s) s.classList.add('hidden'); clearStage(); }

  // ── SVG Building Blocks ────────────────────────────────────────────────────
  // Centralised so every scene shares the same artwork — easier to refine.
  function rocketSVG(extraClass) {
    return `
      <svg class="ag-rocket-svg ${extraClass || ''}" viewBox="0 0 64 96" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="agRocketBody" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="#7afbe5"/>
            <stop offset="0.55" stop-color="#25f4d0"/>
            <stop offset="1" stop-color="#0a8c79"/>
          </linearGradient>
          <radialGradient id="agRocketFlame" cx="0.5" cy="0.15">
            <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
            <stop offset="0.35" stop-color="#25f4d0" stop-opacity="0.8"/>
            <stop offset="1" stop-color="#25f4d0" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <ellipse class="ag-rocket-flame" cx="32" cy="84" rx="11" ry="20" fill="url(#agRocketFlame)"/>
        <path class="ag-rocket-body"
              d="M32 4 C 22 18, 18 36, 18 56 L 18 70 L 46 70 L 46 56 C 46 36, 42 18, 32 4 Z"
              fill="url(#agRocketBody)" stroke="#bafff2" stroke-width="1.2"/>
        <path d="M18 56 L 8 74 L 18 68 Z" fill="#0a8c79"/>
        <path d="M46 56 L 56 74 L 46 68 Z" fill="#0a8c79"/>
        <circle cx="32" cy="36" r="7" fill="#06121a" stroke="#bafff2" stroke-width="1.2"/>
        <circle cx="30" cy="34" r="2.5" fill="#7afbe5" opacity="0.85"/>
      </svg>`;
  }

  function checkmarkSVG() {
    return `
      <svg class="ag-check-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <circle class="ag-check-circle" cx="32" cy="32" r="28" fill="none"
                stroke="#25f4d0" stroke-width="3"/>
        <path class="ag-check-tick" d="M 18 33 L 28 43 L 46 24" fill="none"
              stroke="#25f4d0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  }

  function progressRingSVG() {
    // Two-layer ring: base + animated fill + rotating shimmer cap.
    return `
      <svg class="ag-pring-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="agPringFill" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stop-color="#7afbe5"/>
            <stop offset="1" stop-color="#25f4d0"/>
          </linearGradient>
        </defs>
        <circle class="ag-pring-bg"  cx="50" cy="50" r="42" fill="none" stroke="rgba(37,244,208,0.15)" stroke-width="6"/>
        <circle class="ag-pring-fill" id="agPringFill" cx="50" cy="50" r="42" fill="none"
                stroke="url(#agPringFill)" stroke-width="6" stroke-linecap="round"
                stroke-dasharray="263.9" stroke-dashoffset="263.9"
                transform="rotate(-90 50 50)"/>
        <circle class="ag-pring-shine" cx="50" cy="8" r="3" fill="#ffffff"/>
      </svg>`;
  }

  // ── Particle helpers ───────────────────────────────────────────────────────
  // Burst — particles fly outward in even arcs (used on impact / success).
  function spawnBurst(container, count, colors) {
    const palette = colors || ['var(--accent)'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'ag-particle';
      const c = palette[i % palette.length];
      p.style.background = c;
      p.style.boxShadow = `0 0 8px ${c}`;
      container.appendChild(p);
      const angle = (360 / count) * i + (Math.random() * 20 - 10);
      const dist  = 80 + Math.random() * 80;
      anime({
        targets: p,
        translateX: Math.cos(angle * Math.PI / 180) * dist,
        translateY: Math.sin(angle * Math.PI / 180) * dist,
        opacity:    [1, 0],
        scale:      [1, 0.2],
        duration:   900 + Math.random() * 500,
        easing:     'easeOutQuart',
        complete:   () => p.remove(),
      });
    }
  }

  // Inflow — energy strings flow INTO the centre from edges (the "grab" feel).
  function spawnInflow(container, count) {
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'ag-string';
      container.appendChild(p);
      const angle = (360 / count) * i;
      const startDist = 180 + Math.random() * 60;
      const sx = Math.cos(angle * Math.PI / 180) * startDist;
      const sy = Math.sin(angle * Math.PI / 180) * startDist;
      anime({
        targets: p,
        translateX: [sx, 0],
        translateY: [sy, 0],
        rotate:     angle + 90,
        opacity:    [0, 1, 0],
        scaleY:     [0.4, 1.4, 0.2],
        duration:   850,
        delay:      i * 28,
        easing:     'easeInQuad',
        complete:   () => p.remove(),
      });
    }
  }

  // Confetti — random arcs falling with gravity feel (success state).
  function spawnConfetti(container, count) {
    const palette = ['#25f4d0', '#7afbe5', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'ag-confetti';
      p.style.background = palette[i % palette.length];
      container.appendChild(p);
      const dx = (Math.random() - 0.5) * 360;
      const dy = -120 - Math.random() * 120;
      const dy2 = 280 + Math.random() * 100;
      anime({
        targets: p,
        translateX: [{ value: 0, duration: 0 }, { value: dx, duration: 1300, easing: 'easeOutQuad' }],
        translateY: [{ value: 0, duration: 0 }, { value: dy, duration: 500, easing: 'easeOutQuad' },
                     { value: dy2, duration: 900, easing: 'easeInQuad' }],
        rotate:     [0, 540 + Math.random() * 360],
        opacity:    [{ value: 1, duration: 100 }, { value: 1, duration: 1100 }, { value: 0, duration: 200 }],
        complete:   () => p.remove(),
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SENDER — Energy Compression → Comet Launch → Radar Waiting
  // ═══════════════════════════════════════════════════════════════════════════
  function showSenderLaunch(payload) {
    const stage = getStage();
    if (!stage) return;
    clearStage();
    showStage();

    // ── Backdrop: subtle radial glow that intensifies during compression ─────
    const aura = document.createElement('div');
    aura.className = 'ag-aura';
    stage.appendChild(aura);
    anime({ targets: aura, opacity: [0, 0.9], scale: [0.6, 1.15], duration: 900, easing: 'easeOutQuart' });

    // ── File card (will morph into orb) ──────────────────────────────────────
    const card = document.createElement('div');
    card.className = 'ag-file-card';
    card.innerHTML = `
      <div class="ag-card-glow"></div>
      <div class="ag-card-icon">${getFileEmoji(payload)}</div>
      <div class="ag-card-name">${escHtml(payload.name || 'File')}</div>
    `;
    stage.appendChild(card);
    anime({ targets: card, scale: [0.6, 1], opacity: [0, 1], duration: 380, easing: 'easeOutBack' });

    // Inflow strings start ~250ms after card lands
    setTimeout(() => spawnInflow(stage, 14), 250);

    // Card pulses while energy converges
    anime({
      targets: card,
      scale: [{ value: 1.05, duration: 350 }, { value: 0.92, duration: 250 },
              { value: 1.18, duration: 200, easing: 'easeOutBack' }],
      delay: 400,
    });

    // After ~1100ms, morph card into orb and fire comet
    setTimeout(() => morphAndLaunch(stage, payload, card), 1150);
  }

  function morphAndLaunch(stage, payload, card) {
    // Card collapses into a glowing orb at centre
    anime({
      targets: card,
      scale:   [1.18, 0.45],
      opacity: [1, 0],
      duration: 280,
      easing:  'easeInQuad',
      complete: () => card.remove(),
    });

    const orb = document.createElement('div');
    orb.className = 'ag-orb';
    stage.appendChild(orb);
    anime({
      targets: orb,
      scale:   [{ value: 0.3, duration: 0 }, { value: 1.4, duration: 220, easing: 'easeOutBack' },
               { value: 1.2, duration: 100 }],
      opacity: [{ value: 0, duration: 0 }, { value: 1, duration: 220 }],
    });

    // Brief flash before launch
    setTimeout(() => {
      const flash = document.createElement('div');
      flash.className = 'ag-flash';
      stage.appendChild(flash);
      anime({
        targets: flash, opacity: [0, 0.85, 0], scale: [0.4, 2.2],
        duration: 380, easing: 'easeOutExpo', complete: () => flash.remove(),
      });
    }, 320);

    // Comet: orb stretches into a streak and launches up
    setTimeout(() => {
      const comet = document.createElement('div');
      comet.className = 'ag-comet';
      comet.innerHTML = `
        <div class="ag-comet-trail"></div>
        <div class="ag-comet-head">${rocketSVG('ag-comet-rocket')}</div>
      `;
      stage.appendChild(comet);
      anime({ targets: orb, scale: [1.2, 0.2], opacity: [1, 0], duration: 250, easing: 'easeInQuad',
              complete: () => orb.remove() });

      anime({
        targets: comet,
        translateY: [0, -window.innerHeight * 0.85],
        scale:      [{ value: 0.6, duration: 0 }, { value: 1.0, duration: 250, easing: 'easeOutBack' },
                     { value: 0.7, duration: 800, easing: 'easeInCubic' }],
        opacity:    [{ value: 0, duration: 0 }, { value: 1, duration: 200 },
                     { value: 1, duration: 600 }, { value: 0, duration: 250 }],
        duration:   1200,
        complete:   () => { comet.remove(); showSenderRadar(stage, payload); },
      });

      // Aura fades out as comet leaves
      const auraEl = stage.querySelector('.ag-aura');
      if (auraEl) anime({ targets: auraEl, opacity: 0, duration: 700, easing: 'easeOutQuad' });
    }, 600);
  }

  function showSenderRadar(stage, payload) {
    clearStage();
    const radar = document.createElement('div');
    radar.className = 'ag-radar';
    radar.innerHTML = `
      <div class="ag-radar-pulse"></div>
      <div class="ag-radar-pulse" style="animation-delay:1.2s"></div>
      <div class="ag-radar-pulse" style="animation-delay:2.4s"></div>
      <div class="ag-radar-sweep"></div>
      <div class="ag-radar-core">
        <div class="ag-radar-icon">${getFileEmoji(payload || {})}</div>
      </div>
      <div class="ag-radar-label">
        <div class="ag-radar-title">In flight…</div>
        <div class="ag-radar-sub" id="agSenderProgress">Waiting for receiver</div>
      </div>
    `;
    stage.appendChild(radar);
    anime({ targets: radar, opacity: [0, 1], scale: [0.8, 1], duration: 500, easing: 'easeOutBack' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECEIVER — Sky Beam → Comet Descent → Impact Shockwave → File Reveal
  // ═══════════════════════════════════════════════════════════════════════════
  function showReceiverLanding(meta) {
    const stage = getStage();
    if (!stage) return;
    clearStage();
    showStage();
    _pendingRecvPct = 0;

    // ── Backdrop aura ────────────────────────────────────────────────────────
    const aura = document.createElement('div');
    aura.className = 'ag-aura';
    stage.appendChild(aura);
    anime({ targets: aura, opacity: [0, 0.7], scale: [0.6, 1.1], duration: 700, easing: 'easeOutQuart' });

    // ── Sky beam coming down ─────────────────────────────────────────────────
    const beam = document.createElement('div');
    beam.className = 'ag-sky-beam';
    stage.appendChild(beam);
    anime({
      targets: beam,
      scaleY:  [{ value: 0, duration: 0 }, { value: 1, duration: 600, easing: 'easeOutQuart' }],
      opacity: [{ value: 0, duration: 0 }, { value: 0.6, duration: 400 }, { value: 0.2, duration: 600 }],
    });

    // ── Landing pad rings (glowing target) ───────────────────────────────────
    const pad = document.createElement('div');
    pad.className = 'ag-landing-pad';
    pad.innerHTML = `<div class="ag-pad-ring"></div><div class="ag-pad-ring ag-pad-ring2"></div><div class="ag-pad-core"></div>`;
    stage.appendChild(pad);
    anime({ targets: pad, opacity: [0, 1], scale: [0.6, 1], duration: 500, easing: 'easeOutBack' });

    // ── Descending comet (rocket inverted) ───────────────────────────────────
    setTimeout(() => {
      const comet = document.createElement('div');
      comet.className = 'ag-comet ag-comet-down';
      comet.innerHTML = `
        <div class="ag-comet-trail ag-comet-trail-down"></div>
        <div class="ag-comet-head">${rocketSVG('ag-comet-rocket-down')}</div>
      `;
      stage.appendChild(comet);
      anime({
        targets: comet,
        translateY: [-window.innerHeight * 0.65, 0],
        scale:      [{ value: 0.55, duration: 0 }, { value: 1, duration: 600, easing: 'easeOutQuad' },
                     { value: 1.05, duration: 200 }],
        opacity:    [{ value: 0, duration: 0 }, { value: 1, duration: 200 }, { value: 1, duration: 700 }],
        duration:   900,
        easing:     'easeInQuad',
        complete:   () => onLandingImpact(stage, meta, comet),
      });
    }, 350);
  }

  function onLandingImpact(stage, meta, comet) {
    // ── Shockwave ring ───────────────────────────────────────────────────────
    const shock = document.createElement('div');
    shock.className = 'ag-shockwave';
    stage.appendChild(shock);
    anime({ targets: shock, scale: [0, 4.5], opacity: [0.85, 0], duration: 750, easing: 'easeOutExpo',
            complete: () => shock.remove() });

    // ── 360° particle burst ──────────────────────────────────────────────────
    spawnBurst(stage, 28, ['#25f4d0', '#7afbe5']);

    // Fade out comet + landing pad
    anime({ targets: comet, scale: 0.4, opacity: 0, duration: 350, easing: 'easeInQuad',
            complete: () => comet.remove() });
    const pad = stage.querySelector('.ag-landing-pad');
    if (pad) anime({ targets: pad, opacity: 0, scale: 1.4, duration: 500, easing: 'easeOutQuad',
                     complete: () => pad.remove() });

    // ── File card unfolds at centre with progress ring ───────────────────────
    setTimeout(() => revealReceiverCard(stage, meta), 280);
  }

  function revealReceiverCard(stage, meta) {
    const card = document.createElement('div');
    card.className = 'ag-recv-card';
    card.innerHTML = `
      <div class="ag-recv-ring-wrap">
        ${progressRingSVG()}
        <div class="ag-recv-icon">${getFileEmoji(meta || {})}</div>
      </div>
      <div class="ag-recv-name">${escHtml(meta && meta.name ? meta.name : 'Incoming…')}</div>
      <div class="ag-recv-sub" id="agRecvPct">Receiving 0%</div>
    `;
    stage.appendChild(card);
    anime({
      targets: card,
      scale:   [0.4, 1.05, 1],
      opacity: [0, 1],
      duration: 600,
      easing:  'easeOutBack',
    });
    // Replay any pct that arrived during the landing scene before the ring mounted.
    if (_pendingRecvPct > 0) applyRecvPct(_pendingRecvPct);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROGRESS UPDATES
  // ═══════════════════════════════════════════════════════════════════════════
  const PRING_CIRC = 2 * Math.PI * 42;

  // The receiver landing scene takes ~1.2 s before the progress card mounts.
  // If WebRTC chunks arrive during that window, updateReceiverProgress is
  // called against a DOM that doesn't have #agPringFill yet → updates lost,
  // ring appears stuck at 0 % until the next chunk fires after card mount.
  // Cache the latest pct and replay it as soon as the card mounts.
  let _pendingRecvPct = 0;

  function applyRecvPct(pct) {
    const fill  = $('agPringFill');
    const label = $('agRecvPct');
    if (fill) {
      const offset = PRING_CIRC * (1 - Math.max(0, Math.min(100, pct)) / 100);
      fill.style.strokeDashoffset = offset;
    }
    if (label) label.textContent = pct >= 100 ? 'Saving…' : `Receiving ${pct}%`;
  }

  function updateSenderProgress(pct) {
    const sub = $('agSenderProgress');
    if (sub) sub.innerHTML = `Sending… <b>${Math.round(pct)}%</b>`;
    ensureCancelButton();
  }

  // Smooth easing toward target pct so the receiver ring/label animate
  // continuously even when chunks arrive in bursts.
  let _recvCurrentPct = 0;
  let _recvTargetPct  = 0;
  let _recvRafId      = null;
  function smoothRecvLoop() {
    const diff = _recvTargetPct - _recvCurrentPct;
    if (Math.abs(diff) < 0.05) {
      _recvCurrentPct = _recvTargetPct;
      applyRecvPct(_recvCurrentPct);
      _recvRafId = null;
      return;
    }
    _recvCurrentPct += diff * 0.18;        // ease toward target
    applyRecvPct(_recvCurrentPct);
    _recvRafId = requestAnimationFrame(smoothRecvLoop);
  }
  function updateReceiverProgress(pct) {
    _pendingRecvPct = pct;
    _recvTargetPct  = Math.max(0, Math.min(100, pct));
    if (_recvRafId == null) _recvRafId = requestAnimationFrame(smoothRecvLoop);
    ensureCancelButton();
  }

  // ── Body-fixed cancel button (immune to stage clears, always clickable) ───
  let _cancelBtnEl    = null;
  let _cancelDisabled = false;   // once true, ensureCancelButton refuses to re-create
  function ensureCancelButton() {
    if (_cancelDisabled) return;                                      // sticky guard
    if (_cancelBtnEl && document.body.contains(_cancelBtnEl)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ag-cancel-btn';
    btn.id = 'aeroCancelBtn';
    btn.setAttribute('aria-label', 'Cancel transfer');
    btn.innerHTML = '<span class="ag-cancel-x">×</span><span class="ag-cancel-lbl">Cancel</span>';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.aeroGrabCancel) window.aeroGrabCancel();
    });
    document.body.appendChild(btn);
    _cancelBtnEl = btn;
  }
  function removeCancelButton() {
    // Set sticky flag so any late progress update can't resurrect the button.
    _cancelDisabled = true;
    if (_cancelBtnEl && _cancelBtnEl.parentNode) _cancelBtnEl.parentNode.removeChild(_cancelBtnEl);
    _cancelBtnEl = null;
    // Also nuke any orphaned button that may have been created by another path.
    const orphan = document.getElementById('aeroCancelBtn');
    if (orphan && orphan.parentNode) orphan.parentNode.removeChild(orphan);
  }
  function armCancelButton() {
    // Called by aerograb.js at the START of each new transfer to reset the guard.
    _cancelDisabled = false;
  }

  function onCancelled(msg) {
    removeCancelButton();
    const stage = getStage();
    if (!stage) { return; }
    clearStage();
    const wrap = document.createElement('div');
    wrap.className = 'ag-success ag-cancelled';
    wrap.innerHTML = `
      <div class="ag-cancel-ring">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </div>
      <div class="ag-success-label">${escHtml(msg || 'Cancelled')}</div>
      <div class="ag-success-sub">Transfer stopped on both devices</div>
    `;
    stage.appendChild(wrap);
    if (window.anime) anime({ targets: wrap, scale: [0.4, 1.05, 1], opacity: [0, 1], duration: 460, easing: 'easeOutBack' });
    _recvCurrentPct = 0; _recvTargetPct = 0;
    if (_recvRafId) { cancelAnimationFrame(_recvRafId); _recvRafId = null; }
    setTimeout(hideStage, 1600);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUCCESS BLOOM
  // ═══════════════════════════════════════════════════════════════════════════
  function onSenderComplete() {
    removeCancelButton();
    const stage = getStage();
    if (!stage) return;
    clearStage();
    const wrap = document.createElement('div');
    wrap.className = 'ag-success';
    wrap.innerHTML = `
      ${checkmarkSVG()}
      <div class="ag-success-label">Delivered</div>
      <div class="ag-success-sub">File reached the other device</div>
    `;
    stage.appendChild(wrap);
    bloomSuccess(stage, wrap);
    setTimeout(hideStage, 2200);
  }

  function onReceiverComplete(meta, openUrl) {
    removeCancelButton();
    const stage = getStage();
    if (!stage) return;
    clearStage();
    const safeName   = escHtml(meta && meta.name ? meta.name : 'file');
    const autoOpened = !openUrl;
    const wrap = document.createElement('div');
    wrap.className = 'ag-success';
    wrap.innerHTML = `
      ${checkmarkSVG()}
      <div class="ag-success-label">Caught: ${safeName}</div>
      <div class="ag-success-sub">${autoOpened ? 'Opened in Hevi Explorer · saved in HeviExplorer/' : 'Saved · tap to open'}</div>
      ${autoOpened ? '' : '<button class="ag-open-btn" type="button">Open file</button>'}
    `;
    stage.appendChild(wrap);
    bloomSuccess(stage, wrap);
    const btn = wrap.querySelector('.ag-open-btn');
    if (btn && openUrl) {
      btn.addEventListener('click', () => {
        try { const w = window.open(openUrl, '_blank', 'noopener'); if (!w) location.href = openUrl; }
        catch (_) { location.href = openUrl; }
      });
    }
    setTimeout(hideStage, autoOpened ? 4200 : 12000);
  }

  function bloomSuccess(stage, wrap) {
    anime({ targets: wrap, scale: [0.4, 1.08, 1], opacity: [0, 1], duration: 600, easing: 'easeOutBack' });
    // Trigger SVG check draw-on by re-reading the strokes (CSS animation runs once)
    const circle = wrap.querySelector('.ag-check-circle');
    const tick   = wrap.querySelector('.ag-check-tick');
    if (circle && tick) {
      // Reflow trick to restart the animation
      [circle, tick].forEach(el => { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; });
    }
    spawnConfetti(stage, 32);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════
  function getFileEmoji(meta) {
    if (!meta) return '📦';
    const name = (meta.name || '').toLowerCase();
    if (meta.isFolder)                                        return '📁';
    if (meta.isMulti)                                         return '📦';
    if (/\.(mp4|mkv|avi|mov|webm)$/.test(name))              return '🎬';
    if (/\.(mp3|flac|ogg|wav|aac|opus)$/.test(name))         return '🎵';
    if (/\.(jpg|jpeg|png|gif|webp|heic|svg)$/.test(name))    return '🖼️';
    if (/\.(pdf)$/.test(name))                                return '📄';
    if (/\.(zip|rar|7z|tar|gz)$/.test(name))                 return '🗜️';
    if (/\.(apk)$/.test(name))                                return '📱';
    if (/\.(doc|docx|txt|md)$/.test(name))                   return '📝';
    return '📦';
  }

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Expose to aerograb.js (same surface as v1) ─────────────────────────────
  window.aeroAnim = {
    showSenderLaunch,
    showReceiverLanding,
    updateSenderProgress,
    updateReceiverProgress,
    onSenderComplete,
    onReceiverComplete,
    onCancelled,
    showCancelButton: ensureCancelButton,
    hideCancelButton: removeCancelButton,
    armCancelButton: armCancelButton,
  };

})();

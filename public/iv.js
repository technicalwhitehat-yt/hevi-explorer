(function () {
"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   L-Host — Premium Image Viewer v4.0
   Smooth slide nav, spring physics, inertia pan, double-tap smart zoom,
   swipe-down to close, swipe-up for info, 2-finger rotation,
   strict pan clamp, EXIF metadata, full PC support
══════════════════════════════════════════════════════════════════════════ */

const MIN_SCALE      = 0.8;
const MAX_SCALE      = 8;
const SNAP_RATIO     = 0.22;
const VEL_THRESHOLD  = 0.32;
const CLOSE_PX       = 100;
const CLOSE_VEL      = 0.40;
const OPEN_INFO_PX   = -90;
const OPEN_INFO_VEL  = -0.40;
const FRICTION       = 0.84;
const ZOOM_CYCLE     = [1, 2];

const IV_DEMO = [
  { name: 'Mountain Vista',  url: 'https://picsum.photos/seed/iv-mountain-vista/1400/900',  thumb: 'https://picsum.photos/seed/iv-mountain-vista/400/260',  _demo: true, type: 'file', category: 'image', meta: { Name:'Mountain_Vista.jpg', Size:'4.2 MB', Resolution:'4032×2688', Type:'JPEG', Date:'Jan 15 2024', Camera:'Sony α7 IV', ISO:'400', Location:'Himalayas, India', Path:'/demo/images/', Folder:'/demo/images' } },
  { name: 'Ocean Sunset',    url: 'https://picsum.photos/seed/iv-ocean-sunset-goa/1400/900', thumb: 'https://picsum.photos/seed/iv-ocean-sunset-goa/400/260', _demo: true, type: 'file', category: 'image', meta: { Name:'Ocean_Sunset.jpg', Size:'3.8 MB', Resolution:'3840×2160', Type:'JPEG', Date:'Mar 8 2024', Camera:'Canon EOS R5', ISO:'200', Location:'Goa, India', Path:'/demo/images/', Folder:'/demo/images' } },
  { name: 'City Lights',     url: 'https://picsum.photos/seed/iv-city-night-lights/1400/900',thumb: 'https://picsum.photos/seed/iv-city-night-lights/400/260',_demo: true, type: 'file', category: 'image', meta: { Name:'City_Lights.jpg', Size:'5.1 MB', Resolution:'5472×3648', Type:'JPEG', Date:'Dec 31 2023', Camera:'Nikon Z8', ISO:'1600', Location:'Mumbai, India', Path:'/demo/images/', Folder:'/demo/images' } },
];

const iv = {
  list: [], idx: 0, isDemo: false,
  scale: 1, panX: 0, panY: 0, rotate: 0, filter: '',
  metaOpen: false, filterOpen: false, moreOpen: false,
  zoomLevelIdx: 0, zoomBadgeTimer: null,
  bgColor: null,

  touchActive: false,
  touchStartX: 0, touchStartY: 0, touchStartTime: 0,
  touchLastX: 0,  touchLastY: 0,
  swipeAxis: null,

  trackDeltaX: 0,
  stageW: 0,
  closeOffsetY: 0,

  inertiaVelX: 0, inertiaVelY: 0, inertiaRaf: null,

  // Pinch zoom+rotate
  pinchActive: false,
  pinchDist: 0, pinchCx: 0, pinchCy: 0,
  pinchScaleStart: 1, pinchPanXStart: 0, pinchPanYStart: 0,
  pinchAngle: 0, pinchRotateStart: 0, pinchRotateActive: false,

  // Mouse drag (PC)
  mouseDragging: false,
  mouseDragPX: 0, mouseDragPY: 0,
  mouseMoved: false,
  mouseSwipeStartX: 0, mouseSwipeStartY: 0,
  mouseSwipeAxis: null,
  mouseLastClick: 0,

  velBuf: [],
  heicPreviewUrls: new Map(),
  heicScriptPromise: null,
};

const $  = id => document.getElementById(id);
const clamp = (v,lo,hi) => Math.max(lo, Math.min(hi, v));
const IV_NATIVE_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif', '.apng']);
const IV_HEIC_EXTS = new Set(['.heic', '.heif']);
const IV_PRO_EXTS = new Set(['.raw', '.cr2', '.nef', '.arw', '.dng', '.psd', '.ai', '.tiff', '.tif']);
const IV_HEIC_CACHE_MAX = 3;

function stageSize() {
  const s = $('ivStage');
  return { w: s.offsetWidth, h: s.offsetHeight };
}

function ivGetViewUrl(item) {
  if (item._demo) return item.url;
  if (item._heicPreview) return item._heicPreview;
  if (item._cloudUrl) return item._cloudUrl;
  const IV_PREVIEW_MIN = 2 * 1024 * 1024;
  if (item.size && item.size < IV_PREVIEW_MIN) return `/file?path=${encodeURIComponent(item.path)}`;
  return `/api/preview?path=${encodeURIComponent(item.path)}`;
}
function ivGetUrl(item) {
  if (item._demo) return item.url;
  if (item._heicPreview) return item._heicPreview;
  if (item._cloudUrl) return item._cloudUrl;
  return `/file?path=${encodeURIComponent(item.path)}`;
}
function ivGetThumbUrl(item) {
  if (item._demo) return item.thumb || item.url;
  if (item._heicPreview) return item._heicPreview;
  if (item._cloudUrl) return item._cloudUrl;
  return `/api/thumb?path=${encodeURIComponent(item.path)}&w=300&h=225`;
}
function ivExt(item) {
  return (item?.ext || '').toLowerCase();
}
function ivIsHeic(item) {
  return IV_HEIC_EXTS.has(ivExt(item));
}
function ivIsBrowserImage(item) {
  if (!item) return false;
  if (item._demo || item._heicPreview) return true;
  if (item._cloudUrl) return true;
  return IV_NATIVE_IMAGE_EXTS.has(ivExt(item));
}
function ivUnsupportedBadge(item) {
  const ext = ivExt(item);
  if (IV_HEIC_EXTS.has(ext)) return 'HEIC';
  if (['.raw', '.cr2', '.nef', '.arw', '.dng'].includes(ext)) return 'RAW';
  if (IV_PRO_EXTS.has(ext)) return ext.replace('.', '').toUpperCase();
  return (ext || '.IMG').replace('.', '').toUpperCase();
}
function ivGetMeta(item) {
  if (item._demo) return item.meta;
  const folder = item.path ? item.path.substring(0, item.path.lastIndexOf('/')) || '/' : '--';
  return { Name: item.name, Size: item.sizeStr||'--', Type: (item.ext||'').toUpperCase().replace('.',''), Date: item.mtimeStr||'--', Camera: '--', ISO: '--', Location: '--', Folder: folder, Path: item.path||'--' };
}

// ── RAF-batched transform ──────────────────────────────────────────────────
let _rafPending = false;
function ivApplyWrap() {
  if (_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(() => {
    _rafPending = false;
    const wrap = $('ivImgWrap');
    if (wrap) wrap.style.transform =
      `translate(${iv.panX}px,${iv.panY}px) scale(${iv.scale}) rotate(${iv.rotate}deg)`;
  });
}
function ivApplyWrapAnimated(overrides = {}) {
  const wrap = $('ivImgWrap');
  if (!wrap) return;
  const tx = overrides.panX  ?? iv.panX;
  const ty = overrides.panY  ?? iv.panY;
  const sc = overrides.scale ?? iv.scale;
  const ro = overrides.rotate?? iv.rotate;
  if (typeof anime !== 'undefined') {
    anime({ targets: wrap, translateX: tx, translateY: ty, scale: sc, rotate: ro, duration: 300, easing: 'easeOutExpo' });
  } else {
    wrap.style.transition = 'transform 0.3s cubic-bezier(0.25,1,0.5,1)';
    wrap.style.transform = `translate(${tx}px,${ty}px) scale(${sc}) rotate(${ro}deg)`;
    setTimeout(() => { if (wrap) wrap.style.transition = 'none'; }, 320);
  }
}

function ivResetWrap(animated = true) {
  iv.scale = 1; iv.panX = 0; iv.panY = 0;
  if (animated) ivApplyWrapAnimated();
  else { const w=$('ivImgWrap'); if(w) w.style.transform='translate(0,0) scale(1) rotate(0deg)'; }
  ivShowZoomBadge();
}

// ── Strict pan clamp — image border = screen edge ─────────────────────────
function ivClampPan() {
  const { w: sw, h: sh } = stageSize();
  const img = $('imagePlayer');
  if (!img) return;
  const iw = img.naturalWidth  || img.offsetWidth  || sw;
  const ih = img.naturalHeight || img.offsetHeight || sh;
  // Effective displayed size
  const dispW = Math.min(iw, sw) * iv.scale;
  const dispH = Math.min(ih, sh) * iv.scale;
  const maxX = Math.max(0, (dispW - sw) / 2);
  const maxY = Math.max(0, (dispH - sh) / 2);
  iv.panX = clamp(iv.panX, -maxX, maxX);
  iv.panY = clamp(iv.panY, -maxY, maxY);
}

// ── Track position (navigation swipe) ────────────────────────────────────
function ivApplyTrack(extraX, animated) {
  const track = $('ivTrack');
  if (!track) return;
  const w = iv.stageW || stageSize().w;
  const tx = -w + extraX;
  track.style.transition = animated ? 'transform 0.22s ease-out' : 'none';
  track.style.transform = `translateX(${tx}px)`;
}

function ivResetTrack() { ivApplyTrack(0, false); iv.trackDeltaX = 0; }

// ── Dynamic background color sampling from image ───────────────────────────
let _ivBgTimer = null;
function ivSampleBgColor(imgEl) {
  clearTimeout(_ivBgTimer);
  _ivBgTimer = setTimeout(() => {
    try {
      const cvs = document.createElement('canvas');
      cvs.width = 16; cvs.height = 16;
      const ctx = cvs.getContext('2d');
      ctx.drawImage(imgEl, 0, 0, 16, 16);
      const d = ctx.getImageData(0, 0, 16, 16).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i+1]; b += d[i+2]; n++; }
      // Darken to a moody tone — factor controls how vivid the tint is
      const f = 0.38;
      r = Math.round(r / n * f); g = Math.round(g / n * f); b = Math.round(b / n * f);
      iv.bgColor = { r, g, b };
      const modal = $('imageModal');
      if (modal && !modal.classList.contains('hidden')) {
        modal.style.transition = 'background 0.45s ease';
        modal.style.background = `rgb(${r},${g},${b})`;
        setTimeout(() => { if (modal) modal.style.transition = ''; }, 500);
      }
    } catch (_) {}
  }, 60);
}

// ── Background dim for close gesture ─────────────────────────────────────
function ivDimBg(ratio) {
  const modal = $('imageModal');
  if (!modal) return;
  const a = 1 - clamp(ratio, 0, 1) * 0.72;
  const c = iv.bgColor;
  modal.style.background = c
    ? `rgba(${c.r},${c.g},${c.b},${a})`
    : `rgba(0,0,0,${a})`;
}

// ── Center slot close/open gesture ───────────────────────────────────────
function ivApplyCurSlot(y, opacity, animated) {
  const slot = $('ivSlotCur');
  if (!slot) return;
  slot.style.transition = animated
    ? 'transform 0.38s cubic-bezier(0.34,1.56,0.64,1), opacity 0.32s ease'
    : 'none';
  slot.style.transform = y ? `translateY(${y}px)` : '';
  slot.style.opacity   = opacity != null ? String(opacity) : '';
}

// ── Zoom badge ────────────────────────────────────────────────────────────
function ivShowZoomBadge() {
  const badge = $('ivZoomBadge');
  if (!badge) return;
  badge.textContent = Math.round(iv.scale * 100) + '%';
  badge.style.opacity = '1';
  badge.classList.remove('hidden');
  clearTimeout(iv.zoomBadgeTimer);
  iv.zoomBadgeTimer = setTimeout(() => {
    badge.style.opacity = '0';
    setTimeout(() => badge.classList.add('hidden'), 320);
  }, 1400);
}

// ── Pulse dot ─────────────────────────────────────────────────────────────
function ivPulseAt(x, y) {
  if (typeof anime === 'undefined') return;
  const dot = document.createElement('div');
  dot.className = 'iv-pulse-dot';
  dot.style.cssText = `left:${x}px;top:${y}px`;
  document.body.appendChild(dot);
  anime({ targets: dot, scale: [0.1, 3.2], opacity: [1, 0], duration: 580, easing: 'easeOutExpo', complete: () => dot.remove() });
}

// ── Pinch dot ─────────────────────────────────────────────────────────────
function ivShowPinchDot(x, y) { const d=$('ivPinchDot'); if(!d)return; d.style.left=x+'px'; d.style.top=y+'px'; d.classList.remove('hidden'); d.classList.add('iv-pinch-active'); }
function ivMovePinchDot(x, y) { const d=$('ivPinchDot'); if(!d)return; d.style.left=x+'px'; d.style.top=y+'px'; }
function ivHidePinchDot()     { const d=$('ivPinchDot'); if(!d)return; d.classList.remove('iv-pinch-active'); setTimeout(()=>d.classList.add('hidden'),300); }

// ── Image loading ─────────────────────────────────────────────────────────
function ivLoadImg(imgEl, item, thumbOnly) {
  if (!imgEl || !item) { if(imgEl) imgEl.src=''; return; }
  if (!ivIsBrowserImage(item)) {
    imgEl.removeAttribute('src');
    imgEl.style.display = 'none';
    return;
  }
  imgEl.style.display = '';
  const thumbUrl = ivGetThumbUrl(item);
  const viewUrl  = ivGetViewUrl(item);
  imgEl.src = thumbUrl;
  if (!thumbOnly) {
    const loader = new window.Image();
    loader.decoding = 'async';
    loader.onload = () => { if (imgEl.src !== viewUrl) imgEl.src = viewUrl; };
    loader.src = viewUrl;
  }
}

function ivHideUnsupported() {
  const panel = $('ivUnsupportedPanel');
  if (panel) panel.classList.add('hidden');
}

function ivSetUnsupported(item, state = 'idle', error = '') {
  const panel = $('ivUnsupportedPanel');
  if (!panel) return;
  const badge = $('ivUnsupportedBadge');
  const title = $('ivUnsupportedTitle');
  const msg = $('ivUnsupportedMsg');
  const btn = $('ivHeicPreviewBtn');
  const spinner = $('ivHeicSpinner');
  const btnText = $('ivHeicBtnText');
  const isHeic = ivIsHeic(item);
  if (badge) badge.textContent = ivUnsupportedBadge(item);
  if (title) title.textContent = isHeic ? 'HEIC preview is available on demand' : 'Preview not natively supported by browser';
  if (msg) {
    msg.textContent = error || (isHeic
      ? 'This iPhone photo is kept unloaded to protect CPU and memory. Generate a preview only when you need it.'
      : 'Preview not natively supported by browser. Please download to view original quality.');
  }
  if (btn) {
    btn.classList.toggle('hidden', !isHeic);
    btn.disabled = state === 'loading';
  }
  if (spinner) spinner.classList.toggle('hidden', state !== 'loading');
  if (btnText) btnText.textContent = state === 'loading' ? 'Generating preview…' : 'Generate High-Quality Preview';
  panel.classList.remove('hidden', 'iv-unsupported-error');
  if (state === 'error') panel.classList.add('iv-unsupported-error');
}

function ivDisplayCurrent(cur, mode = 'open') {
  const wrap = $('ivImgWrap');
  const curImg = $('imagePlayer');
  if (!curImg || !cur) return;
  if (!ivIsBrowserImage(cur)) {
    if (wrap) wrap.classList.remove('iv-loading');
    curImg.removeAttribute('src');
    curImg.style.display = 'none';
    curImg.style.transition = 'none';
    curImg.style.opacity = '1';
    curImg.style.filter = '';
    ivResetWrap(false);
    ivSetUnsupported(cur);
    return;
  }

  ivHideUnsupported();
  curImg.style.display = 'block';
  const thumbUrl = ivGetThumbUrl(cur);
  const viewUrl  = ivGetViewUrl(cur);
  curImg.style.transition = 'none';
  curImg.style.opacity = '1';
  curImg.style.filter = mode === 'nav' ? 'blur(16px)' : (iv.filter || '');
  curImg.src = thumbUrl;
  if (wrap) wrap.classList.add('iv-loading');

  const loader = new window.Image();
  loader.decoding = 'async';
  loader.onload = () => {
    if (!curImg || iv.list[iv.idx] !== cur) return;
    if (wrap) wrap.classList.remove('iv-loading');
    if (mode === 'nav') {
      curImg.src = viewUrl;
      requestAnimationFrame(() => {
        curImg.style.transition = 'filter 0.30s ease';
        curImg.style.filter = iv.filter || '';
        ivSampleBgColor(loader);
      });
      return;
    }
    curImg.style.transition = 'opacity 0.18s ease';
    curImg.style.opacity = '0.01';
    requestAnimationFrame(() => {
      curImg.src = viewUrl;
      requestAnimationFrame(() => {
        curImg.style.opacity = '1';
        ivSampleBgColor(loader);
      });
    });
  };
  loader.onerror = () => {
    if (wrap) wrap.classList.remove('iv-loading');
    if (curImg) {
      curImg.style.transition = 'filter 0.30s ease';
      curImg.style.filter = iv.filter || '';
    }
  };
  loader.src = viewUrl;
}

function ivUpdateSlots() {
  const prev = iv.list[(iv.idx - 1 + iv.list.length) % iv.list.length];
  const cur  = iv.list[iv.idx];
  const next = iv.list[(iv.idx + 1) % iv.list.length];
  const curImg = $('imagePlayer');
  if (curImg) ivDisplayCurrent(cur, 'open');
  ivLoadImg($('ivImgPrev'), prev, true);
  ivLoadImg($('ivImgNext'), next, true);
}

function ivPreload() {
  const prev = iv.list[(iv.idx - 1 + iv.list.length) % iv.list.length];
  const next = iv.list[(iv.idx + 1) % iv.list.length];
  [prev, next].forEach(item => { if (item && ivIsBrowserImage(item)) { const i=new window.Image(); i.decoding='async'; i.src=ivGetViewUrl(item); } });
}

function ivLoadHeicLib() {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  if (iv.heicScriptPromise) return iv.heicScriptPromise;
  iv.heicScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/heic2any/heic2any.min.js';
    script.async = true;
    script.onload = () => window.heic2any ? resolve(window.heic2any) : reject(new Error('HEIC converter unavailable'));
    script.onerror = () => reject(new Error('Could not load HEIC converter'));
    document.head.appendChild(script);
  });
  return iv.heicScriptPromise;
}

function ivRememberHeicPreview(item, url) {
  const key = item.path || item.name;
  const old = iv.heicPreviewUrls.get(key);
  if (old) URL.revokeObjectURL(old);
  iv.heicPreviewUrls.set(key, url);
  item._heicPreview = url;
  while (iv.heicPreviewUrls.size > IV_HEIC_CACHE_MAX) {
    const [oldKey, oldUrl] = iv.heicPreviewUrls.entries().next().value;
    URL.revokeObjectURL(oldUrl);
    iv.heicPreviewUrls.delete(oldKey);
    iv.list.forEach(i => {
      if ((i.path || i.name) === oldKey) delete i._heicPreview;
    });
  }
}

async function ivGenerateHeicPreview(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const item = iv.list[iv.idx];
  if (!item || !ivIsHeic(item)) return;
  if (item._heicPreview) {
    ivDisplayCurrent(item, 'open');
    return;
  }
  ivSetUnsupported(item, 'loading');
  try {
    const heic2any = await ivLoadHeicLib();
    const res = await fetch(`/file?path=${encodeURIComponent(item.path)}`);
    if (!res.ok) throw new Error('Could not read HEIC file');
    const blob = await res.blob();
    const converted = await heic2any({ blob, toType: 'image/jpeg', quality: 0.92 });
    const jpeg = Array.isArray(converted) ? converted[0] : converted;
    const url = URL.createObjectURL(jpeg);
    ivRememberHeicPreview(item, url);
    if (iv.list[iv.idx] === item) ivDisplayCurrent(item, 'open');
  } catch (err) {
    if (iv.list[iv.idx] === item) {
      ivSetUnsupported(item, 'error', err?.message || 'Could not generate HEIC preview. Please download the original file.');
    }
  }
}

// ── Update header/counter ─────────────────────────────────────────────────
function ivRefreshUI() {
  const item = iv.list[iv.idx];
  if (!item) return;
  const title = item.name || item.title || 'Image';
  $('imageTitle').textContent = title;
  const _ctr = $('imageCounter'); if (_ctr) _ctr.textContent = `${iv.idx + 1} / ${iv.list.length}`;
  const dl = $('imageDl');
  if (dl) {
    const url = item._demo ? ivGetUrl(item) : (item._cloudUrl || `/file?path=${encodeURIComponent(item.path)}`);
    dl.href = item._demo ? url : url + (item._cloudUrl ? '' : '&dl=1');
    if (!item._demo) dl.download = title;
  }
}

// ── More menu toggle ──────────────────────────────────────────────────────
function ivToggleMore() {
  iv.moreOpen = !iv.moreOpen;
  const menu = $('ivMoreMenu');
  if (!menu) return;
  if (iv.moreOpen) {
    menu.classList.remove('hidden');
    if (typeof anime !== 'undefined') {
      anime({ targets: menu, opacity: [0,1], translateY: [-8,0], duration: 200, easing: 'easeOutExpo' });
    }
  } else {
    menu.classList.add('hidden');
  }
}

function ivCloseMore() {
  if (iv.moreOpen) { iv.moreOpen = false; const m=$('ivMoreMenu'); if(m) m.classList.add('hidden'); }
}

// ── Open ──────────────────────────────────────────────────────────────────
function ivOpen(list, startIdx = 0, isDemo = false, thumbEl = null) {
  iv.list    = list;
  iv.idx     = startIdx;
  iv.isDemo  = isDemo;
  iv.scale   = 1; iv.panX = 0; iv.panY = 0; iv.rotate = 0;
  iv.filter  = '';
  iv.metaOpen = false; iv.filterOpen = false; iv.moreOpen = false;
  iv.zoomLevelIdx = 0;
  iv.closeOffsetY = 0;

  const modal = $('imageModal');
  modal.classList.remove('hidden');
  modal.style.background = 'rgba(0,0,0,1)';
  document.body.style.overflow = 'hidden';

  $('ivMetaModal').classList.add('hidden');
  const _filterBar = $('ivFilterBar');
  if (_filterBar) _filterBar.classList.remove('iv-filter-open');
  const moreMenu = $('ivMoreMenu');
  if (moreMenu) moreMenu.classList.add('hidden');

  document.querySelectorAll('.iv-filter-chip').forEach(c => c.classList.remove('active'));
  const first = document.querySelector('.iv-filter-chip[data-filter=""]');
  if (first) first.classList.add('active');

  const wrap = $('ivImgWrap');
  if (wrap) { wrap.style.transition='none'; wrap.style.transform='translate(0,0) scale(1) rotate(0deg)'; }
  ivApplyCurSlot(0, 1, false);
  iv.stageW = stageSize().w;
  ivResetTrack();

  ivRefreshUI();
  ivUpdateSlots();
  ivPreload();
  ivShowZoomBadge();

  // Pure fade-in — no scale pop
  const curSlot = $('ivSlotCur');
  if (curSlot) {
    curSlot.style.opacity = '0';
    if (typeof anime !== 'undefined') {
      anime({ targets: curSlot, opacity: [0, 1], duration: 320, easing: 'easeOutQuart' });
    } else {
      curSlot.style.transition = 'opacity 0.32s ease';
      curSlot.style.opacity = '1';
      setTimeout(() => { if (curSlot) curSlot.style.transition = ''; }, 340);
    }
  }
}

function ivOpenDemo() { ivOpen(IV_DEMO, 0, true); }

// ── Close ─────────────────────────────────────────────────────────────────
function _ivReset() {
  iv.bgColor = null;
  clearTimeout(_ivBgTimer);
  $('imageModal').classList.add('hidden');
  $('imageModal').style.background = '';
  document.body.style.overflow = '';
  ['imagePlayer', 'ivImgPrev', 'ivImgNext'].forEach(id => { const el=$(id); if(el) el.src=''; });
  iv.heicPreviewUrls.forEach(url => URL.revokeObjectURL(url));
  iv.heicPreviewUrls.clear();
  iv.list.forEach(item => { if (item && item._heicPreview) delete item._heicPreview; });
  ivHideUnsupported();
  $('ivMetaModal').classList.add('hidden');
  const slot = $('ivSlotCur');
  if (slot) { slot.style.transform=''; slot.style.opacity='1'; slot.style.transition='none'; }
  const wrap = $('ivImgWrap');
  if (wrap) { wrap.style.transform='translate(0,0) scale(1) rotate(0deg)'; }
  ivDimBg(0);
}

function ivClose() {
  ivCloseMore();
  const curSlot = $('ivSlotCur');
  if (curSlot && typeof anime !== 'undefined') {
    anime({ targets: curSlot, opacity: [1, 0], duration: 220, easing: 'easeInQuart', complete: _ivReset });
  } else { _ivReset(); }
}

// ── Navigate ──────────────────────────────────────────────────────────────
function _ivAfterNav(direction) {
  const w = iv.stageW || stageSize().w;
  const track = $('ivTrack');

  iv.idx = direction === 'next'
    ? (iv.idx + 1) % iv.list.length
    : (iv.idx - 1 + iv.list.length) % iv.list.length;
  iv.scale = 1; iv.panX = 0; iv.panY = 0; iv.rotate = 0; iv.closeOffsetY = 0; iv.zoomLevelIdx = 0;

  const prevImg = $('ivImgPrev'), curImg = $('imagePlayer'), nextImg = $('ivImgNext');

  // Reset track + slot silently
  if (track) { track.style.transition='none'; track.style.transform=`translateX(${-w}px)`; }
  const slot = $('ivSlotCur');
  if (slot) { slot.style.transform=''; slot.style.opacity='1'; slot.style.transition='none'; }
  const wrap = $('ivImgWrap');
  if (wrap) { wrap.style.transition='none'; wrap.style.transform='translate(0,0) scale(1) rotate(0deg)'; }

  const cur = iv.list[iv.idx];

  // Show blurred thumbnail instantly — visible placeholder while full-res loads
  if (curImg) ivDisplayCurrent(cur, 'nav');

  // Update the adjacent (opposite) slot
  const newAdjItem = direction === 'next'
    ? iv.list[(iv.idx + 1) % iv.list.length]
    : iv.list[(iv.idx - 1 + iv.list.length) % iv.list.length];
  if (prevImg && nextImg) ivLoadImg(direction === 'next' ? nextImg : prevImg, newAdjItem, true);

  ivRefreshUI(); ivShowZoomBadge(); ivPreload();
}

function ivCommitNext() {
  if (iv.list.length <= 1) { ivApplyTrack(0, false); return; }
  // Blur-out current image
  const curImg = $('imagePlayer');
  if (curImg) {
    curImg.style.transition = 'filter 0.15s ease, opacity 0.15s ease';
    curImg.style.filter = 'blur(16px)';
    curImg.style.opacity = '0.55';
  }
  // Snap track to center (no slide animation)
  const track = $('ivTrack'); const w = iv.stageW || stageSize().w;
  if (track) { track.style.transition='none'; track.style.transform=`translateX(${-w}px)`; }
  setTimeout(() => _ivAfterNav('next'), 80);
}
function ivCommitPrev() {
  if (iv.list.length <= 1) { ivApplyTrack(0, false); return; }
  const curImg = $('imagePlayer');
  if (curImg) {
    curImg.style.transition = 'filter 0.15s ease, opacity 0.15s ease';
    curImg.style.filter = 'blur(16px)';
    curImg.style.opacity = '0.55';
  }
  const track = $('ivTrack'); const w = iv.stageW || stageSize().w;
  if (track) { track.style.transition='none'; track.style.transform=`translateX(${-w}px)`; }
  setTimeout(() => _ivAfterNav('prev'), 80);
}
function ivPrev() { ivCommitPrev(); }
function ivNext() { ivCommitNext(); }

// ── Programmatic zoom ─────────────────────────────────────────────────────
function ivZoomBy(delta, cx, cy) {
  const rect = $('ivStage').getBoundingClientRect();
  const px = (cx != null ? cx : rect.left + rect.width  / 2) - rect.left - rect.width  / 2;
  const py = (cy != null ? cy : rect.top  + rect.height / 2) - rect.top  - rect.height / 2;
  const oldScale = iv.scale;
  iv.scale = clamp(iv.scale + delta, MIN_SCALE, MAX_SCALE);
  const ratio = iv.scale / oldScale;
  iv.panX = px + (iv.panX - px) * ratio;
  iv.panY = py + (iv.panY - py) * ratio;
  if (iv.scale <= 1) { iv.scale = 1; iv.panX = 0; iv.panY = 0; }
  ivClampPan();
  ivApplyWrap();
  ivShowZoomBadge();
}

function ivRotate(deg) {
  iv.rotate += deg;
  ivApplyWrapAnimated();
}

// ── Filter ────────────────────────────────────────────────────────────────
function ivSetFilter(f) {
  iv.filter = f;
  const img = $('imagePlayer');
  if (img) img.style.filter = f || '';
  document.querySelectorAll('.iv-filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === f));
}

// ── Metadata ──────────────────────────────────────────────────────────────
async function ivFetchExif(item) {
  if (item._demo || !item.path) return null;
  try {
    const res = await fetch(`/api/imgmeta?path=${encodeURIComponent(item.path)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}

async function ivToggleMeta() {
  const modal = $('ivMetaModal');
  iv.metaOpen = !iv.metaOpen;
  ivCloseMore();
  if (iv.metaOpen) {
    const item = iv.list[iv.idx];
    const base = ivGetMeta(item);
    $('ivMetaTitle').textContent = item.name || 'Image Info';
    // Show base info immediately
    const renderRows = meta => Object.entries(meta)
      .filter(([,v]) => v && v !== '--')
      .map(([k,v]) => `<div class="iv-meta-row"><span class="iv-meta-label">${k}</span><span class="iv-meta-val">${v}</span></div>`)
      .join('');
    $('ivMetaBody').innerHTML = renderRows(base);
    modal.classList.remove('hidden');
    if (typeof anime !== 'undefined') {
      anime({ targets: modal, opacity: [0,1], translateY: [24,0], duration: 200, easing: 'easeOutExpo' });
    }
    // Fetch EXIF and update
    const exif = await ivFetchExif(item);
    if (exif && iv.metaOpen) {
      const merged = { ...base, ...exif };
      $('ivMetaBody').innerHTML = renderRows(merged);
    }
  } else {
    if (typeof anime !== 'undefined') {
      anime({ targets: modal, opacity: [1,0], translateY: [0,16], duration: 150, easing:'easeInQuad', complete: () => modal.classList.add('hidden') });
    } else { modal.classList.add('hidden'); }
  }
}

function ivToggleFilter() {
  iv.filterOpen = !iv.filterOpen;
  ivCloseMore();
  const _fb = $('ivFilterBar');
  if (_fb) _fb.classList.toggle('iv-filter-open', iv.filterOpen);
}

// ── Inertia ───────────────────────────────────────────────────────────────
function ivStartInertia() {
  if (iv.inertiaRaf) cancelAnimationFrame(iv.inertiaRaf);
  function step() {
    if (Math.abs(iv.inertiaVelX) < 0.4 && Math.abs(iv.inertiaVelY) < 0.4) { iv.inertiaRaf = null; return; }
    iv.panX += iv.inertiaVelX;
    iv.panY += iv.inertiaVelY;
    iv.inertiaVelX *= FRICTION;
    iv.inertiaVelY *= FRICTION;
    ivClampPan();
    ivApplyWrap();
    iv.inertiaRaf = requestAnimationFrame(step);
  }
  iv.inertiaRaf = requestAnimationFrame(step);
}

// ── Double-tap: toggle between 1x (centered) and 2x (at tap point) ──────────
function ivDoubleTap(x, y) {
  if (iv.scale > 1.05) {
    // Already zoomed → reset to 1x centered
    iv.scale = 1; iv.panX = 0; iv.panY = 0;
    iv.zoomLevelIdx = 0;
    ivApplyWrapAnimated();
  } else {
    // At 1x → zoom to 2x at tap point
    iv.zoomLevelIdx = 1;
    const rect = $('ivStage').getBoundingClientRect();
    const px = x - rect.left - rect.width  / 2;
    const py = y - rect.top  - rect.height / 2;
    const target = 2;
    const ratio = target / iv.scale;
    iv.panX = px + (iv.panX - px) * ratio;
    iv.panY = py + (iv.panY - py) * ratio;
    iv.scale = target;
    ivClampPan();
    ivApplyWrapAnimated();
  }
  ivShowZoomBadge();
  ivPulseAt(x, y);
}

// ── Touch gestures ────────────────────────────────────────────────────────
function ivInitTouch() {
  const stage = $('ivStage');
  let lastTap = 0, singleTapTimer = null;

  function getTouchAngle(t0, t1) {
    return Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX) * 180 / Math.PI;
  }

  stage.addEventListener('touchstart', e => {
    ivCloseMore();

    if (e.touches.length === 2) {
      iv.touchActive = false;
      iv.pinchActive = true; iv.swipeAxis = null;
      const t0 = e.touches[0], t1 = e.touches[1];
      const dx = t1.clientX - t0.clientX, dy = t1.clientY - t0.clientY;
      iv.pinchDist = Math.hypot(dx, dy);
      iv.pinchCx   = (t0.clientX + t1.clientX) / 2;
      iv.pinchCy   = (t0.clientY + t1.clientY) / 2;
      iv.pinchScaleStart    = iv.scale;
      iv.pinchPanXStart     = iv.panX;
      iv.pinchPanYStart     = iv.panY;
      iv.pinchAngle         = getTouchAngle(t0, t1);
      iv.pinchRotateStart   = iv.rotate;
      iv.pinchRotateActive  = false;
      ivShowPinchDot(iv.pinchCx, iv.pinchCy);
      if (iv.inertiaRaf) { cancelAnimationFrame(iv.inertiaRaf); iv.inertiaRaf = null; }
      return;
    }

    if (e.touches.length === 1 && !iv.pinchActive) {
      const t = e.touches[0];
      iv.touchActive  = true;
      iv.touchStartX  = t.clientX; iv.touchStartY = t.clientY;
      iv.touchStartTime = Date.now();
      iv.touchLastX   = t.clientX; iv.touchLastY  = t.clientY;
      iv.swipeAxis    = null;
      iv.velBuf       = [{ x: t.clientX, y: t.clientY, t: Date.now() }];
      iv.stageW       = stageSize().w;
      iv.mouseDragPX  = t.clientX - iv.panX;
      iv.mouseDragPY  = t.clientY - iv.panY;
      if (iv.inertiaRaf) { cancelAnimationFrame(iv.inertiaRaf); iv.inertiaRaf = null; }
    }
  }, { passive: true });

  stage.addEventListener('touchmove', e => {
    e.preventDefault();

    // Pinch = zoom + 2-finger rotate
    if (e.touches.length === 2 && iv.pinchActive) {
      const t0 = e.touches[0], t1 = e.touches[1];
      const dx = t1.clientX - t0.clientX, dy = t1.clientY - t0.clientY;
      const dist = Math.hypot(dx, dy);
      const cx = (t0.clientX + t1.clientX) / 2;
      const cy = (t0.clientY + t1.clientY) / 2;

      // Scale
      const newScale = clamp(iv.pinchScaleStart * (dist / iv.pinchDist), MIN_SCALE, MAX_SCALE);
      const rect = $('ivStage').getBoundingClientRect();
      const px = cx - rect.left - rect.width  / 2;
      const py = cy - rect.top  - rect.height / 2;
      const ratio = newScale / iv.scale;
      iv.panX = px + (iv.panX - px) * ratio;
      iv.panY = py + (iv.panY - py) * ratio;
      iv.scale = newScale;

      // 2-finger rotation — only activates after 25° threshold so pure pinch stays pure
      const currentAngle = getTouchAngle(t0, t1);
      const rawDelta = currentAngle - iv.pinchAngle;
      const ROTATE_THRESHOLD = 25;
      if (!iv.pinchRotateActive && Math.abs(rawDelta) > ROTATE_THRESHOLD) {
        iv.pinchRotateActive = true;
        iv.pinchAngle = currentAngle - (rawDelta > 0 ? ROTATE_THRESHOLD : -ROTATE_THRESHOLD);
      }
      if (iv.pinchRotateActive) {
        iv.rotate = iv.pinchRotateStart + (currentAngle - iv.pinchAngle);
      }

      ivClampPan();
      ivApplyWrap();
      ivShowZoomBadge();
      ivMovePinchDot(cx, cy);
      return;
    }

    if (!iv.touchActive || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - iv.touchStartX;
    const dy = t.clientY - iv.touchStartY;

    iv.velBuf.push({ x: t.clientX, y: t.clientY, t: Date.now() });
    if (iv.velBuf.length > 8) iv.velBuf.shift();

    if (!iv.swipeAxis && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      iv.swipeAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }

    if (iv.scale > 1.05) {
      iv.panX = t.clientX - iv.mouseDragPX;
      iv.panY = t.clientY - iv.mouseDragPY;
      ivClampPan();
      ivApplyWrap();
    } else if (iv.swipeAxis === 'x') {
      // Clean slide without opacity change on current slot
      const track = $('ivTrack');
      if (track) { track.style.transition='none'; track.style.transform=`translateX(${-iv.stageW + dx}px)`; }
    } else if (iv.swipeAxis === 'y') {
      if (dy > 0) {
        // Swipe down → close
        const closeY = dy;
        iv.closeOffsetY = closeY;
        const slot = $('ivSlotCur');
        if (slot) {
          slot.style.transition = 'none';
          slot.style.transform = `translateY(${closeY}px)`;
          slot.style.opacity = String(clamp(1 - closeY / 380, 0.1, 1));
        }
        ivDimBg(closeY / 300);
      } else {
        // Swipe up → show info preview (light drag up)
        const slot = $('ivSlotCur');
        const upY = Math.max(dy, -60);
        if (slot) {
          slot.style.transition = 'none';
          slot.style.transform = `translateY(${upY}px)`;
          slot.style.opacity = '1';
        }
      }
    }

    iv.touchLastX = t.clientX; iv.touchLastY = t.clientY;
  }, { passive: false });

  stage.addEventListener('touchend', e => {
    if (iv.pinchActive) {
      if (e.touches.length < 2) {
        const wasRotating = iv.pinchRotateActive;
        iv.pinchActive = false;
        iv.pinchRotateActive = false;
        ivHidePinchDot();

        // Snap rotation to nearest 90° (4 sides: 0, 90, 180, 270)
        if (wasRotating) {
          iv.rotate = Math.round(iv.rotate / 90) * 90;
        }

        if (iv.scale < 1) {
          // Snap back cleanly — no spring to avoid transform glitch
          iv.scale = 1; iv.panX = 0; iv.panY = 0;
          const wrap = $('ivImgWrap');
          if (wrap && typeof anime !== 'undefined') {
            anime({ targets: wrap, scale: 1, translateX: 0, translateY: 0, rotate: iv.rotate,
              duration: 320, easing: 'easeOutCubic' });
          } else { ivApplyWrapAnimated(); }
        } else if (wasRotating) {
          // Animate snap to 90° grid
          ivApplyWrapAnimated();
        }
      }
      return;
    }

    if (!iv.touchActive) return;
    iv.touchActive = false;

    const ct = e.changedTouches[0];
    const endX = ct ? ct.clientX : iv.touchLastX;
    const endY = ct ? ct.clientY : iv.touchLastY;
    const dx = endX - iv.touchStartX;
    const dy = endY - iv.touchStartY;
    const dt = Date.now() - iv.touchStartTime;

    let vx = 0, vy = 0;
    if (iv.velBuf.length >= 2) {
      const last = iv.velBuf[iv.velBuf.length - 1];
      const prev = iv.velBuf[Math.max(0, iv.velBuf.length - 4)];
      const td = Math.max(last.t - prev.t, 1);
      vx = (last.x - prev.x) / td;
      vy = (last.y - prev.y) / td;
    }

    if (iv.scale > 1.05) {
      iv.inertiaVelX = vx * 16;
      iv.inertiaVelY = vy * 16;
      ivStartInertia();
      return;
    }

    if (iv.swipeAxis === 'x') {
      const snap = Math.abs(dx) > iv.stageW * SNAP_RATIO || Math.abs(vx) > VEL_THRESHOLD;
      if (snap && dx < 0 && iv.list.length > 1)      ivCommitNext();
      else if (snap && dx > 0 && iv.list.length > 1) ivCommitPrev();
      else {
        ivApplyTrack(0, true);
        const slot = $('ivSlotCur');
        if (slot) { slot.style.transition='opacity 0.25s ease'; slot.style.opacity='1'; }
      }
    } else if (iv.swipeAxis === 'y') {
      if (dy > 0) {
        // Down → close
        const shouldClose = dy > CLOSE_PX || vy > CLOSE_VEL;
        if (shouldClose) {
          const slot = $('ivSlotCur');
          if (slot && typeof anime !== 'undefined') {
            anime({ targets: slot, translateY: [iv.closeOffsetY, window.innerHeight], opacity: 0, duration: 260, easing: 'easeInCubic', complete: _ivReset });
          } else { _ivReset(); }
        } else {
          ivApplyCurSlot(0, 1, true); ivDimBg(0); iv.closeOffsetY = 0;
        }
      } else {
        // Up → open info
        const shouldOpenInfo = dy < OPEN_INFO_PX || vy < OPEN_INFO_VEL;
        ivApplyCurSlot(0, 1, true);
        if (shouldOpenInfo && !iv.metaOpen) { ivToggleMeta(); }
      }
    } else if (Math.abs(dx) < 20 && Math.abs(dy) < 20 && dt < 500) {
      const now = Date.now();
      if (now - lastTap < 420) {
        clearTimeout(singleTapTimer); singleTapTimer = null;
        ivDoubleTap(endX, endY);
        lastTap = 0;
      } else {
        lastTap = now;
        singleTapTimer = setTimeout(() => {
          singleTapTimer = null;
          $('ivWrap').classList.toggle('ui-hidden');
        }, 440);
      }
    }
  }, { passive: true });
}

// ── Mouse drag (full PC support: pan + swipe nav) ─────────────────────────
function ivInitMouseDrag() {
  const stage = $('ivStage');
  let lastClick = 0;

  stage.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.iv-nav') || e.target.closest('.iv-ctrl-btn') || e.target.closest('#ivMetaModal') || e.target.closest('#ivMoreMenu')) return;
    iv.mouseDragging = true;
    iv.mouseMoved    = false;
    iv.touchStartX   = e.clientX; iv.touchStartY = e.clientY;
    iv.mouseSwipeStartX = e.clientX; iv.mouseSwipeStartY = e.clientY;
    iv.mouseSwipeAxis = null;
    iv.mouseDragPX   = e.clientX - iv.panX;
    iv.mouseDragPY   = e.clientY - iv.panY;
    iv.stageW        = stageSize().w;
    iv.velBuf        = [{ x: e.clientX, y: e.clientY, t: Date.now() }];
    stage.style.cursor = iv.scale > 1 ? 'grabbing' : 'grab';
    e.preventDefault();
    if (iv.inertiaRaf) { cancelAnimationFrame(iv.inertiaRaf); iv.inertiaRaf = null; }
  });

  document.addEventListener('mousemove', e => {
    if (!iv.mouseDragging || $('imageModal').classList.contains('hidden')) return;
    const dx = e.clientX - iv.mouseSwipeStartX;
    const dy = e.clientY - iv.mouseSwipeStartY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) iv.mouseMoved = true;

    iv.velBuf.push({ x: e.clientX, y: e.clientY, t: Date.now() });
    if (iv.velBuf.length > 8) iv.velBuf.shift();

    if (!iv.mouseSwipeAxis && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      iv.mouseSwipeAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }

    if (iv.scale > 1.05) {
      iv.panX = e.clientX - iv.mouseDragPX;
      iv.panY = e.clientY - iv.mouseDragPY;
      ivClampPan(); ivApplyWrap();
    } else if (iv.mouseSwipeAxis === 'x') {
      // Slide nav on PC
      const track = $('ivTrack');
      if (track) { track.style.transition='none'; track.style.transform=`translateX(${-iv.stageW + dx}px)`; }
    } else if (iv.mouseSwipeAxis === 'y') {
      if (dy > 0) {
        const slot = $('ivSlotCur');
        if (slot) { slot.style.transition='none'; slot.style.transform=`translateY(${dy}px)`; slot.style.opacity=String(clamp(1 - dy/380, 0.1, 1)); }
        ivDimBg(dy / 300);
      }
    }
  });

  document.addEventListener('mouseup', e => {
    if (!iv.mouseDragging) return;
    iv.mouseDragging = false;
    stage.style.cursor = '';

    const dx = e.clientX - iv.mouseSwipeStartX;
    const dy = e.clientY - iv.mouseSwipeStartY;

    let vx = 0, vy = 0;
    if (iv.velBuf.length >= 2) {
      const last = iv.velBuf[iv.velBuf.length-1];
      const prev = iv.velBuf[Math.max(0, iv.velBuf.length-4)];
      const td = Math.max(last.t - prev.t, 1);
      vx = (last.x - prev.x) / td;
      vy = (last.y - prev.y) / td;
    }

    if (!iv.mouseMoved) {
      const now = Date.now();
      if (now - lastClick < 300) { ivDoubleTap(e.clientX, e.clientY); lastClick = 0; }
      else { lastClick = now; }
      return;
    }

    if (iv.scale > 1.05) {
      iv.inertiaVelX = vx * 14; iv.inertiaVelY = vy * 14;
      ivStartInertia();
    } else if (iv.mouseSwipeAxis === 'x') {
      const snap = Math.abs(dx) > iv.stageW * SNAP_RATIO || Math.abs(vx) > VEL_THRESHOLD;
      if (snap && dx < 0 && iv.list.length > 1)      ivCommitNext();
      else if (snap && dx > 0 && iv.list.length > 1) ivCommitPrev();
      else { ivApplyTrack(0, true); }
    } else if (iv.mouseSwipeAxis === 'y' && dy > 0) {
      const shouldClose = dy > CLOSE_PX || vy > CLOSE_VEL;
      if (shouldClose) {
        const slot = $('ivSlotCur');
        if (slot && typeof anime !== 'undefined') {
          anime({ targets: slot, translateY: [dy, window.innerHeight], opacity: 0, duration: 260, easing: 'easeInCubic', complete: _ivReset });
        } else { _ivReset(); }
      } else {
        ivApplyCurSlot(0, 1, true); ivDimBg(0);
      }
    } else if (iv.mouseSwipeAxis === 'y' && dy <= 0) {
      ivApplyCurSlot(0, 1, true);
      if (dy < OPEN_INFO_PX || vy < OPEN_INFO_VEL) { if (!iv.metaOpen) ivToggleMeta(); }
    }
  });
}

// ── Wheel zoom ────────────────────────────────────────────────────────────
function ivInitWheel() {
  $('ivStage').addEventListener('wheel', e => {
    e.preventDefault();
    ivZoomBy(e.deltaY < 0 ? 0.25 : -0.25, e.clientX, e.clientY);
    ivCloseMore();
  }, { passive: false });
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────
function ivInitKeyboard() {
  document.addEventListener('keydown', e => {
    if ($('imageModal').classList.contains('hidden')) return;
    if (e.key === 'ArrowLeft')           ivPrev();
    if (e.key === 'ArrowRight')          ivNext();
    if (e.key === '+' || e.key === '=')  ivZoomBy(0.25);
    if (e.key === '-')                   ivZoomBy(-0.25);
    if (e.key === '0')                   ivResetWrap(true);
    if (e.key === 'r' || e.key === 'R')  ivRotate(90);
    if (e.key === 'i' || e.key === 'I')  ivToggleMeta();
    if (e.key === 'm' || e.key === 'M')  ivToggleMore();
    if (e.key === 'Escape') {
      if (iv.moreOpen)  { ivCloseMore(); return; }
      if (iv.metaOpen)  { ivToggleMeta(); return; }
      ivClose();
    }
  });
}

// ── Init ──────────────────────────────────────────────────────────────────
function ivInit() {
  iv.stageW = stageSize().w;
  const track = $('ivTrack');
  if (track) { track.style.transition='none'; track.style.transform=`translateX(${-iv.stageW}px)`; }

  $('imagePrev').addEventListener('click', e => { e.stopPropagation(); ivPrev(); });
  $('imageNext').addEventListener('click', e => { e.stopPropagation(); ivNext(); });
  $('imageClose').addEventListener('click', ivClose);

  // Top-right controls (info · download · more)
  const _filterBtn = $('ivFilterBtn');
  if (_filterBtn) _filterBtn.addEventListener('click', ivToggleFilter);
  $('ivInfoBtn').addEventListener('click',   ivToggleMeta);
  $('ivMoreBtn').addEventListener('click', e => { e.stopPropagation(); ivToggleMore(); });
  const heicBtn = $('ivHeicPreviewBtn');
  if (heicBtn) heicBtn.addEventListener('click', ivGenerateHeicPreview);

  // More menu items (zoom + rotate only)
  $('ivZoomInBtn').addEventListener('click',    () => { ivZoomBy(0.5); ivCloseMore(); });
  $('ivZoomOutBtn').addEventListener('click',   () => { ivZoomBy(-0.5); ivCloseMore(); });
  $('ivRotateLeftBtn').addEventListener('click',() => { ivRotate(-90); ivCloseMore(); });
  $('ivRotateRightBtn').addEventListener('click',()=> { ivRotate(90); ivCloseMore(); });
  $('ivMetaClose').addEventListener('click',    ivToggleMeta);

  // Swipe-down on info panel to close it
  const metaModal = $('ivMetaModal');
  let _metaSwipeStartY = 0;
  metaModal.addEventListener('touchstart', e => {
    _metaSwipeStartY = e.touches[0].clientY;
  }, { passive: true });
  metaModal.addEventListener('touchend', e => {
    const endY = e.changedTouches[0].clientY;
    if (endY - _metaSwipeStartY > 60 && iv.metaOpen) {
      ivToggleMeta();
    }
  }, { passive: true });

  // Close more menu when clicking stage
  $('ivStage').addEventListener('click', () => ivCloseMore(), { capture: false });

  document.querySelectorAll('.iv-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => ivSetFilter(chip.dataset.filter));
  });

  window.addEventListener('resize', () => {
    iv.stageW = stageSize().w;
    if (!$('imageModal').classList.contains('hidden')) ivResetTrack();
  });

  ivInitWheel();
  ivInitMouseDrag();
  ivInitTouch();
  ivInitKeyboard();
}

// ── Public API ────────────────────────────────────────────────────────────
window.ivOpen    = ivOpen;
window.ivOpenDemo= ivOpenDemo;
window.ivClose   = ivClose;
window.ivInit    = ivInit;
window.IV_DEMO   = IV_DEMO;

})();

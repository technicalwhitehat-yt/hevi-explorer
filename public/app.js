/* ─────────────────────────────────────────────
   Hevi Explorer  ·  Frontend App
   ───────────────────────────────────────────── */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  currentPath: '',
  currentView: 'home',
  listMode: 'grid',
  searchOpen: false,
  imageList: [],
  imageIndex: 0,
  ctxItem: null,
  uploadPath: '',
  uploadFiles: [],
  uploadUploading: false,
  uploadCancelled: false,
  uploadXhr: null,
  uploadReader: null,
  selectMode: false,
  selectedItems: new Set(),
};

// ── Persistent preferences (localStorage) ──────────────────────────────────
const PREFS_KEY = 'lhost_prefs';
const prefs = (() => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch(_) { return {}; }
})();
if (!prefs.viewMode)   prefs.viewMode  = 'grid';
if (!prefs.sortBy)     prefs.sortBy    = 'date';
if (!prefs.sortDir)    prefs.sortDir   = 'desc';
if (prefs.showHidden === undefined) prefs.showHidden = true;

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch(_) {}
}

// ── Cookie helpers (video player preferences persist across sessions) ───────
function setCookie(name, value, days) {
  const expires = new Date(Date.now() + (days || 365) * 86400000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}
function getCookie(name) {
  const c = document.cookie.split(';').find(s => s.trim().startsWith(name + '='));
  return c ? decodeURIComponent(c.split('=').slice(1).join('=').trim()) : null;
}

// ── Video player persistent preferences (cookies) ──────────────────────────
const vpPrefs = {
  volume:     Math.max(0, Math.min(1, parseFloat(getCookie('vp_vol')    ?? '1'))),
  speed:      parseFloat(getCookie('vp_speed')  ?? '1'),
  brightness: Math.max(0.1, Math.min(1, parseFloat(getCookie('vp_bright') ?? '1'))),
  aspectIdx:  parseInt(getCookie('vp_aspect')  ?? '0', 10),
  muted:      getCookie('vp_muted') === '1',
};
function saveVpPrefs() {
  setCookie('vp_vol',    vpPrefs.volume);
  setCookie('vp_speed',  vpPrefs.speed);
  setCookie('vp_bright', vpPrefs.brightness);
  setCookie('vp_aspect', vpPrefs.aspectIdx);
  setCookie('vp_muted',  vpPrefs.muted ? '1' : '0');
}

function buildListParams() {
  return `sort=${prefs.sortBy}&sortDir=${prefs.sortDir}&hidden=${prefs.showHidden ? '1' : '0'}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

function fileIcon(item) {
  return fileVisual(item).icon;
}

function fileVisual(item) {
  const ext = (item.ext || '').toLowerCase();
  const cat = item.category;
  if (item.type === 'dir') return { icon: '📁', label: '', className: 'file-type-folder' };
  if (cat === 'video') return { icon: '🎬', label: 'VID', className: 'file-type-video' };
  if (cat === 'image') return { icon: '🖼️', label: 'IMG', className: 'file-type-image' };
  if (cat === 'audio') {
    if (ext === '.opus') return { icon: '🎙️', label: 'OPUS', className: 'file-type-voice' };
    return { icon: '🎵', label: 'AUD', className: 'file-type-audio' };
  }
  if (cat === 'apk') return { icon: '📱', label: 'APK', className: 'file-type-apk', image: `/api/apk-icon?path=${encodeURIComponent(item.path)}` };
  if (ext === '.pdf') return { icon: '', label: '', className: 'file-type-pdf', fa: 'fa-file-pdf-o' };
  if (['.ttf','.otf','.woff','.woff2','.eot'].includes(ext)) return { icon: '🔤', label: ext.replace('.', '').toUpperCase(), className: 'file-type-font' };
  if (['.tmp','.temp','.cache','.bak','.old'].includes(ext)) return { icon: '⏱️', label: ext.replace('.', '').toUpperCase(), className: 'file-type-temp' };
  if (['.zip','.jar'].includes(ext)) return { icon: '📦', label: ext === '.jar' ? 'JAR' : 'ZIP', className: 'file-type-zip' };
  if (ext === '.rar') return { icon: '🧰', label: 'RAR', className: 'file-type-rar' };
  if (ext === '.7z' || ext === '.z7') return { icon: '🧊', label: ext.replace('.', '').toUpperCase(), className: 'file-type-7z' };
  if (['.tar','.gz','.tgz','.bz2','.xz','.lz','.lzma','.zst'].includes(ext) || cat === 'archive') return { icon: '🗜️', label: ext.replace('.', '').toUpperCase() || 'ARC', className: 'file-type-archive' };
  if (['.ppt','.pptx','.pps','.ppsx'].includes(ext)) return { icon: '📊', label: ext.replace('.', '').toUpperCase(), className: 'file-type-ppt' };
  if (['.doc','.docx','.rtf'].includes(ext)) return { icon: '📘', label: ext.replace('.', '').toUpperCase(), className: 'file-type-doc' };
  if (['.xls','.xlsx','.ods'].includes(ext)) return { icon: '📗', label: ext.replace('.', '').toUpperCase(), className: 'file-type-sheet' };
  if (['.txt','.md','.log','.sbv'].includes(ext)) return { icon: '📝', label: ext.replace('.', '').toUpperCase(), className: 'file-type-text' };
  if (ext === '.py') return { icon: '🐍', label: 'PY', className: 'file-type-python' };
  if (ext === '.sh') return { icon: '⌨️', label: 'SH', className: 'file-type-shell' };
  if (ext === '.java') return { icon: '☕', label: 'JAVA', className: 'file-type-java' };
  if (ext === '.css') return { icon: '🎨', label: 'CSS', className: 'file-type-css' };
  if (ext === '.html' || ext === '.htm') return { icon: '🌐', label: 'HTML', className: 'file-type-html' };
  if (['.js','.ts','.jsx','.tsx','.json','.xml','.yaml','.yml','.ini','.conf','.csv','.sql','.bat','.ps1','.rb','.go','.rs','.c','.cpp','.h'].includes(ext)) return { icon: '🔧', label: ext.replace('.', '').toUpperCase(), className: 'file-type-code' };
  return { icon: '📄', label: ext ? ext.replace('.', '').toUpperCase() : 'FILE', className: 'file-type-default' };
}

function fileThumbHtml(item) {
  const visual = fileVisual(item);
  const label = visual.label ? `<span class="file-type-badge">${visual.label}</span>` : '';
  const mark = visual.fa
    ? '<span class="pdf-mega-icon"><span class="pdf-mega-fold"></span><span class="pdf-mega-mark">PDF</span><span class="pdf-mega-line pdf-mega-line-1"></span><span class="pdf-mega-line pdf-mega-line-2"></span><span class="pdf-mega-line pdf-mega-line-3"></span></span>'
    : visual.image
    ? `<img class="file-type-img" src="${visual.image}" alt="${visual.label || item.name}" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='')"><span class="file-icon-big" style="display:none">${visual.icon}</span>`
    : `<span class="file-icon-big">${visual.icon}</span>`;
  return `<div class="thumb file-type-thumb ${visual.className}">${mark}${label}</div>`;
}

function fmtTime(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${m}:${String(sec).padStart(2,'0')}`;
}

function toast(msg, type = '') {
  const c = $('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 2500);
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function updateBreadcrumb(p) {
  const el = $('breadcrumb');
  if (el) el.textContent = p ? '/ ' + p.replace(/\\/g, '/') : '/';
}

// ═══════════════════════════════════════════════════════════════════════════
//  LRU CACHE  — limits memory used by thumbnail data URLs
// ═══════════════════════════════════════════════════════════════════════════

class LRUCache {
  constructor(max) { this.max = max; this.map = new Map(); }
  has(k) { return this.map.has(k); }
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k); this.map.set(k, v); // move to end (most recently used)
    return v;
  }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value); // evict oldest
  }
}


// Intersection observer for lazy audio album art in grid
const audioArtObserver = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const artUrl = el.dataset.audioArt;
        if (!artUrl) return;
        audioArtObserver.unobserve(el);
        const img = el.querySelector('.audio-art-img');
        if (!img) return;
        const probe = new Image();
        probe.crossOrigin = 'anonymous';
        probe.onload = () => {
          img.src = artUrl;
          img.style.display = 'block';
          const icon = el.querySelector('.at-icon');
          const eq = el.querySelector('.audio-eq');
          if (icon) icon.style.opacity = '0';
          if (eq) eq.style.opacity = '0';
        };
        probe.onerror = () => {};
        probe.src = artUrl;
      });
    }, { rootMargin: '150px' })
  : null;

// ── EQ animation observer — pauses CSS animation when card is off-screen ───
// Keeps GPU compositor free during fast scrolling (200+ animated elements).
const eqObserver = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver(entries => {
      entries.forEach(e => {
        const eq = e.target.querySelector('.audio-eq');
        if (eq) eq.classList.toggle('eq-paused', !e.isIntersecting);
      });
    }, { rootMargin: '200px 0px' })
  : null;

// ═══════════════════════════════════════════════════════════════════════════
//  VIDEO THUMBNAIL GENERATOR  (canvas-based, lazy)
//  Works everywhere — no FFmpeg, no server-side processing.
//  Browser loads a tiny slice of the video, seeks to ~10%, draws to canvas.
// ═══════════════════════════════════════════════════════════════════════════

const thumbCache = new Map(); // url → dataUrl | null (loading)

// ── Concurrency queue — max 2 videos loading simultaneously ───────────────
// Lower concurrency keeps the main thread free for user interaction.
const THUMB_CONCURRENCY = 2;
let _thumbActive = 0;
const _thumbQueue = []; // [{url, thumbEl}]

function _thumbDequeue() {
  while (_thumbActive < THUMB_CONCURRENCY && _thumbQueue.length) {
    const { url, thumbEl } = _thumbQueue.shift();
    _thumbRunNow(url, thumbEl);
  }
}

function generateThumb(url, thumbEl) {
  if (thumbCache.has(url)) {
    const cached = thumbCache.get(url);
    if (cached) applyThumb(thumbEl, cached);
    return;
  }
  thumbCache.set(url, null); // mark as in-progress

  if (_thumbActive >= THUMB_CONCURRENCY) {
    _thumbQueue.push({ url, thumbEl });
    return;
  }
  _thumbRunNow(url, thumbEl);
}

// Check brightness on a tiny canvas — much faster than full-res getImageData
function _isBitmapBlack(smallCtx, w, h) {
  try {
    const data = smallCtx.getImageData(0, 0, w, h).data;
    let total = 0;
    // Sample every pixel on the tiny canvas (only ~576 pixels for 32×18)
    for (let i = 0; i < data.length; i += 4) {
      total += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    return (total / (data.length / 4)) < 12;
  } catch(_) { return false; }
}

function _thumbRunNow(url, thumbEl) {
  _thumbActive++;

  const vid = document.createElement('video');
  vid.muted = true;
  vid.preload = 'metadata';
  vid.crossOrigin = 'anonymous';
  let done = false;

  // Try these timestamps; stop at first non-black frame
  const seekSteps = [2, 5, 10, 30, 60];
  let stepIdx = 0;

  const finish  = () => { _thumbActive--; _thumbDequeue(); };
  const cleanup = () => { try { vid.src = ''; vid.load(); } catch(_) {} };
  const timeout = setTimeout(() => {
    if (!done) { done = true; cleanup(); finish(); }
  }, 20000);

  vid.addEventListener('loadedmetadata', () => { vid.currentTime = seekSteps[0]; });

  vid.addEventListener('seeked', async () => {
    if (done) return;

    // Yield to the browser event loop first so UI stays responsive
    await new Promise(r => setTimeout(r, 0));
    if (done) return;

    try {
      let isBlack = false;

      // Use createImageBitmap for async, non-blocking frame capture
      if (typeof createImageBitmap === 'function') {
        // Capture a tiny 32×18 version just for the brightness check
        const small = await createImageBitmap(vid, { resizeWidth: 32, resizeHeight: 18 });
        const sc = document.createElement('canvas');
        sc.width = 32; sc.height = 18;
        sc.getContext('2d').drawImage(small, 0, 0);
        small.close();
        isBlack = _isBitmapBlack(sc.getContext('2d'), 32, 18);

        if (isBlack && stepIdx < seekSteps.length - 1) {
          stepIdx++;
          vid.currentTime = seekSteps[stepIdx];
          return;
        }

        // Good frame — capture full-res asynchronously
        const full = await createImageBitmap(vid, { resizeWidth: 320, resizeHeight: 180 });
        const canvas = document.createElement('canvas');
        canvas.width = 320; canvas.height = 180;
        canvas.getContext('2d').drawImage(full, 0, 0);
        full.close();

        done = true;
        clearTimeout(timeout);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        thumbCache.set(url, dataUrl);
        applyThumb(thumbEl, dataUrl);
      } else {
        // Fallback for browsers without createImageBitmap
        const canvas = document.createElement('canvas');
        canvas.width = 320; canvas.height = 180;
        canvas.getContext('2d').drawImage(vid, 0, 0, 320, 180);
        done = true;
        clearTimeout(timeout);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        thumbCache.set(url, dataUrl);
        applyThumb(thumbEl, dataUrl);
      }
    } catch(_) { done = true; clearTimeout(timeout); }

    if (done) { cleanup(); finish(); }
  });

  vid.addEventListener('error', () => {
    if (!done) { done = true; clearTimeout(timeout); cleanup(); finish(); }
  });
  vid.src = url;
}

function applyThumb(thumbEl, dataUrl) {
  if (!thumbEl || !thumbEl.isConnected) return;
  const canvas = thumbEl.querySelector('.vt-canvas');
  const spinner = thumbEl.querySelector('.vt-loading');
  const overlay = thumbEl.querySelector('.video-play-overlay');
  if (canvas) { canvas.src = dataUrl; canvas.style.display = 'block'; }
  if (spinner) spinner.style.display = 'none';
  if (overlay) overlay.style.opacity = '1';
}

// Lazy: only generate thumbnails when card enters viewport.
// rootMargin: 0px — don't preload until card is actually visible.
// A 250ms debounce lets the user scroll freely without triggering loads for every card.
const thumbObserver = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver(entries => {
      entries.forEach(e => {
        const el = e.target;
        if (!e.isIntersecting) {
          // Card left viewport — cancel any pending debounce
          if (el._thumbTimer) { clearTimeout(el._thumbTimer); el._thumbTimer = null; }
          return;
        }
        const url = el.dataset.thumbUrl;
        if (!url) return;
        // Debounce: only start loading if card stays visible for 250ms
        el._thumbTimer = setTimeout(() => {
          el._thumbTimer = null;
          thumbObserver.unobserve(el);
          generateThumb(url, el);
        }, 250);
      });
    }, { rootMargin: '0px' })
  : null;

// ── Image thumbnail lazy loader — debounced IntersectionObserver ───────────
//  Uses a concurrency limit so the server isn't hammered with 50+ sharp calls.
//  Replaces native loading="lazy" which has no debounce or concurrency limit.
const IMG_CONCURRENCY = 6;
let _imgActive = 0;
const _imgQueue = []; // {img, src}

function _imgDequeue() {
  while (_imgActive < IMG_CONCURRENCY && _imgQueue.length) {
    const { img, src } = _imgQueue.shift();
    _imgLoad(img, src);
  }
}
function _imgLoad(img, src) {
  _imgActive++;
  const done = () => { _imgActive--; _imgDequeue(); };
  img.onload = img.onerror = done;
  img.src = src;
}
function _imgEnqueue(img, src) {
  if (_imgActive < IMG_CONCURRENCY) { _imgLoad(img, src); return; }
  _imgQueue.push({ img, src });
}

const imgObserver = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver(entries => {
      entries.forEach(e => {
        const img = e.target;
        if (!e.isIntersecting) {
          if (img._imgTimer) { clearTimeout(img._imgTimer); img._imgTimer = null; }
          return;
        }
        const src = img.dataset.src;
        if (!src || img.src) return;
        img._imgTimer = setTimeout(() => {
          img._imgTimer = null;
          imgObserver.unobserve(img);
          _imgEnqueue(img, src);
        }, 150);
      });
    }, { rootMargin: '200px' })
  : null;

// ═══════════════════════════════════════════════════════════════════════════
//  MEMORY OBSERVER  — evicts audio-art-img src when 5+ screens away.
//  Browser handles regular lazy-loaded images itself; we only touch
//  the fetched audio art images which stay in memory after load.
// ═══════════════════════════════════════════════════════════════════════════

const memObserver = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver(entries => {
      entries.forEach(e => {
        const el       = e.target;
        const audioArt = el.querySelector('.audio-art-img');
        if (!audioArt) return;
        if (!e.isIntersecting) {
          if (audioArt.complete && audioArt.naturalWidth > 0 && audioArt.src && !audioArt.dataset.memSrc) {
            audioArt.dataset.memSrc = audioArt.src;
            audioArt.src = '';
          }
        } else {
          if (audioArt.dataset.memSrc) {
            audioArt.src = audioArt.dataset.memSrc;
            delete audioArt.dataset.memSrc;
          }
        }
      });
    }, { rootMargin: '3000% 0px' })
  : null;

// ═══════════════════════════════════════════════════════════════════════════
//  PAGINATION ENGINE  (infinite scroll for 100k+ files)
// ═══════════════════════════════════════════════════════════════════════════

const PG_LIMIT = 125; // items per page — larger batch = fewer API calls
const VP_PREVIEW_BUCKET_SECONDS = 5;

const pg = {
  view:     null,  // 'browser' | 'cat' | 'search'
  param:    null,  // relPath | cat | query string
  page:     0,     // NEXT page to fetch
  total:    0,     // total items on server
  loading:  false,
  imageSet: [],    // grows as pages load
  audioSet: [],
  videoSet: [],
  grid:     null,
};

let _sentinelObserver = null;

function pgReset(view, param, grid) {
  if (_sentinelObserver) { _sentinelObserver.disconnect(); _sentinelObserver = null; }
  pg.view = view; pg.param = param; pg.grid = grid;
  pg.page = 0; pg.total = 0; pg.loading = false;
  pg.imageSet = []; pg.audioSet = []; pg.videoSet = [];
}

function pgSentinelSetup() {
  const old = pg.grid ? pg.grid.querySelector('.pg-sentinel') : null;
  if (old) old.remove();
  if (!pg.grid) return;
  if (pg.page * PG_LIMIT >= pg.total) return; // all pages loaded

  const s = document.createElement('div');
  s.className = 'pg-sentinel';
  pg.grid.appendChild(s);

  _sentinelObserver = new IntersectionObserver(async entries => {
    if (!entries[0].isIntersecting || pg.loading) return;
    if (pg.page * PG_LIMIT >= pg.total) { _sentinelObserver.disconnect(); return; }
    await pgNext();
  }, { rootMargin: '800px' }); // load next page well before user reaches bottom
  _sentinelObserver.observe(s);
}

function createSkeletons(count) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'file-item sk-card';
    el.innerHTML = '<div class="thumb sk-thumb"></div><div class="item-info"><div class="sk-line sk-name"></div><div class="sk-line sk-size"></div></div>';
    frag.appendChild(el);
  }
  return frag;
}

async function pgNext() {
  if (pg.loading || !pg.grid) return;
  pg.loading = true;

  // Show skeleton placeholders
  const remaining = pg.total - pg.page * PG_LIMIT;
  const skCount = Math.min(remaining, 30);
  const skEls = [];
  for (let i = 0; i < skCount; i++) {
    const sk = document.createElement('div');
    sk.className = 'file-item sk-card';
    sk.innerHTML = '<div class="thumb sk-thumb"></div><div class="item-info"><div class="sk-line sk-name"></div><div class="sk-line sk-size"></div></div>';
    pg.grid.appendChild(sk);
    skEls.push(sk);
  }

  try {
    let url;
    if      (pg.view === 'browser') url = `/api/ls?path=${encodeURIComponent(pg.param)}&page=${pg.page}&limit=${PG_LIMIT}&${buildListParams()}`;
    else if (pg.view === 'cat')     url = `/api/category/${pg.param}?page=${pg.page}&limit=${PG_LIMIT}&${buildListParams()}`;
    else if (pg.view === 'search')  url = `/api/search?q=${encodeURIComponent(pg.param)}&path=&page=${pg.page}&limit=${PG_LIMIT}&hidden=${prefs.showHidden ? '1' : '0'}`;

    const data = await fetchJson(url);
    const newItems = data.items || data.results || [];

    pg.imageSet.push(...newItems.filter(i => i.category === 'image'));
    pg.audioSet.push(...newItems.filter(i => i.category === 'audio'));
    pg.videoSet.push(...newItems.filter(i => i.category === 'video'));
    pg.total = data.total;
    pg.page++;

    skEls.forEach(s => s.remove());
    for (const item of newItems) {
      pg.grid.appendChild(createItemEl(item, pg.imageSet, pg.audioSet, pg.videoSet));
    }
  } catch (e) {
    skEls.forEach(s => s.remove());
    console.error('[pg] load error:', e);
  }

  pg.loading = false;
  pgSentinelSetup();
}

// ═══════════════════════════════════════════════════════════════════════════
//  CUSTOM VIDEO PLAYER
// ═══════════════════════════════════════════════════════════════════════════

const VP_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const ASPECTS   = ['fit','fill','stretch'];
const ASPECT_LABELS = { fit:'Fit', fill:'Fill', stretch:'Stretch' };

// Extensions that the HTML5 <video> element can reliably play in modern browsers
const NATIVE_VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogg', '.ogv', '.m4v']);
function isNativeVideo(item) { return NATIVE_VIDEO_EXTS.has((item.ext || '').toLowerCase()); }

const NATIVE_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif', '.apng']);
const HEIC_IMAGE_EXTS = new Set(['.heic', '.heif']);
const PRO_IMAGE_EXTS = new Set(['.raw', '.cr2', '.nef', '.arw', '.dng', '.psd', '.ai', '.tiff', '.tif']);
function imageFormatInfo(item) {
  const ext = (item.ext || '').toLowerCase();
  if (NATIVE_IMAGE_EXTS.has(ext)) return { native: true, badge: '', className: '' };
  if (HEIC_IMAGE_EXTS.has(ext)) return { native: false, badge: 'HEIC', className: 'format-thumb-heic' };
  if (PRO_IMAGE_EXTS.has(ext)) {
    const raw = ['.raw', '.cr2', '.nef', '.arw', '.dng'].includes(ext);
    return { native: false, badge: raw ? 'RAW' : ext.replace('.', '').toUpperCase(), className: raw ? 'format-thumb-raw' : 'format-thumb-pro' };
  }
  return { native: false, badge: (ext || '.IMG').replace('.', '').toUpperCase(), className: 'format-thumb-pro' };
}

const vp = {
  item: null,
  url: '',
  videoSet: [],    // all videos in current context (for prev/next)
  videoIdx: -1,    // index of current video in videoSet
  // Restored from cookies on every session
  speed:      vpPrefs.speed,
  aspectIdx:  vpPrefs.aspectIdx,
  theater: false,
  brightness: vpPrefs.brightness,
  volume:     vpPrefs.volume,
  muted:      vpPrefs.muted,
  controlsTimer: null,
  controlsLocked: false,
  lockTimer: null,
  progressDragging: false,
  previewTimer: null,
  previewVideo: null,
  previewVideoUrl: '',
  previewBusy: false,
  previewPendingTime: null,
  previewCache: new LRUCache(24),
  clickTimer: null,
  suppressClickUntil: 0,
  // gesture tracking
  touch: {
    startX: 0, startY: 0, startVal: 0,
    type: null,         // 'vol' | 'bright' | null
    leftTap: 0, rightTap: 0,
    tapCount: 0,
    controlsWereHidden: false,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//  PREMIUM MUSIC PLAYER
// ═══════════════════════════════════════════════════════════════════════════

const AUDIO_PALETTES = [
  ['#00d4c8','#0091ff'],
  ['#f953c6','#b91d73'],
  ['#667eea','#764ba2'],
  ['#f7971e','#ffd200'],
  ['#11998e','#38ef7d'],
  ['#c94b4b','#4b134f'],
  ['#4776e6','#8e54e9'],
  ['#00b09b','#96c93d'],
];

function audioPalette(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AUDIO_PALETTES[Math.abs(h) % AUDIO_PALETTES.length];
}

function _hue2rgb(p, q, t) {
  if (t < 0) t += 1; if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}
function _rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6;
    }
  }
  return [h, s, l];
}
function _hslToHex(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = _hue2rgb(p, q, h + 1/3);
    g = _hue2rgb(p, q, h);
    b = _hue2rgb(p, q, h - 1/3);
  }
  const toH = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toH(r)}${toH(g)}${toH(b)}`;
}
function extractColors(imgEl) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 8; canvas.height = 8;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(imgEl, 0, 0, 8, 8);
    const d = ctx.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 100) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    if (!n) return null;
    r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
    let [h, s, l] = _rgbToHsl(r, g, b);
    s = Math.min(1, s * 1.5 + 0.25);
    l = Math.min(0.72, Math.max(0.38, l));
    const c1 = _hslToHex(h, s, l);
    const c2 = _hslToHex((h + 0.17) % 1, s, Math.max(0.25, l - 0.15));
    return [c1, c2];
  } catch (_) { return null; }
}

const mp = {
  queue: [],
  index: 0,
  shuffle: false,
  repeat: 'none',
  shuffleOrder: [],
  audioCtx: null,
  analyser: null,
  source: null,
  rafId: null,
  isPlaying: false,
  progressDragging: false,
  color1: '#00d4c8',
  color2: '#0091ff',
  volume: 1,
  speed: 1,
  muted: false,
  sleepTimer: null,
  sleepEnd: 0,
  vizMode: 'circle',
  metaCache: {},
  trackChanging: false,
};

function mpGetAudio() { return $('audioPlayer'); }

function mpFisherYates(len) {
  const a = [...Array(len).keys()];
  for (let i = len - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function openAudio(item, url, queue = []) {
  closeOtherMediaModals('audio');
  mp.queue = queue.length ? queue : [item];
  mp.index = mp.queue.findIndex(i => i.path === item.path);
  if (mp.index < 0) mp.index = 0;
  if (mp.shuffle) mp.shuffleOrder = mpFisherYates(mp.queue.length);
  mpHideMini();
  openModal('audioModal');
  // Apply circle mode class immediately so CSS transitions and vinyl overlay are ready
  if (mp.vizMode === 'circle') {
    $('mpArtSection')?.classList.add('circle-mode');
    const vizWrap = document.querySelector('.mp-viz-wrap');
    if (vizWrap) vizWrap.style.display = 'none';
  }
  mpLoadTrack(mp.index);
}

function mpExpandFromMini() {
  mpHideMini();
  openModal('audioModal');
  if (mp.vizMode === 'circle') {
    $('mpArtSection')?.classList.add('circle-mode');
    const vizWrap = document.querySelector('.mp-viz-wrap');
    if (vizWrap) vizWrap.style.display = 'none';
  }
  // Restart visualizer since it was stopped when mini was shown
  if (!mp.rafId) mpStartVisualizer();
}

function mpLoadTrack(idx) {
  const item = mp.queue[idx];
  if (!item) return;
  mp.index = idx;
  mpUpdateFavBtn();

  const trackUrl = item._cloudUrl || `/file?path=${encodeURIComponent(item.path)}`;
  const audio = mpGetAudio();

  const displayName = item.name.replace(/\.[^.]+$/, '');
  const ext = (item.ext || '').toUpperCase().replace('.', '');
  $('mpTitle').textContent = displayName;
  $('mpArtist').textContent = (ext ? ext + ' · ' : '') + (item.sizeStr || '');
  $('audioDl').href = trackUrl + '&dl=1';

  const [c1, c2] = audioPalette(item.name);

  function mpApplyColors(col1, col2) {
    mp.color1 = col1; mp.color2 = col2;
    $('mpArtGlow').style.background = col1;
    const container = $('mpContainer');
    container.style.setProperty('--mp-color1', col1);
    container.style.setProperty('--mp-color2', col2);
    $('mpAmbientBlur').style.setProperty('--mp-color1', col1);
    $('mpAmbientBlur').style.setProperty('--mp-color2', col2);
    // Update vol slider gradient color
    mpUpdateVolDisplay();
  }

  // Art pop-in animation
  const artEl = $('mpArt');
  artEl.classList.remove('mp-art-pop');
  void artEl.offsetWidth;
  artEl.classList.add('mp-art-pop');
  artEl.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
  const artIcon = artEl.querySelector('.mp-art-icon');
  if (artIcon) artIcon.style.display = '';
  let existingImg = artEl.querySelector('.mp-art-img');
  if (existingImg) existingImg.remove();

  const artUrl = `/api/art?path=${encodeURIComponent(item.path)}`;
  const img = new Image();
  img.className = 'mp-art-img';
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    artEl.style.background = 'none';
    if (artIcon) artIcon.style.display = 'none';
    let old = artEl.querySelector('.mp-art-img');
    if (old) old.remove();
    artEl.appendChild(img);
    const extracted = extractColors(img);
    if (extracted) mpApplyColors(extracted[0], extracted[1]);
    mpUpdateMediaSession(item);
  };
  img.onerror = () => { mpUpdateMediaSession(item); };
  img.src = artUrl;

  mpApplyColors(c1, c2);

  mp.trackChanging = true;
  mpUpdateMediaSession(item);
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

  const _targetVol = mp.muted ? 0 : mp.volume;
  audio.src = trackUrl;
  audio.playbackRate = mp.speed;
  audio.volume = 0;
  $('mpProgressFill').style.width = '0%';
  $('mpProgressDot').style.left = '0%';
  $('mpCurrentTime').textContent = '0:00';
  $('mpDuration').textContent = '0:00';

  mpInitAudioContext();
  audio.play().then(() => {
    mp.trackChanging = false;
    mpSetPlaying(true);
    let _fv = 0;
    const _fadeIn = () => {
      _fv = Math.min(_fv + 0.06, _targetVol);
      audio.volume = _fv;
      if (_fv < _targetVol) requestAnimationFrame(_fadeIn);
    };
    requestAnimationFrame(_fadeIn);
  }).catch(() => { mp.trackChanging = false; audio.volume = _targetVol; });
  mpRenderQueue();

  // Apply marquee for long titles
  setTimeout(() => mpApplyMarquee($('mpTitle')), 60);

  // Fetch real ID3 metadata
  mpLoadMeta(item);
  mpUpdateMediaSession(item);

  if ($('miniPlayer').classList.contains('active')) {
    mpUpdateMiniInfo(mp.queue[mp.index]);
  }

  // Update EQ badge: only currently playing item gets .eq-active
  mpUpdateEqBadge();
}

function mpUpdateEqBadge() {
  // Remove .eq-active from all file-item elements
  qsa('.file-item.eq-active').forEach(el => el.classList.remove('eq-active'));
  const cur = mp.queue[mp.index];
  if (!cur) return;
  // Find the matching file-item in the grid by path
  const match = document.querySelector(`.file-item[data-path="${CSS.escape(cur.path)}"]`);
  if (match) match.classList.add('eq-active');
}

function mpInitAudioContext() {
  const audio = mpGetAudio();
  if (!mp.audioCtx) {
    try {
      mp.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      mp.source = mp.audioCtx.createMediaElementSource(audio);
      mp.analyser = mp.audioCtx.createAnalyser();
      mp.analyser.fftSize = 128;
      mp.analyser.smoothingTimeConstant = 0.8;
      mp.source.connect(mp.analyser);
      mp.analyser.connect(mp.audioCtx.destination);
    } catch(e) { console.warn('AudioContext unavailable:', e); }
  } else if (mp.audioCtx.state === 'suspended') {
    mp.audioCtx.resume();
  }
  if (!mp.rafId) mpStartVisualizer();
}

function mpSetPlaying(playing) {
  mp.isPlaying = playing;
  $('mpPlayIcon').innerHTML = playing
    ? '<rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/>'
    : '<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/>';
  mpUpdateMiniPlayIcon();

  // ── Vinyl spin: play → spin, pause/stop → slow-down then stop ───────────
  const artEl = $('mpArt');
  if (artEl && mp.vizMode === 'circle') {
    if (playing) {
      // Remove pop animation to avoid conflict with vinyl spin transform
      artEl.classList.remove('vinyl-slowing', 'mp-art-pop');
      void artEl.offsetWidth;
      artEl.classList.add('vinyl-playing');
    } else {
      artEl.classList.remove('vinyl-playing');
      artEl.classList.add('vinyl-slowing');
      artEl.addEventListener('animationend', function _end() {
        artEl.classList.remove('vinyl-slowing');
        artEl.removeEventListener('animationend', _end);
      }, { once: true });
    }
  }
}

function mpTogglePlay() {
  const audio = mpGetAudio();
  const btn = $('mpPlayBtn');
  btn.classList.remove('pulse');
  void btn.offsetWidth;
  btn.classList.add('pulse');
  if (audio.paused) {
    if (mp.audioCtx && mp.audioCtx.state === 'suspended') mp.audioCtx.resume();
    audio.play().then(() => mpSetPlaying(true)).catch(() => {});
  } else {
    audio.pause();
    mpSetPlaying(false);
  }
}

function mpNext() {
  if (!mp.queue.length) return;
  let nextIdx;
  if (mp.shuffle) {
    const pos = mp.shuffleOrder.indexOf(mp.index);
    nextIdx = mp.shuffleOrder[(pos + 1) % mp.shuffleOrder.length];
  } else {
    nextIdx = (mp.index + 1) % mp.queue.length;
  }
  mpLoadTrack(nextIdx);
}

function mpPrev() {
  const audio = mpGetAudio();
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  let prevIdx;
  if (mp.shuffle) {
    const pos = mp.shuffleOrder.indexOf(mp.index);
    prevIdx = mp.shuffleOrder[(pos - 1 + mp.shuffleOrder.length) % mp.shuffleOrder.length];
  } else {
    prevIdx = (mp.index - 1 + mp.queue.length) % mp.queue.length;
  }
  mpLoadTrack(prevIdx);
}

function mpToggleShuffle() {
  mp.shuffle = !mp.shuffle;
  if (mp.shuffle) mp.shuffleOrder = mpFisherYates(mp.queue.length);
  $('mpShuffleBtn').classList.toggle('active', mp.shuffle);
  mpRenderQueue();
}

function mpToggleRepeat() {
  const modes = ['none', 'all', 'one'];
  mp.repeat = modes[(modes.indexOf(mp.repeat) + 1) % modes.length];
  const btn = $('mpRepeatBtn');
  btn.classList.toggle('active', mp.repeat !== 'none');
  btn.title = mp.repeat === 'one' ? 'Repeat One' : mp.repeat === 'all' ? 'Repeat All' : 'Repeat';
  // Show "1" badge on the button when repeat-one is active
  let badge = btn.querySelector('.mp-repeat-badge');
  if (mp.repeat === 'one') {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'mp-repeat-badge';
      btn.appendChild(badge);
    }
    badge.textContent = '1';
  } else {
    if (badge) badge.remove();
  }
}

let _mpProgressRaf = null;
function mpUpdateProgress() {
  if (mp.progressDragging) return;
  if (_mpProgressRaf) return;
  _mpProgressRaf = requestAnimationFrame(() => {
    _mpProgressRaf = null;
    const audio = mpGetAudio();
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    $('mpProgressFill').style.width = pct + '%';
    $('mpProgressDot').style.left = pct + '%';
    $('mpCurrentTime').textContent = fmtTime(audio.currentTime);
    $('miniProgressFill').style.width = pct + '%';
  });
}

let _mpSeekPending = null;
let _mpBarRect = null;
function mpSeekFromEvent(e) {
  if (!_mpBarRect) _mpBarRect = $('mpProgressBar').getBoundingClientRect();
  const rect = _mpBarRect;
  const touch = e.touches && e.touches[0] ? e.touches[0] : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null);
  const clientX = touch ? touch.clientX : e.clientX;
  const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  // Update visual immediately — no transition so dot follows finger exactly
  $('mpProgressFill').style.width = (pct * 100) + '%';
  $('mpProgressDot').style.left = (pct * 100) + '%';
  $('mpCurrentTime').textContent = fmtTime(pct * (mpGetAudio().duration || 0));
  // Buffer the actual seek — applied on release to avoid audio glitch while dragging
  _mpSeekPending = pct;
}
function _mpApplyPendingSeek() {
  if (_mpSeekPending !== null) {
    const audio = mpGetAudio();
    if (audio.duration) {
      const wasPlaying = !audio.paused;
      if (wasPlaying) audio.pause();
      audio.currentTime = _mpSeekPending * audio.duration;
      if (wasPlaying) {
        setTimeout(() => {
          audio.play().catch(() => {});
          if (mp.audioCtx && mp.audioCtx.state === 'suspended') mp.audioCtx.resume();
        }, 80);
      }
    }
    _mpSeekPending = null;
  }
  mp.progressDragging = false;
}

function mpRenderQueue() {
  const list = $('mpQueueList');
  list.innerHTML = '';
  const total = mp.queue.length;

  // Update both the toggle bar label and the panel header label
  const panelLabel = $('mpQueuePanelLabel');
  if (panelLabel) panelLabel.textContent = `Up Next (${total})`;
  const toggleLabel = $('mpQueueLabel');
  if (toggleLabel) toggleLabel.textContent = `Up Next${total > 1 ? ` (${total})` : ''}`;

  for (let i = 0; i < total; i++) {
    const idx = mp.shuffle ? mp.shuffleOrder[i] : (mp.index + i) % total;
    const item = mp.queue[idx];
    if (!item) continue;
    const [c1, c2] = audioPalette(item.name);
    const isCurr = idx === mp.index;
    const el = document.createElement('div');
    el.className = 'mp-queue-item' + (isCurr ? ' active' : '');
    el.setAttribute('draggable', 'true');
    el.dataset.queuePos = String(i);
    const badgeHtml = isCurr
      ? `<div class="mp-queue-playing"><span></span><span></span><span></span></div>`
      : `<span class="mp-queue-num">${i + 1}</span>`;
    el.innerHTML = `
      <div class="mp-queue-thumb" style="background:linear-gradient(135deg,${c1},${c2})">
        <img class="mp-queue-art" alt="">
        <svg viewBox="0 0 24 24" class="mp-queue-icon"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      </div>
      <div class="mp-queue-info">
        <div class="mp-queue-name">${item.name.replace(/\.[^.]+$/,'')}</div>
        <div class="mp-queue-size">${item.sizeStr || ''}</div>
      </div>
      ${badgeHtml}
      <div class="mp-queue-drag-handle" title="Drag to reorder">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="15" x2="16" y2="15"/></svg>
      </div>`;
    const artUrl = `/api/art?path=${encodeURIComponent(item.path)}`;
    const artImg = el.querySelector('.mp-queue-art');
    const artIcon = el.querySelector('.mp-queue-icon');
    const probe = new Image();
    probe.onload = () => { artImg.src = artUrl; artImg.style.display = 'block'; if (artIcon) artIcon.style.opacity = '0'; };
    probe.onerror = () => {};
    probe.src = artUrl;
    el.addEventListener('click', e => {
      if (e.target.closest('.mp-queue-drag-handle')) return;
      mpLoadTrack(idx);
      setTimeout(mpCloseQueue, 280);
    });
    list.appendChild(el);
  }

  mpSetupQueueDrag(list);
}

function mpReorderQueue(fromPos, toPos) {
  if (fromPos === toPos || fromPos < 0 || toPos < 0) return;
  const total = mp.queue.length;
  const currentItem = mp.queue[mp.index];

  if (mp.shuffle) {
    const moved = mp.shuffleOrder.splice(fromPos, 1)[0];
    mp.shuffleOrder.splice(toPos, 0, moved);
  } else {
    const actualFrom = (mp.index + fromPos) % total;
    const actualTo   = (mp.index + toPos)   % total;
    const [moved] = mp.queue.splice(actualFrom, 1);
    mp.queue.splice(actualTo, 0, moved);
    mp.index = mp.queue.indexOf(currentItem);
    if (mp.index < 0) mp.index = 0;
  }
  mpRenderQueue();
}

function mpSetupQueueDrag(list) {
  let dragSrcPos = -1;

  // ── Desktop drag-and-drop ──────────────────────────────────────────────────
  list.addEventListener('dragstart', e => {
    const item = e.target.closest('.mp-queue-item');
    if (!item) return;
    dragSrcPos = parseInt(item.dataset.queuePos);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => item.classList.add('mp-q-dragging'), 0);
  });
  list.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.mp-queue-item');
    if (!target) return;
    qsa('.mp-queue-item', list).forEach(el => el.classList.remove('mp-q-dragover'));
    if (parseInt(target.dataset.queuePos) !== dragSrcPos) target.classList.add('mp-q-dragover');
  });
  list.addEventListener('dragleave', e => {
    if (!e.relatedTarget || !list.contains(e.relatedTarget)) {
      qsa('.mp-queue-item', list).forEach(el => el.classList.remove('mp-q-dragover'));
    }
  });
  list.addEventListener('drop', e => {
    e.preventDefault();
    const target = e.target.closest('.mp-queue-item');
    qsa('.mp-queue-item', list).forEach(el => { el.classList.remove('mp-q-dragging', 'mp-q-dragover'); });
    if (!target) return;
    const destPos = parseInt(target.dataset.queuePos);
    mpReorderQueue(dragSrcPos, destPos);
    dragSrcPos = -1;
  });
  list.addEventListener('dragend', () => {
    qsa('.mp-queue-item', list).forEach(el => { el.classList.remove('mp-q-dragging', 'mp-q-dragover'); });
    dragSrcPos = -1;
  });

  // ── Mobile touch long-press drag ──────────────────────────────────────────
  let touchSrcPos = -1, touchSrcEl = null;
  let holdTimer = null, dragActive = false;
  let startY = 0, ghost = null;

  list.addEventListener('touchstart', e => {
    const item = e.target.closest('.mp-queue-item');
    if (!item) return;
    touchSrcEl  = item;
    touchSrcPos = parseInt(item.dataset.queuePos);
    startY = e.touches[0].clientY;
    holdTimer = setTimeout(() => {
      dragActive = true;
      item.classList.add('mp-q-dragging');
      const r = item.getBoundingClientRect();
      ghost = item.cloneNode(true);
      ghost.classList.add('mp-q-ghost');
      ghost.style.top    = r.top + 'px';
      ghost.style.width  = r.width + 'px';
      document.body.appendChild(ghost);
    }, 380);
  }, { passive: true });

  list.addEventListener('touchmove', e => {
    const dy = Math.abs(e.touches[0].clientY - startY);
    if (!dragActive && dy > 10) { clearTimeout(holdTimer); return; }
    if (!dragActive || !ghost) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    ghost.style.top = (y - 28) + 'px';
    qsa('.mp-queue-item:not(.mp-q-dragging)', list).forEach(el => {
      const r = el.getBoundingClientRect();
      el.classList.toggle('mp-q-dragover', y >= r.top && y <= r.bottom);
    });
  }, { passive: false });

  list.addEventListener('touchend', e => {
    clearTimeout(holdTimer);
    if (ghost) { ghost.remove(); ghost = null; }
    if (touchSrcEl) touchSrcEl.classList.remove('mp-q-dragging');
    if (!dragActive) { touchSrcPos = -1; touchSrcEl = null; return; }
    dragActive = false;
    const y = e.changedTouches[0].clientY;
    let destPos = touchSrcPos;
    qsa('.mp-queue-item:not(.mp-q-dragging)', list).forEach(el => {
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) destPos = parseInt(el.dataset.queuePos);
      el.classList.remove('mp-q-dragover');
    });
    if (destPos !== touchSrcPos) mpReorderQueue(touchSrcPos, destPos);
    touchSrcPos = -1; touchSrcEl = null;
  }, { passive: true });
}

function mpStartVisualizer() {
  if (mp.vizMode === 'off') return;

  // ── Circle mode: draws on the overlay canvas around album art ──────────────
  if (mp.vizMode === 'circle') {
    const canvas = $('mpCircleCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const isMobile = window.matchMedia('(max-width: 600px)').matches;
    const frameInterval = isMobile ? 66 : 33; // ~15fps mobile, ~30fps desktop — balanced
    let lastTs = 0;
    let sizeDirty = true;
    let dpr = 1, CX = 160, CY = 160, ART_R = 110, INNER_R = 118, MAX_EXT = 52;

    function vcResize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const par = canvas.parentElement;
      const SW = par ? par.offsetWidth : 320;
      const SH = par ? par.offsetHeight : 320;
      canvas.width  = SW * dpr;
      canvas.height = SH * dpr;
      canvas.style.width  = SW + 'px';
      canvas.style.height = SH + 'px';

      // Compute center from actual art element position for pixel-perfect alignment
      const artEl = $('mpArt');
      if (artEl) {
        const cr = canvas.getBoundingClientRect();
        const ar = artEl.getBoundingClientRect();
        if (cr.width > 0) {
          CX = ar.left - cr.left + ar.width  / 2;
          CY = ar.top  - cr.top  + ar.height / 2;
          ART_R = ar.width / 2;
        } else {
          CX = SW / 2; CY = SH / 2;
          ART_R = artEl.offsetWidth / 2 || 110;
        }
      } else {
        CX = SW / 2; CY = SH / 2; ART_R = 110;
      }
      INNER_R = ART_R + 7;
      const room = Math.min(CX, CY, SW - CX, SH - CY) - INNER_R - 6;
      MAX_EXT = Math.max(10, Math.min(isMobile ? 48 : 62, room));
      sizeDirty = false;
    }

    const _ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { sizeDirty = true; }) : null;
    if (_ro) { _ro.observe(canvas.parentElement); }

    // Defer first resize to next paint so modal is fully laid out
    requestAnimationFrame(() => { vcResize(); });

    const NUM_BARS    = isMobile ? 64 : 128;  // fewer bars on mobile — halves stroke calls
    const QUARTER     = NUM_BARS / 4;
    const HALF        = NUM_BARS / 2;
    const ACTIVE_BINS = 29;  // use bins 0-29 (~0-10kHz) so every quadrant maps to musical range

    // Parse hex → [r,g,b] — called once outside drawCircle, re-called when colors change
    function _hx(h) {
      h = (h || '#00d4c8').replace('#','');
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return [parseInt(h.slice(0,2),16)||0, parseInt(h.slice(2,4),16)||0, parseInt(h.slice(4,6),16)||0];
    }
    let _cachedC1 = '', _cachedC2 = '';
    let _rgb1 = [0,212,200], _rgb2 = [0,145,255];

    // Pre-allocate frequency buffer — never reallocated per frame
    let _freqBuf = null;

    // Pre-compute per-bar colors into typed arrays — recomputed only on color change
    const _barR = new Uint8Array(NUM_BARS);
    const _barG = new Uint8Array(NUM_BARS);
    const _barB = new Uint8Array(NUM_BARS);

    function _rebuildBarColors(r1,g1,b1,r2,g2,b2) {
      for (let i = 0; i < NUM_BARS; i++) {
        const t = (Math.sin((i / NUM_BARS) * Math.PI * 4 - Math.PI / 2) + 1) / 2;
        _barR[i] = Math.round(r1 + (r2 - r1) * t);
        _barG[i] = Math.round(g1 + (g2 - g1) * t);
        _barB[i] = Math.round(b1 + (b2 - b1) * t);
      }
    }
    _rebuildBarColors(0,212,200,0,145,255);

    function drawCircle(ts) {
      if (mp.vizMode !== 'circle') { mp.rafId = null; if (_ro) _ro.disconnect(); return; }
      // Don't keep the RAF loop spinning when nothing is visible — saves CPU
      // and noticeably reduces UI lag on lower-end phones.
      if (document.hidden) { mp.rafId = null; return; }
      mp.rafId = requestAnimationFrame(drawCircle);
      if (frameInterval && ts - lastTs < frameInterval) return;
      lastTs = ts;
      if (sizeDirty) vcResize();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      const c1 = mp.color1 || '#00d4c8';
      const c2 = mp.color2 || '#0091ff';

      // Re-parse + rebuild bar colors only when album changes
      if (c1 !== _cachedC1 || c2 !== _cachedC2) {
        _rgb1 = _hx(c1); _rgb2 = _hx(c2);
        _cachedC1 = c1; _cachedC2 = c2;
        _rebuildBarColors(_rgb1[0],_rgb1[1],_rgb1[2], _rgb2[0],_rgb2[1],_rgb2[2]);
      }
      const [r1,g1,b1] = _rgb1;

      if (!mp.analyser || !mp.isPlaying) {
        // Idle: single glowing ring — skip shadowBlur on mobile
        ctx.beginPath();
        ctx.arc(CX, CY, INNER_R, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r1},${g1},${b1},0.35)`;
        ctx.lineWidth = 1.5;
        if (!isMobile) { ctx.shadowBlur = 10; ctx.shadowColor = c1; }
        ctx.stroke();
        ctx.shadowBlur = 0;
        return;
      }

      // Reuse pre-allocated buffer — zero GC pressure
      const binCount = mp.analyser.frequencyBinCount;
      if (!_freqBuf || _freqBuf.length !== binCount) _freqBuf = new Uint8Array(binCount);
      mp.analyser.getByteFrequencyData(_freqBuf);
      const bins = binCount; // 64 for fftSize=128

      // Average energy (integer math only)
      let avgSum = 0;
      for (let i = 0; i < bins; i++) avgSum += _freqBuf[i];
      const avg = avgSum / (bins * 255);

      // Cheap aura: one semi-transparent wide arc — no radial gradient
      if (avg > 0.05) {
        ctx.beginPath();
        ctx.arc(CX, CY, INNER_R + MAX_EXT * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r1},${g1},${b1},${(avg * 0.18).toFixed(2)})`;
        ctx.lineWidth = MAX_EXT * avg * 2.5;
        ctx.stroke();
      }

      // ── Bars: NO shadowBlur per bar — massive perf win ──────────────────
      ctx.lineCap = 'round';
      ctx.shadowBlur = 0;

      // 4-fold symmetry: bass at top, right, bottom, left
      for (let i = 0; i < NUM_BARS; i++) {
        const posInQ = i % QUARTER;
        const fi     = Math.round(posInQ * ACTIVE_BINS / (QUARTER - 1));
        const v      = _freqBuf[fi < bins ? fi : bins - 1] / 255;
        const barLen = v > 0.01 ? Math.max(2, v * MAX_EXT) : 2;

        const angle = (i / NUM_BARS) * Math.PI * 2 - Math.PI * 0.5;
        const cosA  = Math.cos(angle);
        const sinA  = Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(CX + cosA * INNER_R,            CY + sinA * INNER_R);
        ctx.lineTo(CX + cosA * (INNER_R + barLen), CY + sinA * (INNER_R + barLen));
        ctx.strokeStyle = `rgba(${_barR[i]},${_barG[i]},${_barB[i]},${0.55 + v * 0.45})`;
        ctx.lineWidth   = 1.6 + v * 2.2;
        ctx.stroke();
      }

      // Inner border ring — pulses with energy; skip shadowBlur on mobile (expensive GPU op)
      ctx.beginPath();
      ctx.arc(CX, CY, INNER_R, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r1},${g1},${b1},${(0.2 + avg * 0.6).toFixed(2)})`;
      ctx.lineWidth   = 1.2;
      if (!isMobile) {
        ctx.shadowBlur  = avg > 0.08 ? Math.round(avg * 12) : 0;
        ctx.shadowColor = c1;
      }
      ctx.stroke();
      ctx.shadowBlur  = 0;
    }

    mp.rafId = requestAnimationFrame(drawCircle);
    return;
  }

  // ── Regular (bars / wave) — draws on mpVisualizer ─────────────────────────
  const canvas = $('mpVisualizer');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let cachedGrad = null;
  let cachedC1 = '', cachedC2 = '', cachedH = 0, cachedMode = '';
  const isMobile = window.matchMedia('(max-width: 600px)').matches;
  let lastTs = 0;
  const frameInterval = isMobile ? 40 : 0;

  let cachedCssW = canvas.offsetWidth  || 340;
  let cachedCssH = canvas.offsetHeight || 64;
  let sizeDirty = false;
  const _ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => { sizeDirty = true; }) : null;
  if (_ro) _ro.observe(canvas);

  function draw(ts) {
    if (mp.vizMode === 'off' || mp.vizMode === 'circle') { mp.rafId = null; if (_ro) _ro.disconnect(); return; }
    if (document.hidden) { mp.rafId = null; return; }
    mp.rafId = requestAnimationFrame(draw);
    if (frameInterval && ts - lastTs < frameInterval) return;
    lastTs = ts;

    const dpr  = Math.min(window.devicePixelRatio || 1, 2);
    if (sizeDirty) {
      cachedCssW = canvas.offsetWidth  || 340;
      cachedCssH = canvas.offsetHeight || 64;
      sizeDirty = false;
    }
    const cssW = cachedCssW;
    const cssH = cachedCssH;
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width  = targetW;
      canvas.height = targetH;
      canvas.style.width  = cssW + 'px';
      canvas.style.height = cssH + 'px';
      cachedGrad = null;
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.scale(dpr, dpr);

    const W = cssW, H = cssH;
    ctx.clearRect(0, 0, W, H);

    const c1   = mp.color1 || '#00d4c8';
    const c2   = mp.color2 || '#0091ff';
    const mode = mp.vizMode || 'bars';

    if (!mp.analyser || !mp.isPlaying) {
      if (!cachedGrad || cachedC1 !== c1 || cachedMode !== 'idle') {
        cachedGrad = ctx.createLinearGradient(0, 0, W, 0);
        cachedGrad.addColorStop(0, 'transparent');
        cachedGrad.addColorStop(0.3, c1 + '44');
        cachedGrad.addColorStop(0.7, c1 + '44');
        cachedGrad.addColorStop(1, 'transparent');
        cachedC1 = c1; cachedMode = 'idle';
      }
      ctx.fillStyle = cachedGrad;
      ctx.fillRect(0, H / 2 - 1, W, 2);
      return;
    }

    if (mode === 'wave') {
      const data = new Uint8Array(mp.analyser.fftSize);
      mp.analyser.getByteTimeDomainData(data);

      if (!cachedGrad || cachedC1 !== c1 || cachedC2 !== c2 || cachedMode !== 'wave') {
        cachedGrad = ctx.createLinearGradient(0, 0, W, 0);
        cachedGrad.addColorStop(0,    c2 + '00');
        cachedGrad.addColorStop(0.12, c1);
        cachedGrad.addColorStop(0.88, c2);
        cachedGrad.addColorStop(1,    c2 + '00');
        cachedC1 = c1; cachedC2 = c2; cachedMode = 'wave';
      }

      ctx.lineJoin = 'round';
      ctx.lineCap  = 'round';

      ctx.beginPath();
      const step = W / (data.length - 1);
      for (let i = 0; i < data.length; i++) {
        const x = i * step;
        const y = ((data[i] / 255) * H * 0.85) + (H * 0.075);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = c1 + '28';
      ctx.lineWidth = 7;
      ctx.stroke();

      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = i * step;
        const y = ((data[i] / 255) * H * 0.85) + (H * 0.075);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = cachedGrad;
      ctx.lineWidth = 2.5;
      ctx.stroke();

    } else {
      // ── Bars — centered mirror (default) ─────────────────────────
      const data = new Uint8Array(mp.analyser.frequencyBinCount);
      mp.analyser.getByteFrequencyData(data);

      if (!cachedGrad || cachedC1 !== c1 || cachedC2 !== c2 || cachedH !== H || cachedMode !== 'bars') {
        cachedGrad = ctx.createLinearGradient(0, 0, 0, H);
        cachedGrad.addColorStop(0, c1);
        cachedGrad.addColorStop(1, c2 + '33');
        cachedC1 = c1; cachedC2 = c2; cachedH = H; cachedMode = 'bars';
      }
      ctx.fillStyle = cachedGrad;

      const halfBars = 20;
      const barW = (W / 2) / halfBars;
      const gap  = Math.max(1, barW * 0.2);
      const bw   = barW - gap;
      const cx   = W / 2;

      for (let i = 0; i < halfBars; i++) {
        const di = Math.floor(i * (data.length * 0.6) / halfBars);
        const v  = data[di] / 255;
        const bh = Math.max(3, v * H * 0.92);
        const y  = H / 2 - bh / 2;
        ctx.fillRect(cx + i * barW + gap * 0.5, y, bw, bh);
        ctx.fillRect(cx - (i + 1) * barW + gap * 0.5, y, bw, bh);
      }
    }
  }
  requestAnimationFrame(draw);
}

function mpStopVisualizer() {
  if (mp.rafId) { cancelAnimationFrame(mp.rafId); mp.rafId = null; }
}

// ── Volume control ─────────────────────────────────────────────────────────
function mpSetVolume(v) {
  mp.volume = Math.max(0, Math.min(1, v));
  if (!mp.muted) mpGetAudio().volume = mp.volume;
  const slider = $('mpVolSlider');
  if (slider) slider.value = mp.volume;
  mpUpdateVolDisplay();
  try { localStorage.setItem('lhost_mp_vol', mp.volume); } catch(_) {}
}

function mpToggleMuteAudio() {
  mp.muted = !mp.muted;
  mpGetAudio().volume = mp.muted ? 0 : mp.volume;
  mpUpdateVolDisplay();
}

function mpUpdateVolDisplay() {
  const v = mp.muted ? 0 : mp.volume;
  const pct = Math.round(v * 100);
  const pctEl = $('mpVolPct');
  if (pctEl) pctEl.textContent = pct + '%';
  const slider = $('mpVolSlider');
  if (slider) slider.value = v;
  const icon = $('mpVolIcon');
  if (!icon) return;
  if (v === 0) {
    icon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;
  } else if (v < 0.4) {
    icon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
  } else {
    icon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>`;
  }
}

function mpToggleVolPopup(e) {
  e && e.stopPropagation();
  const popup = $('mpVolPopup');
  if (!popup) return;
  if (!popup.classList.contains('open')) {
    const btn = $('mpVolMute');
    if (btn) {
      const rect = btn.getBoundingClientRect();
      // Vertical popup is 48px wide — align right edge with button right edge
      let right = window.innerWidth - rect.right;
      right = Math.max(8, right);
      popup.style.top   = (rect.bottom + 6) + 'px';
      popup.style.right = right + 'px';
      popup.style.left  = 'auto';
    }
  }
  popup.classList.toggle('open');
}

function mpCloseVolPopup() {
  $('mpVolPopup') && $('mpVolPopup').classList.remove('open');
}

// ── Playback speed ─────────────────────────────────────────────────────────
const MP_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
function mpCycleSpeed() {
  const i = MP_SPEEDS.indexOf(mp.speed);
  mp.speed = MP_SPEEDS[(i + 1) % MP_SPEEDS.length];
  mpGetAudio().playbackRate = mp.speed;
  const btn = $('mpSpeedBtn');
  if (btn) {
    btn.textContent = mp.speed === 1 ? '1×' : mp.speed + '×';
    btn.classList.toggle('active-speed', mp.speed !== 1);
  }
  try { localStorage.setItem('lhost_mp_speed', mp.speed); } catch(_) {}
}

// ── Visualizer mode ────────────────────────────────────────────────────────
function mpSetVizMode(mode) {
  mp.vizMode = mode;
  qsa('.mp-viz-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  try { localStorage.setItem('lhost_mp_viz', mode); } catch(_) {}

  const artSection = $('mpArtSection');
  const vizWrap    = document.querySelector('.mp-viz-wrap');
  const circleCanvas = $('mpCircleCanvas');

  const artEl = $('mpArt');

  if (mode === 'circle') {
    artSection?.classList.add('circle-mode');
    if (vizWrap) vizWrap.style.display = 'none';
    // Activate vinyl spin if already playing
    if (artEl && mp.isPlaying) {
      artEl.classList.remove('vinyl-slowing');
      artEl.classList.add('vinyl-playing');
    }
  } else {
    artSection?.classList.remove('circle-mode');
    if (vizWrap) vizWrap.style.display = '';
    if (circleCanvas) { const c = circleCanvas.getContext('2d'); c.clearRect(0, 0, circleCanvas.width, circleCanvas.height); }
    // Remove vinyl spin when leaving circle mode
    if (artEl) { artEl.classList.remove('vinyl-playing', 'vinyl-slowing'); }
  }

  if (mp.rafId) { cancelAnimationFrame(mp.rafId); mp.rafId = null; }

  if (mode === 'off') {
    const canvas = $('mpVisualizer');
    if (canvas) { const c = canvas.getContext('2d'); c.clearRect(0, 0, canvas.width, canvas.height); }
  } else {
    mpStartVisualizer();
  }
}

// ── Sleep timer ────────────────────────────────────────────────────────────
function mpToggleSleepOpts(e) {
  e && e.stopPropagation();
  const opts = $('mpSleepOpts');
  if (!opts) return;
  opts.classList.toggle('open');
}

function mpCloseSleepOpts() {
  $('mpSleepOpts') && $('mpSleepOpts').classList.remove('open');
}

function mpSelectSleepOpt(minutes) {
  mpClearSleepTimer();
  mpCloseSleepOpts();

  const btn = $('mpSleepBtn');
  const lbl = $('mpSleepLabel');

  // Reset active state on all opts
  qsa('.mp-sleep-opt').forEach(o => o.classList.toggle('active', parseInt(o.dataset.min) === minutes));

  if (minutes === 0) {
    btn && btn.classList.remove('active');
    if (lbl) lbl.textContent = 'Sleep';
    toast('Sleep timer off');
    return;
  }
  if (minutes === -1) {
    mp.sleepTimer = 'eot';
    btn && btn.classList.add('active');
    if (lbl) lbl.textContent = 'End of track';
    toast('Sleep: end of track');
    return;
  }
  mp.sleepEnd = Date.now() + minutes * 60 * 1000;
  mp.sleepTimer = setInterval(() => mpUpdateSleepDisplay(), 1000);
  btn && btn.classList.add('active');
  mpUpdateSleepDisplay();
  toast(`Sleep timer: ${minutes} min`);
}

function mpUpdateSleepDisplay() {
  const lbl = $('mpSleepLabel');
  if (!lbl || !mp.sleepEnd) return;
  const rem = Math.max(0, mp.sleepEnd - Date.now());
  if (rem <= 0) {
    mpGetAudio().pause();
    mpSetPlaying(false);
    mpClearSleepTimer();
    const btn = $('mpSleepBtn');
    btn && btn.classList.remove('active');
    if (lbl) lbl.textContent = 'Sleep';
    qsa('.mp-sleep-opt').forEach(o => o.classList.remove('active'));
    return;
  }
  const m = Math.floor(rem / 60000);
  const s = Math.floor((rem % 60000) / 1000);
  lbl.textContent = `${m}:${s.toString().padStart(2,'0')}`;
}

function mpClearSleepTimer() {
  if (mp.sleepTimer && mp.sleepTimer !== 'eot') clearInterval(mp.sleepTimer);
  mp.sleepTimer = null;
  mp.sleepEnd = 0;
}

// ── ID3 Metadata loading ───────────────────────────────────────────────────
async function mpLoadMeta(item) {
  const cached = mp.metaCache[item.path];
  if (cached) { _mpApplyMeta(cached, item.path); return; }
  try {
    const data = await fetchJson(`/api/meta?path=${encodeURIComponent(item.path)}`);
    mp.metaCache[item.path] = data;
    if (mp.queue[mp.index] && mp.queue[mp.index].path === item.path) {
      _mpApplyMeta(data, item.path);
      mpUpdateMediaSession(mp.queue[mp.index]);
    }
  } catch (_) {}
}

function _mpApplyMeta(data, forPath) {
  if (!data) return;
  // Safety: don't apply if track changed since request was made
  if (mp.queue[mp.index] && mp.queue[mp.index].path !== forPath) return;
  const artistEl = $('mpArtist');
  if (artistEl) {
    const parts = [];
    if (data.artist) parts.push(data.artist);
    if (data.album)  parts.push(data.album);
    if (data.year)   parts.push(String(data.year));
    if (parts.length) artistEl.textContent = parts.join(' · ');
  }
  if (data.title) {
    const titleEl = $('mpTitle');
    if (titleEl) {
      titleEl.textContent = data.title;
      setTimeout(() => mpApplyMarquee(titleEl), 60);
    }
  }
}

// ── MediaSession API ───────────────────────────────────────────────────────
// Only updates metadata — action handlers are registered once in mpInitEvents.
function mpUpdateMediaSession(item) {
  if (!item || !('mediaSession' in navigator)) return;
  const cached = mp.metaCache[item.path];
  const title  = cached?.title  || item.name.replace(/\.[^.]+$/, '');
  const artist = cached?.artist || '';
  const album  = cached?.album  || '';
  const artUrl = location.origin + '/api/art?path=' + encodeURIComponent(item.path);
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title, artist, album,
      artwork: [
        { src: artUrl, sizes: '96x96',   type: 'image/jpeg' },
        { src: artUrl, sizes: '256x256', type: 'image/jpeg' },
        { src: artUrl, sizes: '512x512', type: 'image/jpeg' },
      ],
    });
  } catch(_) {}
}

// ── Register MediaSession action handlers once at startup ──────────────────
// Registering on every track change creates a window where handlers are unset,
// causing the OS notification to briefly disappear (≈2 s flicker).
function mpInitMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const audio = mpGetAudio();
  try {
    navigator.mediaSession.setActionHandler('play', () => {
      if (mp.audioCtx && mp.audioCtx.state === 'suspended') mp.audioCtx.resume();
      audio.play().then(() => mpSetPlaying(true)).catch(() => {});
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      audio.pause();
      mpSetPlaying(false);
    });
    // Stop — collapses to mini player (keeps audio alive, like Spotify minimize)
    try {
      navigator.mediaSession.setActionHandler('stop', () => {
        audio.pause();
        mpSetPlaying(false);
        mpHideMini();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
      });
    } catch(_) {}
    navigator.mediaSession.setActionHandler('previoustrack', mpPrev);
    navigator.mediaSession.setActionHandler('nexttrack',     mpNext);
    navigator.mediaSession.setActionHandler('seekbackward', d => {
      audio.currentTime = Math.max(0, audio.currentTime - (d?.seekOffset || 10));
      mpUpdateProgress();
      mpSyncPositionState(audio);
    });
    navigator.mediaSession.setActionHandler('seekforward', d => {
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (d?.seekOffset || 10));
      mpUpdateProgress();
      mpSyncPositionState(audio);
    });
    try {
      navigator.mediaSession.setActionHandler('seekto', d => {
        if (d?.seekTime !== undefined && audio.duration) {
          audio.currentTime = Math.min(audio.duration, Math.max(0, d.seekTime));
          mpUpdateProgress();
          mpSyncPositionState(audio);
        }
      });
    } catch(_) {}
  } catch(_) {}
}

function mpSyncPositionState(audio) {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  if (!audio.duration) return;
  try {
    navigator.mediaSession.setPositionState({
      duration:     audio.duration,
      playbackRate: audio.playbackRate,
      position:     Math.min(audio.currentTime, audio.duration),
    });
  } catch(_) {}
}

// ── Album art swipe (mobile) ───────────────────────────────────────────────
function mpSetupArtSwipe() {
  const art = $('mpArt');
  if (!art) return;
  let tx = 0, ty = 0;
  art.addEventListener('touchstart', e => {
    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
  }, { passive: true });
  art.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      if (dx < 0) mpNext(); else mpPrev();
    }
  }, { passive: true });
}

// ── Marquee for long titles ────────────────────────────────────────────────
function mpApplyMarquee(el) {
  if (!el) return;
  el.style.animation = 'none';
  el.style.paddingRight = '';
  void el.offsetWidth;
  const wrap = el.parentElement;
  if (!wrap) return;
  const overflow = el.scrollWidth - wrap.clientWidth;
  if (overflow > 6) {
    el.style.setProperty('--marquee-dist', `-${overflow + 14}px`);
    el.style.paddingRight = '14px';
    el.style.animation = `mp-marquee-scroll ${Math.max(6, overflow / 18)}s linear 1.8s infinite`;
  }
}

// ── Queue panel ────────────────────────────────────────────────────────────
function mpOpenQueue() {
  const panel = $('mpQueuePanel');
  if (!panel) return;
  panel.classList.add('open');
  const chevron = document.querySelector('.mp-queue-chevron');
  if (chevron) chevron.style.transform = 'rotate(180deg)';
  // Scroll the active item into view
  setTimeout(() => {
    const active = panel.querySelector('.mp-queue-item.active');
    if (active) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 360);
}

function mpCloseQueue() {
  const panel = $('mpQueuePanel');
  if (!panel) return;
  panel.classList.remove('open');
  const chevron = document.querySelector('.mp-queue-chevron');
  if (chevron) chevron.style.transform = '';
}

// ── Mini Player ─────────────────────────────────────────────────────────────
function mpShowMini() {
  const item = mp.queue[mp.index];
  if (!item) return;
  mpUpdateMiniInfo(item);
  $('miniPlayer').classList.add('active');
  $('main').classList.add('mini-active');
}

function mpHideMini() {
  $('miniPlayer').classList.remove('active');
  $('main').classList.remove('mini-active');
}

function mpUpdateMiniInfo(item) {
  if (!item) return;
  const [c1, c2] = audioPalette(item.name);
  const miniArt = $('miniArt');
  miniArt.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
  let miniImg = miniArt.querySelector('img');
  if (!miniImg) {
    miniImg = document.createElement('img');
    miniArt.appendChild(miniImg);
  }
  miniImg.style.opacity = '0';
  const artUrl = `/api/art?path=${encodeURIComponent(item.path)}`;
  const probe = new Image();
  probe.onload = () => { miniImg.src = artUrl; miniImg.style.opacity = '1'; };
  probe.onerror = () => { miniImg.style.opacity = '0'; };
  probe.src = artUrl;
  $('miniTitle').textContent = item.name.replace(/\.[^.]+$/, '');
  mpUpdateMiniPlayIcon();
}

function mpUpdateMiniPlayIcon() {
  $('miniPlayIcon').innerHTML = mp.isPlaying
    ? '<rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/>'
    : '<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/>';
}

function mpInitEvents() {
  const audio = mpGetAudio();

  // ── Escape parent stacking contexts ──────────────────────────────────────
  // Move vol/more popups to <body> so they escape any stacking-context trap
  // inside .mp-container (overflow:hidden, z-index:1). mpSleepOpts is kept in
  // its original DOM position but uses position:fixed (set below) so it also
  // escapes the overflow clip.
  ['mpVolPopup', 'mpMorePopup'].forEach(id => {
    const el = $(id);
    if (el && el.parentNode !== document.body) document.body.appendChild(el);
  });

  $('mpPlayBtn').addEventListener('click', mpTogglePlay);
  $('mpPrevBtn').addEventListener('click', mpPrev);
  $('mpNextBtn').addEventListener('click', mpNext);
  $('mpShuffleBtn').addEventListener('click', mpToggleShuffle);
  $('mpRepeatBtn').addEventListener('click', mpToggleRepeat);

  // Volume popup (desktop) - click icon to open/close
  $('mpVolMute') && $('mpVolMute').addEventListener('click', mpToggleVolPopup);
  const volSlider = $('mpVolSlider');
  if (volSlider) {
    volSlider.addEventListener('input', () => mpSetVolume(parseFloat(volSlider.value)));
    // Prevent popup closing when interacting with slider
    volSlider.addEventListener('click', e => e.stopPropagation());
  }
  $('mpVolPopup') && $('mpVolPopup').addEventListener('click', e => e.stopPropagation());

  // Sleep timer popup — position it above the button via fixed coords
  $('mpSleepBtn') && $('mpSleepBtn').addEventListener('click', e => {
    e.stopPropagation();
    const opts = $('mpSleepOpts');
    if (!opts) return;
    if (!opts.classList.contains('open')) {
      const rect = e.currentTarget.getBoundingClientRect();
      opts.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
      opts.style.left   = Math.max(8, rect.left + rect.width / 2 - 80) + 'px';
      opts.style.right  = 'auto';
      opts.style.transform = 'none';
    }
    opts.classList.toggle('open');
  });
  qsa('.mp-sleep-opt').forEach(btn => {
    btn.addEventListener('click', () => mpSelectSleepOpt(parseInt(btn.dataset.min)));
  });
  $('mpSleepOpts') && $('mpSleepOpts').addEventListener('click', e => e.stopPropagation());

  // More menu toggle
  $('mpMoreBtn') && $('mpMoreBtn').addEventListener('click', e => {
    e.stopPropagation();
    const popup = $('mpMorePopup');
    if (!popup) return;
    if (!popup.classList.contains('open')) {
      const rect = e.currentTarget.getBoundingClientRect();
      popup.style.top   = (rect.bottom + 8) + 'px';
      popup.style.right = (window.innerWidth - rect.right) + 'px';
      popup.style.left  = 'auto';
    }
    popup.classList.toggle('open');
    if (popup.classList.contains('open')) {
      clearTimeout(mp._vizAutoClose);
      mp._vizAutoClose = setTimeout(() => {
        popup.classList.remove('open');
      }, 6000);
    } else {
      clearTimeout(mp._vizAutoClose);
    }
  });
  $('mpMorePopup') && $('mpMorePopup').addEventListener('click', e => e.stopPropagation());

  // Delete current track from queue
  $('mpDeleteTrackBtn') && $('mpDeleteTrackBtn').addEventListener('click', () => {
    if (!mp.queue.length) return;
    $('mpMorePopup') && $('mpMorePopup').classList.remove('open');
    const idx = mp.index;
    mp.queue.splice(idx, 1);
    if (!mp.queue.length) {
      $('mpContainer').classList.remove('open');
      $('miniPlayer').classList.remove('active');
      mpGetAudio().pause();
      mpGetAudio().src = '';
      return;
    }
    const nextIdx = Math.min(idx, mp.queue.length - 1);
    mp.index = -1;
    mpLoadTrack(nextIdx);
    mpRenderQueue();
  });

  // Visualizer mode buttons — stay open, reset 6-second auto-close on each pick
  qsa('.mp-viz-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mpSetVizMode(btn.dataset.mode);
      clearTimeout(mp._vizAutoClose);
      mp._vizAutoClose = setTimeout(() => {
        $('mpMorePopup') && $('mpMorePopup').classList.remove('open');
      }, 6000);
    });
  });

  // Queue panel: open on toggle, close on X or down-swipe
  $('mpQueueToggle') && $('mpQueueToggle').addEventListener('click', mpOpenQueue);
  $('mpQueueClose') && $('mpQueueClose').addEventListener('click', mpCloseQueue);

  // Close queue on swipe down — only when list is at the top or touch started in header
  const qPanel = $('mpQueuePanel');
  const qPanelHdr = qPanel && qPanel.querySelector('.mp-queue-panel-hdr');
  if (qPanel) {
    let qTy = 0, qTouchInHdr = false;
    qPanel.addEventListener('touchstart', e => {
      qTy = e.touches[0].clientY;
      qTouchInHdr = qPanelHdr ? qPanelHdr.contains(e.target) : false;
    }, { passive: true });
    qPanel.addEventListener('touchend', e => {
      const dy = e.changedTouches[0].clientY - qTy;
      const list = $('mpQueueList');
      const atTop = !list || list.scrollTop <= 2;
      if (dy > 80 && (qTouchInHdr || atTop)) mpCloseQueue();
    }, { passive: true });
  }

  audio.addEventListener('timeupdate', () => {
    mpUpdateProgress();
    mpSyncPositionState(audio);
  });
  audio.addEventListener('loadedmetadata', () => {
    $('mpDuration').textContent = fmtTime(audio.duration);
    // Set position state immediately so the OS notification shows the progress bar right away
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
      try {
        navigator.mediaSession.setPositionState({
          duration:     audio.duration,
          playbackRate: audio.playbackRate,
          position:     0,
        });
      } catch(_) {}
    }
  });
  audio.addEventListener('ended', () => {
    // Sleep: end of track
    if (mp.sleepTimer === 'eot') {
      mpSetPlaying(false);
      mpClearSleepTimer();
      const btn = $('mpSleepBtn');
      btn && btn.classList.remove('active');
      const lbl = $('mpSleepLabel');
      if (lbl) lbl.textContent = 'Sleep';
      qsa('.mp-sleep-opt').forEach(o => o.classList.remove('active'));
      mpHideMini();
      return;
    }
    if (mp.repeat === 'one') {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else if (mp.repeat === 'all' || mp.index < mp.queue.length - 1) {
      mpNext();
    } else {
      mpSetPlaying(false);
      mpHideMini();
    }
  });
  audio.addEventListener('play',  () => {
    mpSetPlaying(true);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  });
  audio.addEventListener('pause', () => {
    mpSetPlaying(false);
    if (!mp.trackChanging && 'mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  });

  const bar = $('mpProgressBar');
  const _mpDragStart = () => {
    mp.progressDragging = true;
    _mpBarRect = bar.getBoundingClientRect();
    $('mpProgressFill').style.transition = 'none';
    $('mpProgressDot').style.transition = 'none';
  };
  const _mpDragEnd = e => {
    if (!mp.progressDragging) return;
    if (e) mpSeekFromEvent(e);
    $('mpProgressFill').style.transition = '';
    $('mpProgressDot').style.transition = '';
    _mpBarRect = null;
    _mpApplyPendingSeek();
  };
  bar.addEventListener('mousedown', e => { _mpDragStart(); mpSeekFromEvent(e); });
  bar.addEventListener('touchstart', e => { _mpDragStart(); mpSeekFromEvent(e); }, { passive: true });
  document.addEventListener('mousemove', e => { if (mp.progressDragging) mpSeekFromEvent(e); });
  document.addEventListener('touchmove', e => { if (mp.progressDragging) { e.preventDefault(); mpSeekFromEvent(e); } }, { passive: false });
  document.addEventListener('mouseup',   () => { if (mp.progressDragging) _mpDragEnd(); });
  document.addEventListener('touchend',  e => { if (mp.progressDragging) _mpDragEnd(e); }, { passive: true });

  // Restore saved preferences
  const savedVol = parseFloat(localStorage.getItem('lhost_mp_vol') ?? '1');
  mp.volume = isNaN(savedVol) ? 1 : Math.max(0, Math.min(1, savedVol));
  const savedSpeed = parseFloat(localStorage.getItem('lhost_mp_speed') ?? '1');
  mp.speed = MP_SPEEDS.includes(savedSpeed) ? savedSpeed : 1;
  const savedViz = localStorage.getItem('lhost_mp_viz') || 'circle';
  mpSetVizMode(savedViz);
  mpUpdateVolDisplay();

  // Global click → close all floating popups
  document.addEventListener('click', () => {
    mpCloseVolPopup();
    mpCloseSleepOpts();
    const morePopup = $('mpMorePopup');
    if (morePopup && morePopup.classList.contains('open')) {
      morePopup.classList.remove('open');
      clearTimeout(mp._vizAutoClose);
    }
  });

  // Album art swipe gesture
  mpSetupArtSwipe();

  // Register MediaSession action handlers once — prevents notification flicker
  mpInitMediaSession();
}

// ── Resume storage ─────────────────────────────────────────────────────────
function resumeKey(path) { return `lhost_resume_${path}`; }
function saveResume(path, time) {
  try { if (time > 3) localStorage.setItem(resumeKey(path), String(time)); } catch(_) {}
}
function loadResume(path) {
  try { return parseFloat(localStorage.getItem(resumeKey(path)) || '0') || 0; } catch(_) { return 0; }
}
function clearResume(path) {
  try { localStorage.removeItem(resumeKey(path)); } catch(_) {}
}

// ── Open / Close ───────────────────────────────────────────────────────────
function vpUpdateNavButtons() {
  const hasPrev = vp.videoIdx > 0;
  const hasNext = vp.videoIdx >= 0 && vp.videoIdx < vp.videoSet.length - 1;
  const prevBtn = $('vpPrevBtn');
  const nextBtn = $('vpNextBtn');
  if (prevBtn) prevBtn.style.opacity = hasPrev ? '1' : '0.3';
  if (prevBtn) prevBtn.disabled = !hasPrev;
  if (nextBtn) nextBtn.style.opacity = hasNext ? '1' : '0.3';
  if (nextBtn) nextBtn.disabled = !hasNext;
}

function vpPrev() {
  if (vp.videoIdx <= 0 || !vp.videoSet.length) return;
  vp.videoIdx--;
  openVideo(vp.videoSet[vp.videoIdx], vp.videoSet, vp.videoIdx);
}

function vpNext() {
  if (vp.videoIdx < 0 || vp.videoIdx >= vp.videoSet.length - 1) return;
  vp.videoIdx++;
  openVideo(vp.videoSet[vp.videoIdx], vp.videoSet, vp.videoIdx);
}

function closeOtherMediaModals(except) {
  // Media modals are mutually exclusive — opening one auto-closes the rest so
  // back-nav doesn't reveal a stale modal underneath (no flash, single back).
  try {
    if (except !== 'video' && !$('videoModal').classList.contains('hidden')) {
      const v = $('videoPlayer'); if (v) { try { v.pause(); } catch(_){} }
      $('videoModal').classList.add('hidden');
    }
    if (except !== 'audio' && !$('audioModal').classList.contains('hidden')) {
      const a = $('mpAudio') || document.querySelector('audio'); if (a) { try { a.pause(); } catch(_){} }
      $('audioModal').classList.add('hidden');
    }
    if (except !== 'image' && !$('imageModal').classList.contains('hidden')) {
      $('imageModal').classList.add('hidden');
    }
    if (except !== 'pdf' && $('pdfModal') && !$('pdfModal').classList.contains('hidden')) {
      $('pdfModal').classList.add('hidden');
    }
    if (except !== 'text' && $('textModal') && !$('textModal').classList.contains('hidden')) {
      $('textModal').classList.add('hidden');
    }
    if (except !== 'archive' && $('archiveModal') && !$('archiveModal').classList.contains('hidden')) {
      $('archiveModal').classList.add('hidden');
    }
  } catch (_) {}
}

function openVideo(item, videoSet, videoIdx) {
  closeOtherMediaModals('video');
  if (videoSet && Array.isArray(videoSet)) {
    vp.videoSet = videoSet;
    vp.videoIdx = (videoIdx !== undefined) ? videoIdx : videoSet.findIndex(v => v.path === item.path);
    if (vp.videoIdx === -1) { vp.videoSet = [item]; vp.videoIdx = 0; }
  } else if (!videoSet) {
    vp.videoSet = [item];
    vp.videoIdx = 0;
  }
  vpUpdateNavButtons();

  const newUrl  = `/file?path=${encodeURIComponent(item.path)}`;
  const vid     = $('videoPlayer');
  const native  = isNativeVideo(item);
  const fallback = $('vpFormatFallback');

  $('vpTitle').textContent    = item.name;
  $('vpDownloadBtn').href     = newUrl + '&dl=1';
  $('vpDownloadBtn').download = item.name;
  $('videoModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  history.pushState({ lhost: true }, '');
  vpShowControls();
  vpBuildSpeedMenu();

  if (!native) {
    // ── Unsupported / legacy format — show fallback panel ───────────────
    vp.item = item;
    vp.url  = '';
    vid.pause();
    vid.removeAttribute('src');
    vid.load();
    vid.style.display = 'none';
    $('vpControls').style.visibility = 'hidden';
    $('vpGestureLayer').style.pointerEvents = 'none';
    fallback.classList.remove('hidden');
    const dlBtn = $('vpFallbackDlBtn');
    if (dlBtn) { dlBtn.href = newUrl + '&dl=1'; dlBtn.download = item.name; }
    return;
  }

  // ── Native format — restore player, hide fallback ───────────────────
  vid.style.display = '';
  $('vpControls').style.visibility = '';
  $('vpGestureLayer').style.pointerEvents = '';
  fallback.classList.add('hidden');

  if (vp.url === newUrl && vid.readyState >= 1) {
    // ── Same video already loaded — no re-download ──────────────────────
    vp.item = item;
    vid.volume = vp.volume;
    vid.muted  = vp.muted;
    $('vpBrightness').style.opacity = 1 - vp.brightness;
    const resume = loadResume(item.path);
    if (resume > 2 && vid.duration && resume < vid.duration - 3) {
      vid.currentTime = resume;
    }
    vid.play().catch(() => {});
  } else {
    // ── Different (or first) video — load it ────────────────────────────
    vp.item = item;
    vp.url  = newUrl;
    vid.volume      = vp.volume;
    vid.muted       = vp.muted;
    vpSetAspect(vp.aspectIdx);
    $('vpBrightness').style.opacity = 1 - vp.brightness;
    vid.preload      = 'auto';
    vid.src          = newUrl;
    vid.playbackRate = vp.speed;

    const resume = loadResume(item.path);
    vid.addEventListener('loadedmetadata', function onMeta() {
      vid.removeEventListener('loadedmetadata', onMeta);
      if (resume > 2 && resume < vid.duration - 3) {
        vid.currentTime = resume;
        toast(`▶ Resuming from ${fmtTime(resume)}`, '');
      }
      vid.play().catch(() => {});
    });
  }
}

function closeVideo() {
  const vid = $('videoPlayer');
  if (vp.item) saveResume(vp.item.path, vid.currentTime);
  vid.pause();
  // Reset fallback state
  $('vpFormatFallback').classList.add('hidden');
  vid.style.display = '';
  $('vpControls').style.visibility = '';
  $('vpGestureLayer').style.pointerEvents = '';
  // Keep vid.src — so re-opening the same video is instant (no re-download).
  // Just reduce buffering by setting preload to none while hidden.
  vid.preload = 'none';
  clearTimeout(vp.controlsTimer);
  clearTimeout(vp.previewTimer);
  clearTimeout(vp.clickTimer);
  if (vp.previewVideo) {
    try { vp.previewVideo.pause(); vp.previewVideo.removeAttribute('src'); vp.previewVideo.load(); } catch(_) {}
    vp.previewVideo = null;
  }
  vp.previewVideoUrl = '';
  vp.previewBusy = false;
  vp.previewPendingTime = null;
    vp.previewCache = new LRUCache(24);
  const _thumb = $('vpProgressThumb');
  if (_thumb && _thumb._blobUrl) { URL.revokeObjectURL(_thumb._blobUrl); _thumb._blobUrl = null; }
  $('videoModal').classList.add('hidden');
  document.body.style.overflow = '';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  $('vpWrap').classList.remove('controls-hidden','theater');
}

function _vpEnsurePreload() {
  $('videoPlayer').preload = 'auto';
}

// ── Controls auto-hide ─────────────────────────────────────────────────────
function vpShowControls() {
  $('vpWrap').classList.remove('controls-hidden');
  clearTimeout(vp.controlsTimer);
  if (vp.controlsLocked) return;
  const vid = $('videoPlayer');
  if (!vid.paused) {
    vp.controlsTimer = setTimeout(() => $('vpWrap').classList.add('controls-hidden'), 5000);
  }
}

function vpLockControls(ms) {
  vp.controlsLocked = true;
  clearTimeout(vp.controlsTimer);
  $('vpWrap').classList.remove('controls-hidden');
  clearTimeout(vp.lockTimer);
  vp.lockTimer = setTimeout(() => {
    vp.controlsLocked = false;
    vpShowControls();
  }, ms || 8000);
}

// ── Play / Pause ───────────────────────────────────────────────────────────
function vpTogglePlay() {
  const vid = $('videoPlayer');
  if (vid.paused) { vid.play().catch(() => {}); vpFlash('play'); }
  else            { vid.pause();                  vpFlash('pause'); }
}

function vpFlash(type) {
  const el    = $('vpFlash');
  const icon  = $('vpFlashIcon');
  const PLAY  = '<polygon points="5 3 19 12 5 21 5 3" fill="white" stroke="none"/>';
  const PAUSE = '<rect x="6" y="4" width="4" height="16" fill="white" stroke="none"/><rect x="14" y="4" width="4" height="16" fill="white" stroke="none"/>';
  icon.innerHTML = type === 'play' ? PLAY : PAUSE;
  el.classList.remove('fade');
  void el.offsetWidth;
  el.classList.add('show','fade');
  setTimeout(() => el.classList.remove('show','fade'), 700);
}

// ── Seek ───────────────────────────────────────────────────────────────────
function vpSeek(delta) {
  const vid = $('videoPlayer');
  vid.currentTime = Math.max(0, Math.min(vid.duration || 0, vid.currentTime + delta));
  if (delta < 0) vpShowSeekAnim('left', delta);
  else            vpShowSeekAnim('right', delta);
  vpShowControls();
}

function vpShowSeekAnim(side, delta) {
  const el = $(side === 'left' ? 'vpSeekLeft' : 'vpSeekRight');
  const lbl = $(side === 'left' ? 'vpSeekLeftTxt' : 'vpSeekRightTxt');
  lbl.textContent = (delta < 0 ? '' : '+') + delta + 's';
  el.classList.remove('active');
  void el.offsetWidth;
  el.classList.add('active');
}

function vpHasVideoOpen() {
  return !$('videoModal').classList.contains('hidden');
}

// ── Volume ─────────────────────────────────────────────────────────────────
function vpSetVolume(v) {
  vp.volume = Math.max(0, Math.min(1, v));
  $('videoPlayer').volume = vp.volume;
  const range = $('vpVolRange');
  range.value = vp.volume;
  range.style.setProperty('--vol-pct', (vp.volume * 100) + '%');
  const pct = $('vpVolPct');
  if (pct) pct.textContent = Math.round(vp.volume * 100) + '%';
  vpUpdateVolIcon();
  vpPrefs.volume = vp.volume;
  saveVpPrefs();
}

function vpToggleMute() {
  vp.muted = !vp.muted;
  $('videoPlayer').muted = vp.muted;
  vpUpdateVolIcon();
  vpPrefs.muted = vp.muted;
  saveVpPrefs();
}

function vpUpdateVolIcon() {
  const muted = vp.muted || vp.volume === 0;
  const w1 = $('vpVolWave1'); if (w1) w1.style.display = muted ? 'none' : '';
  const w2 = $('vpVolWave2'); if (w2) w2.style.display = muted ? 'none' : '';
}

// ── Progress bar ───────────────────────────────────────────────────────────
function vpUpdateProgress() {
  const vid = $('videoPlayer');
  if (!vid.duration) return;
  if (vp.progressDragging) return; // Don't fight with drag handler
  const pct = (vid.currentTime / vid.duration) * 100;
  $('vpProgressFill').style.width = pct + '%';
  $('vpProgressDot').style.left   = pct + '%';
  $('vpCurrentTime').textContent  = fmtTime(vid.currentTime);
  // Buffered
  if (vid.buffered.length) {
    const bpct = (vid.buffered.end(vid.buffered.length - 1) / vid.duration) * 100;
    $('vpProgressBuf').style.width = bpct + '%';
  }
  // Auto-save resume every 5s
  if (Math.round(vid.currentTime) % 5 === 0) saveResume(vp.item?.path, vid.currentTime);
}

function vpProgressFromEvent(e) {
  const track = $('vpProgressTrack');
  const rect  = track.getBoundingClientRect();
  const x     = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  return Math.max(0, Math.min(1, x / rect.width));
}

function vpInitProgress() {
  const track = $('vpProgressTrack');
  const tooltip = $('vpProgressTooltip');
  const tooltipTime = $('vpProgressTooltipTime');
  const thumb = $('vpProgressThumb');

  function updateTooltip(ratio) {
    const vid = $('videoPlayer');
    const t = ratio * (vid.duration || 0);
    tooltipTime.textContent = fmtTime(t);
    tooltip.style.left = (ratio * 100) + '%';
    vpSchedulePreview(t);
  }

  function startDrag(e) {
    e.preventDefault();
    vp.progressDragging = true;
    vp.controlsLocked = true;
    clearTimeout(vp.controlsTimer);
    $('vpWrap').classList.remove('controls-hidden');
    track.classList.add('dragging');
    updateDrag(e);
    document.addEventListener('mousemove', updateDrag);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchmove', updateDrag, { passive: false });
    document.addEventListener('touchend', endDrag);
  }

  function updateDrag(e) {
    if (!vp.progressDragging) return;
    e.preventDefault && e.preventDefault();
    const ratio = vpProgressFromEvent(e);
    const vid   = $('videoPlayer');
    $('vpProgressFill').style.width = (ratio * 100) + '%';
    $('vpProgressDot').style.left   = (ratio * 100) + '%';
    $('vpCurrentTime').textContent  = fmtTime(ratio * (vid.duration || 0));
    updateTooltip(ratio);
  }

  function endDrag(e) {
    if (!vp.progressDragging) return;
    vp.progressDragging = false;
    vp.controlsLocked = false;
    track.classList.remove('dragging');
    document.removeEventListener('mousemove', updateDrag);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchmove', updateDrag);
    document.removeEventListener('touchend', endDrag);
    const ratio = vpProgressFromEvent(e.changedTouches ? { clientX: e.changedTouches[0].clientX } : e);
    const vid   = $('videoPlayer');
    vid.currentTime = ratio * (vid.duration || 0);
    vpShowControls();
  }

  track.addEventListener('mousedown', startDrag);
  track.addEventListener('touchstart', startDrag, { passive: false });

  track.addEventListener('mousemove', e => {
    const ratio = vpProgressFromEvent(e);
    updateTooltip(ratio);
  });

  track.addEventListener('mouseleave', () => {
    clearTimeout(vp.previewTimer);
    tooltip.classList.remove('has-thumb');
    thumb.removeAttribute('src');
  });
}

function vpSchedulePreview(time) {
  const vid     = $('videoPlayer');
  const tooltip = $('vpProgressTooltip');
  const thumb   = $('vpProgressThumb');

  if (!vp.url || !vid.duration || !Number.isFinite(time)) {
    tooltip.classList.remove('has-thumb');
    return;
  }

  clearTimeout(vp.previewTimer);

  vp.previewTimer = setTimeout(() => {
    const maxT = Math.max(0, (vid.duration || 0) - 0.25);
    const t = Math.max(0, Math.min(maxT, time));
    vpRenderClientPreview(t, tooltip, thumb);
  }, 220);
}

function vpGetPreviewVideo() {
  if (vp.previewVideo && vp.previewVideoUrl === vp.url) return vp.previewVideo;

  if (vp.previewVideo) {
    try { vp.previewVideo.pause(); vp.previewVideo.removeAttribute('src'); vp.previewVideo.load(); } catch(_) {}
  }

  const pv = document.createElement('video');
  pv.muted = true;
  pv.preload = 'metadata';
  pv.playsInline = true;
  pv.src = vp.url;
  try { pv.load(); } catch (_) {}

  vp.previewVideo = pv;
  vp.previewVideoUrl = vp.url;
  return pv;
}

function vpRenderClientPreview(time, tooltip, thumb) {
  const previewTime = Math.max(0, Math.round(time / VP_PREVIEW_BUCKET_SECONDS) * VP_PREVIEW_BUCKET_SECONDS);
  const cacheKey = `${vp.url}::${previewTime}`;
  const cached = vp.previewCache.get(cacheKey);
  if (cached) {
    thumb.src = cached;
    tooltip.classList.add('has-thumb');
    return;
  }

  if (vp.previewBusy) {
    vp.previewPendingTime = time;
    return;
  }

  const pv = vpGetPreviewVideo();
  vp.previewBusy = true;
  vp.previewPendingTime = null;

  let done = false;
  const cleanup = () => {
    pv.removeEventListener('seeked', onSeeked);
    pv.removeEventListener('error', onError);
    clearTimeout(timeout);
  };
  const finish = () => {
    cleanup();
    vp.previewBusy = false;
    if (vp.previewPendingTime !== null && !$('videoModal').classList.contains('hidden')) {
      const nextTime = vp.previewPendingTime;
      vp.previewPendingTime = null;
      vpRenderClientPreview(nextTime, tooltip, thumb);
    }
  };
  const fail = () => {
    if (done) return;
    done = true;
    tooltip.classList.remove('has-thumb');
    finish();
  };
  const timeout = setTimeout(fail, 3500);

  function onError() { fail(); }

  function captureFrame() {
    if (done) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      canvas.getContext('2d').drawImage(pv, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      vp.previewCache.set(cacheKey, dataUrl);
      thumb.src = dataUrl;
      tooltip.classList.add('has-thumb');
      done = true;
      finish();
    } catch (_) {
      fail();
    }
  }

  function onSeeked() { captureFrame(); }
  function onLoadedData() {
    if (Math.abs((pv.currentTime || 0) - previewTime) < 0.2) captureFrame();
  }

  pv.addEventListener('seeked', onSeeked, { once: true });
  pv.addEventListener('loadeddata', onLoadedData, { once: true });
  pv.addEventListener('error', onError, { once: true });

  try {
    if (pv.readyState < 1) {
      pv.addEventListener('loadedmetadata', () => {
        try {
          pv.currentTime = Math.min(Math.max(0, previewTime), Math.max(0, (pv.duration || previewTime) - 0.25));
        } catch (_) {
          fail();
        }
      }, { once: true });
    } else {
      pv.currentTime = Math.min(Math.max(0, previewTime), Math.max(0, (pv.duration || previewTime) - 0.25));
    }
  } catch (_) {
    fail();
  }
}

// ── Speed ──────────────────────────────────────────────────────────────────
function vpBuildSpeedMenu() {
  const list = $('vpSpeedList');
  list.innerHTML = '';
  VP_SPEEDS.forEach(s => {
    const item = document.createElement('div');
    item.className = 'vp-speed-item' + (s === vp.speed ? ' active' : '');
    item.innerHTML = `<span>${s === 1 ? 'Normal' : s + '×'}</span>${s === vp.speed ? '<svg class="vp-speed-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;
    item.addEventListener('click', () => {
      vp.speed = s;
      $('videoPlayer').playbackRate = s;
      $('vpSpeedBtn').textContent = s === 1 ? '1×' : s + '×';
      vpBuildSpeedMenu();
      $('vpSpeedPopup').classList.add('hidden');
      vpPrefs.speed = s;
      saveVpPrefs();
    });
    list.appendChild(item);
  });
}

// ── Aspect ratio ───────────────────────────────────────────────────────────
function vpSetAspect(idx) {
  vp.aspectIdx = idx % ASPECTS.length;
  const aspect = ASPECTS[vp.aspectIdx];
  const vid    = $('videoPlayer');
  vid.className = '';
  if (aspect === 'fill')    vid.classList.add('aspect-fill');
  if (aspect === 'stretch') vid.classList.add('aspect-stretch');
  toast('Aspect: ' + ASPECT_LABELS[aspect]);
  vpPrefs.aspectIdx = vp.aspectIdx;
  saveVpPrefs();
}

// ── Theater / Fullscreen ───────────────────────────────────────────────────
function vpToggleTheater() {
  vp.theater = !vp.theater;
  $('vpWrap').classList.toggle('theater', vp.theater);
}

function vpToggleFullscreen() {
  const wrap = $('vpWrap');
  if (!document.fullscreenElement) {
    wrap.requestFullscreen?.() || wrap.webkitRequestFullscreen?.();
  } else {
    document.exitFullscreen?.() || document.webkitExitFullscreen?.();
  }
}

// ── Picture-in-Picture ─────────────────────────────────────────────────────
async function vpTogglePiP() {
  const vid = $('videoPlayer');
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled) {
      await vid.requestPictureInPicture();
    } else {
      toast('PiP not supported in this browser', 'error');
    }
  } catch (e) { toast('PiP: ' + e.message, 'error'); }
}

// ── Gesture HUD ────────────────────────────────────────────────────────────
const VOL_SVG  = '<svg viewBox="0 0 24 24" stroke="white" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
const MUTE_SVG = '<svg viewBox="0 0 24 24" stroke="white" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
const SUN_SVG  = '<svg viewBox="0 0 24 24" stroke="white" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

let hudTimer;
function vpShowHud(type, value) {
  const hud  = $('vpGestureHud');
  const icon = $('vpHudIcon');
  const fill = $('vpHudFill');
  const val  = $('vpHudVal');
  hud.classList.remove('hidden');
  if (type === 'vol') {
    icon.innerHTML = value > 0 ? VOL_SVG : MUTE_SVG;
    fill.style.width = (value * 100) + '%';
    val.textContent  = Math.round(value * 100) + '%';
  } else {
    icon.innerHTML = SUN_SVG;
    fill.style.width = (value * 100) + '%';
    val.textContent  = Math.round(value * 100) + '%';
  }
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => hud.classList.add('hidden'), 1200);
}

function vpSetBrightness(v) {
  vp.brightness = Math.max(0.1, Math.min(1, v));
  $('vpBrightness').style.opacity = 1 - vp.brightness;
  vpShowHud('bright', vp.brightness);
  vpPrefs.brightness = vp.brightness;
  saveVpPrefs();
}

// ── Gesture layer (touch) ──────────────────────────────────────────────────
function vpInitGestures() {
  const layer = $('vpGestureLayer');

  layer.addEventListener('touchstart', e => {
    vp.touch.controlsWereHidden = $('vpWrap').classList.contains('controls-hidden');
    vpShowControls();
    const t = e.changedTouches[0];
    vp.touch.startX   = t.clientX;
    vp.touch.startY   = t.clientY;
    vp.touch.startVal = null;
    vp.touch.type     = null;
  }, { passive: true });

  layer.addEventListener('touchmove', e => {
    if (e.touches.length !== 1) return;
    const t   = e.changedTouches[0];
    const dx  = t.clientX - vp.touch.startX;
    const dy  = t.clientY - vp.touch.startY;

    if (!vp.touch.type) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        // Vertical gesture — vol or brightness
        const isLeft = vp.touch.startX < window.innerWidth / 2;
        vp.touch.type = isLeft ? 'bright' : 'vol';
        vp.touch.startVal = isLeft ? vp.brightness : vp.volume;
      }
    }

    if (vp.touch.type === 'vol') {
      const newVol = Math.max(0, Math.min(1, vp.touch.startVal - dy / 200));
      vpSetVolume(newVol);
      vpShowHud('vol', newVol);
    } else if (vp.touch.type === 'bright') {
      const newBr = Math.max(0.1, Math.min(1, vp.touch.startVal - dy / 200));
      vpSetBrightness(newBr);
    }
  }, { passive: true });

  layer.addEventListener('touchend', e => {
    const t    = e.changedTouches[0];
    const dx   = Math.abs(t.clientX - vp.touch.startX);
    const dy   = Math.abs(t.clientY - vp.touch.startY);
    const isLeft = t.clientX < window.innerWidth / 2;

    if (!vp.touch.type && dx < 15 && dy < 15) {
      const now = Date.now();
      const side = isLeft ? 'left' : 'right';
      const lastKey = side === 'left' ? 'leftTap' : 'rightTap';
      vp.suppressClickUntil = now + 500;
      if (now - vp.touch[lastKey] < 300) {
        // Double-tap: seek
        clearTimeout(vp.clickTimer);
        vpSeek(isLeft ? -10 : 10);
        vp.touch[lastKey] = 0;
      } else {
        vp.touch[lastKey] = now;
        clearTimeout(vp.clickTimer);
        // Detect if tap is in center zone (middle 40% of width, middle 50% of height)
        const rect = layer.getBoundingClientRect();
        const relX = (t.clientX - rect.left) / rect.width;
        const relY = (t.clientY - rect.top)  / rect.height;
        const isCenter = relX > 0.3 && relX < 0.7 && relY > 0.25 && relY < 0.75;
        vp.clickTimer = setTimeout(() => {
          if (vp.touch.controlsWereHidden) {
            vpShowControls();
          } else {
            // Hide controls
            clearTimeout(vp.controlsTimer);
            $('vpWrap').classList.add('controls-hidden');
          }
          // Center tap also toggles play/pause
          if (isCenter) vpTogglePlay();
        }, 260);
      }
    }
    vp.touch.type = null;
  });

  // Desktop click: center = play/pause, edges = toggle controls
  layer.addEventListener('click', e => {
    if (Date.now() < vp.suppressClickUntil) return;
    clearTimeout(vp.clickTimer);
    const rect = layer.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top)  / rect.height;
    const isCenter = relX > 0.3 && relX < 0.7 && relY > 0.25 && relY < 0.75;
    vp.clickTimer = setTimeout(() => {
      if (isCenter) {
        vpTogglePlay();
        vpShowControls();
      } else {
        const controlsHidden = $('vpWrap').classList.contains('controls-hidden');
        if (controlsHidden) vpShowControls();
        else {
          clearTimeout(vp.controlsTimer);
          $('vpWrap').classList.add('controls-hidden');
        }
      }
    }, 210);
  });

  layer.addEventListener('dblclick', e => {
    clearTimeout(vp.clickTimer);
    const rect = layer.getBoundingClientRect();
    const isLeft = e.clientX - rect.left < rect.width / 2;
    vpSeek(isLeft ? -10 : 10);
  });

  layer.addEventListener('mousemove', () => vpShowControls());
}

// ── Play/pause UI sync ─────────────────────────────────────────────────────
function vpSyncPlayIcon(playing) {
  const icon = $('vpPlayIcon');
  icon.innerHTML = playing
    ? '<rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/>'
    : '<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/>';
}

// ── Info Panel ─────────────────────────────────────────────────────────────
function vpShowInfo() {
  const vid  = $('videoPlayer');
  const body = $('vpInfoBody');
  const item = vp.item;
  body.innerHTML = '';
  const rows = [
    ['Name',       item?.name || '—'],
    ['Duration',   vid.duration ? fmtTime(vid.duration) : '—'],
    ['Resolution', (vid.videoWidth && vid.videoHeight) ? `${vid.videoWidth} × ${vid.videoHeight}` : '—'],
    ['Size',       item?.sizeStr || '—'],
    ['Speed',      vp.speed + '×'],
    ['Path',       item?.path || '—'],
  ];
  rows.forEach(([k, v]) => {
    const row = document.createElement('div');
    row.className = 'vp-info-row';
    row.innerHTML = `<span class="vp-info-key">${k}</span><span class="vp-info-val">${v}</span>`;
    body.appendChild(row);
  });
  $('vpInfoPanel').classList.remove('hidden');
  $('vpInfoBtn').classList.add('active');
  vpLockControls(8000);
}

function vpHideInfo() {
  $('vpInfoPanel').classList.add('hidden');
  $('vpInfoBtn').classList.remove('active');
  vp.controlsLocked = false;
  vpShowControls();
}

function vpToggleInfo() {
  $('vpInfoPanel').classList.contains('hidden') ? vpShowInfo() : vpHideInfo();
}

// ── Wire up all player events ──────────────────────────────────────────────
function vpInit() {
  const vid = $('videoPlayer');

  // Video events
  vid.addEventListener('play',  () => { vpSyncPlayIcon(true);  vpShowControls(); });
  vid.addEventListener('pause', () => { vpSyncPlayIcon(false); vpShowControls(); });
  vid.addEventListener('timeupdate', vpUpdateProgress);
  vid.addEventListener('ended', () => {
    vpSyncPlayIcon(false);
    vpShowControls();
    if (vp.item) clearResume(vp.item.path);
  });
  vid.addEventListener('durationchange', () => {
    $('vpDuration').textContent = fmtTime(vid.duration);
  });
  vid.addEventListener('volumechange', () => {
    vpUpdateVolIcon();
    vpSetVolume(vid.volume);
  });

  // Controls
  $('vpClose').addEventListener('click', closeVideo);
  $('vpPrevBtn').addEventListener('click', e => { e.stopPropagation(); vpPrev(); vpShowControls(); });
  $('vpNextBtn').addEventListener('click', e => { e.stopPropagation(); vpNext(); vpShowControls(); });
  $('vpPlayBtn').addEventListener('click', e => { e.stopPropagation(); vpTogglePlay(); vpShowControls(); });
  $('vpMuteBtn').addEventListener('click', e => { e.stopPropagation(); vpToggleMute(); vpShowControls(); });
  $('vpVolRange').addEventListener('input', e => { vpSetVolume(parseFloat(e.target.value)); });
  $('vpSpeedBtn').addEventListener('click', e => {
    e.stopPropagation();
    $('vpSpeedPopup').classList.toggle('hidden');
    vpShowControls();
  });
  $('vpAspectBtn').addEventListener('click', e => { e.stopPropagation(); vpSetAspect(vp.aspectIdx + 1); vpShowControls(); });
  $('vpTheaterBtn').addEventListener('click', e => { e.stopPropagation(); vpToggleTheater(); vpShowControls(); });
  $('vpPipBtn').addEventListener('click', e => { e.stopPropagation(); vpTogglePiP(); });
  $('vpFsBtn').addEventListener('click', e => { e.stopPropagation(); vpToggleFullscreen(); vpShowControls(); });
  $('vpInfoBtn').addEventListener('click', e => { e.stopPropagation(); vpToggleInfo(); });
  $('vpInfoClose').addEventListener('click', e => { e.stopPropagation(); vpHideInfo(); });
  $('vpInfoPanel').addEventListener('click', e => e.stopPropagation());

  // Screencast / Remote Playback (Cast to TV)
  $('vpCastBtn').addEventListener('click', e => {
    e.stopPropagation();
    vpLockControls(10000);
    const vid = $('videoPlayer');
    if (vid.remote) {
      vid.remote.prompt()
        .then(() => { vpLockControls(3000); })
        .catch(() => {
          vpShowCastTip('No cast device found. Connect Chromecast to the same Wi-Fi.');
        });
    } else {
      vpShowCastTip('Open browser menu → Cast… to screen-cast this video.');
    }
  });

  function vpShowCastTip(msg) {
    let tip = $('vpCastTip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'vpCastTip';
      tip.style.cssText = 'position:absolute;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(10,15,28,0.92);backdrop-filter:blur(8px);color:#fff;padding:10px 18px;border-radius:12px;font-size:13px;z-index:50;pointer-events:none;white-space:nowrap;border:1px solid rgba(255,255,255,0.12);';
      $('vpWrap').appendChild(tip);
    }
    tip.textContent = msg;
    tip.style.opacity = '1';
    clearTimeout(tip._t);
    tip._t = setTimeout(() => { tip.style.opacity = '0'; }, 3500);
  }

  // Fullscreen icon update
  document.addEventListener('fullscreenchange', () => {
    const icon = $('vpFsIcon');
    const isFS = !!document.fullscreenElement;
    icon.innerHTML = isFS
      ? '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>'
      : '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>';
  });

  // Close speed popup on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('#vpSpeedPopup') && !e.target.closest('#vpSpeedBtn')) {
      $('vpSpeedPopup').classList.add('hidden');
    }
  });

  // Touch on controls should show controls, not hide
  $('vpControls').addEventListener('touchstart', () => vpShowControls(), { passive: true });
  $('vpControls').addEventListener('mousemove', () => vpShowControls());

  vpInitProgress();
  vpInitGestures();
}

// ═══════════════════════════════════════════════════════════════════════════
//  VIEWS
// ═══════════════════════════════════════════════════════════════════════════

function showView(name) {
  qsa('.view').forEach(v => v.classList.add('hidden'));
  $(`${name}View`).classList.remove('hidden');
  state.currentView = name;
  const isHome = name === 'home';
  $('viewMenuBtn')?.classList.toggle('hidden', isHome);
  if (isHome) {
    $('viewMenu')?.classList.add('hidden');
    $('viewMenuBtn')?.classList.remove('active');
  }
}

// ── Home ───────────────────────────────────────────────────────────────────
async function loadHome() {
  showView('home');
  updateBreadcrumb('');
  setNavActive('navFiles');
  loadStorageSummary();
  loadRecent();
  loadFolders();
  loadFavorites();
  loadCloudSection();
}

function fmtBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B','KB','MB','GB','TB','PB'];
  let value = Math.max(0, bytes);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

let _storageCache = null;

async function loadStorageSummary(openDetails = false) {
  const sub = $('storageSub');
  try {
    const data = await fetchJson('/api/storage');
    _storageCache = data;
    renderStorageSummary(data);
    if (openDetails) renderStorageDetails(data);
  } catch (e) {
    if (sub) sub.textContent = 'Storage data unavailable';
    if (openDetails) {
      $('storageBreakdown').innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
    }
  }
}

function renderStorageSummary(data) {
  const disk = data.disk || {};
  const used = Number(disk.used || data.vaultBytes || 0);
  const free = Number(disk.free || 0);
  const total = Number(disk.total || used + free || 0);
  const percent = total ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;
  $('storageMeterFill').style.width = `${percent}%`;
  $('storageUsedText').textContent = `Used ${fmtBytes(used)}`;
  $('storageFreeText').textContent = disk.free === undefined ? 'Free —' : `Free ${fmtBytes(free)}`;
  $('storageSub').textContent = total
    ? `${percent.toFixed(1)}% used of ${fmtBytes(total)}`
    : `${fmtBytes(data.vaultBytes || 0)} in vault files`;
}

function renderStorageDetails(data) {
  const disk = data.disk || {};
  const used = Number(disk.used || data.vaultBytes || 0);
  const free = Number(disk.free || 0);
  const total = Number(disk.total || used + free || 0);
  const percent = total ? Math.min(100, Math.max(0, (used / total) * 100)) : 0;
  $('storageModalUsed').textContent = `${fmtBytes(used)} used`;
  $('storageModalFree').textContent = disk.free === undefined ? 'Free space unavailable' : `${fmtBytes(free)} free`;
  $('storageModalMeterFill').style.width = `${percent}%`;
  $('storageRootText').textContent = `Root: ${data.root || '/'} · ${data.scannedFiles || 0} files scanned${data.indexReady ? '' : ' · index updating'}`;

  const rows = (data.categories || []).filter(cat => cat.bytes > 0 || cat.key !== 'system');
  $('storageBreakdown').innerHTML = rows.map(cat => {
    const pct = used ? Math.min(100, Math.max(0, cat.percentOfUsed || 0)) : 0;
    const count = cat.count === null ? 'device / app space' : `${cat.count} item${cat.count === 1 ? '' : 's'}`;
    return `<div class="storage-row storage-row-${cat.key}">
      <div class="storage-row-head">
        <span class="storage-dot"></span>
        <div>
          <div class="storage-row-label">${cat.label}</div>
          <div class="storage-row-sub">${count}</div>
        </div>
        <strong>${fmtBytes(cat.bytes)}</strong>
      </div>
      <div class="storage-row-track"><div style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function openStorageDetails() {
  openModal('storageModal');
  $('storageBreakdown').innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  if (_storageCache) renderStorageDetails(_storageCache);
  loadStorageSummary(true);
}

function renderRecentCards(grid, items) {
  grid.innerHTML = '';
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'recent-card';
    if (item.category === 'image') {
      card.innerHTML = `<img class="lazy-img" data-src="/api/thumb?path=${encodeURIComponent(item.path)}&w=300&h=225" decoding="async" alt="${item.name}">
        <div class="card-overlay"><span class="card-name">${item.name}</span></div>`;
    } else if (item.category === 'video') {
      const videoUrl = `/file?path=${encodeURIComponent(item.path)}`;
      if (isNativeVideo(item)) {
        card.innerHTML = `<div class="vt-thumb" data-thumb-url="${videoUrl}" style="width:100%;height:100%;position:relative;overflow:hidden;">
            <img class="vt-canvas" style="display:none;width:100%;height:100%;object-fit:cover;" alt="${item.name}">
            <div class="vt-loading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a0030,#3a1070);font-size:42px;">🎬</div>
          </div>
          <div class="card-overlay"><span class="card-name">${item.name}</span></div>
          <div class="play-btn"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/></svg></div>`;
      } else {
        card.innerHTML = `<div class="vt-static-thumb">
            <div class="play-btn"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/></svg></div>
          </div>
          <div class="card-overlay"><span class="card-name">${item.name}</span></div>`;
      }
    } else if (item.category === 'audio') {
      const [c1, c2] = audioPalette(item.name);
      const artUrl = `/api/art?path=${encodeURIComponent(item.path)}`;
      const audioIcon = item.ext === '.opus' ? '🎙️' : '🎵';
      card.innerHTML = `<div style="width:100%;height:100%;position:relative;overflow:hidden;background:linear-gradient(135deg,${c1},${c2});">
          <img src="${artUrl}" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;"
            onerror="this.style.display='none';">
          <div class="music-fallback" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:42px;pointer-events:none;opacity:0.4;">${audioIcon}</div>
        </div>
        <div class="card-overlay"><span class="card-name">${item.name}</span></div>`;
    } else {
      card.innerHTML = `<div class="recent-file-thumb">${fileThumbHtml(item)}</div>
        <div class="card-overlay"><span class="card-name">${item.name}</span></div>`;
    }
    if (_cachedFavorites.some(f => f.path === item.path)) {
      const star = document.createElement('span');
      star.className = 'fav-star-badge';
      star.textContent = '★';
      card.appendChild(star);
    }
    card.addEventListener('click', () => openFile(item));
    if (item.category === 'image' && imgObserver) {
      const li = card.querySelector('.lazy-img');
      if (li) imgObserver.observe(li);
    }
    if (item.category === 'video' && isNativeVideo(item) && thumbObserver) {
      const vtThumb = card.querySelector('.vt-thumb');
      if (vtThumb) thumbObserver.observe(vtThumb);
    }
    grid.appendChild(card);
  }
}

async function loadRecent() {
  const grid = $('recentGrid');
  grid.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const data = await fetchJson('/api/recent?limit=8');
    const recents = data.items || [];
    if (recents.length) {
      renderRecentCards(grid, recents);
      return;
    }
    grid.innerHTML = '<div class="empty-state"><p>No recent files</p></div>';
  } catch (e) { grid.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
}

// ── Pinned Folders state ───────────────────────────────────────────────────
let _pinnedFolders = []; // { path, name, alias, addedAt }
let _pinPickMode   = false;

async function loadFolders() {
  const scroll = $('foldersScroll');
  scroll.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const pd = await fetchJson('/api/pinned');
    _pinnedFolders = pd.items || [];
    if (_pinnedFolders.length) {
      scroll.innerHTML = '';
      for (const pin of _pinnedFolders) {
        scroll.appendChild(makePinCard(pin));
      }
      // "+" add card at end
      const addCard = document.createElement('div');
      addCard.className = 'folder-card folder-card-add';
      addCard.innerHTML = `<span class="folder-icon">➕</span><div class="folder-name">Add Folder</div>`;
      addCard.addEventListener('click', () => openPinnedModal());
      scroll.appendChild(addCard);
    } else {
      // fallback: auto-show top root folders with a hint
      const data = await fetchJson(`/api/ls?path=&page=0&limit=50&${buildListParams()}`);
      const dirs = data.items.filter(i => i.type === 'dir').slice(0, 10);
      scroll.innerHTML = '';
      if (!dirs.length) {
        scroll.innerHTML = '<div style="color:var(--text3);padding:16px;font-size:13px;">No folders found. Tap Manage to pin folders.</div>';
        return;
      }
      for (const dir of dirs) {
        const card = document.createElement('div');
        card.className = 'folder-card';
        card.innerHTML = `<span class="folder-icon">📁</span><div class="folder-name">${dir.name}</div><div class="folder-count">Auto</div>`;
        card.addEventListener('click', () => navigate(dir.path));
        scroll.appendChild(card);
      }
    }
  } catch (e) { scroll.innerHTML = `<div style="color:var(--text3);padding:16px;font-size:13px;">${e.message}</div>`; }
}

function makePinCard(pin) {
  const card = document.createElement('div');
  card.className = 'folder-card is-pinned';
  const label = pin.alias || pin.name || pin.path || 'Folder';
  card.innerHTML = `<span class="folder-icon">📌</span><div class="folder-name">${label}</div><div class="folder-count">Pinned</div>`;
  card.addEventListener('click', () => navigate(pin.path));
  return card;
}

// ── Pinned Folders Modal ────────────────────────────────────────────────────
async function openPinnedModal() {
  const pd = await fetchJson('/api/pinned');
  _pinnedFolders = pd.items || [];
  renderPinnedModal();
  openModal('pinnedModal');
}

function renderPinnedModal() {
  const list = $('pinnedList');
  const hint = $('pinnedHint');
  list.innerHTML = '';
  if (!_pinnedFolders.length) {
    hint.style.display = '';
    list.innerHTML = '<div class="pinned-empty">No pinned folders yet.<br>Tap "Browse &amp; Pin" to add one.</div>';
    return;
  }
  hint.style.display = 'none';
  for (const pin of _pinnedFolders) {
    const row = document.createElement('div');
    row.className = 'pinned-row';
    const label = pin.alias || pin.name || pin.path || 'Folder';
    const sub   = pin.alias ? pin.name : (pin.path ? '/' + pin.path : 'Root');
    row.innerHTML = `
      <span class="pinned-row-icon">📌</span>
      <div class="pinned-row-info">
        <div class="pinned-row-name">${label}</div>
        <div class="pinned-row-path">${sub}</div>
      </div>
      <div class="pinned-row-btns">
        <button class="pinned-row-btn" data-alias title="Rename label">✏️</button>
        <button class="pinned-row-btn danger" data-remove title="Remove">✕</button>
      </div>`;
    row.querySelector('[data-alias]').addEventListener('click', e => { e.stopPropagation(); openAliasDialog(pin); });
    row.querySelector('[data-remove]').addEventListener('click', async e => {
      e.stopPropagation();
      await unpinFolder(pin.path);
      renderPinnedModal();
      loadFolders();
    });
    row.addEventListener('click', () => { closeModal('pinnedModal'); navigate(pin.path); });
    list.appendChild(row);
  }
}

async function pinFolder(item) {
  const r = await fetch('/api/pinned', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: item.path, name: item.name }),
  });
  const d = await r.json();
  _pinnedFolders = d.items || [];
  toast('📌 Pinned to Active Folders', 'success');
  loadFolders();
}

async function unpinFolder(folderPath) {
  const r = await fetch('/api/pinned', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath }),
  });
  const d = await r.json();
  _pinnedFolders = d.items || [];
  toast('Removed from Active Folders');
  loadFolders();
}

// ── Alias dialog ────────────────────────────────────────────────────────────
let _aliasTarget = null;
function openAliasDialog(pin) {
  _aliasTarget = pin;
  $('aliasInput').value = pin.alias || pin.name || '';
  openModal('aliasModal');
  setTimeout(() => $('aliasInput').focus(), 100);
}

async function saveAlias() {
  if (!_aliasTarget) return;
  const alias = $('aliasInput').value.trim();
  await fetch('/api/pinned', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: _aliasTarget.path, name: _aliasTarget.name, alias: alias || null }),
  });
  closeModal('aliasModal');
  _aliasTarget = null;
  const pd = await fetchJson('/api/pinned');
  _pinnedFolders = pd.items || [];
  renderPinnedModal();
  loadFolders();
}

// ── Pin pick mode (browse to select a folder to pin) ─────────────────────────
function enterPinPickMode() {
  _pinPickMode = true;
  closeModal('pinnedModal');
  navigate(''); // go to root to browse
  // Show banner
  let banner = $('pinPickBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'pin-pick-banner';
    banner.id = 'pinPickBanner';
    banner.innerHTML = `<span>Tap a folder to pin it to Active Folders</span><button class="pin-pick-cancel" id="pinPickCancelBtn">Cancel</button>`;
    document.body.appendChild(banner);
    banner.querySelector('#pinPickCancelBtn').addEventListener('click', exitPinPickMode);
  }
  banner.style.display = 'flex';
}

function exitPinPickMode() {
  _pinPickMode = false;
  const banner = $('pinPickBanner');
  if (banner) banner.style.display = 'none';
}

// ── Browser ────────────────────────────────────────────────────────────────
async function navigate(relPath = '') {
  history.pushState({ lhost: true }, '');
  showView('browser');
  setNavActive('navBrowse');
  state.currentPath = relPath;
  updateBreadcrumb(relPath);
  state.uploadPath = relPath;
  if (state.selectMode) exitSelectMode();

  const grid = $('fileGrid');
  pgReset('browser', relPath, grid);

  // Show skeleton cards immediately
  grid.innerHTML = '';
  grid.appendChild(createSkeletons(12));

  try {
    const data = await fetchJson(`/api/ls?path=${encodeURIComponent(relPath)}&page=0&limit=${PG_LIMIT}&${buildListParams()}`);
    grid.innerHTML = '';

    if (!data.total) {
      grid.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><p>Empty folder</p></div>';
      return;
    }

    pg.total = data.total;
    pg.page  = 1;
    pg.imageSet = data.items.filter(i => i.category === 'image');
    pg.audioSet = data.items.filter(i => i.category === 'audio');
    pg.videoSet = data.items.filter(i => i.category === 'video');

    // Show total count badge if large
    if (data.total > PG_LIMIT) {
      const badge = document.createElement('div');
      badge.className = 'pg-count-badge';
      badge.textContent = `${data.total.toLocaleString()} items`;
      grid.appendChild(badge);
    }

    for (const item of data.items) {
      grid.appendChild(createItemEl(item, pg.imageSet, pg.audioSet, pg.videoSet));
    }
    pgSentinelSetup();
  } catch (e) { grid.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`; }
}

function renderItems(container, items, imageSet, audioSet, videoSet = []) {
  container.innerHTML = '';
  // Also update pg sets so click handlers always have fresh refs
  pg.imageSet = imageSet; pg.audioSet = audioSet; pg.videoSet = videoSet;
  for (const item of items) { container.appendChild(createItemEl(item, imageSet, audioSet, videoSet)); }
}

function createItemEl(item, imageSet = [], audioSet = [], videoSet = []) {
  const el = document.createElement('div');
  const isImg   = item.category === 'image';
  const isVid   = item.category === 'video';
  const isAudio = item.category === 'audio';
  const isDir   = item.type === 'dir';
  el.className = 'file-item' + (isDir ? ' dir-item' : '') + (isVid ? ' video-item' : '');
  el.dataset.path = item.path;
  el.dataset.cat  = item.category;

  let thumbHtml;
  if (isImg) {
    const fmt = imageFormatInfo(item);
    if (fmt.native) {
      thumbHtml = `<div class="thumb"><img class="lazy-img" data-src="/api/thumb?path=${encodeURIComponent(item.path)}&w=300&h=225" decoding="async" alt="${item.name}"></div>`;
    } else {
      thumbHtml = `<div class="thumb format-thumb ${fmt.className}">
        <div class="format-thumb-mark">${fmt.badge.slice(0, 1)}</div>
        <span class="format-thumb-badge">${fmt.badge}</span>
      </div>`;
    }
  } else if (isVid) {
    const videoUrl = `/file?path=${encodeURIComponent(item.path)}`;
    if (isNativeVideo(item)) {
      thumbHtml = `<div class="thumb vt-thumb" data-thumb-url="${videoUrl}">
        <img class="vt-canvas" style="display:none;width:100%;height:100%;object-fit:cover;" alt="${item.name}">
        <div class="vt-loading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a0030,#3a1070);"><span style="font-size:28px;opacity:0.5;">🎬</span></div>
        <div class="video-play-overlay" style="opacity:0;transition:opacity 0.3s;"><div class="play-circle"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div></div>
      </div>`;
    } else {
      thumbHtml = `<div class="thumb vt-static-thumb">
        <div class="play-circle"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
      </div>`;
    }
  } else if (isAudio) {
    const [c1, c2] = audioPalette(item.name);
    const artUrl = `/api/art?path=${encodeURIComponent(item.path)}`;
    const isVoice = item.ext === '.opus';
    const audioMark = isVoice
      ? '<span class="at-icon at-voice-icon">🎙️</span>'
      : '<svg viewBox="0 0 24 24" class="at-icon"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
    thumbHtml = `<div class="thumb">
      <div class="audio-thumb-art" style="background:linear-gradient(135deg,${c1},${c2})" data-audio-art="${artUrl}">
        <img class="audio-art-img" alt="">
        ${audioMark}
        <div class="audio-eq">
          <div class="audio-eq-bar" style="height:5px"></div>
          <div class="audio-eq-bar" style="height:11px"></div>
          <div class="audio-eq-bar" style="height:7px"></div>
          <div class="audio-eq-bar" style="height:13px"></div>
        </div>
      </div>
    </div>`;
  } else if (isDir) {
    thumbHtml = `<div class="thumb"><span class="dir-icon">📁</span></div>`;
  } else {
    thumbHtml = fileThumbHtml(item);
  }

  const isFavItem = _cachedFavorites.some(f => f.path === item.path);
  el.innerHTML = `${thumbHtml}
    ${isFavItem ? '<span class="fav-star-badge">★</span>' : ''}
    <div class="sel-check" aria-hidden="true"></div>
    <div class="item-info">
      <div class="item-name">${item.name}</div>
      <div class="item-size">${item.sizeStr}</div>
    </div>
    <button class="item-more" data-more>
      <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
    </button>`;

  if (isImg && imgObserver && imageFormatInfo(item).native) {
    const lazyImg = el.querySelector('.lazy-img');
    if (lazyImg) imgObserver.observe(lazyImg);
  }

  if (isAudio && audioArtObserver) {
    const artEl = el.querySelector('.audio-thumb-art');
    if (artEl) audioArtObserver.observe(artEl);
  }

  if (isAudio && eqObserver) eqObserver.observe(el);

  if (isVid && isNativeVideo(item) && thumbObserver) {
    const vtThumb = el.querySelector('.vt-thumb');
    if (vtThumb) thumbObserver.observe(vtThumb);
  }

  // Register with memory observer so media is unloaded when far off-screen
  if (memObserver) memObserver.observe(el);

  el.addEventListener('click', e => {
    if (e.target.closest('[data-more]')) { showCtxMenu(e, item); return; }
    // In selection mode every click toggles selection (no opening files)
    if (state.selectMode) {
      if (item.type !== 'dir') toggleItemSelect(item, el);
      return;
    }
    if (isDir && _pinPickMode) {
      exitPinPickMode();
      pinFolder(item);
      return;
    }
    if (isDir) navigate(item.path);
    else {
      // Use live pg sets so items loaded later are included in swipe/queue nav
      const imgs  = pg.imageSet.length ? pg.imageSet : imageSet;
      const auds  = pg.audioSet.length ? pg.audioSet : audioSet;
      const vids  = pg.videoSet.length ? pg.videoSet : videoSet;
      openFile(item, imgs, auds, vids);
    }
  });
  el.addEventListener('contextmenu', e => { e.preventDefault(); showCtxMenu(e, item); });

  // Long-press → enter select mode (works anywhere on website)
  let _lpHold = null;
  el.addEventListener('touchstart', e => {
    if (e.target.closest('[data-more]')) return;
    const t = e.touches[0];
    let startX = t.clientX, startY = t.clientY;
    _lpHold = setTimeout(() => {
      _lpHold = null;
      if (!state.selectMode) enterSelectMode();
      if (item.type !== 'dir') toggleItemSelect(item, el);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 450);
    const cancelLP = () => { clearTimeout(_lpHold); _lpHold = null; };
    const moveLP = ev => { if (Math.abs(ev.touches[0].clientX - startX) > 8 || Math.abs(ev.touches[0].clientY - startY) > 8) cancelLP(); };
    el.addEventListener('touchend',  cancelLP, { once: true, passive: true });
    el.addEventListener('touchcancel', cancelLP, { once: true, passive: true });
    el.addEventListener('touchmove',  moveLP,  { once: true, passive: true });
  }, { passive: true });

  // Mouse hold-press for PC (600 ms) → enter select mode
  let _mlHold = null;
  el.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.target.closest('[data-more]')) return;
    let startX = e.clientX, startY = e.clientY;
    _mlHold = setTimeout(() => {
      _mlHold = null;
      if (!state.selectMode) enterSelectMode();
      if (item.type !== 'dir') toggleItemSelect(item, el);
    }, 600);
    const cancelML = () => { clearTimeout(_mlHold); _mlHold = null; };
    const moveML = ev => { if (Math.abs(ev.clientX - startX) > 8 || Math.abs(ev.clientY - startY) > 8) cancelML(); };
    el.addEventListener('mouseup', cancelML, { once: true });
    document.addEventListener('mousemove', moveML, { once: true });
  });

  return el;
}

// ── Category View ──────────────────────────────────────────────────────────
async function loadCategory(cat) {
  history.pushState({ lhost: true }, '');
  showView('cat');
  $('catViewTitle').textContent = cat + 's';
  const grid = $('catGrid');
  pgReset('cat', cat, grid);

  grid.innerHTML = '';
  grid.appendChild(createSkeletons(12));

  try {
    const data = await fetchJson(`/api/category/${cat}?page=0&limit=${PG_LIMIT}&${buildListParams()}`);
    grid.innerHTML = '';
    if (!data.total) { grid.innerHTML = `<div class="empty-state"><p>No ${cat} files found</p></div>`; return; }

    pg.total = data.total;
    pg.page  = 1;
    pg.imageSet = data.results.filter(i => i.category === 'image');
    pg.audioSet = data.results.filter(i => i.category === 'audio');
    pg.videoSet = data.results.filter(i => i.category === 'video');

    if (data.total > PG_LIMIT) {
      const badge = document.createElement('div');
      badge.className = 'pg-count-badge';
      badge.textContent = `${data.total.toLocaleString()} ${cat}s found`;
      grid.appendChild(badge);
    }

    for (const item of data.results) {
      grid.appendChild(createItemEl(item, pg.imageSet, pg.audioSet, pg.videoSet));
    }
    pgSentinelSetup();
  } catch (e) { grid.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`; }
}

// ── Recent All View ────────────────────────────────────────────────────────
async function loadRecentAll() {
  history.pushState({ lhost: true }, '');
  showView('recentAll');
  const grid = $('recentAllGrid');
  grid.innerHTML = '';
  grid.appendChild(createSkeletons(12));

  try {
    const data = await fetchJson('/api/recent?limit=50');
    const items = data.items || [];
    grid.innerHTML = '';
    if (!items.length) {
      grid.innerHTML = '<div class="empty-state"><p>No recent files yet</p></div>';
      return;
    }
    const badge = document.createElement('div');
    badge.className = 'pg-count-badge';
    badge.textContent = `${items.length} recent file${items.length !== 1 ? 's' : ''}`;
    grid.appendChild(badge);

    const imageSet = items.filter(i => i.category === 'image');
    const audioSet = items.filter(i => i.category === 'audio');
    const videoSet = items.filter(i => i.category === 'video');
    pg.videoSet = videoSet;
    for (const item of items) {
      grid.appendChild(createItemEl(item, imageSet, audioSet, videoSet));
    }
  } catch (e) { grid.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`; }
}

// ── Search ─────────────────────────────────────────────────────────────────
let searchTimeout;
async function doSearch(q) {
  if (!q.trim()) { showView('home'); return; }
  showView('search');
  $('searchResultsLabel').textContent = `Searching for "${q}"…`;
  const grid = $('searchGrid');
  pgReset('search', q, grid);

  grid.innerHTML = '';
  grid.appendChild(createSkeletons(8));

  try {
    const data = await fetchJson(`/api/search?q=${encodeURIComponent(q)}&path=&page=0&limit=${PG_LIMIT}&hidden=${prefs.showHidden ? '1' : '0'}`);
    const total = data.total || 0;
    $('searchResultsLabel').textContent = `${total.toLocaleString()} result${total !== 1 ? 's' : ''} for "${q}"`;
    grid.innerHTML = '';
    if (!total) { grid.innerHTML = '<div class="empty-state"><p>No files found</p></div>'; return; }

    pg.total = total;
    pg.page  = 1;
    pg.imageSet = data.results.filter(i => i.category === 'image');
    pg.audioSet = data.results.filter(i => i.category === 'audio');
    pg.videoSet = data.results.filter(i => i.category === 'video');

    for (const item of data.results) {
      grid.appendChild(createItemEl(item, pg.imageSet, pg.audioSet, pg.videoSet));
    }
    pgSentinelSetup();
  } catch (e) { grid.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`; }
}

// ── Open file ──────────────────────────────────────────────────────────────
// Exposed on window so AeroGrab (and other modules) can open received files
// inside Hevi Explorer's own viewer instead of opening a new browser tab.
window.openFile = openFile;
function openFile(item, imageSet = [], audioSet = [], videoSet = []) {
  // Notify AeroGrab about the currently opened file (Priority Override)
  if (typeof window.aeroGrabSetOpenFile === 'function') {
    window.aeroGrabSetOpenFile({ name: item.name, size: item.size, path: item.path, type: item.mimeType || 'application/octet-stream' });
    try { localStorage.setItem('ag_last_file', item.path); } catch(_) {}
  }

  // Persist to recent.json via dedicated endpoint
  fetch('/api/recent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  }).catch(() => {});

  const cat = item.category;
  const url = `/file?path=${encodeURIComponent(item.path)}`;
  if (cat === 'video') {
    const vids = videoSet.length ? videoSet : [item];
    openVideo(item, vids);
  } else if (cat === 'image') {
    if (['.heic', '.heif'].includes(item.ext)) {
      openHeic(item, imageSet);
    } else {
      openImage(item, imageSet, url);
    }
  } else if (cat === 'audio') {
    openAudio(item, url, audioSet);
  } else if (item.ext === '.pdf') {
    openPdf(item, url);
  } else if (['.pptx','.ppt','.ppsx','.pps'].includes(item.ext)) {
    openPptx(item, url);
  } else if (cat === 'archive' || cat === 'apk' || ['.zip','.tar','.gz','.tgz','.rar','.7z','.z7','.bz2','.xz','.lz','.lzma','.zst','.apk','.jar'].includes(item.ext)) {
    openArchive(item, url);
  } else if (['.txt','.md','.log','.sbv','.json','.xml','.html','.css','.js','.ts','.py','.sh','.c','.cpp','.h','.java','.yaml','.yml','.ini','.conf','.csv','.sql','.bat','.ps1','.rb','.go','.rs'].includes(item.ext)) {
    openText(item, url);
  } else {
    const a = document.createElement('a');
    a.href = url + '&dl=1';
    a.download = item.name;
    a.click();
  }
}

// ── PDF Viewer (PDF.js canvas renderer — works on mobile) ──────────────────
let _pdfLoadTask = null;
let _pdfZoom = 1;
function _pdfSetZoom(z) {
  _pdfZoom = Math.max(0.5, Math.min(4, z));
  const inner = $('pdfZoomInner');
  if (inner) {
    inner.style.transform = '';
    inner.style.zoom = String(_pdfZoom);
  }
  const lbl = $('pdfZoomLabel');
  if (lbl) lbl.textContent = Math.round(_pdfZoom * 100) + '%';
}

function _cancelPdf() {
  if (_pdfLoadTask) { try { _pdfLoadTask.destroy(); } catch(_) {} _pdfLoadTask = null; }
  requestAnimationFrame(() => {
    const inner = $('pdfZoomInner');
    if (inner) inner.innerHTML = '';
    else { const w=$('pdfCanvasWrap'); if(w) w.innerHTML=''; }
  });
}

async function openPdf(item, url) {
  $('pdfTitle').textContent = item.name;
  $('pdfDl').href = url + '&dl=1';
  $('pdfDl').download = item.name;
  _pdfSetZoom(1);
  openModal('pdfModal');
  await _renderPdfPages(url);
}

async function openPptx(item, url) {
  $('pdfTitle').textContent = item.name;
  $('pdfDl').href = url + '&dl=1';
  $('pdfDl').download = item.name;
  _pdfSetZoom(1);
  openModal('pdfModal');
  const wrap = $('pdfZoomInner') || $('pdfCanvasWrap');
  wrap.innerHTML = `<div class="pdf-loading"><div class="pdf-spinner"></div><span>Converting PPTX…</span></div>`;
  try {
    const r = await fetch(`/api/pptx-preview?path=${encodeURIComponent(item.path)}`);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      wrap.innerHTML = `<div class="pdf-error">⚠️ ${d.error || 'PPTX preview unavailable'}<br>
        <a class="vp-fallback-dl-btn" href="${url}&dl=1" download="${item.name}" style="margin-top:12px">Download File</a></div>`;
      return;
    }
    const blob = await r.blob();
    const blobUrl = URL.createObjectURL(blob);
    await _renderPdfPages(blobUrl);
    URL.revokeObjectURL(blobUrl);
  } catch(e) {
    wrap.innerHTML = `<div class="pdf-error">⚠️ ${e.message}<br>
      <a class="vp-fallback-dl-btn" href="${url}&dl=1" download="${item.name}" style="margin-top:12px">Download File</a></div>`;
  }
}

async function _renderPdfPages(url) {
  const wrap = $('pdfZoomInner') || $('pdfCanvasWrap');
  wrap.innerHTML = `<div class="pdf-loading"><div class="pdf-spinner"></div><span>Loading PDF…</span></div>`;

  // Cancel any previous load
  if (_pdfLoadTask) { try { _pdfLoadTask.destroy(); } catch(_) {} _pdfLoadTask = null; }

  // Fallback if PDF.js didn't load (no internet)
  if (typeof pdfjsLib === 'undefined') {
    wrap.innerHTML = `<div class="pdf-error">⚠️ PDF renderer unavailable.<br>
      <a class="vp-fallback-dl-btn" href="${url}&dl=1" download>Download PDF</a></div>`;
    return;
  }

  const task = pdfjsLib.getDocument(url);
  _pdfLoadTask = task;

  try {
    const pdf = await task.promise;
    wrap.innerHTML = '';

    const canvasWrap = $('pdfCanvasWrap');
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2× for memory
    const containerW = (canvasWrap ? canvasWrap.clientWidth : window.innerWidth) || window.innerWidth;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const baseVP  = page.getViewport({ scale: 1 });
      const scale   = ((containerW - 24) / baseVP.width) * dpr;
      const viewport = page.getViewport({ scale });

      const pageWrap = document.createElement('div');
      pageWrap.className = 'pdf-page-wrap';

      const canvas = document.createElement('canvas');
      canvas.width  = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width  = '100%';
      canvas.style.display = 'block';

      pageWrap.appendChild(canvas);

      if (pdf.numPages > 1) {
        const lbl = document.createElement('div');
        lbl.className = 'pdf-page-label';
        lbl.textContent = `${pageNum} / ${pdf.numPages}`;
        pageWrap.appendChild(lbl);
      }

      wrap.appendChild(pageWrap);

      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  } catch (err) {
    if (err?.name === 'TaskCancelled' || err?.message?.includes('cancelled')) return;
    wrap.innerHTML = `<div class="pdf-error">⚠️ Could not render PDF.<br><small>${err.message}</small><br>
      <a class="vp-fallback-dl-btn" href="${url}&dl=1" download style="margin-top:12px;">Download PDF</a></div>`;
  }
}

// ── HEIC / HEIF viewer — server converts to JPEG ──────────────────────────
async function openHeic(item, imageSet) {
  const previewUrl = `/api/heic-preview?path=${encodeURIComponent(item.path)}`;
  const fakeItem = Object.assign({}, item, { _heicPreview: previewUrl });
  const list = (imageSet && imageSet.length) ? imageSet.map(i =>
    ['.heic', '.heif'].includes(i.ext) ? Object.assign({}, i, { _heicPreview: `/api/heic-preview?path=${encodeURIComponent(i.path)}` }) : i
  ) : [fakeItem];
  const startIdx = Math.max(0, list.findIndex(i => i.path === item.path));
  document.body.style.overflow = 'hidden';
  history.pushState({ lhost: true }, '');
  ivOpen(list, startIdx, false);
}

// ── Archive / ZIP viewer ───────────────────────────────────────────────────
let _archiveAllEntries = [];

async function openArchive(item, url) {
  $('archiveTitle').textContent = item.name;
  $('archiveDl').href = url + '&dl=1';
  $('archiveDl').download = item.name;
  $('archiveSearchInput').value = '';
  $('archiveBody').innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  openModal('archiveModal');

  try {
    const data = await fetchJson(`/api/archive-list?path=${encodeURIComponent(item.path)}`);
    _archiveAllEntries = data.entries || [];
    renderArchiveEntries(_archiveAllEntries, data.total);
  } catch (e) {
    $('archiveBody').innerHTML = `<div class="archive-error"><div class="archive-error-icon">🗜️</div><strong>Preview not available</strong><br><span>${archiveErrorMessage(e)}</span><br><small>Is file ko download karke ZIP/RAR/7z extractor se extract karein.</small><br><a class="vp-fallback-dl-btn" href="${url}&dl=1" download="${item.name}">Download archive</a></div>`;
  }
}

function archiveErrorMessage(e) {
  try {
    const parsed = JSON.parse(e.message);
    return parsed.error || e.message;
  } catch (_) {
    return e.message || 'Could not read this compressed file.';
  }
}

function archiveIcon(entry) {
  if (entry.isDir) return '📁';
  const ext = (entry.name.match(/\.([^.]+)$/) || [])[1];
  if (!ext) return '📄';
  const e = '.' + ext.toLowerCase();
  if (['.mp4','.mkv','.avi','.mov','.webm'].includes(e)) return '🎬';
  if (['.jpg','.jpeg','.png','.gif','.webp','.heic'].includes(e)) return '🖼️';
  if (['.mp3','.wav','.flac','.aac','.ogg'].includes(e)) return '🎵';
  if (e === '.opus') return '🎙️';
  if (['.pdf'].includes(e)) return 'PDF';
  if (e === '.zip') return '📦';
  if (e === '.rar') return '🧰';
  if (e === '.7z' || e === '.z7') return '🧊';
  if (['.tar','.gz','.tgz','.bz2','.xz','.lz','.lzma','.zst'].includes(e)) return '🗜️';
  if (['.ttf','.otf','.woff','.woff2','.eot'].includes(e)) return '🔤';
  if (['.tmp','.temp','.cache','.bak','.old'].includes(e)) return '⏱️';
  if (['.ppt','.pptx','.pps','.ppsx'].includes(e)) return '📊';
  if (['.txt','.md','.log','.sbv'].includes(e)) return '📝';
  if (['.html','.htm'].includes(e)) return '🌐';
  if (e === '.css') return '🎨';
  if (e === '.py') return '🐍';
  if (e === '.sh') return '⌨️';
  if (e === '.java') return '☕';
  if (['.js','.ts','.c','.cpp','.json','.xml'].includes(e)) return '🔧';
  return '📄';
}

function formatArchiveSize(bytes) {
  if (bytes == null || bytes === 0) return '';
  const k = 1024, s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(Math.max(bytes,1)) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + s[Math.min(i, s.length-1)];
}

function renderArchiveEntries(entries, total) {
  if (!entries.length) {
    $('archiveBody').innerHTML = '<div class="archive-empty">Archive is empty</div>';
    return;
  }
  const html = [`<div class="archive-stats">${total} items</div>`];
  for (const e of entries) {
    const parentPath = e.path.includes('/') ? e.path.substring(0, e.path.lastIndexOf('/')) : '';
    html.push(`<div class="archive-entry">
      <span class="archive-entry-icon">${archiveIcon(e)}</span>
      <div class="archive-entry-info">
        <div class="archive-entry-name" title="${e.path}">${e.name || e.path}</div>
        ${parentPath ? `<div class="archive-entry-path">${parentPath}/</div>` : ''}
      </div>
      <span class="archive-entry-size">${formatArchiveSize(e.size)}</span>
    </div>`);
  }
  $('archiveBody').innerHTML = html.join('');
}

$('archiveSearchInput').addEventListener('input', () => {
  const q = $('archiveSearchInput').value.toLowerCase();
  if (!q) { renderArchiveEntries(_archiveAllEntries, _archiveAllEntries.length); return; }
  const filtered = _archiveAllEntries.filter(e => (e.path || '').toLowerCase().includes(q));
  renderArchiveEntries(filtered, filtered.length);
});

// ── Image viewer (delegates to iv.js) ─────────────────────────────────────
function openImage(item, imageSet, url) {
  closeOtherMediaModals('image');
  const list = (imageSet && imageSet.length) ? imageSet : [item];
  const idx  = list.findIndex(i => i.path === item.path);
  const startIdx = idx >= 0 ? idx : 0;
  document.body.style.overflow = 'hidden';
  history.pushState({ lhost: true }, '');
  ivOpen(list, startIdx, false);
}

function showImageAt(idx) {
  if (typeof ivShowAt === 'function') ivShowAt(idx);
}

// ── Text viewer ────────────────────────────────────────────────────────────
async function openText(item, url) {
  $('textTitle').textContent = item.name;
  $('textDl').href = url + '&dl=1';
  $('textContent').textContent = 'Loading…';
  openModal('textModal');
  try {
    const r = await fetch(url);
    $('textContent').textContent = await r.text();
  } catch (e) { $('textContent').textContent = 'Failed to load: ' + e.message; }
}

// ── Modal helpers ──────────────────────────────────────────────────────────
// Proxy for closeAboutPage — assigned once DOMContentLoaded wires it up
let _closeAboutPageFn = null;

function openModal(id)  { $(id).classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeModal(id) {
  if (id === 'settingsModal' && _closeAboutPageFn) _closeAboutPageFn(false, true);
  $(id).classList.add('hidden');
  document.body.style.overflow = '';
  if (id === 'audioModal') {
    mpStopVisualizer();
    // Don't stop audio — collapse to mini player if something is loaded
    if (mp.queue.length && mpGetAudio().src) {
      mpShowMini();
    }
  }
}

// ── Context Menu ───────────────────────────────────────────────────────────
let _cachedFavorites = [];

async function toggleFavorite(item) {
  try {
    const r = await fetch('/api/userstate/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    const d = await r.json();
    toast(d.favorited ? '⭐ Added to Favorites' : 'Removed from Favorites');
    const st = await fetchJson('/api/userstate');
    _cachedFavorites = st.favorites || [];
    refreshFavStarBadges();
    mpUpdateFavBtn();
    if (state.currentView === 'home') loadFavorites();
    if (state.currentView === 'favAll') loadFavoritesAll();
  } catch (e) { toast(e.message, 'error'); }
}

function refreshFavStarBadges() {
  qsa('[data-path]').forEach(el => {
    const p = el.dataset.path;
    const isFav = _cachedFavorites.some(f => f.path === p);
    let star = el.querySelector('.fav-star-badge');
    if (isFav && !star) {
      star = document.createElement('span');
      star.className = 'fav-star-badge';
      star.textContent = '★';
      el.appendChild(star);
    } else if (!isFav && star) {
      star.remove();
    }
  });
}

function mpUpdateFavBtn() {
  const btn = $('mpFavBtn');
  if (!btn) return;
  const item = mp.queue && mp.queue[mp.index];
  if (!item) { btn.classList.remove('fav-active'); return; }
  const isFav = _cachedFavorites.some(f => f.path === item.path);
  btn.classList.toggle('fav-active', isFav);
}

async function loadFavoritesAll() {
  history.pushState({ lhost: true }, '');
  showView('favAll');
  updateBreadcrumb('');
  const list = $('favAllList');
  list.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const st = await fetchJson('/api/userstate');
    _cachedFavorites = st.favorites || [];
    if (!_cachedFavorites.length) {
      list.innerHTML = '<div class="fav-all-empty">No favorites yet.<br>Long-press or use the ⋮ menu to add any file.</div>';
      return;
    }
    list.innerHTML = '';
    for (const item of _cachedFavorites) {
      const row = document.createElement('div');
      row.className = 'fav-all-item';
      const thumbHtml = item.category === 'image'
        ? `<img src="/api/thumb?path=${encodeURIComponent(item.path)}&w=100&h=100" decoding="async" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">`
        : item.category === 'audio'
          ? `<img src="/api/art?path=${encodeURIComponent(item.path)}" decoding="async" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">`
          : item.type === 'dir' ? '📁'
          : item.category === 'video' ? '🎬'
          : item.category === 'text' ? '📄'
          : '📎';
      row.innerHTML = `
        <div class="fav-all-thumb">${typeof thumbHtml === 'string' && thumbHtml.startsWith('<') ? thumbHtml : `<span>${thumbHtml}</span>`}</div>
        <div class="fav-all-info">
          <div class="fav-all-name">${item.name}</div>
          <div class="fav-all-sub">${item.category || 'file'}${item.sizeStr ? ' · ' + item.sizeStr : ''}</div>
        </div>
        <button class="fav-all-rm" title="Remove from favorites">✕</button>`;
      row.querySelector('.fav-all-rm').addEventListener('click', async e => {
        e.stopPropagation();
        await toggleFavorite(item);
      });
      row.addEventListener('click', e => {
        if (e.target.classList.contains('fav-all-rm')) return;
        openFile(item);
      });
      list.appendChild(row);
    }
  } catch (e) { list.innerHTML = `<div class="fav-all-empty">${e.message}</div>`; }
}

function showCtxMenu(e, item) {
  state.ctxItem = item;
  window._aeroCtxItem = item;
  const menu = $('ctxMenu');
  menu.classList.remove('hidden');
  menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
  menu.style.top  = Math.min(e.clientY, window.innerHeight - 180) + 'px';
  $('ctxDownload').style.display = item.type === 'file' ? 'flex' : 'none';
  const isFav = _cachedFavorites.some(f => f.path === item.path);
  const favBtn = $('ctxFavorite');
  favBtn.querySelector('.ctx-fav-label').textContent = isFav ? 'Unfavorite' : 'Favorite';
  favBtn.querySelector('.ctx-fav-star').textContent   = isFav ? '★' : '☆';
  // Pin option: only for directories
  const pinBtn = $('ctxPin');
  if (item.type === 'dir') {
    pinBtn.style.display = 'flex';
    const isPinned = _pinnedFolders.some(p => p.path === item.path);
    $('ctxPinLabel').textContent = isPinned ? 'Unpin from Active Folders' : 'Pin to Active Folders';
  } else {
    pinBtn.style.display = 'none';
  }
}
function hideCtxMenu() { $('ctxMenu').classList.add('hidden'); state.ctxItem = null; }

// ── Favorites section on home ───────────────────────────────────────────────
async function loadFavorites() {
  const section = $('favSection');
  if (!section) return;
  try {
    const st = await fetchJson('/api/userstate');
    _cachedFavorites = st.favorites || [];
    if (!_cachedFavorites.length) { section.style.display = 'none'; return; }
    section.style.display = '';
    const grid = $('favGrid');
    renderRecentCards(grid, _cachedFavorites.slice(0, 8));
  } catch (_) { if (section) section.style.display = 'none'; }
}

// ── Upload ─────────────────────────────────────────────────────────────────
function uploadFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B','KB','MB','GB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, idx)).toFixed(idx ? 1 : 0)} ${units[idx]}`;
}

function renderUploadFiles() {
  const list = $('uploadList');
  const files = state.uploadFiles;
  if (!files.length) {
    list.innerHTML = '<div class="upload-empty">No files selected yet</div>';
    return;
  }
  list.innerHTML = files.map(f => `
    <div class="upload-file-row">
      <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</span>
      <span style="color:var(--text2);font-variant-numeric:tabular-nums">${uploadFileSize(f.size)}</span>
    </div>
  `).join('');
}

function setUploadBusy(isBusy) {
  state.uploadUploading = isBusy;
  $('startUploadBtn').disabled = isBusy;
  $('startUploadBtn').textContent = isBusy ? 'Uploading...' : 'Upload';
  $('cancelUploadBtn').classList.toggle('hidden', !isBusy);
  $('dropZone').classList.toggle('uploading', isBusy);
}

function normalizeUploadFiles(fileList) {
  if (!fileList) return [];
  if (Array.isArray(fileList)) return fileList.filter(f => f && f.name);
  if (typeof FileList !== 'undefined' && fileList instanceof FileList) return Array.from(fileList).filter(f => f && f.name);
  if (typeof DataTransferItemList !== 'undefined' && fileList instanceof DataTransferItemList) {
    return Array.from(fileList).map(item => item.getAsFile?.()).filter(f => f && f.name);
  }
  if (typeof fileList.length === 'number' && fileList[0] && fileList[0].name) {
    return Array.from(fileList).filter(f => f && f.name);
  }
  return [];
}

function setUploadFiles(fileList) {
  const files = normalizeUploadFiles(fileList);
  state.uploadFiles = files;
  const input = $('fileInput');
  try {
    const dt = new DataTransfer();
    files.forEach(file => dt.items.add(file));
    input.files = dt.files;
  } catch (_) {}
  renderUploadFiles();
  if (files.length) toast(`${files.length} file(s) ready to upload`);
}

function openUploadModal(files) {
  state.uploadPath = state.currentPath || '';
  state.uploadCancelled = false;
  setUploadBusy(false);
  openModal('uploadModal');
  const selectedFiles = normalizeUploadFiles(files);
  if (selectedFiles.length) setUploadFiles(selectedFiles);
  else {
    state.uploadFiles = [];
    $('fileInput').value = '';
    renderUploadFiles();
  }
}

function cancelUpload() {
  if (!state.uploadUploading) return;
  state.uploadCancelled = true;
  try { state.uploadReader?.abort?.(); } catch (_) {}
  try { state.uploadXhr?.abort?.(); } catch (_) {}
  state.uploadReader = null;
  state.uploadXhr = null;
  setUploadBusy(false);
  qsa('.upload-progress-bar', $('uploadList')).forEach(bar => {
    if (bar.style.background !== 'var(--success)') {
      bar.style.width = bar.style.width || '0%';
      bar.style.background = 'var(--danger)';
    }
  });
  toast('Upload cancelled', 'error');
}

async function handleUpload() {
  const input = $('fileInput');
  const files = state.uploadFiles.length ? state.uploadFiles : [...input.files];
  if (!files.length) { toast('Select files first', 'error'); return; }
  if (state.uploadUploading) return;
  state.uploadCancelled = false;
  setUploadBusy(true);
  const list = $('uploadList');
  list.innerHTML = '';
  for (const file of files) {
    const row = document.createElement('div');
    row.className = 'upload-file-row';
    row.innerHTML = `<div class="upload-file-info">
        <span class="upload-file-name">${file.name}</span>
        <span class="upload-file-size">${fmtBytes(file.size)}</span>
      </div>
      <div class="upload-progress-wrap"><div class="upload-progress"><div class="upload-progress-bar" style="width:0%"></div></div>
      <span class="upload-pct">0%</span></div>`;
    list.appendChild(row);
  }
  for (let i = 0; i < files.length; i++) {
    if (state.uploadCancelled) break;
    const file = files[i];
    const row  = list.children[i];
    const bar  = row.querySelector('.upload-progress-bar');
    const pct  = row.querySelector('.upload-pct');
    await new Promise(resolve => {
      if (state.uploadCancelled) { resolve(); return; }
      const xhr = new XMLHttpRequest();
      state.uploadXhr = xhr;
      xhr.open('POST', `/api/upload?path=${encodeURIComponent(state.uploadPath)}`);
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          const p = Math.round(e.loaded / e.total * 100);
          bar.style.width = p + '%';
          if (pct) pct.textContent = p + '%';
        }
      };
      xhr.onload = () => {
        if (!state.uploadCancelled) {
          const ok = xhr.status >= 200 && xhr.status < 300;
          bar.style.width = '100%';
          bar.style.background = ok ? 'var(--success)' : 'var(--danger)';
          if (pct) pct.textContent = ok ? '✓' : '✗';
        }
        state.uploadXhr = null;
        resolve();
      };
      xhr.onerror = () => { bar.style.background = 'var(--danger)'; if (pct) pct.textContent = '✗'; state.uploadXhr = null; resolve(); };
      xhr.onabort = () => { bar.style.background = 'var(--danger)'; if (pct) pct.textContent = '✗'; state.uploadXhr = null; resolve(); };
      // Use FormData — browser streams the file directly, progress starts immediately
      const fd = new FormData();
      fd.append('file', file, file.name);
      xhr.send(fd);
    });
  }
  state.uploadXhr = null;
  setUploadBusy(false);
  if (state.uploadCancelled) return;
  toast(`${files.length} file(s) uploaded!`, 'success');
  setTimeout(() => { closeModal('uploadModal'); if (state.currentView === 'browser') navigate(state.uploadPath); else loadHome(); }, 800);
}

// ── Nav ────────────────────────────────────────────────────────────────────
function setNavActive(id) { qsa('.nav-item').forEach(b => b.classList.remove('active')); $(id)?.classList.add('active'); }

// ── Info ───────────────────────────────────────────────────────────────────
async function showSettings(options = {}) {
  history.pushState({ lhost: true }, '');
  openModal('settingsModal');

  // ── Staggered entrance animation ──────────────────────────────
  const targets = Array.from(document.querySelectorAll(
    '#stMainPage .st-app-banner, #stMainPage .st-group-label, #stMainPage .st-group'
  ));
  targets.forEach(el => { el.style.opacity = '0'; el.style.transform = 'translateY(18px)'; });
  anime({
    targets,
    opacity: [0, 1],
    translateY: [18, 0],
    delay: anime.stagger(55, { start: 60 }),
    duration: 420,
    easing: 'easeOutExpo',
  });
  // Header title pop-in
  anime({
    targets: '#stMainPage .st-header-title',
    opacity: [0, 1],
    translateY: [-8, 0],
    duration: 300,
    easing: 'easeOutCubic',
  });

  syncThemeButtons();
  try {
    const cfg = await fetchJson('/api/settings');
    const tog = $('pwToggle');
    tog.checked = !!cfg.passwordEnabled;
    $('pwFields').classList.toggle('hidden', !cfg.passwordEnabled);
    $('pwCurrentWrap').classList.toggle('hidden', !cfg.passwordEnabled);
  } catch (_) {}
  try {
    const data = await fetchJson('/api/info');
    const envLabels = { termux:'🤖 Termux (Android)', android:'📱 Android', 'linux-root':'🔴 Linux (root)', linux:'🐧 Linux', darwin:'🍎 macOS', win32:'🪟 Windows', custom:'⚙️ Custom (ROOT_DIR)' };
    $('infoBody').innerHTML = `
      <div class="info-row"><span class="info-label">Environment</span><span class="info-val">${envLabels[data.env] || data.env}</span></div>
      <div class="info-row"><span class="info-label">Hostname</span><span class="info-val">${data.hostname}</span></div>
      <div class="info-row"><span class="info-label">Platform</span><span class="info-val">${data.platform} · Node ${data.nodeVersion}</span></div>
      <div class="info-row"><span class="info-label">Root Dir</span><span class="info-val">${data.root}</span></div>
      <div class="info-row"><span class="info-label">Tip</span><span class="info-val"><code style="background:var(--bg4);padding:2px 6px;border-radius:4px;font-size:11px">ROOT_DIR=/sdcard node server.js</code></span></div>`;
    const port = location.port;
    $('lanIPs').innerHTML = (data.networkIPs || []).length
      ? (data.networkIPs.map(ip =>
          `<div class="lan-ip-row"><span class="lan-ip-label">Network</span><span class="lan-ip-val">http://${ip}${port ? ':'+port : ''}</span></div>`).join(''))
      : '<div style="color:var(--text2);font-size:13px">No network interfaces found</div>';
  } catch (e) { toast(e.message, 'error'); }
  wanSyncUI();
  if (options.focusWan) focusWanTunnelSection();
  try {
    const v = await fetchJson('/api/version');
    const ver = 'v' + v.version;
    const el1 = $('updateCurrentVer'); if (el1) el1.textContent = ver;
    const el2 = $('updateVerSub'); if (el2) el2.textContent = ver + ' installed';
  } catch (_) {}
}
function showInfo() { showSettings(); }

function focusWanTunnelSection() {
  setTimeout(() => {
    const section = $('wanSection');
    if (!section) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'center' });
    section.classList.add('wan-section-focus');
    setTimeout(() => section.classList.remove('wan-section-focus'), 1700);
  }, 260);
}

function openWanTunnelPanel() {
  setNavActive('navWan');
  history.pushState({ lhost: true }, '');
  openModal('wanQuickModal');
  wanSyncUI();
}

// ── WAN Tunnel ─────────────────────────────────────────────────────────────
let _wanPollTimer = null;

function wanEls(baseId) {
  return [$(baseId), $('quick' + baseId.charAt(0).toUpperCase() + baseId.slice(1))].filter(Boolean);
}

function setAllWanText(baseId, text) {
  wanEls(baseId).forEach(el => { el.textContent = text; });
}

function toggleAllWan(baseId, hidden) {
  wanEls(baseId).forEach(el => el.classList.toggle('hidden', hidden));
}

function setAllWanDisabled(baseId, disabled) {
  wanEls(baseId).forEach(el => { el.disabled = disabled; });
}

function wanSyncUI() {
  fetch('/api/wan/status').then(r => r.json()).then(d => {
    _wanApplyState(d);
    if (d.status === 'stopped' || d.status === 'error') wanCheck();
  }).catch(() => {});
}

function _wanApplyState(d) {
  const iconWrap = $('wanIconWrap');

  wanEls('wanDot').forEach(dot => { dot.className = 'st-status-dot wan-dot-' + d.status; });

  const iconColors = { stopped:'s-icon-green', starting:'s-icon-teal', running:'s-icon-green', error:'s-icon-red' };
  if (iconWrap) {
    iconWrap.className = 's-row-icon ' + (iconColors[d.status] || 's-icon-green');
  }

  if (d.status === 'stopped') {
    setAllWanText('wanStatusTxt', 'Not running');
    toggleAllWan('wanUrlBox', true);
    toggleAllWan('wanStartBtn', false);
    setAllWanDisabled('wanStartBtn', false);
    toggleAllWan('wanStopBtn', true);
    clearInterval(_wanPollTimer); _wanPollTimer = null;
  } else if (d.status === 'starting') {
    setAllWanText('wanStatusTxt', 'Starting tunnel…');
    toggleAllWan('wanUrlBox', true);
    toggleAllWan('wanStartBtn', true);
    toggleAllWan('wanStopBtn', false);
  } else if (d.status === 'running') {
    setAllWanText('wanStatusTxt', 'Active — tunnel is live');
    wanEls('wanUrlVal').forEach(el => { el.textContent = d.url; });
    toggleAllWan('wanUrlBox', false);
    anime({ targets: '#wanUrlBox,#quickWanUrlBox', opacity: [0,1], translateY: [-6,0], duration: 400, easing: 'easeOutQuad' });
    toggleAllWan('wanStartBtn', true);
    toggleAllWan('wanStopBtn', false);
    clearInterval(_wanPollTimer); _wanPollTimer = null;
  } else if (d.status === 'error') {
    setAllWanText('wanStatusTxt', '⚠️ ' + (d.error || 'Error starting tunnel'));
    toggleAllWan('wanUrlBox', true);
    toggleAllWan('wanStartBtn', false);
    setAllWanDisabled('wanStartBtn', false);
    toggleAllWan('wanStopBtn', true);
    clearInterval(_wanPollTimer); _wanPollTimer = null;
    toast(d.error || 'Tunnel error', 'error');
  }
}

const _platformLabels = {
  termux:  { name:'Termux (Android)', cmd:'pkg install -y cloudflared' },
  kali:    { name:'Kali Linux', cmd:'apt-get install -y cloudflared' },
  debian:  { name:'Debian/Ubuntu', cmd:'apt-get install -y cloudflared' },
  linux:   { name:'Linux', cmd:'(downloading binary from GitHub…)' },
  darwin:  { name:'macOS', cmd:'brew install cloudflared' },
  win32:   { name:'Windows', cmd:'winget install Cloudflare.cloudflared' },
  unknown: { name:'your system', cmd:'see cloudflare.com/products/tunnel' },
};

async function wanCheck() {
  try {
    const d = await fetchJson('/api/wan/check');
    toggleAllWan('wanNoInstall', d.cloudflaredInstalled);
    toggleAllWan('wanNoInternet', !d.cloudflaredInstalled || d.internetAvailable);
    setAllWanDisabled('wanStartBtn', !d.cloudflaredInstalled || !d.internetAvailable);

    // Update install platform text
    if (!d.cloudflaredInstalled && d.platform) {
      const pl = _platformLabels[d.platform] || _platformLabels.unknown;
      const canAuto = ['termux','kali','debian','linux'].includes(d.platform);
      wanEls('wanInstallPlatformTxt').forEach(ptxt => {
        ptxt.innerHTML = `Detected: <strong>${pl.name}</strong><br>Tap <em>Install cloudflared</em> to set up automatically.`;
        if (!canAuto) ptxt.innerHTML += `<br><code>${pl.cmd}</code>`;
      });
      wanEls('wanInstallBtn').forEach(installBtn => {
        installBtn.style.display = canAuto ? '' : 'none';
      });
    }

    return d;
  } catch (_) { return { cloudflaredInstalled: false, internetAvailable: false }; }
}

async function wanStart() {
  setAllWanDisabled('wanStartBtn', true);
  const chk = await wanCheck();
  if (!chk.cloudflaredInstalled) {
    toast('cloudflared not installed. Install via: pkg install cloudflared', 'error');
    setAllWanDisabled('wanStartBtn', false); return;
  }
  if (!chk.internetAvailable) {
    toast('No internet connection. Please connect to the internet first.', 'error');
    setAllWanDisabled('wanStartBtn', false); return;
  }
  try {
    const r = await fetch('/api/wan/start', { method: 'POST' });
    const d = await r.json();
    if (!d.ok) { toast(d.error || 'Failed to start tunnel', 'error'); setAllWanDisabled('wanStartBtn', false); return; }
    _wanApplyState({ status: 'starting' });
    _wanPollTimer = setInterval(() => {
      fetch('/api/wan/status').then(r => r.json()).then(d => {
        if (d.status !== 'starting') { clearInterval(_wanPollTimer); _wanPollTimer = null; _wanApplyState(d); }
      }).catch(() => {});
    }, 1500);
  } catch (e) { toast(e.message, 'error'); }
  setAllWanDisabled('wanStartBtn', false);
}

async function wanStop() {
  setAllWanDisabled('wanStopBtn', true);
  try {
    await fetch('/api/wan/stop', { method: 'POST' });
    anime({ targets: ['#wanUrlBox','#quickWanUrlBox'], opacity: [1,0], translateY: [0,-8], duration: 300, easing: 'easeInQuad',
      complete: () => { _wanApplyState({ status: 'stopped' }); } });
  } catch (e) { toast(e.message, 'error'); }
  setAllWanDisabled('wanStopBtn', false);
}

// ── Update Checker ─────────────────────────────────────────────────────────
async function checkForUpdates() {
  const btn  = $('updateCheckBtn');
  const icon = $('updateCheckIcon');
  btn.disabled = true;
  anime({ targets: '#updateCheckIcon', rotate: '1turn', duration: 800, loop: true, easing: 'linear' });
  try {
    const d = await fetchJson('/api/update/check');
    anime.remove('#updateCheckIcon');
    icon.style.transform = '';
    $('updateCurrentVer').textContent = 'v' + d.currentVersion;
    const badge    = $('updateBadge');
    const changelog= $('updateChangelog');
    const dlBtn    = $('updateDlBtn');
    const latestRow= $('updateLatestRow');

    if (d.noReleases) {
      badge.className = 'update-badge update-badge-ok';
      badge.textContent = '✓ No releases yet on GitHub';
      badge.classList.remove('hidden');
      anime({ targets: '#updateBadge', opacity:[0,1], translateY:[-6,0], duration:400, easing:'easeOutQuad' });
    } else if (d.upToDate) {
      badge.className = 'update-badge update-badge-ok';
      badge.textContent = '✓ You are on the latest version';
      badge.classList.remove('hidden');
      anime({ targets: '#updateBadge', opacity:[0,1], translateY:[-6,0], duration:400, easing:'easeOutQuad' });
    } else {
      $('updateLatestVer').textContent = d.latestVersion || '';
      latestRow.classList.remove('hidden');
      badge.className = 'update-badge update-badge-new';
      badge.textContent = `🎉 New version available: ${d.latestVersion}`;
      badge.classList.remove('hidden');
      anime({ targets: '#updateBadge', opacity:[0,1], scale:[0.9,1], duration:500, easing:'easeOutBack' });
      if (d.changelog) {
        changelog.innerHTML = '<div class="update-changelog-title">What\'s new:</div>' +
          d.changelog.split('\n').filter(Boolean).map(l =>
            `<div class="update-changelog-line">${l.replace(/^[-*]\s*/,'')}</div>`
          ).join('');
        changelog.classList.remove('hidden');
        anime({ targets: '#updateChangelog', opacity:[0,1], translateY:[8,0], duration:400, easing:'easeOutQuad' });
      }
      if (d.htmlUrl) {
        const dlBtn = $('updateDlBtn');
        const dlWrap = $('updateDlWrap');
        if (dlBtn) dlBtn.href = d.htmlUrl;
        if (dlWrap) dlWrap.classList.remove('hidden');
      }
    }
    const verSub = $('updateVerSub');
    if (verSub && d.latestVersion && !d.upToDate) verSub.textContent = d.currentVersion ? 'v' + d.currentVersion + ' installed' : '';
  } catch (e) {
    anime.remove('#updateCheckIcon');
    icon.style.transform = '';
    toast('Could not check updates: ' + e.message, 'error');
  }
  btn.disabled = false;
}

// ── Folder ─────────────────────────────────────────────────────────────────
async function createFolder(name) {
  try {
    const r = await fetch(`/api/mkdir?path=${encodeURIComponent(state.currentPath)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    toast('Folder created!', 'success');
    navigate(state.currentPath);
  } catch (e) { toast(e.message, 'error'); }
}

// ── Delete ─────────────────────────────────────────────────────────────────
async function deleteItem(item) {
  if (!confirm(`Delete "${item.name}"?`)) return;
  try {
    const r = await fetch(`/api/delete?path=${encodeURIComponent(item.path)}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    toast('Deleted!', 'success');
    if (state.currentView === 'browser') navigate(state.currentPath);
    else if (state.currentView === 'cat') loadCategory(item.category);
    else loadHome();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Multi-select / Bulk operations ─────────────────────────────────────────
function enterSelectMode() {
  state.selectMode = true;
  state.selectedItems.clear();
  document.body.classList.add('select-mode');
  $('selectModeBtn')?.classList.add('active');
  history.pushState({ lhost: true }, '');
  updateBulkBar();
}

function exitSelectMode() {
  state.selectMode = false;
  state.selectedItems.clear();
  document.body.classList.remove('select-mode');
  $('selectModeBtn')?.classList.remove('active');
  document.querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
  updateBulkBar();
}

function toggleItemSelect(item, el) {
  const key = item.path;
  if (state.selectedItems.has(key)) {
    state.selectedItems.delete(key);
    el.classList.remove('selected');
  } else {
    state.selectedItems.add(key);
    el.classList.add('selected');
  }
  updateBulkBar();
}

function updateBulkBar() {
  const bar = $('bulkBar');
  if (!bar) return;
  const count = state.selectedItems.size;
  if (state.selectMode) {
    bar.classList.remove('hidden');
    $('bulkCount').textContent = count ? `${count} selected` : 'Tap files to select';
    $('bulkDeleteBtn').disabled = count === 0;
    $('bulkDownloadBtn').disabled = count === 0;
  } else {
    bar.classList.add('hidden');
  }
}

async function bulkDelete() {
  const paths = [...state.selectedItems];
  if (!paths.length) return;
  if (!confirm(`Delete ${paths.length} item(s)? This cannot be undone.`)) return;
  try {
    const r = await fetch('/api/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }) });
    const d = await r.json();
    const deletedCount = (d.deleted || []).length;
    const failedCount  = (d.failed  || []).length;
    toast(`Deleted ${deletedCount} item(s)${failedCount ? `, ${failedCount} failed` : ''}`, deletedCount ? 'success' : 'error');
    exitSelectMode();
    if (state.currentView === 'browser') navigate(state.currentPath);
    else loadHome();
  } catch (e) { toast(e.message, 'error'); }
}

function bulkDownload() {
  const paths = [...state.selectedItems];
  if (!paths.length) return;
  paths.forEach(p => {
    const a = document.createElement('a');
    a.href = `/file?path=${encodeURIComponent(p)}&dl=1`;
    a.download = p.split('/').pop();
    a.click();
  });
  toast(`Downloading ${paths.length} file(s)…`);
}

// ── Rename ─────────────────────────────────────────────────────────────────
function renameItem(item) {
  $('renameInput').value = item.name;
  openModal('renameModal');
  setTimeout(() => { $('renameInput').focus(); $('renameInput').select(); }, 80);
  $('renameConfirmBtn')._handler = async () => {
    const newName = $('renameInput').value.trim();
    if (!newName || newName === item.name) { closeModal('renameModal'); return; }
    closeModal('renameModal');
    try {
      const r = await fetch('/api/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: item.path, name: newName }) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      toast('Renamed!', 'success');
      if (state.currentView === 'browser') navigate(state.currentPath);
      else if (state.currentView === 'cat') loadCategory(item.category);
      else loadHome();
    } catch (e) { toast(e.message, 'error'); }
  };
}

// ── Folder Picker (for Copy / Move) ─────────────────────────────────────────
const _fp = { mode: 'copy', item: null, path: '' };

function copyItem(item) { _openFolderPicker(item, 'copy'); }
function moveItem(item) { _openFolderPicker(item, 'move'); }

function _openFolderPicker(item, mode) {
  _fp.mode = mode;
  _fp.item = item;
  _fp.path = '';
  $('fpTitle').textContent = mode === 'copy' ? 'Copy to…' : 'Move to…';
  $('fpSelectBtn').textContent = mode === 'copy' ? '📋 Copy here' : '✂️ Move here';
  openModal('folderPickerModal');
  _fpNavigate('');
}

async function _fpNavigate(relPath) {
  _fp.path = relPath;
  const breadcrumb = relPath ? '/ ' + relPath.replace(/\//g, ' / ') : '/ root';
  $('fpBreadcrumb').textContent = breadcrumb;
  $('fpBack').classList.toggle('active', !!relPath);
  const list = $('fpList');
  list.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const data = await fetchJson(`/api/ls?path=${encodeURIComponent(relPath)}&page=0&limit=200&sort=name&dir=asc&hidden=0`);
    const dirs = (data.items || []).filter(i => i.type === 'dir');
    if (!dirs.length) {
      list.innerHTML = '<div class="fp-empty">No folders here</div>';
      return;
    }
    list.innerHTML = '';
    dirs.forEach(dir => {
      const el = document.createElement('div');
      el.className = 'fp-item';
      el.innerHTML = `
        <span class="fp-item-icon">📁</span>
        <span class="fp-item-name">${dir.name}</span>
        <span class="fp-item-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>`;
      el.addEventListener('click', () => _fpNavigate(dir.path));
      list.appendChild(el);
    });
  } catch (e) {
    list.innerHTML = `<div class="fp-empty">Failed to load folders</div>`;
  }
}

// ── File Info ───────────────────────────────────────────────────────────────
function showFileInfo(item) {
  $('fileInfoTitle').textContent = item.name;
  const rows = [];
  const typeLabel = item.type === 'dir' ? 'Folder' : (item.ext ? item.ext.replace('.', '').toUpperCase() : 'File');
  rows.push(['Type', typeLabel]);
  rows.push(['Path', '/' + (item.path || '')]);
  if (item.sizeStr && item.type !== 'dir') rows.push(['Size', item.sizeStr]);
  if (item.mtime) rows.push(['Modified', new Date(item.mtime).toLocaleString()]);
  if (item.category && item.category !== 'file') rows.push(['Category', item.category.charAt(0).toUpperCase() + item.category.slice(1)]);
  $('fileInfoBody').innerHTML = rows.map(([k, v]) =>
    `<div style="display:flex;gap:8px;border-bottom:1px solid var(--border);padding:4px 0">
      <span style="color:var(--text2);min-width:80px;flex-shrink:0">${k}</span>
      <span style="word-break:break-all">${v}</span>
    </div>`
  ).join('');
  openModal('fileInfoModal');
}

// ── View toggle ────────────────────────────────────────────────────────────
function setListMode(mode) {
  state.listMode = mode;
  prefs.viewMode = mode;
  savePrefs();
  ['fileGrid','catGrid','searchGrid'].forEach(id => {
    $(id).classList.toggle('list-view', mode === 'list');
  });
  $('gridViewBtn')?.classList.toggle('active', mode === 'grid');
  $('listViewBtn')?.classList.toggle('active', mode === 'list');
  $('vmGrid')?.classList.toggle('active', mode === 'grid');
  $('vmList')?.classList.toggle('active', mode === 'list');
}

// ── View menu ──────────────────────────────────────────────────────────────
function syncViewMenu() {
  $('vmGrid')?.classList.toggle('active', prefs.viewMode === 'grid');
  $('vmList')?.classList.toggle('active', prefs.viewMode === 'list');
  qsa('.vm-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === prefs.sortBy);
  });
  $('vmAsc')?.classList.toggle('active', prefs.sortDir === 'asc');
  $('vmDesc')?.classList.toggle('active', prefs.sortDir === 'desc');
  const tog = $('vmHiddenToggle');
  if (tog) tog.checked = prefs.showHidden;
}

function refreshCurrentView() {
  if (state.currentView === 'browser') navigate(state.currentPath);
  else if (state.currentView === 'cat') loadCategory(pg.param);
  else if (state.currentView === 'search') doSearch(pg.param);
  else if (state.currentView === 'recentAll') loadRecentAll();
  else if (state.currentView === 'favAll') loadFavoritesAll();
}

// ═══════════════════════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════════

// ── Theme ───────────────────────────────────────────────────────────────────
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('lhost_theme', t);
  syncThemeButtons();
}
function syncThemeButtons() {
  const t = localStorage.getItem('lhost_theme') || 'dark';
  qsa('.s-theme-pill').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === t));
  qsa('.theme-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === t));
}

document.addEventListener('DOMContentLoaded', () => {


  // Apply saved theme immediately
  applyTheme(localStorage.getItem('lhost_theme') || 'dark');

  vpInit();
  ivInit();
  mpInitEvents();

  // Apply saved view mode on startup
  setListMode(prefs.viewMode);
  syncViewMenu();

  // ── Lock screen ──────────────────────────────────────────────────────────
  (async () => {
    try {
      const cfg = await fetchJson('/api/settings');
      if (cfg.passwordEnabled && !sessionStorage.getItem('lhost_unlocked')) {
        $('lockScreen').classList.remove('hidden');
        $('lockInput').focus();
      }
    } catch (_) {}
  })();

  async function tryUnlock() {
    const pw = $('lockInput').value;
    if (!pw) return;
    try {
      const r = await fetch('/api/verify-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw })
      });
      const d = await r.json();
      if (d.ok) {
        sessionStorage.setItem('lhost_unlocked', '1');
        $('lockScreen').classList.add('hidden');
        $('lockError').classList.add('hidden');
        $('lockInput').value = '';
      } else {
        $('lockError').classList.remove('hidden');
        $('lockInput').value = '';
        $('lockInput').focus();
      }
    } catch (e) { toast(e.message, 'error'); }
  }
  $('lockUnlockBtn').addEventListener('click', tryUnlock);
  $('lockInput').addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });

  // ── Theme buttons ────────────────────────────────────────────────────────
  qsa('.theme-btn, .s-theme-pill').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  });

  // ── Password settings ────────────────────────────────────────────────────
  $('pwToggle').addEventListener('change', () => {
    const en = $('pwToggle').checked;
    $('pwFields').classList.toggle('hidden', !en);
    $('pwCurrentWrap').classList.toggle('hidden', true);
    $('pwNewInput').value = '';
    $('pwConfirmInput').value = '';
    $('pwError').classList.add('hidden');
    if (!en) {
      fetch('/api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwordEnabled: false })
      }).then(r => r.json()).then(d => {
        if (d.error) toast(d.error, 'error');
        else { toast('Password lock disabled', 'success'); sessionStorage.removeItem('lhost_unlocked'); }
      });
    }
  });

  $('pwSaveBtn').addEventListener('click', async () => {
    const current = $('pwCurrentInput').value;
    const nw = $('pwNewInput').value;
    const conf = $('pwConfirmInput').value;
    const pwErr = $('pwError');
    if (nw.length < 4) { pwErr.textContent = 'Password must be at least 4 characters'; pwErr.classList.remove('hidden'); return; }
    if (nw !== conf) { pwErr.textContent = 'Passwords do not match'; pwErr.classList.remove('hidden'); return; }
    pwErr.classList.add('hidden');
    try {
      const body = { passwordEnabled: true, password: nw };
      if (current) body.currentPassword = current;
      const d = await fetch('/api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }).then(r => r.json());
      if (d.error) { pwErr.textContent = d.error; pwErr.classList.remove('hidden'); }
      else { toast('Password saved!', 'success'); $('pwNewInput').value = ''; $('pwConfirmInput').value = ''; $('pwCurrentInput').value = ''; }
    } catch (e) { toast(e.message, 'error'); }
  });

  // ── WAN Tunnel ─────────────────────────────────────────────────────────
  $('wanStartBtn').addEventListener('click', wanStart);
  $('wanStopBtn').addEventListener('click', wanStop);
  $('quickWanStartBtn') && $('quickWanStartBtn').addEventListener('click', wanStart);
  $('quickWanStopBtn') && $('quickWanStopBtn').addEventListener('click', wanStop);
  $('wanRefreshBtn').addEventListener('click', () => {
    anime({ targets: '#wanRefreshIcon', rotate: '360deg', duration: 600, easing: 'easeInOutQuad' });
    setTimeout(() => { if ($('wanRefreshIcon')) $('wanRefreshIcon').style.transform = ''; }, 700);
    wanSyncUI();
  });
  $('quickWanRefreshBtn') && $('quickWanRefreshBtn').addEventListener('click', () => {
    anime({ targets: '#quickWanRefreshIcon', rotate: '360deg', duration: 600, easing: 'easeInOutQuad' });
    setTimeout(() => { if ($('quickWanRefreshIcon')) $('quickWanRefreshIcon').style.transform = ''; }, 700);
    wanSyncUI();
  });
  const copyWanUrl = () => {
    const url = (($('quickWanUrlVal') || {}).textContent || ($('wanUrlVal') || {}).textContent || '').trim();
    if (!url) return;
    const fallbackCopy = () => {
      if (navigator.share) {
        navigator.share({ title: 'Hevi Explorer', url }).then(() => toast('Link shared!', 'success')).catch(() => promptCopy());
      } else {
        promptCopy();
      }
    };
    const promptCopy = () => {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:90vw;max-width:480px;padding:12px;font-size:14px;z-index:99999;border:2px solid #0ff;border-radius:8px;background:#111;color:#fff;';
      document.body.appendChild(ta);
      ta.focus();
      ta.setSelectionRange(0, ta.value.length);
      try { document.execCommand('copy'); toast('Link copied!', 'success'); ta.remove(); }
      catch(e) { toast('Long-press the link above to copy', 'info'); setTimeout(() => ta.remove(), 4000); }
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(() => toast('Link copied!', 'success')).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  };
  $('wanCopyBtn').addEventListener('click', copyWanUrl);
  $('quickWanCopyBtn') && $('quickWanCopyBtn').addEventListener('click', copyWanUrl);
  const toggleWanQr = (collapseId, imgId, btnId) => {
    const collapse = $(collapseId);
    const img = $(imgId);
    const btn = $(btnId);
    if (!collapse || !img || !btn) return;
    const isHidden = collapse.classList.contains('hidden');
    if (isHidden) {
      img.src = '/api/wan/qr?' + Date.now();
      collapse.classList.remove('hidden');
      anime({ targets: '#' + collapseId, opacity:[0,1], translateY:[-10,0], duration:400, easing:'easeOutQuad' });
      btn.textContent = '🔼 Hide QR Code';
    } else {
      anime({ targets: '#' + collapseId, opacity:[1,0], translateY:[0,-10], duration:300, easing:'easeInQuad',
        complete: () => collapse.classList.add('hidden') });
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Show QR Code';
    }
  };
  $('wanQrBtn') && $('wanQrBtn').addEventListener('click', () => toggleWanQr('wanQrCollapse', 'wanQrImg', 'wanQrBtn'));
  $('quickWanQrBtn') && $('quickWanQrBtn').addEventListener('click', () => toggleWanQr('quickWanQrCollapse', 'quickWanQrImg', 'quickWanQrBtn'));

  // ── About Page Navigation ─────────────────────────────────────────────────
  let _aboutAnimFrame = null;
  let _aboutRevealTimers = [];
  let _aboutHistoryOpen = false;

  function stopAboutAnimations() {
    const page = $('stAboutPage');
    if (_aboutAnimFrame) cancelAnimationFrame(_aboutAnimFrame);
    _aboutRevealTimers.forEach(timer => clearTimeout(timer));
    _aboutAnimFrame = null;
    _aboutRevealTimers = [];
    if (page) {
      page.classList.remove('ab-live');
      page.style.removeProperty('--ab-shift');
      page.querySelectorAll('.ab-reveal').forEach(el => el.classList.remove('ab-seen'));
    }
  }

  function startAboutAnimations() {
    const page = $('stAboutPage');
    if (!page || page.classList.contains('hidden')) return;
    stopAboutAnimations();
    page.classList.add('ab-live');
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealItems = Array.from(page.querySelectorAll('.ab-reveal'));
    revealItems.forEach(el => el.classList.remove('ab-seen'));
    revealItems.forEach((el, i) => {
      _aboutRevealTimers.push(setTimeout(() => el.classList.add('ab-seen'), reduced ? 0 : 80 + i * 55));
    });
    if (reduced) return;
    const tick = now => {
      if (!page.classList.contains('ab-live')) return;
      page.style.setProperty('--ab-shift', (Math.sin(now / 1800) * 18).toFixed(2));
      _aboutAnimFrame = requestAnimationFrame(tick);
    };
    _aboutAnimFrame = requestAnimationFrame(tick);
  }

  // Sections open by default (0-indexed among .ab-section elements)
  // 2 = Core Features, 5 = Cloud Storage, 9 = Creator, 10 = TWH
  const ABOUT_OPEN_DEFAULT = new Set([2, 5, 9, 10]);

  function initAboutAccordion() {
    const page = $('stAboutPage');
    if (!page || page.dataset.accInit) return;
    page.dataset.accInit = '1';

    const chevronSVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

    page.querySelectorAll('.ab-section').forEach((section, idx) => {
      const head = section.querySelector('.ab-section-head');
      if (!head) return;

      // Collect all children that come after the head
      const allChildren = Array.from(section.childNodes);
      const headIdx = allChildren.indexOf(head);
      const bodyNodes = allChildren.slice(headIdx + 1).filter(n => !(n.nodeType === 3 && !n.textContent.trim()));

      // Wrap body in accordion shell
      const inner = document.createElement('div');
      inner.className = 'ab-acc-inner';
      bodyNodes.forEach(n => inner.appendChild(n));

      const body = document.createElement('div');
      body.className = 'ab-acc-body';
      body.appendChild(inner);
      section.appendChild(body);

      // Add chevron to head
      const chev = document.createElement('span');
      chev.className = 'ab-acc-chevron';
      chev.innerHTML = chevronSVG;
      head.appendChild(chev);
      head.classList.add('ab-acc-trigger');

      // Apply default open/collapsed state
      if (ABOUT_OPEN_DEFAULT.has(idx)) {
        section.classList.add('ab-acc-open');
      }

      // Toggle on click
      head.addEventListener('click', () => {
        section.classList.toggle('ab-acc-open');
      });
    });
  }

  function openAboutPage(pushHistory = true) {
    const page = $('stAboutPage');
    if (!page) return;
    const curVer = $('updateCurrentVer');
    const abVer  = $('abVersion');
    if (curVer && abVer) abVer.textContent = curVer.textContent;
    if (pushHistory) {
      history.pushState({ lhost: true, modal: 'settingsModal', subpage: 'about' }, '');
      _aboutHistoryOpen = true;
    }
    initAboutAccordion();
    page.classList.remove('hidden', 'slide-out');
    requestAnimationFrame(() => {
      page.classList.add('active');
      startAboutAnimations();
    });
  }
  function closeAboutPage(syncHistory = false, immediate = false) {
    if (syncHistory) {
      _aboutHistoryOpen = false;
      history.back();
      return;
    }
    const page = $('stAboutPage');
    if (!page) return;
    stopAboutAnimations();
    _aboutHistoryOpen = false;
    page.classList.remove('active');
    if (immediate) {
      page.classList.add('hidden');
    } else {
      page.addEventListener('transitionend', () => page.classList.add('hidden'), { once: true });
    }
  }
  // Expose closeAboutPage to the global proxy so closeModal can reach it
  _closeAboutPageFn = closeAboutPage;

  $('aboutCard') && $('aboutCard').addEventListener('click', openAboutPage);
  $('aboutPageBack') && $('aboutPageBack').addEventListener('click', () => closeAboutPage(_aboutHistoryOpen));

  // ── WAN Install Button ───────────────────────────────────────────────────
  let _wanInstallPoll = null;
  const startWanInstall = async () => {
    wanEls('wanInstallBtn').forEach(btn => {
      btn.disabled = true;
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Installing…';
    });
    wanEls('wanInstallLogWrap').forEach(el => el.classList.remove('hidden'));
    wanEls('wanInstallLog').forEach(el => { el.textContent = 'Starting install…\n'; });
    wanEls('wanInstallLogBtn').forEach(el => { el.style.display = ''; });
    try {
      const r = await fetch('/api/wan/install', { method:'POST' });
      const d = await r.json();
      if (!d.ok) {
        toast(d.error || 'Install failed', 'error');
        wanEls('wanInstallBtn').forEach(btn => { btn.disabled = false; btn.innerHTML = '↓ Install cloudflared'; });
        return;
      }
    } catch(e) {
      toast('Could not start install: ' + e.message, 'error');
      wanEls('wanInstallBtn').forEach(btn => { btn.disabled = false; });
      return;
    }
    clearInterval(_wanInstallPoll);
    _wanInstallPoll = setInterval(async () => {
      try {
        const s = await fetchJson('/api/wan/install-status');
        wanEls('wanInstallLog').forEach(logEl => {
          logEl.textContent = s.log || '';
          logEl.scrollTop = logEl.scrollHeight;
        });
        if (s.state === 'done') {
          clearInterval(_wanInstallPoll); _wanInstallPoll = null;
          wanEls('wanInstallBtn').forEach(btn => { btn.innerHTML = '✓ Installed!'; btn.disabled = false; });
          toast('cloudflared installed! Starting WAN check…', 'success');
          setTimeout(() => {
            toggleAllWan('wanNoInstall', true);
            wanCheck();
          }, 1500);
        } else if (s.state === 'error') {
          clearInterval(_wanInstallPoll); _wanInstallPoll = null;
          wanEls('wanInstallBtn').forEach(btn => {
            btn.disabled = false;
            btn.innerHTML = '↓ Retry Install';
          });
          toast('Install error: ' + (s.error || 'Unknown'), 'error');
        }
      } catch(_) {}
    }, 1000);
  };
  $('wanInstallBtn') && $('wanInstallBtn').addEventListener('click', startWanInstall);
  $('quickWanInstallBtn') && $('quickWanInstallBtn').addEventListener('click', startWanInstall);
  $('wanInstallLogBtn') && $('wanInstallLogBtn').addEventListener('click', () => $('wanInstallLogWrap').classList.toggle('hidden'));
  $('quickWanInstallLogBtn') && $('quickWanInstallLogBtn').addEventListener('click', () => $('quickWanInstallLogWrap').classList.toggle('hidden'));

  // ── LAN QR Toggle ───────────────────────────────────────────────────────
  $('lanQrBtn') && $('lanQrBtn').addEventListener('click', () => {
    const collapse = $('lanQrCollapse');
    const isHidden = collapse.classList.contains('hidden');
    if (isHidden) {
      collapse.classList.remove('hidden');
      anime({ targets: '#lanQrCollapse', opacity:[0,1], translateY:[-10,0], duration:400, easing:'easeOutQuad' });
      $('lanQrBtn').textContent = '🔼 Hide QR';
    } else {
      anime({ targets: '#lanQrCollapse', opacity:[1,0], translateY:[0,-10], duration:300, easing:'easeInQuad',
        complete: () => collapse.classList.add('hidden') });
      $('lanQrBtn').innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> QR Code';
    }
  });

  // ── Update Checker ──────────────────────────────────────────────────────
  $('updateCheckBtn').addEventListener('click', checkForUpdates);

  // ── History-based back navigation ──────────────────────────────────────
  history.replaceState({ lhost: true }, '');
  window.addEventListener('popstate', () => {
    if (state.selectMode) {
      exitSelectMode();
      history.replaceState({ lhost: true }, '');
      return;
    }
    const aboutPage = $('stAboutPage');
    if (aboutPage && !aboutPage.classList.contains('hidden') && aboutPage.classList.contains('active')) {
      closeAboutPage(false);
      history.replaceState({ lhost: true }, '');
      return;
    }
    if (!$('imageModal').classList.contains('hidden')) {
      ivClose();
      history.replaceState({ lhost: true }, '');
      return;
    }
    if (!$('videoModal').classList.contains('hidden')) {
      closeVideo();
      history.replaceState({ lhost: true }, '');
      return;
    }
    if (!$('audioModal').classList.contains('hidden')) {
      closeModal('audioModal');
      history.replaceState({ lhost: true }, '');
      return;
    }
    const modals = ['textModal','settingsModal','uploadModal','folderModal','pdfModal','archiveModal','storageModal','wanQuickModal'];
    for (const id of modals) {
      if (!$(id).classList.contains('hidden')) {
        closeModal(id);
        history.replaceState({ lhost: true }, '');
        return;
      }
    }
    if (state.currentView !== 'home') {
      loadHome();
      history.replaceState({ lhost: true }, '');
      return;
    }
    history.replaceState({ lhost: true }, '');
  });

  loadHome();

  // Category icons
  qsa('[data-cat]').forEach(el => el.addEventListener('click', () => loadCategory(el.dataset.cat)));
  qsa('[data-browse]').forEach(el => el.addEventListener('click', () => navigate('')));
  $('recentViewAllBtn').addEventListener('click', () => loadRecentAll());
  $('recentAllBackBtn').addEventListener('click', () => loadHome());
  $('favViewAllBtn') && $('favViewAllBtn').addEventListener('click', () => loadFavoritesAll());
  $('favAllBackBtn') && $('favAllBackBtn').addEventListener('click', () => loadHome());

  // Manage Active Folders
  $('managePinnedBtn') && $('managePinnedBtn').addEventListener('click', () => openPinnedModal());
  $('pinnedCloseBtn') && $('pinnedCloseBtn').addEventListener('click', () => closeModal('pinnedModal'));
  $('pinnedBackdrop') && $('pinnedBackdrop').addEventListener('click', () => closeModal('pinnedModal'));
  $('pinnedBrowseBtn') && $('pinnedBrowseBtn').addEventListener('click', () => enterPinPickMode());
  $('aliasConfirmBtn') && $('aliasConfirmBtn').addEventListener('click', () => saveAlias());
  $('aliasCancelBtn')  && $('aliasCancelBtn').addEventListener('click', () => closeModal('aliasModal'));
  $('aliasBackdrop')   && $('aliasBackdrop').addEventListener('click', () => closeModal('aliasModal'));
  $('aliasInput') && $('aliasInput').addEventListener('keydown', e => { if (e.key === 'Enter') saveAlias(); });

  // PDF close + zoom buttons
  $('pdfClose') && $('pdfClose').addEventListener('click', () => { _cancelPdf(); closeModal('pdfModal'); });
  $('pdfZoomIn')  && $('pdfZoomIn').addEventListener('click',  () => _pdfSetZoom(_pdfZoom + 0.25));
  $('pdfZoomOut') && $('pdfZoomOut').addEventListener('click', () => _pdfSetZoom(_pdfZoom - 0.25));
  // Pinch-to-zoom on PDF canvas wrapper (mobile) + Shift+Scroll (PC)
  (() => {
    const cw = $('pdfCanvasWrap');
    if (!cw) return;
    let _pz0 = 0, _pzBase = 1;
    cw.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        e.preventDefault();
        _pz0 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        _pzBase = _pdfZoom;
      }
    }, { passive: false });
    cw.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && _pz0 > 0) {
        e.preventDefault();
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        _pdfSetZoom(_pzBase * (d / _pz0));
      }
    }, { passive: false });
    cw.addEventListener('touchend', () => { _pz0 = 0; }, { passive: true });
    // Shift+Scroll to zoom on PC
    cw.addEventListener('wheel', e => {
      if (!e.shiftKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      _pdfSetZoom(_pdfZoom + delta);
    }, { passive: false });
    // Hide/show the Shift+Scroll hint based on input type
    cw.addEventListener('touchstart', () => {
      const hint = $('pdfZoomHint');
      if (hint) hint.style.display = 'none';
    }, { passive: true, once: true });
  })();

  $('mpFavBtn') && $('mpFavBtn').addEventListener('click', () => {
    const item = mp.queue && mp.queue[mp.index];
    if (item) toggleFavorite(item);
  });
  $('uploadCatBtn').addEventListener('click', openUploadModal);
  $('storageCard').addEventListener('click', openStorageDetails);
  $('storageCard').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openStorageDetails();
    }
  });
  $('storageManageBtn').addEventListener('click', e => {
    e.stopPropagation();
    openStorageDetails();
  });
  $('storageRefreshBtn').addEventListener('click', () => loadStorageSummary(true));

  // ── View menu button ────────────────────────────────────────────────────
  $('viewMenuBtn').addEventListener('click', e => {
    e.stopPropagation();
    const menu = $('viewMenu');
    const open = !menu.classList.contains('hidden');
    menu.classList.toggle('hidden', open);
    $('viewMenuBtn').classList.toggle('active', !open);
  });
  $('vmGrid').addEventListener('click', () => { setListMode('grid'); syncViewMenu(); });
  $('vmList').addEventListener('click', () => { setListMode('list'); syncViewMenu(); });
  qsa('.vm-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      prefs.sortBy = btn.dataset.sort;
      savePrefs(); syncViewMenu(); refreshCurrentView();
    });
  });
  $('vmAsc').addEventListener('click', () => {
    prefs.sortDir = 'asc'; savePrefs(); syncViewMenu(); refreshCurrentView();
  });
  $('vmDesc').addEventListener('click', () => {
    prefs.sortDir = 'desc'; savePrefs(); syncViewMenu(); refreshCurrentView();
  });
  $('vmHiddenToggle').addEventListener('change', () => {
    prefs.showHidden = $('vmHiddenToggle').checked;
    savePrefs(); refreshCurrentView();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#viewMenu') && !e.target.closest('#viewMenuBtn')) {
      $('viewMenu').classList.add('hidden');
      $('viewMenuBtn').classList.remove('active');
    }
  });

  // ── Sidebar drawer ──────────────────────────────────────────────────────
  function openSidebar() {
    $('sidebarDrawer').classList.add('open');
    $('sidebarOverlay').classList.add('open');
  }
  function closeSidebar() {
    $('sidebarDrawer').classList.remove('open');
    $('sidebarOverlay').classList.remove('open');
  }

  $('menuBtn').addEventListener('click', openSidebar);
  $('sidebarClose').addEventListener('click', closeSidebar);
  $('sidebarOverlay').addEventListener('click', closeSidebar);

  // Sidebar navigation items
  $('sbHome').addEventListener('click', () => { closeSidebar(); loadHome(); });
  $('sbBrowse').addEventListener('click', () => { closeSidebar(); navigate(''); });
  qsa('[data-sidebar-cat]').forEach(el => {
    el.addEventListener('click', () => { closeSidebar(); loadCategory(el.dataset.sidebarCat); });
  });
  $('sbSettings').addEventListener('click', () => { closeSidebar(); showSettings(); });

  // Swipe-right to open sidebar from left edge
  let _sbTx = 0;
  document.addEventListener('touchstart', e => { _sbTx = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - _sbTx;
    if (_sbTx < 24 && dx > 60) openSidebar();
    if ($('sidebarDrawer').classList.contains('open') && dx < -60) closeSidebar();
  }, { passive: true });

  // Search bar
  $('searchToggleBtn').addEventListener('click', () => {
    state.searchOpen = !state.searchOpen;
    $('searchBar').classList.toggle('open', state.searchOpen);
    $('main').classList.toggle('search-open', state.searchOpen);
    if (state.searchOpen) $('searchInput').focus();
    else { $('searchInput').value = ''; if (state.currentView === 'search') showView('home'); }
  });
  $('searchInput').addEventListener('input', e => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if (!q) { showView('home'); return; }
    searchTimeout = setTimeout(() => doSearch(q), 350);
  });
  $('searchClearBtn').addEventListener('click', () => {
    $('searchInput').value = '';
    state.searchOpen = false;
    $('searchBar').classList.remove('open');
    $('main').classList.remove('search-open');
    showView('home');
  });

  // Browser actions
  $('backBtn').addEventListener('click', () => {
    const parent = state.currentPath ? state.currentPath.split('/').slice(0,-1).join('/') : null;
    if (parent !== null) navigate(parent); else loadHome();
  });
  $('catBackBtn').addEventListener('click', loadHome);
  $('newFolderBtn').addEventListener('click', () => { $('folderNameInput').value = ''; openModal('folderModal'); $('folderNameInput').focus(); });
  $('uploadBtn').addEventListener('click', openUploadModal);
  $('gridViewBtn').addEventListener('click', () => setListMode('grid'));
  $('listViewBtn').addEventListener('click', () => setListMode('list'));
  $('selectModeBtn')?.addEventListener('click', () => { if (state.selectMode) exitSelectMode(); else enterSelectMode(); });
  $('bulkDeleteBtn')?.addEventListener('click', bulkDelete);
  $('bulkDownloadBtn')?.addEventListener('click', bulkDownload);
  $('bulkCancelBtn')?.addEventListener('click', exitSelectMode);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.selectMode) exitSelectMode(); });
  document.addEventListener('click', e => {
    if (!state.selectMode) return;
    if (e.target.closest('.file-item') || e.target.closest('.bulk-bar') || e.target.closest('#selectModeBtn')) return;
    exitSelectMode();
  });

  // Bottom nav
  $('navFiles').addEventListener('click', loadHome);
  $('navBrowse').addEventListener('click', () => navigate(state.currentPath || ''));
  $('navUpload').addEventListener('click', openUploadModal);
  $('navSettings').addEventListener('click', () => { setNavActive('navSettings'); showSettings(); });
  $('navWan').addEventListener('click', openWanTunnelPanel);

   // Non-video modals close (image viewer handled by ivInit)
  ['audio','text','settings','upload','pdf','archive','storage','wanQuick'].forEach(name => {
    $(`${name}Close`).addEventListener('click', () => {
      if (name === 'pdf') _cancelPdf();
      closeModal(`${name}Modal`);
      if (name === 'settings' || name === 'wanQuick') history.back();
    });
    const bd = $(`${name}Backdrop`);
    if (bd) bd.addEventListener('click', () => {
      if (name === 'pdf') _cancelPdf();
      closeModal(`${name}Modal`);
      if (name === 'settings' || name === 'wanQuick') history.back();
    });
  });

  // Mini player controls
  $('miniPlayer').addEventListener('click', e => {
    if (e.target.closest('#miniPlayBtn') || e.target.closest('#miniNextBtn') || e.target.closest('#miniCloseBtn')) return;
    mpExpandFromMini();
  });
  $('miniPlayBtn').addEventListener('click', e => {
    e.stopPropagation();
    mpTogglePlay();
  });
  $('miniNextBtn') && $('miniNextBtn').addEventListener('click', e => {
    e.stopPropagation();
    mpNext();
  });
  $('miniCloseBtn').addEventListener('click', e => {
    e.stopPropagation();
    const audio = mpGetAudio();
    audio.pause();
    audio.src = '';
    mpSetPlaying(false);
    mp.queue = [];
    mpClearSleepTimer();
    mpHideMini();
  });

  // Upload
  $('startUploadBtn').addEventListener('click', handleUpload);
  $('cancelUploadBtn').addEventListener('click', cancelUpload);
  const dz = $('dropZone');
  const fileInput = $('fileInput');
  const onUploadDrag = e => {
    e.preventDefault();
    e.stopPropagation();
    dz.classList.add('dragging');
  };
  const onUploadDrop = e => {
    e.preventDefault();
    e.stopPropagation();
    dz.classList.remove('dragging');
    setUploadFiles(e.dataTransfer?.files);
  };
  dz.addEventListener('dragenter', onUploadDrag);
  dz.addEventListener('dragover', onUploadDrag);
  dz.addEventListener('dragleave', e => {
    if (!dz.contains(e.relatedTarget)) dz.classList.remove('dragging');
  });
  dz.addEventListener('drop', onUploadDrop);
  fileInput.addEventListener('drop', onUploadDrop);
  fileInput.addEventListener('change', () => setUploadFiles(fileInput.files));
  document.addEventListener('dragover', e => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    if ($('uploadModal').classList.contains('hidden')) openUploadModal();
    dz.classList.add('dragging');
  });
  document.addEventListener('drop', e => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    openUploadModal(e.dataTransfer.files);
    dz.classList.remove('dragging');
  });
  $('uploadBackdrop').addEventListener('click', () => closeModal('uploadModal'));

  // Folder modal
  $('folderCancelBtn').addEventListener('click', () => closeModal('folderModal'));
  $('folderBackdrop').addEventListener('click', () => closeModal('folderModal'));
  $('folderCreateBtn').addEventListener('click', () => { const n = $('folderNameInput').value.trim(); if (n) { closeModal('folderModal'); createFolder(n); } });
  $('folderNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') { const n = e.target.value.trim(); if (n) { closeModal('folderModal'); createFolder(n); } } });

  // Context menu
  $('ctxSelect') && $('ctxSelect').addEventListener('click', () => {
    const i = state.ctxItem; hideCtxMenu();
    if (!i) return;
    if (!state.selectMode) enterSelectMode();
    if (i.type !== 'dir') {
      const el = document.querySelector(`.file-item[data-path="${CSS.escape(i.path)}"]`);
      if (el) toggleItemSelect(i, el);
    }
  });
  $('ctxOpen').addEventListener('click', () => { const i = state.ctxItem; hideCtxMenu(); if (!i) return; if (i.type === 'dir') navigate(i.path); else openFile(i); });
  $('ctxDownload').addEventListener('click', () => { const i = state.ctxItem; hideCtxMenu(); if (!i) return; const a = document.createElement('a'); a.href = `/file?path=${encodeURIComponent(i.path)}&dl=1`; a.download = i.name; a.click(); });
  $('ctxFavorite').addEventListener('click', () => { const i = state.ctxItem; hideCtxMenu(); if (i) toggleFavorite(i); });
  $('ctxPin').addEventListener('click', () => {
    const i = state.ctxItem; hideCtxMenu();
    if (!i || i.type !== 'dir') return;
    const isPinned = _pinnedFolders.some(p => p.path === i.path);
    isPinned ? unpinFolder(i.path) : pinFolder(i);
  });
  $('ctxRename').addEventListener('click', () => { const i = state.ctxItem; hideCtxMenu(); if (i) renameItem(i); });
  $('ctxCopy').addEventListener('click', () => { const i = state.ctxItem; hideCtxMenu(); if (i) copyItem(i); });
  $('ctxMove').addEventListener('click', () => { const i = state.ctxItem; hideCtxMenu(); if (i) moveItem(i); });
  $('ctxInfo').addEventListener('click', () => { const i = state.ctxItem; hideCtxMenu(); if (i) showFileInfo(i); });
  $('ctxDelete').addEventListener('click', () => { const i = state.ctxItem; hideCtxMenu(); if (i) deleteItem(i); });
  document.addEventListener('click', e => { if (!e.target.closest('#ctxMenu') && !e.target.closest('[data-more]')) hideCtxMenu(); });

  // Rename modal
  $('renameCancelBtn').addEventListener('click', () => closeModal('renameModal'));
  $('renameBackdrop').addEventListener('click', () => closeModal('renameModal'));
  $('renameConfirmBtn').addEventListener('click', () => { if ($('renameConfirmBtn')._handler) $('renameConfirmBtn')._handler(); });
  $('renameInput').addEventListener('keydown', e => { if (e.key === 'Enter') { if ($('renameConfirmBtn')._handler) $('renameConfirmBtn')._handler(); } });

  // Folder Picker (copy/move)
  const _fpClose = () => closeModal('folderPickerModal');
  $('fpCancelBtn').addEventListener('click', _fpClose);
  $('fpClose').addEventListener('click', _fpClose);
  $('folderPickerBackdrop').addEventListener('click', _fpClose);
  $('fpBack').addEventListener('click', () => {
    if (!_fp.path) return;
    const parent = _fp.path.includes('/') ? _fp.path.substring(0, _fp.path.lastIndexOf('/')) : '';
    _fpNavigate(parent);
  });
  $('fpSelectBtn').addEventListener('click', async () => {
    const item = _fp.item;
    if (!item) return;
    const destPath = (_fp.path ? _fp.path + '/' : '') + item.name;
    closeModal('folderPickerModal');
    try {
      const endpoint = _fp.mode === 'copy' ? '/api/copy' : '/api/move';
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src: item.path, dest: destPath }) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      toast(_fp.mode === 'copy' ? 'Copied!' : 'Moved!', 'success');
      if (state.currentView === 'browser') navigate(state.currentPath);
      else if (state.currentView === 'cat') loadCategory(item.category);
      else loadHome();
    } catch (e) { toast(e.message, 'error'); }
  });

  // File Info modal
  $('fileInfoCloseBtn').addEventListener('click', () => closeModal('fileInfoModal'));
  $('fileInfoBackdrop').addEventListener('click', () => closeModal('fileInfoModal'));

  // Pre-load favorites cache
  fetchJson('/api/userstate').then(st => { _cachedFavorites = st.favorites || []; }).catch(() => {});

  // ── Keyboard shortcuts ──
  document.addEventListener('keydown', e => {
    const videoOpen = vpHasVideoOpen();
    const audioOpen = !$('audioModal').classList.contains('hidden');
    const typing = e.target && ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName);
    if (typing) return;

    // ── Audio player shortcuts ──
    if (audioOpen && !videoOpen) {
      const audio = mpGetAudio();
      if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); mpTogglePlay(); return; }
      if (e.key === 'ArrowRight' && !e.shiftKey) { e.preventDefault(); if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5); return; }
      if (e.key === 'ArrowLeft'  && !e.shiftKey) { e.preventDefault(); audio.currentTime = Math.max(0, audio.currentTime - 5); return; }
      if (e.key === 'ArrowRight' && e.shiftKey)  { e.preventDefault(); mpNext(); return; }
      if (e.key === 'ArrowLeft'  && e.shiftKey)  { e.preventDefault(); mpPrev(); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); mpSetVolume(mp.volume + 0.05); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); mpSetVolume(mp.volume - 0.05); return; }
      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); mpToggleMuteAudio(); return; }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); mpNext(); return; }
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); mpPrev(); return; }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); mpToggleShuffle(); return; }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); mpToggleRepeat(); return; }
      if (e.key === '.') { e.preventDefault(); mpCycleSpeed(); return; }
    }

    if (e.key === 'Escape') {
      if (videoOpen) { closeVideo(); return; }
      ['audioModal','textModal','settingsModal','uploadModal','folderModal','pdfModal','archiveModal','storageModal','wanQuickModal','pinnedModal','aliasModal','cloudPickerModal','cloudSetupModal','cloudShareModal'].forEach(id => {
        if (!$(id).classList.contains('hidden')) {
          if (id === 'pdfModal') _cancelPdf();
          closeModal(id);
        }
      });
      if (state.searchOpen) $('searchToggleBtn').click();
    }

    if (videoOpen) {
      const vid = $('videoPlayer');
      if (e.key === ' ' || e.code === 'Space' || e.key === 'k' || e.key === 'K') { e.preventDefault(); vpTogglePlay(); vpShowControls(); }
      if ((e.key === 'ArrowLeft'  || e.key === 'j' || e.key === 'J') && !e.shiftKey) { e.preventDefault(); vpSeek(-10); }
      if ((e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') && !e.shiftKey) { e.preventDefault(); vpSeek(10); }
      if (e.key === 'ArrowLeft'  && e.shiftKey) { e.preventDefault(); vpPrev(); vpShowControls(); }
      if (e.key === 'ArrowRight' && e.shiftKey) { e.preventDefault(); vpNext(); vpShowControls(); }
      if (e.key === 'ArrowUp')    { e.preventDefault(); vpSetVolume(vp.volume + 0.1); vpShowHud('vol', vp.volume); vpShowControls(); }
      if (e.key === 'ArrowDown')  { e.preventDefault(); vpSetVolume(vp.volume - 0.1); vpShowHud('vol', vp.volume); vpShowControls(); }
      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); vpToggleMute(); vpShowHud('vol', vp.muted ? 0 : vp.volume); vpShowControls(); }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); vpToggleFullscreen(); vpShowControls(); }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); vpToggleTheater(); vpShowControls(); }
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); vpTogglePiP(); vpShowControls(); }
      if (e.key === 'Home') { e.preventDefault(); vid.currentTime = 0; vpShowControls(); }
      if (e.key === 'End' && vid.duration) { e.preventDefault(); vid.currentTime = Math.max(0, vid.duration - 0.1); vpShowControls(); }
      if (/^[0-9]$/.test(e.key) && vid.duration) { e.preventDefault(); vid.currentTime = (Number(e.key) / 10) * vid.duration; vpShowControls(); }
      if ((e.key === '.' || e.key === ',') && vid.paused && vid.duration) {
        e.preventDefault();
        vid.currentTime = Math.max(0, Math.min(vid.duration, vid.currentTime + (e.key === '.' ? 1 / 30 : -1 / 30)));
        vpShowControls();
      }
    }

  });

});
// ═══════════════════════════════════════════════════════════════════════════
//  CLOUD STORAGE INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

let _cloudAccounts = [];
let _cloudBrowserAccountId = null;
let _cloudBrowserStack = []; // breadcrumb stack [{id, name}]
let _cloudSetupProvider = null;
let _cloudSetupStep = 0;
let _cloudShareAccountId = null;

// ── Provider meta ──────────────────────────────────────────────────────────
function cloudProviderMeta(provider) {
  if (provider === 'gdrive')   return { name: 'Google Drive', color: '#4285f4', icon: cloudGDriveIcon() };
  if (provider === 'dropbox')  return { name: 'Dropbox',      color: '#0061ff', icon: cloudDropboxIcon() };
  if (provider === 'onedrive') return { name: 'OneDrive',     color: '#0078d4', icon: cloudOneDriveIcon() };
  if (provider === 'mega')     return { name: 'MEGA',         color: '#d9272e', icon: cloudMegaIcon() };
  return { name: provider, color: '#888', icon: '☁️' };
}

function cloudGDriveIcon(size = 28) {
  return `<svg viewBox="0 0 87.3 78" width="${size}" height="${size}" style="stroke:none;fill:none;flex-shrink:0"><path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5A9.06 9.06 0 0 0 0 53h27.5z" fill="#00ac47"/><path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.7L73.55 76.8z" fill="#ea4335"/><path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/><path d="M59.7 53H87.3c0-1.55-.4-3.1-1.2-4.5L61.1 4.5C60.3 3.1 59.15 2 57.8 1.2L44.05 25z" fill="#2684fc"/><path d="M27.5 53L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.4 4.5-1.2L59.7 53z" fill="#ffba00"/></svg>`;
}
function cloudDropboxIcon(size = 28) {
  return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" style="stroke:none;fill:none;flex-shrink:0"><path d="M10 2L0 9l10 7 10-7zM30 2L20 9l10 7 10-7zM0 23l10 7 10-7-10-7zM30 16l-10 7 10 7 10-7zM20 24.5L10 31.5 20 38.5l10-7z" fill="#0061ff"/></svg>`;
}
function cloudOneDriveIcon(size = 28) {
  return `<svg viewBox="0 0 96 48" width="${size}" height="${size*0.5}" style="stroke:none;fill:none;flex-shrink:0"><path d="M32.3 38.6c-.3-1.4-.5-2.8-.5-4.3 0-10 8.1-18.1 18.1-18.1 4.8 0 9.1 1.9 12.4 4.9A15.2 15.2 0 0 1 74.6 19C81.5 19.6 87 25.4 87 32.5c0 .7-.1 1.4-.2 2.1H32.3z" fill="#0078d4"/><path d="M9.7 38.6a18 18 0 0 1 21-24.4A21.7 21.7 0 0 1 56 16.7a15.2 15.2 0 0 0-12.4 6.4 18.1 18.1 0 0 0-2.4-.2c-7.6 0-14 4.7-16.5 11.4A18 18 0 0 1 9.7 38.6z" fill="#28a8e0"/></svg>`;
}
function cloudMegaIcon(size = 28) {
  return `<svg viewBox="0 0 40 36" width="${size}" height="${size*0.9}" style="stroke:none;fill:none;flex-shrink:0"><text x="0" y="30" font-family="Arial Black,sans-serif" font-size="34" font-weight="900" fill="#d9272e">M</text></svg>`;
}

// ── Load cloud section on home ─────────────────────────────────────────────
async function loadCloudSection() {
  try {
    _cloudAccounts = await fetchJson('/api/cloud/accounts');
    renderCloudCards(_cloudAccounts);
    renderSidebarCloud(_cloudAccounts);
  } catch (e) {
    const row = $('cloudCardsRow');
    if (row) row.innerHTML = `<div style="font-size:12px;color:var(--text3);padding:4px 0">Unable to load cloud accounts</div>`;
  }
}

function renderCloudCards(accounts) {
  const row = $('cloudCardsRow');
  if (!row) return;
  row.innerHTML = '';

  if (!accounts.length) {
    const addCard = document.createElement('button');
    addCard.className = 'cloud-card cloud-card-add';
    addCard.innerHTML = `<div class="cloud-card-icon">+</div><span class="cloud-card-label">Add Account</span>`;
    addCard.addEventListener('click', openCloudPicker);
    row.appendChild(addCard);
    return;
  }

  for (const acc of accounts) {
    const meta = cloudProviderMeta(acc.provider);
    const card = document.createElement('button');
    card.className = 'cloud-card';
    card.dataset.accountId = acc.id;
    card.innerHTML = `
      ${!acc._own ? `<span class="cloud-badge-shared">Shared</span>` : ''}
      <div class="cloud-card-icon">${meta.icon}</div>
      <span class="cloud-card-label">${escHtml(acc.label || meta.name)}</span>
      <span class="cloud-card-provider">${meta.name}</span>`;
    card.addEventListener('click', () => openCloudBrowser(acc.id, acc));
    row.appendChild(card);
  }

  // Always show + add button at end
  const addCard = document.createElement('button');
  addCard.className = 'cloud-card cloud-card-add';
  addCard.innerHTML = `<div class="cloud-card-icon" style="font-size:22px">+</div><span class="cloud-card-label">Add</span>`;
  addCard.addEventListener('click', openCloudPicker);
  row.appendChild(addCard);
}

function renderSidebarCloud(accounts) {
  const label = $('sbCloudLabel');
  const list  = $('sbCloudList');
  if (!label || !list) return;
  if (!accounts || !accounts.length) {
    label.classList.add('hidden');
    list.innerHTML = '';
    return;
  }
  label.classList.remove('hidden');
  list.innerHTML = accounts.map(acc => {
    const meta = cloudProviderMeta(acc.provider);
    return `<button class="sidebar-item sb-cloud-btn" data-sb-cloud="${escHtml(acc.id)}">
      <span class="sb-cloud-icon">${meta.icon}</span>
      ${escHtml(acc.label || meta.name)}
    </button>`;
  }).join('');
  list.querySelectorAll('[data-sb-cloud]').forEach(btn => {
    btn.addEventListener('click', () => {
      $('sidebarDrawer').classList.remove('open');
      $('sidebarOverlay').classList.remove('open');
      const acc = _cloudAccounts.find(a => a.id === btn.dataset.sbCloud);
      if (acc) openCloudBrowser(acc.id, acc);
    });
  });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Cloud provider picker ──────────────────────────────────────────────────
function openCloudPicker() {
  $('cloudPickerModal').classList.remove('hidden');
}
function closeCloudPicker() {
  $('cloudPickerModal').classList.add('hidden');
}

// ── Cloud setup modal ──────────────────────────────────────────────────────
const CLOUD_SETUP_STEPS = {
  gdrive:   4,
  dropbox:  4,
  onedrive: 4,
  mega:     2,
};

function openCloudSetup(provider) {
  closeCloudPicker();
  _cloudSetupProvider = provider;
  _cloudSetupStep = 0;
  const meta = cloudProviderMeta(provider);
  $('cloudSetupTitle').textContent = `Connect ${meta.name}`;
  renderCloudSetupDots();
  renderCloudSetupStep();
  $('cloudSetupModal').classList.remove('hidden');
}

function renderCloudSetupDots() {
  const total = CLOUD_SETUP_STEPS[_cloudSetupProvider] || 2;
  const dots = $('cloudSetupStepDots');
  dots.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const d = document.createElement('div');
    d.className = 'cloud-step-dot' + (i === _cloudSetupStep ? ' active' : '');
    dots.appendChild(d);
  }
}

function renderCloudSetupStep() {
  const body = $('cloudSetupBody');
  const backBtn = $('cloudSetupBackBtn');
  const nextBtn = $('cloudSetupNextBtn');
  const redirectBase = window.location.origin;

  backBtn.style.display = _cloudSetupStep > 0 ? '' : 'none';
  renderCloudSetupDots();

  const p = _cloudSetupProvider;

  if (p === 'gdrive') {
    if (_cloudSetupStep === 0) {
      body.innerHTML = `
        <div class="cs-intro-icon">${cloudGDriveIcon(60)}</div>
        <div class="cs-intro-title">Connect Google Drive</div>
        <div class="cs-intro-sub">To use your Google Drive with Hevi Explorer, you'll create a free personal Google Cloud API project. This takes about 5 minutes and is 100% free — no credit card required.<br><br>Your files are accessed directly through your own Google account. No third-party server ever sees your data.</div>`;
      nextBtn.textContent = 'Get Started →';
    } else if (_cloudSetupStep === 1) {
      body.innerHTML = `
        <div class="cs-guide-title">Set up Google Cloud Credentials</div>
        <a href="https://console.cloud.google.com" target="_blank" rel="noopener" class="cs-link">🌐 Open Google Cloud Console ↗</a>
        <ol class="cs-steps-list">
          <li><span class="cs-step-num">1</span><span class="cs-step-text">Sign in with your Google account, then click <strong>Select a project → New Project</strong>. Name it anything (e.g. "Hevi Explorer").</span></li>
          <li><span class="cs-step-num">2</span><span class="cs-step-text">In the left menu, go to <strong>APIs &amp; Services → Library</strong>. Search for <strong>Google Drive API</strong> and click <strong>Enable</strong>.</span></li>
          <li><span class="cs-step-num">3</span><span class="cs-step-text">Go to <strong>APIs &amp; Services → Credentials</strong>. Click <strong>+ Create Credentials → OAuth 2.0 Client ID</strong>.</span></li>
          <li><span class="cs-step-num">4</span><span class="cs-step-text">If prompted, configure the OAuth consent screen — choose <strong>External</strong>, fill in an app name, then save.</span></li>
          <li><span class="cs-step-num">5</span><span class="cs-step-text">Set Application type to <strong>Web application</strong>. Under <strong>Authorized redirect URIs</strong> click Add URI and paste exactly:<br><code>${redirectBase}/api/cloud/gdrive/callback</code></span></li>
          <li><span class="cs-step-num">6</span><span class="cs-step-text">Click <strong>Create</strong>. Copy your <strong>Client ID</strong> and <strong>Client Secret</strong>.</span></li>
        </ol>`;
      nextBtn.textContent = 'I have my credentials →';
    } else if (_cloudSetupStep === 2) {
      body.innerHTML = `
        <div class="cs-guide-title">Enter your Google Drive credentials</div>
        <label class="cs-label">Client ID</label>
        <input type="text" class="st-input" id="csGdriveClientId" placeholder="xxxxxx.apps.googleusercontent.com" autocomplete="off" />
        <label class="cs-label">Client Secret</label>
        <input type="password" class="st-input" id="csGdriveClientSecret" placeholder="Client secret" autocomplete="off" />
        <label class="cs-label">Account Label (optional)</label>
        <input type="text" class="st-input" id="csGdriveLabel" placeholder="My Drive" autocomplete="off" />
        <div class="cs-note">Your credentials are stored encrypted on your local server and never shared with anyone.</div>`;
      nextBtn.textContent = 'Authorize with Google →';
    } else if (_cloudSetupStep === 3) {
      body.innerHTML = `
        <div class="cs-intro-icon">🔐</div>
        <div class="cs-intro-title">Authorize Access</div>
        <div class="cs-intro-sub">Click the button below to open a Google authorization window. Sign in and grant Hevi Explorer read-only access to your Drive files.<br><br>After you approve, this window will automatically update.</div>
        <div style="margin-top:20px;text-align:center" id="csGdriveAuthStatus"></div>`;
      nextBtn.textContent = 'Open Google Authorization ↗';
    }

  } else if (p === 'dropbox') {
    if (_cloudSetupStep === 0) {
      body.innerHTML = `
        <div class="cs-intro-icon">${cloudDropboxIcon(60)}</div>
        <div class="cs-intro-title">Connect Dropbox</div>
        <div class="cs-intro-sub">You'll create a free Dropbox app using your own Dropbox developer account. This gives you full, private access to your Dropbox files through Hevi Explorer.</div>`;
      nextBtn.textContent = 'Get Started →';
    } else if (_cloudSetupStep === 1) {
      body.innerHTML = `
        <div class="cs-guide-title">Create a Dropbox App</div>
        <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noopener" class="cs-link">🌐 Open Dropbox App Console ↗</a>
        <ol class="cs-steps-list">
          <li><span class="cs-step-num">1</span><span class="cs-step-text">Click <strong>Create app</strong>. Choose <strong>Scoped access</strong> and <strong>Full Dropbox</strong>.</span></li>
          <li><span class="cs-step-num">2</span><span class="cs-step-text">Name it anything (e.g. "HeviExplorer"). Click <strong>Create app</strong>.</span></li>
          <li><span class="cs-step-num">3</span><span class="cs-step-text">On the <strong>Settings</strong> tab, scroll to <strong>OAuth 2 → Redirect URIs</strong>. Add this URI:<br><code>${redirectBase}/api/cloud/dropbox/callback</code></span></li>
          <li><span class="cs-step-num">4</span><span class="cs-step-text">Copy your <strong>App key</strong> and <strong>App secret</strong> from the Settings tab.</span></li>
        </ol>`;
      nextBtn.textContent = 'I have my app key →';
    } else if (_cloudSetupStep === 2) {
      body.innerHTML = `
        <div class="cs-guide-title">Enter your Dropbox App credentials</div>
        <label class="cs-label">App Key</label>
        <input type="text" class="st-input" id="csDropboxKey" placeholder="App key" autocomplete="off" />
        <label class="cs-label">App Secret</label>
        <input type="password" class="st-input" id="csDropboxSecret" placeholder="App secret" autocomplete="off" />
        <label class="cs-label">Account Label (optional)</label>
        <input type="text" class="st-input" id="csDropboxLabel" placeholder="My Dropbox" autocomplete="off" />
        <div class="cs-note">Stored encrypted on your local server only.</div>`;
      nextBtn.textContent = 'Authorize with Dropbox →';
    } else if (_cloudSetupStep === 3) {
      body.innerHTML = `
        <div class="cs-intro-icon">🔐</div>
        <div class="cs-intro-title">Authorize Access</div>
        <div class="cs-intro-sub">Click the button to open a Dropbox authorization window. Sign in and allow access. After you approve, this window will automatically update.</div>
        <div style="margin-top:20px;text-align:center" id="csDropboxAuthStatus"></div>`;
      nextBtn.textContent = 'Open Dropbox Authorization ↗';
    }

  } else if (p === 'onedrive') {
    if (_cloudSetupStep === 0) {
      body.innerHTML = `
        <div class="cs-intro-icon">${cloudOneDriveIcon(56)}</div>
        <div class="cs-intro-title" style="margin-top:10px">Connect OneDrive</div>
        <div class="cs-intro-sub">You'll register a free personal Microsoft app using the Azure Portal. This gives Hevi Explorer read-only access to your OneDrive files through your own account.</div>`;
      nextBtn.textContent = 'Get Started →';
    } else if (_cloudSetupStep === 1) {
      body.innerHTML = `
        <div class="cs-guide-title">Register a Microsoft App</div>
        <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener" class="cs-link">🌐 Open Azure App Registrations ↗</a>
        <ol class="cs-steps-list">
          <li><span class="cs-step-num">1</span><span class="cs-step-text">Click <strong>+ New registration</strong>. Enter any name. Under <strong>Supported account types</strong>, select <strong>Personal Microsoft accounts only</strong>.</span></li>
          <li><span class="cs-step-num">2</span><span class="cs-step-text">Under <strong>Redirect URI</strong>, select <strong>Web</strong> and paste:<br><code>${redirectBase}/api/cloud/onedrive/callback</code></span></li>
          <li><span class="cs-step-num">3</span><span class="cs-step-text">Click <strong>Register</strong>. Copy the <strong>Application (client) ID</strong> shown on the overview page.</span></li>
          <li><span class="cs-step-num">4</span><span class="cs-step-text">Go to <strong>Certificates &amp; secrets → New client secret</strong>. Set an expiry and click Add. Copy the <strong>Value</strong> (not Secret ID).</span></li>
          <li><span class="cs-step-num">5</span><span class="cs-step-text">Go to <strong>API permissions → Add a permission → Microsoft Graph → Delegated → Files.Read</strong>. Click <strong>Add permissions</strong>.</span></li>
        </ol>`;
      nextBtn.textContent = 'I have my credentials →';
    } else if (_cloudSetupStep === 2) {
      body.innerHTML = `
        <div class="cs-guide-title">Enter your Microsoft App credentials</div>
        <label class="cs-label">Application (Client) ID</label>
        <input type="text" class="st-input" id="csOneDriveClientId" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off" />
        <label class="cs-label">Client Secret Value</label>
        <input type="password" class="st-input" id="csOneDriveClientSecret" placeholder="Client secret value" autocomplete="off" />
        <label class="cs-label">Account Label (optional)</label>
        <input type="text" class="st-input" id="csOneDriveLabel" placeholder="My OneDrive" autocomplete="off" />
        <div class="cs-note">Stored encrypted on your local server only.</div>`;
      nextBtn.textContent = 'Authorize with Microsoft →';
    } else if (_cloudSetupStep === 3) {
      body.innerHTML = `
        <div class="cs-intro-icon">🔐</div>
        <div class="cs-intro-title">Authorize Access</div>
        <div class="cs-intro-sub">Click the button to open a Microsoft authorization window. Sign in with your Microsoft personal account and grant Hevi Explorer Files.Read access.</div>
        <div style="margin-top:20px;text-align:center" id="csOneDriveAuthStatus"></div>`;
      nextBtn.textContent = 'Open Microsoft Authorization ↗';
    }

  } else if (p === 'mega') {
    if (_cloudSetupStep === 0) {
      body.innerHTML = `
        <div class="cs-intro-icon">${cloudMegaIcon(60)}</div>
        <div class="cs-intro-title">Connect MEGA</div>
        <div class="cs-intro-sub">MEGA doesn't use API keys — it uses your MEGA account email and password directly. Your credentials are encrypted and stored only on your local server. They are never sent anywhere except to MEGA's own servers to log in.</div>`;
      nextBtn.textContent = 'Enter Credentials →';
    } else if (_cloudSetupStep === 1) {
      body.innerHTML = `
        <div class="cs-guide-title">MEGA Account Credentials</div>
        <label class="cs-label">MEGA Email</label>
        <input type="email" class="st-input" id="csMegaEmail" placeholder="your@email.com" autocomplete="off" />
        <label class="cs-label">MEGA Password</label>
        <input type="password" class="st-input" id="csMegaPassword" placeholder="Password" autocomplete="off" />
        <label class="cs-label">Account Label (optional)</label>
        <input type="text" class="st-input" id="csMegaLabel" placeholder="My MEGA" autocomplete="off" />
        <div class="cs-note">Stored encrypted on your local server. Hevi Explorer uses these credentials only to access your MEGA files.</div>`;
      nextBtn.textContent = 'Connect MEGA →';
    }
  }
}

async function cloudSetupNext() {
  const p = _cloudSetupProvider;
  const total = CLOUD_SETUP_STEPS[p] || 2;
  const nextBtn = $('cloudSetupNextBtn');

  // Handle special action steps
  if (p === 'gdrive' && _cloudSetupStep === 2) {
    const clientId = ($('csGdriveClientId') || {}).value || '';
    const clientSecret = ($('csGdriveClientSecret') || {}).value || '';
    if (!clientId.trim() || !clientSecret.trim()) { toast('Please fill in Client ID and Client Secret', 'error'); return; }
    // Store for next step
    window._csGdriveClientId = clientId.trim();
    window._csGdriveClientSecret = clientSecret.trim();
    window._csGdriveLabel = (($('csGdriveLabel') || {}).value || '').trim();
  }

  if (p === 'gdrive' && _cloudSetupStep === 3) {
    // Trigger OAuth
    nextBtn.disabled = true; nextBtn.textContent = 'Opening…';
    try {
      const r = await fetch('/api/cloud/connect/gdrive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: window._csGdriveClientId, clientSecret: window._csGdriveClientSecret, label: window._csGdriveLabel || 'My Drive' }) });
      const d = await r.json();
      if (d.error) { toast(d.error, 'error'); nextBtn.disabled = false; nextBtn.textContent = 'Open Google Authorization ↗'; return; }
      const popup = window.open(d.authUrl, 'gdrive_auth', 'width=520,height=640,left=100,top=100');
      const status = $('csGdriveAuthStatus');
      if (status) status.innerHTML = `<div style="font-size:13px;color:var(--text2)">⏳ Waiting for authorization…</div>`;
      const handler = (e) => {
        if (e.data === 'cloud:success:googledrive' || e.data && String(e.data).startsWith('cloud:success')) {
          window.removeEventListener('message', handler);
          closeCloudSetup();
          toast('Google Drive connected!', 'success');
          loadCloudSection();
          if (state.currentView === 'home') {} // already on home
        } else if (e.data === 'cloud:error') {
          window.removeEventListener('message', handler);
          if (status) status.innerHTML = `<div style="color:var(--danger);font-size:13px">❌ Authorization failed. Try again.</div>`;
          nextBtn.disabled = false; nextBtn.textContent = 'Open Google Authorization ↗';
        }
      };
      window.addEventListener('message', handler);
      // Fallback polling if popup closed
      const poll = setInterval(() => {
        if (popup && popup.closed) {
          clearInterval(poll);
          window.removeEventListener('message', handler);
          if (!$('cloudSetupModal').classList.contains('hidden')) {
            nextBtn.disabled = false; nextBtn.textContent = 'Open Google Authorization ↗';
            if (status) status.innerHTML = '';
          }
        }
      }, 1000);
    } catch (e) { toast(e.message, 'error'); nextBtn.disabled = false; nextBtn.textContent = 'Open Google Authorization ↗'; }
    return;
  }

  if (p === 'dropbox' && _cloudSetupStep === 2) {
    const appKey = ($('csDropboxKey') || {}).value || '';
    const appSecret = ($('csDropboxSecret') || {}).value || '';
    if (!appKey.trim() || !appSecret.trim()) { toast('Please fill in App Key and App Secret', 'error'); return; }
    window._csDropboxKey = appKey.trim();
    window._csDropboxSecret = appSecret.trim();
    window._csDropboxLabel = (($('csDropboxLabel') || {}).value || '').trim();
  }

  if (p === 'dropbox' && _cloudSetupStep === 3) {
    nextBtn.disabled = true; nextBtn.textContent = 'Opening…';
    try {
      const r = await fetch('/api/cloud/connect/dropbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appKey: window._csDropboxKey, appSecret: window._csDropboxSecret, label: window._csDropboxLabel || 'My Dropbox' }) });
      const d = await r.json();
      if (d.error) { toast(d.error, 'error'); nextBtn.disabled = false; nextBtn.textContent = 'Open Dropbox Authorization ↗'; return; }
      const popup = window.open(d.authUrl, 'dropbox_auth', 'width=520,height=640,left=100,top=100');
      const status = $('csDropboxAuthStatus');
      if (status) status.innerHTML = `<div style="font-size:13px;color:var(--text2)">⏳ Waiting for authorization…</div>`;
      const handler = (e) => {
        if (e.data && String(e.data).startsWith('cloud:success')) {
          window.removeEventListener('message', handler);
          closeCloudSetup();
          toast('Dropbox connected!', 'success');
          loadCloudSection();
        } else if (e.data === 'cloud:error') {
          window.removeEventListener('message', handler);
          if (status) status.innerHTML = `<div style="color:var(--danger);font-size:13px">❌ Authorization failed. Try again.</div>`;
          nextBtn.disabled = false; nextBtn.textContent = 'Open Dropbox Authorization ↗';
        }
      };
      window.addEventListener('message', handler);
      const poll = setInterval(() => { if (popup && popup.closed) { clearInterval(poll); window.removeEventListener('message', handler); if (!$('cloudSetupModal').classList.contains('hidden')) { nextBtn.disabled = false; nextBtn.textContent = 'Open Dropbox Authorization ↗'; if (status) status.innerHTML = ''; } } }, 1000);
    } catch (e) { toast(e.message, 'error'); nextBtn.disabled = false; nextBtn.textContent = 'Open Dropbox Authorization ↗'; }
    return;
  }

  if (p === 'onedrive' && _cloudSetupStep === 2) {
    const clientId = ($('csOneDriveClientId') || {}).value || '';
    const clientSecret = ($('csOneDriveClientSecret') || {}).value || '';
    if (!clientId.trim()) { toast('Please fill in the Application (Client) ID', 'error'); return; }
    window._csOneDriveClientId = clientId.trim();
    window._csOneDriveClientSecret = clientSecret.trim();
    window._csOneDriveLabel = (($('csOneDriveLabel') || {}).value || '').trim();
  }

  if (p === 'onedrive' && _cloudSetupStep === 3) {
    nextBtn.disabled = true; nextBtn.textContent = 'Opening…';
    try {
      const r = await fetch('/api/cloud/connect/onedrive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: window._csOneDriveClientId, clientSecret: window._csOneDriveClientSecret, label: window._csOneDriveLabel || 'My OneDrive' }) });
      const d = await r.json();
      if (d.error) { toast(d.error, 'error'); nextBtn.disabled = false; nextBtn.textContent = 'Open Microsoft Authorization ↗'; return; }
      const popup = window.open(d.authUrl, 'onedrive_auth', 'width=520,height=640,left=100,top=100');
      const status = $('csOneDriveAuthStatus');
      if (status) status.innerHTML = `<div style="font-size:13px;color:var(--text2)">⏳ Waiting for authorization…</div>`;
      const handler = (e) => {
        if (e.data && String(e.data).startsWith('cloud:success')) {
          window.removeEventListener('message', handler);
          closeCloudSetup();
          toast('OneDrive connected!', 'success');
          loadCloudSection();
        } else if (e.data === 'cloud:error') {
          window.removeEventListener('message', handler);
          if (status) status.innerHTML = `<div style="color:var(--danger);font-size:13px">❌ Authorization failed. Try again.</div>`;
          nextBtn.disabled = false; nextBtn.textContent = 'Open Microsoft Authorization ↗';
        }
      };
      window.addEventListener('message', handler);
      const poll = setInterval(() => { if (popup && popup.closed) { clearInterval(poll); window.removeEventListener('message', handler); if (!$('cloudSetupModal').classList.contains('hidden')) { nextBtn.disabled = false; nextBtn.textContent = 'Open Microsoft Authorization ↗'; if (status) status.innerHTML = ''; } } }, 1000);
    } catch (e) { toast(e.message, 'error'); nextBtn.disabled = false; nextBtn.textContent = 'Open Microsoft Authorization ↗'; }
    return;
  }

  if (p === 'mega' && _cloudSetupStep === 1) {
    const email = ($('csMegaEmail') || {}).value || '';
    const password = ($('csMegaPassword') || {}).value || '';
    if (!email.trim() || !password) { toast('Please enter your MEGA email and password', 'error'); return; }
    nextBtn.disabled = true; nextBtn.textContent = 'Connecting…';
    try {
      const r = await fetch('/api/cloud/connect/mega', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password, label: (($('csMegaLabel') || {}).value || '').trim() || 'My MEGA' }) });
      const d = await r.json();
      if (d.error) { toast(d.error, 'error'); nextBtn.disabled = false; nextBtn.textContent = 'Connect MEGA →'; return; }
      closeCloudSetup();
      toast('MEGA connected!', 'success');
      loadCloudSection();
    } catch (e) { toast(e.message, 'error'); nextBtn.disabled = false; nextBtn.textContent = 'Connect MEGA →'; }
    return;
  }

  // Advance step
  if (_cloudSetupStep < total - 1) {
    _cloudSetupStep++;
    renderCloudSetupStep();
  }
}

function cloudSetupBack() {
  if (_cloudSetupStep > 0) {
    _cloudSetupStep--;
    $('cloudSetupNextBtn').disabled = false;
    renderCloudSetupStep();
  }
}

function closeCloudSetup() {
  $('cloudSetupModal').classList.add('hidden');
  _cloudSetupProvider = null;
  _cloudSetupStep = 0;
}

// ── Cloud browser view ─────────────────────────────────────────────────────
function openCloudBrowser(accountId, acc) {
  _cloudBrowserAccountId = accountId;
  _cloudBrowserStack = [];
  const meta = cloudProviderMeta((acc || {}).provider || '');
  $('cloudBrowserTitle').textContent = (acc && acc.label) ? acc.label : meta.name;
  showView('cloud');
  loadCloudFiles(accountId, '', null);
}

async function loadCloudFiles(accountId, folderPath, folderName) {
  const grid = $('cloudGrid');
  grid.innerHTML = `<div class="loader-wrap"><div class="loader"></div></div>`;

  // Update breadcrumb stack
  if (folderPath === '' || folderPath === null) {
    _cloudBrowserStack = [];
  } else {
    // Check if going back
    const existIdx = _cloudBrowserStack.findIndex(s => s.id === folderPath);
    if (existIdx >= 0) {
      _cloudBrowserStack = _cloudBrowserStack.slice(0, existIdx + 1);
    } else {
      _cloudBrowserStack.push({ id: folderPath, name: folderName || folderPath });
    }
  }
  renderCloudBreadcrumb(accountId);

  try {
    const data = await fetchJson(`/api/cloud/${encodeURIComponent(accountId)}/ls?path=${encodeURIComponent(folderPath || '')}`);
    renderCloudGrid(accountId, data.items || []);
  } catch (e) {
    grid.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">Error: ${escHtml(e.message)}</p></div>`;
  }
}

function renderCloudBreadcrumb(accountId) {
  const bc = $('cloudBreadcrumb');
  if (!bc) return;
  const acc = _cloudAccounts.find(a => a.id === accountId);
  const meta = cloudProviderMeta((acc || {}).provider || '');
  const rootName = (acc && acc.label) ? acc.label : meta.name;
  let html = `<span class="cloud-bc-item" data-cloud-path="" data-cloud-name="">🏠 ${escHtml(rootName)}</span>`;
  for (let i = 0; i < _cloudBrowserStack.length; i++) {
    const s = _cloudBrowserStack[i];
    html += `<span class="cloud-bc-sep">›</span>`;
    if (i === _cloudBrowserStack.length - 1) {
      html += `<span class="cloud-bc-current">${escHtml(s.name)}</span>`;
    } else {
      html += `<span class="cloud-bc-item" data-cloud-path="${escHtml(s.id)}" data-cloud-name="${escHtml(s.name)}">${escHtml(s.name)}</span>`;
    }
  }
  bc.innerHTML = html;
  bc.querySelectorAll('.cloud-bc-item').forEach(el => {
    el.addEventListener('click', () => {
      const p = el.dataset.cloudPath || '';
      const n = el.dataset.cloudName || '';
      if (p === '') {
        _cloudBrowserStack = [];
        renderCloudBreadcrumb(accountId);
        loadCloudFiles(accountId, '', null);
      } else {
        const targetIdx = _cloudBrowserStack.findIndex(s => s.id === p);
        if (targetIdx >= 0) _cloudBrowserStack = _cloudBrowserStack.slice(0, targetIdx + 1);
        renderCloudBreadcrumb(accountId);
        loadCloudFiles(accountId, p, n);
      }
    });
  });
}

function cloudItemCategory(item) {
  const ext = (item.ext || '').toLowerCase();
  if (item.type === 'dir') return 'dir';
  if (item.mimeType) {
    if (item.mimeType.startsWith('image/')) return 'image';
    if (item.mimeType.startsWith('video/')) return 'video';
    if (item.mimeType.startsWith('audio/')) return 'audio';
  }
  if (['.jpg','.jpeg','.png','.gif','.webp','.bmp','.avif','.svg','.heic','.heif'].includes(ext)) return 'image';
  if (['.mp4','.mkv','.avi','.mov','.webm','.m4v','.ts','.flv','.wmv'].includes(ext)) return 'video';
  if (['.mp3','.flac','.wav','.aac','.m4a','.ogg','.opus','.wma'].includes(ext)) return 'audio';
  if (['.zip','.rar','.7z','.tar','.gz','.tgz','.bz2','.xz'].includes(ext)) return 'archive';
  return 'file';
}

function renderCloudGrid(accountId, items) {
  const grid = $('cloudGrid');
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state"><p>This folder is empty</p></div>`;
    return;
  }

  const sorted = [...items].sort((a, b) => {
    if (a.type === 'dir' && b.type !== 'dir') return -1;
    if (a.type !== 'dir' && b.type === 'dir') return 1;
    return a.name.localeCompare(b.name);
  });

  grid.innerHTML = '';
  for (const item of sorted) {
    const el    = document.createElement('div');
    const isDir = item.type === 'dir';
    const ext   = (item.ext || '').toLowerCase();
    const cat   = cloudItemCategory(item);

    // Build a local-compatible fake item so fileThumbHtml / fileVisual work correctly
    const fakeItem = { name: item.name, ext, category: cat, type: item.type, path: '' };

    el.className = 'file-item' + (isDir ? ' dir-item' : '');
    el.dataset.cloudItemId = item.id;

    // Thumbnail HTML — identical structure to createItemEl
    let thumbHtml;
    if (isDir) {
      thumbHtml = `<div class="thumb"><span class="dir-icon">📁</span></div>`;
    } else if (cat === 'image') {
      // Placeholder — real thumbnail injected below
      thumbHtml = `<div class="thumb" style="background:var(--bg3)"></div>`;
    } else {
      thumbHtml = fileThumbHtml(fakeItem);
    }

    const sizeStr = (!isDir && item.size) ? fmtBytes(item.size) : '';

    el.innerHTML = `${thumbHtml}
      <div class="item-info">
        <div class="item-name">${escHtml(item.name)}</div>
        <div class="item-size">${sizeStr}</div>
      </div>`;

    // Inject thumbnail image for image files (uses /thumb — much smaller than full file)
    if (!isDir && cat === 'image') {
      const thumbUrl = item.thumbnailLink
        ? `/api/cloud/${encodeURIComponent(accountId)}/thumb?path=${encodeURIComponent(item.id)}&url=${encodeURIComponent(item.thumbnailLink)}`
        : `/api/cloud/${encodeURIComponent(accountId)}/thumb?path=${encodeURIComponent(item.id)}`;
      const thumbDiv = el.querySelector('.thumb');
      if (thumbDiv) {
        const img = document.createElement('img');
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .25s';
        img.decoding = 'async';
        img.loading = 'lazy';
        img.onload  = () => { img.style.opacity = '1'; };
        img.onerror = () => { img.remove(); };
        img.src = thumbUrl;
        thumbDiv.appendChild(img);
      }
    }

    el.addEventListener('click', () => {
      if (isDir) loadCloudFiles(accountId, item.id, item.name);
      else openCloudFile(accountId, item);
    });

    grid.appendChild(el);
  }
}

function openCloudFile(accountId, item) {
  const fileUrl = `/api/cloud/${encodeURIComponent(accountId)}/file?path=${encodeURIComponent(item.id)}`;
  const ext = (item.ext || '').toLowerCase();
  const cat = item.mimeType ? (item.mimeType.startsWith('video') ? 'video' : item.mimeType.startsWith('audio') ? 'audio' : item.mimeType.startsWith('image') ? 'image' : '') : '';

  const isVideo  = cat === 'video' || ['.mp4','.mkv','.avi','.mov','.webm','.m4v','.ts','.flv'].includes(ext);
  const isAudio  = cat === 'audio' || ['.mp3','.flac','.wav','.aac','.m4a','.ogg','.opus'].includes(ext);
  const isImage  = cat === 'image' || ['.jpg','.jpeg','.png','.gif','.webp','.bmp','.avif','.svg'].includes(ext);
  const isPdf    = ext === '.pdf';
  const isText   = ['.txt','.md','.log','.sbv','.json','.xml','.csv','.sh','.py','.js','.ts','.html','.css'].includes(ext);

  if (isVideo) {
    cloudOpenVideo(item.name, fileUrl);
  } else if (isAudio) {
    const fakeItem = { name: item.name, path: null, category: 'audio', ext, _cloudUrl: fileUrl };
    openAudio(fakeItem, fileUrl, [fakeItem]);
  } else if (isImage) {
    const fakeItem = { name: item.name, path: null, _cloudUrl: fileUrl, category: 'image', ext, size: item.size || 0, sizeStr: item.size ? fmtBytes(item.size) : '' };
    ivOpen([fakeItem], 0, false);
  } else if (isPdf) {
    openPdf({ name: item.name, path: null }, fileUrl);
  } else if (isText) {
    openText({ name: item.name, path: null }, fileUrl);
  } else {
    window.open(fileUrl, '_blank');
  }
}

// ── Cloud video/audio open helpers ────────────────────────────────────────
function cloudOpenVideo(name, url) {
  const vid = $('videoPlayer');
  const modal = $('videoModal');
  if (!vid || !modal) { window.open(url, '_blank'); return; }
  // Build a minimal fake item so the player can display it
  const fakeItem = { name, path: '__cloud__', category: 'video', ext: url.split('.').pop().split('?')[0] };
  // Directly set video source bypassing path-based URL building
  vid.src = url;
  $('vpTitle').textContent = name;
  const dlBtn = $('vpDownloadBtn');
  if (dlBtn) { dlBtn.href = url; dlBtn.download = name; }
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  history.pushState({ lhost: true }, '');
  vid.play().catch(() => {});
}

// ── Cloud settings in settings modal ──────────────────────────────────────
async function loadCloudSettings() {
  const list = $('cloudSettingsAccountsList');
  const sep = $('cloudSettingsSep');
  if (!list) return;
  try {
    const accounts = await fetchJson('/api/cloud/accounts');
    _cloudAccounts = accounts;
    renderSidebarCloud(accounts);
    if (!accounts.length) {
      list.innerHTML = `<div style="font-size:13px;color:var(--text3);padding:6px 0 2px">No cloud accounts connected yet.</div>`;
      if (sep) sep.style.display = 'none';
      return;
    }
    if (sep) sep.style.display = '';
    list.innerHTML = '';
    for (const acc of accounts) {
      const meta = cloudProviderMeta(acc.provider);
      const item = document.createElement('div');
      item.className = 'cloud-st-item';
      item.innerHTML = `
        <div class="cloud-st-icon" style="background:${meta.color}22">${meta.icon}</div>
        <div class="cloud-st-info">
          <div class="cloud-st-name">${escHtml(acc.label || meta.name)}</div>
          <div class="cloud-st-meta">${meta.name}${!acc._own ? ' · Shared' : ''}</div>
        </div>
        <div class="cloud-st-actions">
          ${acc._own ? `<button class="st-mini-btn cloud-st-share-btn" data-id="${acc.id}">Share</button>` : ''}
          ${acc._own ? `<button class="st-mini-btn" style="color:var(--danger)" data-id="${acc.id}" data-action="disconnect">Disconnect</button>` : ''}
        </div>`;
      list.appendChild(item);
    }
    list.querySelectorAll('[data-action="disconnect"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Disconnect ${accounts.find(a => a.id === btn.dataset.id)?.label || 'this account'}?`)) return;
        try {
          await fetch(`/api/cloud/${btn.dataset.id}`, { method: 'DELETE' });
          toast('Account disconnected', 'success');
          loadCloudSettings();
          loadCloudSection();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
    list.querySelectorAll('.cloud-st-share-btn').forEach(btn => {
      btn.addEventListener('click', () => openCloudShareModal(btn.dataset.id, accounts));
    });
  } catch (e) {
    list.innerHTML = `<div style="font-size:13px;color:var(--danger)">Error loading accounts</div>`;
  }

  // Load device name
  try {
    const devices = await fetchJson('/api/cloud/devices');
    const myId = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('hevi_did='));
    if (myId) {
      const did = decodeURIComponent(myId.split('=')[1]);
      const inp = $('cloudDeviceNameInput');
      if (inp && devices[did]) inp.value = devices[did].name || '';
    }
  } catch (_) {}
}

// ── Cloud share modal ──────────────────────────────────────────────────────
async function openCloudShareModal(accountId, accounts) {
  _cloudShareAccountId = accountId;
  const acc = accounts.find(a => a.id === accountId);
  const sw = acc ? (acc.sharedWith || 'none') : 'none';

  // Set radio
  const opts = $('cloudShareOptions');
  if (opts) {
    opts.querySelectorAll('input[name="cloudShare"]').forEach(inp => {
      inp.checked = (inp.value === sw || (inp.value === 'select' && Array.isArray(sw)));
    });
  }
  await loadCloudShareDevices(sw);
  $('cloudShareModal').classList.remove('hidden');
}

async function loadCloudShareDevices(currentSw) {
  const container = $('cloudShareDeviceList');
  if (!container) return;
  try {
    const devices = await fetchJson('/api/cloud/devices');
    const myIdCookie = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('hevi_did='));
    const myDid = myIdCookie ? decodeURIComponent(myIdCookie.split('=')[1]) : '';
    const others = Object.entries(devices).filter(([did]) => did !== myDid);
    if (!others.length) {
      container.innerHTML = `<div style="font-size:12px;color:var(--text3)">No other devices found. Open Hevi Explorer on other devices first.</div>`;
    } else {
      container.innerHTML = others.map(([did, info]) => {
        const checked = Array.isArray(currentSw) && currentSw.includes(did) ? 'checked' : '';
        const dname = escHtml(info.name || (did.slice(0,8) + '…'));
        const dsub  = info.name ? `<span class="csd-id">${escHtml(did.slice(0,10))}</span>` : '';
        return `<label class="cloud-share-device"><input type="checkbox" class="cloud-did-check" data-did="${did}" ${checked}><div class="csd-info"><span class="csd-name">${dname}</span>${dsub}</div></label>`;
      }).join('');
    }
  } catch (_) {}

  // Toggle device list visibility based on radio
  const updateVisibility = () => {
    const val = document.querySelector('input[name="cloudShare"]:checked')?.value || 'none';
    container.classList.toggle('hidden', val !== 'select');
  };
  document.querySelectorAll('input[name="cloudShare"]').forEach(inp => inp.addEventListener('change', updateVisibility));
  updateVisibility();
}

async function saveCloudShare() {
  const val = document.querySelector('input[name="cloudShare"]:checked')?.value || 'none';
  let sharedWith = val;
  if (val === 'select') {
    sharedWith = [...document.querySelectorAll('.cloud-did-check:checked')].map(cb => cb.dataset.did);
  }
  try {
    const r = await fetch(`/api/cloud/${_cloudShareAccountId}/share`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sharedWith }) });
    const d = await r.json();
    if (d.error) { toast(d.error, 'error'); return; }
    $('cloudShareModal').classList.add('hidden');
    toast('Share settings saved', 'success');
    loadCloudSettings();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Event listeners ────────────────────────────────────────────────────────
(function initCloudEvents() {
  // Provider picker
  $('cloudPickerClose')?.addEventListener('click', closeCloudPicker);
  $('cloudPickerBackdrop')?.addEventListener('click', closeCloudPicker);
  document.querySelectorAll('[data-provider]').forEach(btn => {
    btn.addEventListener('click', () => openCloudSetup(btn.dataset.provider));
  });

  // Cloud setup modal
  $('cloudSetupClose')?.addEventListener('click', closeCloudSetup);
  $('cloudSetupBackdrop')?.addEventListener('click', closeCloudSetup);
  $('cloudSetupNextBtn')?.addEventListener('click', cloudSetupNext);
  $('cloudSetupBackBtn')?.addEventListener('click', cloudSetupBack);

  // Cloud manage button on home
  $('cloudManageBtn')?.addEventListener('click', () => {
    // Open settings modal on cloud section
    closeModal && closeModal('settingsModal'); // ensure closed
    $('settingsModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const el = $('cloudSettingsGroup');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
    loadCloudSettings();
  });

  // Cloud settings add button
  $('cloudSettingsAddBtn')?.addEventListener('click', openCloudPicker);

  // Cloud browser back button
  $('cloudBrowserBackBtn')?.addEventListener('click', () => {
    if (_cloudBrowserStack.length > 0) {
      const parent = _cloudBrowserStack.length > 1 ? _cloudBrowserStack[_cloudBrowserStack.length - 2] : null;
      _cloudBrowserStack.pop();
      const path = parent ? parent.id : '';
      const name = parent ? parent.name : null;
      loadCloudFiles(_cloudBrowserAccountId, path, name);
    } else {
      loadHome();
    }
  });

  // Device name save
  $('cloudDeviceNameSaveBtn')?.addEventListener('click', async () => {
    const name = ($('cloudDeviceNameInput') || {}).value || '';
    try {
      await fetch('/api/cloud/device/name', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      toast('Device name saved', 'success');
    } catch (e) { toast(e.message, 'error'); }
  });

  // Cloud share modal
  $('cloudShareBackdrop')?.addEventListener('click', () => $('cloudShareModal').classList.add('hidden'));
  $('cloudShareCancelBtn')?.addEventListener('click', () => $('cloudShareModal').classList.add('hidden'));
  $('cloudShareSaveBtn')?.addEventListener('click', saveCloudShare);
})();

// ── Hook into settings modal open ─────────────────────────────────────────
['navSettings', 'sbSettings'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('click', () => loadCloudSettings(), { capture: false });
});

// Load cloud section on initial home load
loadCloudSection();

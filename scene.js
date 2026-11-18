// Secular Solstice: shared script for every version of the page.
// Plays the fire video once (invisibly) and paints each frame into every fire canvas,
// placed so each canvas covers the whole screen; measures the fire's brightness for the
// torch flicker; and builds the tuning panel when the address has ?tune.

(function () {
  const root = document.documentElement;
  const scene = document.querySelector('.scene');
  const isStatic = root.dataset.version === 'static';
  let fireSpeed = 0.5;   // 0.5 = half speed

  // ---------- Star threshold: stars only appear where the fire is bright enough ----------
  // Light below the threshold -> 0, a little above it -> full brightness.
  let starThreshold = 0.6;
  const STEEP = 8;
  function setStarThreshold(t) {
    starThreshold = t;
    for (const f of document.querySelectorAll('#star-threshold feFuncR, #star-threshold feFuncG, #star-threshold feFuncB')) {
      f.setAttribute('slope', STEEP);
      f.setAttribute('intercept', (-STEEP * t).toFixed(3));
    }
  }
  setStarThreshold(starThreshold);

  // ---------- Which title (1 or 2), remembered in the address as ?title=2 ----------
  let relayout = () => {};          // replaced below once the fire canvases exist
  const params = new URLSearchParams(location.search);
  function setTitle(n) {
    root.dataset.title = n;
    for (const b of document.querySelectorAll('.title-switch button')) {
      b.setAttribute('aria-pressed', String(b.dataset.title === n));
    }
    const p = new URLSearchParams(location.search);
    if (n === '1') p.delete('title'); else p.set('title', n);
    const q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
    relayout();
  }
  setTitle(params.get('title') === '2' ? '2' : '1');
  for (const b of document.querySelectorAll('.title-switch button')) {
    b.addEventListener('click', () => setTitle(b.dataset.title));
  }

  // ---------- Home / Program (address ends in #program for the program page) ----------
  function setPage() {
    const page = location.hash === '#program' ? 'program' : 'home';
    root.dataset.page = page;
    for (const a of document.querySelectorAll('.menu a[data-page]')) {
      if (a.dataset.page === page) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }
  setPage();
  addEventListener('hashchange', setPage);

  if (isStatic) { buildTuning(); return; }

  // ---------- The fire video ----------
  const video = document.createElement('video');
  video.muted = true; video.loop = true; video.playsInline = true; video.autoplay = true;
  video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
  // Kept "rendered" but invisible: some browsers stop decoding display:none videos.
  Object.assign(video.style, { position: 'fixed', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none', left: '0', top: '0' });
  for (const [src, type] of [['fire.webm', 'video/webm'], ['fire-small.mp4', 'video/mp4']]) {
    const s = document.createElement('source'); s.src = src; s.type = type; video.appendChild(s);
  }
  document.body.appendChild(video);
  const setSpeed = () => { video.defaultPlaybackRate = fireSpeed; video.playbackRate = fireSpeed; };
  setSpeed();
  video.addEventListener('loadedmetadata', setSpeed);
  const kick = () => { if (video.paused) video.play().catch(() => {}); };
  kick();
  document.addEventListener('visibilitychange', kick);
  document.addEventListener('pointerdown', kick, { once: true });

  // ---------- Fire canvases: each one covers the whole screen ----------
  const canvases = [...document.querySelectorAll('canvas.fire')].map(c => [c, c.getContext('2d')]);
  const master = document.createElement('canvas');
  const mg = master.getContext('2d');
  function layout() {
    const s = scene.getBoundingClientRect();
    master.width = 480;
    master.height = Math.max(1, Math.min(1400, Math.round(480 * s.height / s.width)));
    for (const [c] of canvases) {
      const p = c.parentElement.getBoundingClientRect();
      c.width = master.width; c.height = master.height;
      Object.assign(c.style, {
        left: (s.left - p.left) + 'px', top: (s.top - p.top) + 'px',
        width: s.width + 'px', height: s.height + 'px',
      });
    }
  }
  relayout = () => { layout(); lastTime = -1; };
  layout();
  addEventListener('resize', relayout);
  addEventListener('load', relayout);           // images/fonts loaded: boxes may have moved
  if (document.fonts) document.fonts.ready.then(relayout);

  // ---------- Paint each frame + measure the flicker ----------
  const probe = document.createElement('canvas'); probe.width = 8; probe.height = 4;
  const pg = probe.getContext('2d', { willReadFrequently: true });
  let fl = 0.5, fr = 0.5;
  // Stretch each side's brightness to 0..1 using its own recent darkest/brightest values,
  // so both torches flicker fully whatever part of the fire they follow.
  const range = () => ({ lo: 1, hi: 0 });
  const rl = range(), rr = range();
  function norm(r, v) {
    r.lo = Math.min(v, r.lo + 0.002); r.hi = Math.max(v, r.hi - 0.002);
    return r.hi - r.lo < 0.02 ? 0.5 : (v - r.lo) / (r.hi - r.lo);
  }
  // Runs every screen refresh; only does work when the video has moved on to a new frame.
  // (Not requestVideoFrameCallback: some browsers never fire it for an invisible video.)
  let lastTime = -1;
  function paint() {
    requestAnimationFrame(paint);
    if (video.readyState >= 2 && video.videoWidth && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      // Scale the video to cover the screen, keeping its bottom edge (where the fire is).
      const vw = video.videoWidth, vh = video.videoHeight, A = master.width / master.height;
      let sx = 0, sy = 0, sw = vw, sh = vh;
      if (A > vw / vh) { sh = vw / A; sy = vh - sh; } else { sw = vh * A; sx = (vw - sw) / 2; }
      mg.drawImage(video, sx, sy, sw, sh, 0, 0, master.width, master.height);
      for (const [, g] of canvases) g.drawImage(master, 0, 0);

      pg.drawImage(video, 0, 0, 8, 4);
      const d = pg.getImageData(0, 0, 8, 4).data;
      let l = 0, r = 0;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) {
        const i = (y * 8 + x) * 4, v = (d[i] + d[i + 1] + d[i + 2]) / 765;
        if (x < 4) l += v; else r += v;
      }
      fl += (norm(rl, l / 16) - fl) * 0.4;
      fr += (norm(rr, r / 16) - fr) * 0.4;
      root.style.setProperty('--flick-l', fl.toFixed(3));
      root.style.setProperty('--flick-r', fr.toFixed(3));
    }
  }
  paint();

  buildTuning();

  // ---------- Tuning panel (only with ?tune in the address) ----------
  function buildTuning() {
    if (!/[?&]tune\b/.test(location.search)) return;
    const rows = [
      ['Background glow', '--glow-amt', 0, 1, 0.05],
      ['Visible flames', '--flame-amt', 0, 1, 0.05],
      ['Torch glow', '--torch-amt', 0, 1, 0.05],
      ['Text opacity', '--text-opacity', 0, 1, 0.05],
      ['Fire reach', '--fire-boost', 0.5, 4, 0.1],
      ['Sky without fire', '--sky-base', 0, 1, 0.05],
      ['Stars without fire', '--stars-base', 0, 1, 0.05],
      ['Star threshold', 'star', 0.2, 1.2, 0.05],
      ['Fire speed', 'speed', 0.25, 1, 0.05],
      ['Text size', '--text-width', 15, 80, 0.1, 'vw'],
    ];
    const panel = document.createElement('div');
    panel.className = 'tuning';
    for (const [label, key, min, max, step, unit = ''] of rows) {
      const l = document.createElement('label'); l.textContent = label;
      const i = document.createElement('input'); Object.assign(i, { type: 'range', min, max, step });
      const o = document.createElement('span');
      i.value = key === 'star' ? starThreshold : key === 'speed' ? fireSpeed
        : parseFloat(getComputedStyle(root).getPropertyValue(key));
      o.textContent = i.value;
      i.addEventListener('input', () => {
        o.textContent = i.value;
        if (key === 'star') setStarThreshold(+i.value);
        else if (key === 'speed') { if (!isStatic) { fireSpeed = +i.value; setSpeed(); } }
        else { root.style.setProperty(key, i.value + unit); relayout(); }
      });
      panel.append(l, i, o);
    }
    document.body.appendChild(panel);
  }
})();

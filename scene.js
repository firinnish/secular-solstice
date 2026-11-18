// Secular Solstice: page script.
// - Style switcher (Glow / Fire / Static) and title switcher (Title 1 / Title 2), both
//   remembered in the address (?style=fire&title=2) so a link opens on the same choice.
// - Home / Program (address ends in #program).
// - Plays the fire video once (invisibly) and paints each frame into every fire canvas,
//   placed so each canvas covers the whole screen; measures the fire's brightness for the
//   torch flicker. Static style stops the video.
// - Tuning sliders when the address has ?tune.

(function () {
  const root = document.documentElement;
  const scene = document.querySelector('.scene');
  const STYLES = ['glow', 'fire', 'glow2', 'static'];
  let fireSpeed = 0.5;   // 0.5 = half speed
  // Glow 2 only: where the fire starts (share of screen height from the top), how far it
  // takes to fade in, and how much it's squashed vertically (1 = not squashed).
  let fireTop = 0.25, fireFade = 0.15, squashBy = 1.6;

  // ---------- Star threshold: stars only appear where the fire is bright enough ----------
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

  // ---------- Remember choices in the address ----------
  function setParam(key, value, isDefault) {
    const p = new URLSearchParams(location.search);
    if (isDefault) p.delete(key); else p.set(key, value);
    const q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }
  function press(group, attr, value) {
    for (const b of document.querySelectorAll(group + ' button')) {
      b.setAttribute('aria-pressed', String(b.dataset[attr] === value));
    }
  }
  const params = new URLSearchParams(location.search);

  // ---------- Title 1 / Title 2 ----------
  function setTitle(n) {
    root.dataset.title = n;
    press('.title-switch', 'title', n);
    setParam('title', n, n === '1');
    relayout();
  }

  // ---------- Glow / Fire / Glow 2 / Static ----------
  // auto = switched by the page itself (fire couldn't load), so don't change the address.
  function setStyle(s, auto) {
    root.dataset.version = s;
    press('.style-switch', 'style', s);
    if (!auto) setParam('style', s, s === 'glow');
    if (s === 'static') { if (video) video.pause(); }
    else {
      startFire(); kick();
      if (!gotFrame && !auto) { clearTimeout(fallbackTimer); fallbackTimer = setTimeout(fireFailed, 8000); }
    }
    relayout();
  }

  // If the fire can't load (blocked by an ad blocker, autoplay refused, very slow
  // connection...), fall back to Static instead of showing a half-working page.
  let gotFrame = false, fallbackTimer = null;
  function fireFailed() {
    if (gotFrame || root.dataset.version === 'static') return;
    root.dataset.fireFailed = 'true';
    setStyle('static', true);
  }

  // ---------- Home / Program ----------
  function setPage() {
    const page = location.hash === '#program' ? 'program' : 'home';
    root.dataset.page = page;
    for (const a of document.querySelectorAll('.menu a[data-page]')) {
      if (a.dataset.page === page) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }

  // ---------- The fire (created the first time a moving style is shown) ----------
  let video = null, layout = () => {}, lastTime = -1;
  const relayout = () => { fitMenu(); layout(); lastTime = -1; };

  // Menu split around the "t" tail if both halves fit on screen; otherwise a wrapped row.
  const menu = document.querySelector('.menu');
  function fitMenu() {
    menu.classList.remove('wrap');
    const margin = 8;
    const l = menu.querySelector('.left').getBoundingClientRect();
    const r = menu.querySelector('.right').getBoundingClientRect();
    if (l.left < margin || r.right > innerWidth - margin) menu.classList.add('wrap');
  }
  addEventListener('resize', relayout);
  addEventListener('load', relayout);             // images/fonts loaded: boxes may have moved
  if (document.fonts) document.fonts.ready.then(relayout);
  const kick = () => { if (video && video.paused && root.dataset.version !== 'static') video.play().catch(() => {}); };

  function startFire() {
    if (video) return;
    video = document.createElement('video');
    video.muted = true; video.loop = true; video.playsInline = true; video.autoplay = true;
    video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
    // Kept "rendered" but invisible: some browsers stop decoding display:none videos.
    Object.assign(video.style, { position: 'fixed', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none', left: '0', top: '0' });
    const sources = [['fire.webm', 'video/webm'], ['fire-small.mp4', 'video/mp4']].map(([src, type]) => {
      const s = document.createElement('source'); s.src = src; s.type = type; video.appendChild(s); return s;
    });
    // Every source failed (e.g. blocked): give up right away. Otherwise give it 8 seconds.
    sources[sources.length - 1].addEventListener('error', fireFailed);
    video.addEventListener('error', fireFailed);
    fallbackTimer = setTimeout(fireFailed, 8000);
    document.body.appendChild(video);
    const setSpeed = () => { video.defaultPlaybackRate = fireSpeed; video.playbackRate = fireSpeed; };
    setSpeed();
    video.addEventListener('loadedmetadata', setSpeed);
    video.setSpeed = setSpeed;
    document.addEventListener('visibilitychange', kick);
    document.addEventListener('pointerdown', kick);

    // Fire canvases: each one covers the whole screen, wherever its parent box is.
    const canvases = [...document.querySelectorAll('canvas.fire')].map(c => [c, c.getContext('2d')]);
    const master = document.createElement('canvas');
    const mg = master.getContext('2d');
    layout = function () {
      const s = scene.getBoundingClientRect();
      master.width = 480;
      master.height = Math.max(1, Math.min(1400, Math.round(480 * s.height / s.width)));
      for (const [c] of canvases) {
        const p = c.parentElement.getBoundingClientRect();
        if (!p.width && !p.height) continue;          // hidden right now (e.g. the other title)
        c.width = master.width; c.height = master.height;
        Object.assign(c.style, {
          left: (s.left - p.left) + 'px', top: (s.top - p.top) + 'px',
          width: s.width + 'px', height: s.height + 'px',
        });
      }
    };
    layout();

    // Paint each frame + measure the flicker.
    const probe = document.createElement('canvas'); probe.width = 8; probe.height = 4;
    const pg = probe.getContext('2d', { willReadFrequently: true });
    let fl = 0.5, fr = 0.5;
    // Stretch each side's brightness to 0..1 using its own recent darkest/brightest values.
    const rl = { lo: 1, hi: 0 }, rr = { lo: 1, hi: 0 };
    function norm(r, v) {
      r.lo = Math.min(v, r.lo + 0.002); r.hi = Math.max(v, r.hi - 0.002);
      return r.hi - r.lo < 0.02 ? 0.5 : (v - r.lo) / (r.hi - r.lo);
    }
    // Runs every screen refresh; only does work when the video has moved on to a new frame.
    // (Not requestVideoFrameCallback: some browsers never fire it for an invisible video.)
    function paint() {
      requestAnimationFrame(paint);
      if (video.readyState >= 2 && video.videoWidth && video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        if (!gotFrame) { gotFrame = true; clearTimeout(fallbackTimer); delete root.dataset.fireFailed; }
        const MW = master.width, MH = master.height;
        // Glow 2: the fire is squashed into the lower part of the screen (from fireTop down)
        // and fades to black over the next fireFade, so it never reaches the sky.
        const squash = root.dataset.version === 'glow2';
        const top = squash ? fireTop * MH : 0, DH = MH - top;
        // Scale the video to cover that area, keeping its bottom edge (where the fire is).
        // (Squashing = taking a taller slice of video than the area's shape and fitting it in.)
        const vw = video.videoWidth, vh = video.videoHeight, A = MW / (squash ? DH * squashBy : MH);
        let sx = 0, sy = 0, sw = vw, sh = vh;
        if (A > vw / vh) { sh = vw / A; sy = vh - sh; } else { sw = vh * A; sx = (vw - sw) / 2; }
        mg.fillStyle = '#000'; mg.fillRect(0, 0, MW, MH);
        mg.drawImage(video, sx, sy, sw, sh, 0, top, MW, DH);
        if (squash) {
          const fade = mg.createLinearGradient(0, top, 0, top + fireFade * MH);
          fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
          mg.fillStyle = fade; mg.fillRect(0, top, MW, fireFade * MH);
        }
        for (const [, g] of canvases) g.drawImage(master, 0, 0);

        pg.drawImage(video, 0, 0, 8, 4);
        let d;
        try { d = pg.getImageData(0, 0, 8, 4).data; } catch (e) { return; }   // some privacy tools block this
        let l = 0, r = 0;
        for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) {
          const i = (y * 8 + x) * 4, v = (d[i] + d[i + 1] + d[i + 2]) / 765;
          if (x < 4) l += v; else r += v;
        }
        fl += (norm(rl, l / 16) - fl) * 0.4;
        fr += (norm(rr, r / 16) - fr) * 0.4;
        root.style.setProperty('--flick-l', fl.toFixed(3));
        root.style.setProperty('--flick-r', fr.toFixed(3));
        root.style.setProperty('--flick', ((fl + fr) / 2).toFixed(3));
      }
    }
    paint();
  }

  // ---------- Start up ----------
  setPage();
  addEventListener('hashchange', setPage);
  // The page's HTML says "static" so it looks right even if this script never runs;
  // the script then switches to the chosen style (Glow unless the address says otherwise).
  const startStyle = STYLES.includes(params.get('style')) ? params.get('style') : 'glow';
  setStyle(startStyle);
  setTitle(params.get('title') === '2' ? '2' : '1');
  for (const b of document.querySelectorAll('.title-switch button')) b.addEventListener('click', () => setTitle(b.dataset.title));
  for (const b of document.querySelectorAll('.style-switch button')) b.addEventListener('click', () => setStyle(b.dataset.style));
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
      ['Glow 2: fire top', 'fireTop', 0, 0.7, 0.01],
      ['Glow 2: fade', 'fireFade', 0, 0.5, 0.01],
      ['Glow 2: squash', 'squashBy', 1, 3, 0.05],
      ['Text size', '--text-width', 15, 80, 0.1, 'vw'],
    ];
    const panel = document.createElement('div');
    panel.className = 'tuning';
    for (const [label, key, min, max, step, unit = ''] of rows) {
      const l = document.createElement('label'); l.textContent = label;
      const i = document.createElement('input'); Object.assign(i, { type: 'range', min, max, step });
      const o = document.createElement('span');
      const glow2 = { fireTop: () => fireTop, fireFade: () => fireFade, squashBy: () => squashBy };
      i.value = key === 'star' ? starThreshold : key === 'speed' ? fireSpeed
        : glow2[key] ? glow2[key]() : parseFloat(getComputedStyle(root).getPropertyValue(key));
      o.textContent = i.value;
      i.addEventListener('input', () => {
        o.textContent = i.value;
        if (key === 'fireTop') { fireTop = +i.value; lastTime = -1; }
        else if (key === 'fireFade') { fireFade = +i.value; lastTime = -1; }
        else if (key === 'squashBy') { squashBy = +i.value; lastTime = -1; }
        else if (key === 'star') setStarThreshold(+i.value);
        else if (key === 'speed') { fireSpeed = +i.value; if (video) video.setSpeed(); }
        else { root.style.setProperty(key, i.value + unit); relayout(); }
      });
      panel.append(l, i, o);
    }
    document.body.appendChild(panel);
  }
})();

/* ============================================================
   Regen Studio — Trial / Showcase Page
   Vanilla JS: Polygon Animations & Interactions
   ============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     Brand Palette
     ---------------------------------------------------------- */
  const PALETTE = {
    navy:    ['#243644','#C4D3DE','#8CA9BF','#5781A1','#1B2833'],
    magenta: ['#93093F','#FDB6D2','#FB72A6','#F6347E','#6A072F'],
    red:     ['#E71846','#FCCAD6','#F898AE','#F36988','#A51333'],
    orange:  ['#FFA92D','#FFEEC8','#FFDC96','#FFCB68','#B97A21'],
    green:   ['#65DD35','#DFFACA','#C0F798','#A1F36B','#4B9F27'],
    emerald: ['#00914B','#AFF9D7','#61F4B2','#00EE8E','#006937'],
    teal:    ['#009BBB','#BBF0F8','#79E1F3','#33D2ED','#007086'],
  };

  const ALL_COLORS = Object.values(PALETTE).flat();
  const VIBRANT = ['#009BBB','#00914B','#65DD35','#FFA92D','#E71846','#93093F',
                   '#33D2ED','#00EE8E','#A1F36B','#FFCB68','#F36988','#F6347E',
                   '#FB72A6','#79E1F3','#61F4B2','#C0F798','#FFDC96','#F898AE'];

  /* Spectrum order for wave section */
  const SPECTRUM = [
    '#004956','#007086','#009BBB','#33D2ED','#79E1F3',
    '#004426','#006937','#00914B','#00EE8E','#61F4B2',
    '#32651A','#4B9F27','#65DD35','#A1F36B','#C0F798',
    '#754F15','#B97A21','#FFA92D','#FFCB68','#FFDC96',
    '#690E23','#A51333','#E71846','#F36988','#F898AE',
    '#450520','#6A072F','#93093F','#F6347E','#FB72A6',
  ];

  /* ----------------------------------------------------------
     Utilities
     ---------------------------------------------------------- */
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
  function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
  function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  function rgbToString(r, g, b, a) {
    return a !== undefined ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
  }

  /* Debounce for resize */
  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /* Device pixel ratio helper */
  function dpr() { return Math.min(window.devicePixelRatio || 1, 2); }

  /* Is touch device */
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  /* ----------------------------------------------------------
     Mouse / Touch Tracking
     ---------------------------------------------------------- */
  const mouse = { x: -9999, y: -9999, clientX: -9999, clientY: -9999 };

  function onPointerMove(e) {
    const ev = e.touches ? e.touches[0] : e;
    mouse.x = ev.pageX;
    mouse.y = ev.pageY;
    mouse.clientX = ev.clientX;
    mouse.clientY = ev.clientY;
  }

  window.addEventListener('mousemove', onPointerMove, { passive: true });
  window.addEventListener('touchmove', onPointerMove, { passive: true });

  /* ----------------------------------------------------------
     Navigation: Active section tracking & scroll
     ---------------------------------------------------------- */
  function initNav() {
    const nav = document.getElementById('trialNav');
    const links = nav.querySelectorAll('.trial-nav__link');
    const sections = ['hero', 'mosaic', 'grid', 'reveal', 'wave', 'gallery'];
    const sectionEls = sections.map(id => document.getElementById(id));

    function update() {
      const scrollY = window.scrollY;
      nav.classList.toggle('scrolled', scrollY > 60);

      let current = 0;
      sectionEls.forEach((el, i) => {
        if (el && scrollY >= el.offsetTop - window.innerHeight * 0.4) {
          current = i;
        }
      });

      links.forEach((link, i) => {
        link.classList.toggle('active', i === current);
      });
    }

    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* ----------------------------------------------------------
     Section Header Scroll Animations
     ---------------------------------------------------------- */
  function initScrollAnimations() {
    const targets = document.querySelectorAll('.section-label, .section-title, .section-desc, .gallery-card');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

    targets.forEach(el => observer.observe(el));
  }

  /* ----------------------------------------------------------
     Section 1: Hero — Background Triangle Grid
     ---------------------------------------------------------- */
  function initHeroGrid() {
    const container = document.getElementById('heroGrid');
    if (!container) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const size = 60;
    const cols = Math.ceil(w / size) + 1;
    const rows = Math.ceil(h / (size * 0.866)) + 1;

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.style.position = 'absolute';
    svg.style.inset = '0';

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * size + (row % 2 ? size / 2 : 0);
        const y = row * size * 0.866;
        const flipped = (col + row) % 2 === 0;

        const poly = document.createElementNS(svgNS, 'polygon');
        let points;
        if (flipped) {
          points = `${x},${y} ${x + size},${y} ${x + size / 2},${y + size * 0.866}`;
        } else {
          points = `${x + size / 2},${y} ${x + size},${y + size * 0.866} ${x},${y + size * 0.866}`;
        }
        poly.setAttribute('points', points);
        poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', '#C4D3DE');
        poly.setAttribute('stroke-width', '0.5');
        poly.setAttribute('opacity', rand(0.15, 0.4).toFixed(2));
        svg.appendChild(poly);
      }
    }

    container.appendChild(svg);
  }

  /* ----------------------------------------------------------
     Section 1: Hero — Floating Polygons (Parallax)
     ---------------------------------------------------------- */
  function initHeroPolygons() {
    const container = document.getElementById('heroPolygons');
    if (!container) return;

    const count = Math.min(55, Math.floor(window.innerWidth / 25));
    const polygons = [];

    for (let i = 0; i < count; i++) {
      const size = rand(12, 120);
      const color = pick(VIBRANT);
      const opacity = size > 60 ? rand(0.06, 0.18) : rand(0.15, 0.55);
      const depth = rand(0.2, 1); // parallax depth
      const speed = rand(15, 60); // animation duration (s)
      const rotation = rand(0, 360);
      const vertices = pick([3, 3, 3, 3, 4, 5, 6]); // mostly triangles

      const el = document.createElement('div');
      el.className = 'hero-polygon' + (size > 30 ? ' hero-polygon--interactive' : '');

      // Build SVG triangle/polygon
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
      svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
      svg.style.overflow = 'visible';

      const poly = document.createElementNS(svgNS, 'polygon');
      let points = [];
      for (let v = 0; v < vertices; v++) {
        const angle = (Math.PI * 2 * v) / vertices - Math.PI / 2;
        const r = size / 2 * rand(0.8, 1);
        points.push(`${size / 2 + r * Math.cos(angle)},${size / 2 + r * Math.sin(angle)}`);
      }
      poly.setAttribute('points', points.join(' '));
      poly.setAttribute('fill', color);
      poly.setAttribute('opacity', opacity.toFixed(2));
      svg.appendChild(poly);
      el.appendChild(svg);

      const x = rand(-5, 105);
      const y = rand(-5, 105);

      el.style.left = x + '%';
      el.style.top = y + '%';
      el.style.transform = `rotate(${rotation}deg)`;
      el.style.animation = `float ${speed}s ${rand(0, speed)}s ease-in-out infinite`;

      container.appendChild(el);
      polygons.push({ el, depth, x, y, baseRotation: rotation });
    }

    // Parallax on mouse move
    let ticking = false;
    function updateParallax() {
      const cx = mouse.clientX;
      const cy = mouse.clientY;
      const hw = window.innerWidth / 2;
      const hh = window.innerHeight / 2;
      const dx = (cx - hw) / hw;
      const dy = (cy - hh) / hh;

      polygons.forEach(p => {
        const moveX = dx * 40 * p.depth;
        const moveY = dy * 30 * p.depth;
        p.el.style.transform = `translate(${moveX}px, ${moveY}px) rotate(${p.baseRotation + dx * 10 * p.depth}deg)`;
      });
      ticking = false;
    }

    window.addEventListener('mousemove', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateParallax);
      }
    }, { passive: true });
  }

  /* ----------------------------------------------------------
     Section 2: Polygon Mosaic
     ---------------------------------------------------------- */
  function initMosaic() {
    const svg = document.getElementById('mosaicSvg');
    if (!svg) return;

    const svgNS = 'http://www.w3.org/2000/svg';
    const W = 1200;
    const H = 500;
    const triSize = 40;
    const triHeight = triSize * 0.866;
    const cols = Math.ceil(W / triSize) + 2;
    const rows = Math.ceil(H / triHeight) + 2;

    const triangles = [];

    // Color zones: left=teal/emerald, center=green/orange, right=red/magenta
    function getZoneColor(x, y) {
      const nx = x / W;
      const ny = y / H;

      // Create a landscape-like gradient
      if (ny > 0.75) {
        // Ground — dark navies and emeralds
        return pick([...PALETTE.navy.slice(0, 2), ...PALETTE.emerald.slice(3, 5)]);
      }
      if (ny > 0.5) {
        // Mid — greens and teals
        return pick([...PALETTE.green, ...PALETTE.emerald, ...PALETTE.teal]);
      }
      if (ny > 0.25) {
        // Horizon — oranges and reds
        if (nx < 0.3) return pick(PALETTE.teal);
        if (nx < 0.6) return pick([...PALETTE.orange, ...PALETTE.green]);
        return pick([...PALETTE.red, ...PALETTE.magenta]);
      }
      // Sky — lighter tones
      if (nx < 0.4) return pick([PALETTE.teal[1], PALETTE.teal[2], PALETTE.emerald[1]]);
      if (nx < 0.7) return pick([PALETTE.orange[1], PALETTE.orange[2], PALETTE.green[1]]);
      return pick([PALETTE.red[1], PALETTE.magenta[1], PALETTE.magenta[2]]);
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Two triangles per cell (up and down)
        for (let flip = 0; flip < 2; flip++) {
          const x = col * triSize + (row % 2 ? triSize / 2 : 0);
          const y = row * triHeight;

          let points;
          if (flip === 0) {
            // Upward triangle
            points = `${x},${y + triHeight} ${x + triSize / 2},${y} ${x + triSize},${y + triHeight}`;
          } else {
            // Downward triangle
            points = `${x + triSize / 2},${y} ${x + triSize},${y + triHeight} ${x},${y + triHeight}`;
          }

          const cx = x + triSize / 2;
          const cy = y + triHeight / 2;

          // Skip if outside viewBox
          if (cx < -triSize || cx > W + triSize || cy < -triHeight || cy > H + triHeight) continue;

          const color = getZoneColor(cx, cy);

          const poly = document.createElementNS(svgNS, 'polygon');
          poly.setAttribute('points', points);
          poly.setAttribute('fill', color);
          poly.style.transformOrigin = `${cx}px ${cy}px`;
          poly.style.transform = 'scale(0) rotate(120deg)';

          // Distance from center for stagger
          const distFromCenter = dist(cx, cy, W / 2, H / 2);
          poly.dataset.delay = (distFromCenter / 800).toFixed(3);

          svg.appendChild(poly);
          triangles.push(poly);
        }
      }
    }

    // IntersectionObserver for scroll trigger
    let animated = false;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !animated) {
          animated = true;
          animateMosaic(triangles);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });

    observer.observe(svg);
  }

  function animateMosaic(triangles) {
    triangles.forEach(poly => {
      const delay = parseFloat(poly.dataset.delay) * 1000;
      setTimeout(() => {
        poly.classList.add('mosaic-visible');
        poly.style.transform = 'scale(1) rotate(0deg)';
      }, delay);
    });
  }

  /* ----------------------------------------------------------
     Section 3: Interactive Polygon Grid (Canvas)
     ---------------------------------------------------------- */
  function initInteractiveGrid() {
    const container = document.getElementById('gridContainer');
    const canvas = document.getElementById('gridCanvas');
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    let W, H, triangles, cols, rows;
    const triSize = 38;

    function setup() {
      const rect = container.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = W * dpr();
      canvas.height = H * dpr();
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);

      const triH = triSize * 0.866;
      cols = Math.ceil(W / triSize) + 2;
      rows = Math.ceil(H / triH) + 2;

      triangles = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          for (let flip = 0; flip < 2; flip++) {
            const x = col * triSize + (row % 2 ? triSize / 2 : 0);
            const y = row * triH;

            const cx = x + triSize / 2;
            const cy = y + triH / (flip === 0 ? 3 : 1.5);

            const baseColor = hexToRgb(pick(VIBRANT));
            const hoverColor = hexToRgb(pick(VIBRANT));

            triangles.push({
              x, y, cx, cy, flip,
              size: triSize,
              baseColor,
              hoverColor,
              currentR: baseColor.r,
              currentG: baseColor.g,
              currentB: baseColor.b,
              scale: 1,
              targetScale: 1,
              rotation: 0,
              targetRotation: 0,
              baseOpacity: rand(0.12, 0.25),
              opacity: rand(0.12, 0.25),
              targetOpacity: rand(0.12, 0.25),
            });
          }
        }
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Get mouse position relative to canvas
      const rect = container.getBoundingClientRect();
      const mx = mouse.clientX - rect.left;
      const my = mouse.clientY - rect.top;
      const mouseInside = mx >= 0 && mx <= W && my >= 0 && my <= H;

      const influenceRadius = 180;
      const triH = triSize * 0.866;

      for (let i = 0; i < triangles.length; i++) {
        const t = triangles[i];

        // Calculate distance to mouse
        const d = mouseInside ? dist(t.cx, t.cy, mx, my) : 9999;
        const influence = mouseInside ? Math.max(0, 1 - d / influenceRadius) : 0;

        // Update targets based on influence
        t.targetScale = 1 + influence * 0.8;
        t.targetRotation = influence * 25 * (t.flip === 0 ? 1 : -1);
        t.targetOpacity = t.baseOpacity + influence * 0.65;

        // Lerp towards targets
        t.scale = lerp(t.scale, t.targetScale, 0.12);
        t.rotation = lerp(t.rotation, t.targetRotation, 0.1);
        t.opacity = lerp(t.opacity, t.targetOpacity, 0.1);

        // Color lerp
        t.currentR = Math.round(lerp(t.currentR, influence > 0.1 ? t.hoverColor.r : t.baseColor.r, 0.08));
        t.currentG = Math.round(lerp(t.currentG, influence > 0.1 ? t.hoverColor.g : t.baseColor.g, 0.08));
        t.currentB = Math.round(lerp(t.currentB, influence > 0.1 ? t.hoverColor.b : t.baseColor.b, 0.08));

        // Draw
        ctx.save();
        ctx.translate(t.cx, t.cy);
        ctx.rotate(t.rotation * Math.PI / 180);
        ctx.scale(t.scale, t.scale);
        ctx.globalAlpha = t.opacity;

        ctx.beginPath();
        if (t.flip === 0) {
          ctx.moveTo(0, -triH / 3 * 2);
          ctx.lineTo(triSize / 2, triH / 3);
          ctx.lineTo(-triSize / 2, triH / 3);
        } else {
          ctx.moveTo(0, triH / 3 * 2);
          ctx.lineTo(triSize / 2, -triH / 3);
          ctx.lineTo(-triSize / 2, -triH / 3);
        }
        ctx.closePath();

        ctx.fillStyle = rgbToString(t.currentR, t.currentG, t.currentB);
        ctx.fill();

        // Subtle edge highlight when hovered
        if (influence > 0.3) {
          ctx.strokeStyle = `rgba(255,255,255,${influence * 0.3})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }

        ctx.restore();
      }

      requestAnimationFrame(draw);
    }

    setup();
    draw();

    window.addEventListener('resize', debounce(setup, 200));
  }

  /* ----------------------------------------------------------
     Section 4: Polygon Reveal / Shatter
     ---------------------------------------------------------- */
  function initReveal() {
    const stage = document.getElementById('revealStage');
    const canvas = document.getElementById('revealCanvas');
    if (!canvas || !stage) return;

    const ctx = canvas.getContext('2d');
    let W, H, shards;
    let revealProgress = 0;
    let targetReveal = 0;
    let isInView = false;

    function setup() {
      const rect = stage.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = W * dpr();
      canvas.height = H * dpr();
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
      generateShards();
    }

    function generateShards() {
      shards = [];
      const count = Math.max(50, Math.floor((W * H) / 3000));

      // Use Delaunay-like point scattering
      const points = [];
      // Edges and corners
      for (let x = 0; x <= W; x += W / 8) {
        points.push([x, 0], [x, H]);
      }
      for (let y = 0; y <= H; y += H / 6) {
        points.push([0, y], [W, y]);
      }
      // Random interior points
      for (let i = 0; i < count; i++) {
        points.push([rand(0, W), rand(0, H)]);
      }

      // Simple triangulation: for each random point, create a triangle with nearby points
      // Using a grid-based approach for clean results
      const gridSize = Math.max(40, Math.min(W, H) / 10);
      const gridCols = Math.ceil(W / gridSize) + 1;
      const gridRows = Math.ceil(H / gridSize) + 1;

      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          const x = col * gridSize + rand(-8, 8);
          const y = row * gridSize + rand(-8, 8);
          const x2 = (col + 1) * gridSize + rand(-8, 8);
          const y2 = (row + 1) * gridSize + rand(-8, 8);
          const mx = (x + x2) / 2 + rand(-5, 5);
          const my = (y + y2) / 2 + rand(-5, 5);

          // Two triangles per grid cell
          const color = pick(VIBRANT);
          const rgb = hexToRgb(color);
          const cx1 = (x + x2 + mx) / 3;
          const cy1 = (y + y + my) / 3;
          const cx2 = (x + x2 + mx) / 3;
          const cy2 = (y2 + y2 + my) / 3;

          const distFromCenter1 = dist(cx1, cy1, W / 2, H / 2);
          const distFromCenter2 = dist(cx2, cy2, W / 2, H / 2);

          shards.push({
            points: [[x, y], [x2, y], [mx, my]],
            color: rgb,
            cx: cx1, cy: cy1,
            distFromCenter: distFromCenter1,
            angle: Math.atan2(cy1 - H / 2, cx1 - W / 2),
            velocity: rand(2, 8),
            rotVelocity: rand(-4, 4),
            rotation: 0,
            offsetX: 0, offsetY: 0,
          });

          shards.push({
            points: [[x, y2], [x2, y2], [mx, my]],
            color: hexToRgb(pick(VIBRANT)),
            cx: cx2, cy: cy2,
            distFromCenter: distFromCenter2,
            angle: Math.atan2(cy2 - H / 2, cx2 - W / 2),
            velocity: rand(2, 8),
            rotVelocity: rand(-4, 4),
            rotation: 0,
            offsetX: 0, offsetY: 0,
          });
        }
      }
    }

    function draw() {
      revealProgress = lerp(revealProgress, targetReveal, 0.03);

      ctx.clearRect(0, 0, W, H);

      // Draw shards: when revealProgress = 0, shards cover the canvas
      // When revealProgress = 1, shards scatter outward revealing content behind
      for (let i = 0; i < shards.length; i++) {
        const s = shards[i];
        const progress = clamp(revealProgress * 1.5 - (s.distFromCenter / (Math.max(W, H) * 0.6)), 0, 1);

        // Ease out cubic
        const ease = 1 - Math.pow(1 - progress, 3);

        const scatter = ease * 300;
        const ox = Math.cos(s.angle) * scatter * s.velocity / 5;
        const oy = Math.sin(s.angle) * scatter * s.velocity / 5;
        const rot = ease * s.rotVelocity * 60;
        const opacity = 1 - ease;

        if (opacity <= 0.01) continue;

        ctx.save();
        ctx.translate(s.cx + ox, s.cy + oy);
        ctx.rotate(rot * Math.PI / 180);
        ctx.translate(-s.cx, -s.cy);
        ctx.globalAlpha = opacity;

        ctx.beginPath();
        ctx.moveTo(s.points[0][0], s.points[0][1]);
        ctx.lineTo(s.points[1][0], s.points[1][1]);
        ctx.lineTo(s.points[2][0], s.points[2][1]);
        ctx.closePath();

        ctx.fillStyle = rgbToString(s.color.r, s.color.g, s.color.b);
        ctx.fill();

        // Edge lines for extra visual fidelity
        ctx.strokeStyle = rgbToString(s.color.r, s.color.g, s.color.b, 0.3);
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.restore();
      }

      requestAnimationFrame(draw);
    }

    // Trigger reveal on scroll
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          isInView = true;
          // Gradually reveal as user scrolls further in
          const rect = stage.getBoundingClientRect();
          const viewH = window.innerHeight;
          const progress = clamp(1 - (rect.top / (viewH * 0.5)), 0, 1);
          targetReveal = progress;
        } else {
          isInView = false;
        }
      });
    }, { threshold: Array.from({ length: 20 }, (_, i) => i / 19) });

    observer.observe(stage);

    // Update reveal progress on scroll
    window.addEventListener('scroll', () => {
      if (!isInView) return;
      const rect = stage.getBoundingClientRect();
      const viewH = window.innerHeight;
      const progress = clamp(1 - (rect.top / (viewH * 0.4)), 0, 1);
      targetReveal = progress;
    }, { passive: true });

    setup();
    draw();
    window.addEventListener('resize', debounce(setup, 200));
  }

  /* ----------------------------------------------------------
     Section 5: Color Spectrum Wave (Canvas)
     ---------------------------------------------------------- */
  function initWave() {
    const container = document.getElementById('waveContainer');
    const canvas = document.getElementById('waveCanvas');
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    let W, H, triangles;
    let time = 0;
    let isInView = false;

    function setup() {
      const rect = container.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = W * dpr();
      canvas.height = H * dpr();
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
      generateTriangles();
    }

    function generateTriangles() {
      triangles = [];
      const triW = 36;
      const triH = triW * 0.866;
      const cols = Math.ceil(W / triW) + 2;
      const rows = Math.ceil(H / triH) + 2;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          for (let flip = 0; flip < 2; flip++) {
            const x = col * triW + (row % 2 ? triW / 2 : 0);
            const y = row * triH;
            const cx = x + triW / 2;
            const cy = y + triH / 2;

            // Map column position to spectrum color
            const specIdx = (col / cols) * (SPECTRUM.length - 1);
            const idx1 = Math.floor(specIdx);
            const idx2 = Math.min(idx1 + 1, SPECTRUM.length - 1);
            const t = specIdx - idx1;
            const c1 = hexToRgb(SPECTRUM[idx1]);
            const c2 = hexToRgb(SPECTRUM[idx2]);
            const r = Math.round(lerp(c1.r, c2.r, t));
            const g = Math.round(lerp(c1.g, c2.g, t));
            const b = Math.round(lerp(c1.b, c2.b, t));

            triangles.push({
              x, y, cx, cy, flip, w: triW, h: triH,
              r, g, b,
              col, row,
              phase: (col * 0.15) + (row * 0.1),
            });
          }
        }
      }
    }

    function draw() {
      if (!isInView) {
        requestAnimationFrame(draw);
        return;
      }

      time += 0.02;
      ctx.clearRect(0, 0, W, H);

      for (let i = 0; i < triangles.length; i++) {
        const t = triangles[i];

        // Wave displacement
        const waveY = Math.sin(time + t.phase) * 12;
        const waveScale = 0.85 + Math.sin(time * 0.7 + t.phase * 1.3) * 0.2;
        const waveOpacity = 0.45 + Math.sin(time * 0.5 + t.phase) * 0.35;
        const waveRotation = Math.sin(time * 0.3 + t.phase * 0.8) * 8;

        ctx.save();
        ctx.translate(t.cx, t.cy + waveY);
        ctx.rotate(waveRotation * Math.PI / 180);
        ctx.scale(waveScale, waveScale);
        ctx.globalAlpha = waveOpacity;

        ctx.beginPath();
        const halfW = t.w / 2;
        const thirdH = t.h / 3;
        if (t.flip === 0) {
          ctx.moveTo(0, -thirdH * 2);
          ctx.lineTo(halfW, thirdH);
          ctx.lineTo(-halfW, thirdH);
        } else {
          ctx.moveTo(0, thirdH * 2);
          ctx.lineTo(halfW, -thirdH);
          ctx.lineTo(-halfW, -thirdH);
        }
        ctx.closePath();

        ctx.fillStyle = rgbToString(t.r, t.g, t.b);
        ctx.fill();

        ctx.restore();
      }

      requestAnimationFrame(draw);
    }

    // Observe visibility
    const observer = new IntersectionObserver((entries) => {
      isInView = entries[0].isIntersecting;
    }, { threshold: 0.05 });
    observer.observe(container);

    setup();
    draw();
    window.addEventListener('resize', debounce(setup, 200));
  }

  /* ----------------------------------------------------------
     Section 6: Gallery Artworks (SVG generation)
     ---------------------------------------------------------- */
  function initGallery() {
    generateCrystalline();
    generateStrata();
    generateBloom();
    generatePrism();
  }

  function generateCrystalline() {
    const svg = document.getElementById('artwork1');
    if (!svg) return;
    const svgNS = 'http://www.w3.org/2000/svg';
    const W = 400, H = 400;
    const cx = W / 2, cy = H / 2;

    // Background
    const bg = document.createElementNS(svgNS, 'rect');
    bg.setAttribute('width', W);
    bg.setAttribute('height', H);
    bg.setAttribute('fill', '#141C22');
    svg.appendChild(bg);

    // Rings of crystalline triangles growing outward
    const rings = 8;
    for (let ring = 0; ring < rings; ring++) {
      const count = 6 + ring * 3;
      const radius = 20 + ring * 24;
      const innerR = ring === 0 ? 0 : 20 + (ring - 1) * 24;

      const palette = [PALETTE.teal, PALETTE.emerald, PALETTE.green, PALETTE.orange][ring % 4];

      for (let i = 0; i < count; i++) {
        const a1 = (Math.PI * 2 * i) / count;
        const a2 = (Math.PI * 2 * (i + 1)) / count;
        const aMid = (a1 + a2) / 2;

        const x1 = cx + Math.cos(a1) * innerR;
        const y1 = cy + Math.sin(a1) * innerR;
        const x2 = cx + Math.cos(a2) * innerR;
        const y2 = cy + Math.sin(a2) * innerR;
        const x3 = cx + Math.cos(aMid) * radius;
        const y3 = cy + Math.sin(aMid) * radius;

        const poly = document.createElementNS(svgNS, 'polygon');
        poly.setAttribute('points', `${x1},${y1} ${x2},${y2} ${x3},${y3}`);
        poly.setAttribute('fill', pick(palette));
        poly.setAttribute('opacity', rand(0.5, 0.95).toFixed(2));
        svg.appendChild(poly);
      }
    }

    // Central highlight
    const center = document.createElementNS(svgNS, 'polygon');
    center.setAttribute('points', `${cx},${cy - 15} ${cx + 13},${cy + 8} ${cx - 13},${cy + 8}`);
    center.setAttribute('fill', '#FFFFFF');
    center.setAttribute('opacity', '0.9');
    svg.appendChild(center);
  }

  function generateStrata() {
    const svg = document.getElementById('artwork2');
    if (!svg) return;
    const svgNS = 'http://www.w3.org/2000/svg';
    const W = 400, H = 400;

    // Background
    const bg = document.createElementNS(svgNS, 'rect');
    bg.setAttribute('width', W);
    bg.setAttribute('height', H);
    bg.setAttribute('fill', '#FFEEC8');
    svg.appendChild(bg);

    // Horizontal strata layers with triangles
    const layers = [
      { y: 320, h: 80, colors: PALETTE.navy },
      { y: 260, h: 80, colors: PALETTE.emerald },
      { y: 200, h: 80, colors: PALETTE.green },
      { y: 140, h: 80, colors: PALETTE.orange },
      { y: 80, h: 80, colors: PALETTE.red },
      { y: 20, h: 80, colors: PALETTE.magenta },
    ];

    layers.forEach(layer => {
      const triW = rand(30, 50);
      const count = Math.ceil(W / triW) + 1;

      for (let i = 0; i < count; i++) {
        const x = i * triW;
        const baseY = layer.y + rand(-10, 10);
        const topY = baseY - layer.h * rand(0.4, 1);

        const poly = document.createElementNS(svgNS, 'polygon');
        poly.setAttribute('points', `${x},${baseY + layer.h * 0.3} ${x + triW / 2},${topY} ${x + triW},${baseY + layer.h * 0.3}`);
        poly.setAttribute('fill', pick(layer.colors));
        poly.setAttribute('opacity', rand(0.5, 0.9).toFixed(2));
        svg.appendChild(poly);
      }
    });
  }

  function generateBloom() {
    const svg = document.getElementById('artwork3');
    if (!svg) return;
    const svgNS = 'http://www.w3.org/2000/svg';
    const W = 400, H = 400;
    const cx = W / 2, cy = H / 2;

    // Background
    const bg = document.createElementNS(svgNS, 'rect');
    bg.setAttribute('width', W);
    bg.setAttribute('height', H);
    bg.setAttribute('fill', '#004426');
    svg.appendChild(bg);

    // Spiral bloom of triangles
    const count = 80;
    const maxRadius = 170;
    const turns = 4;

    for (let i = 0; i < count; i++) {
      const t = i / count;
      const angle = t * Math.PI * 2 * turns;
      const radius = t * maxRadius;
      const size = 10 + t * 25;

      const px = cx + Math.cos(angle) * radius;
      const py = cy + Math.sin(angle) * radius;

      const palette = t < 0.33 ? PALETTE.emerald : t < 0.66 ? PALETTE.teal : PALETTE.green;
      const color = pick(palette);

      const poly = document.createElementNS(svgNS, 'polygon');
      const a = angle + Math.PI / 6;
      const p1x = px + Math.cos(a) * size / 2;
      const p1y = py + Math.sin(a) * size / 2;
      const p2x = px + Math.cos(a + Math.PI * 2 / 3) * size / 2;
      const p2y = py + Math.sin(a + Math.PI * 2 / 3) * size / 2;
      const p3x = px + Math.cos(a + Math.PI * 4 / 3) * size / 2;
      const p3y = py + Math.sin(a + Math.PI * 4 / 3) * size / 2;

      poly.setAttribute('points', `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`);
      poly.setAttribute('fill', color);
      poly.setAttribute('opacity', rand(0.4, 0.9).toFixed(2));
      svg.appendChild(poly);
    }
  }

  function generatePrism() {
    const svg = document.getElementById('artwork4');
    if (!svg) return;
    const svgNS = 'http://www.w3.org/2000/svg';
    const W = 400, H = 400;

    // Background
    const bg = document.createElementNS(svgNS, 'rect');
    bg.setAttribute('width', W);
    bg.setAttribute('height', H);
    bg.setAttribute('fill', '#1B2833');
    svg.appendChild(bg);

    // Central prism (large triangle)
    const prism = document.createElementNS(svgNS, 'polygon');
    prism.setAttribute('points', `200,60 340,320 60,320`);
    prism.setAttribute('fill', 'none');
    prism.setAttribute('stroke', '#C4D3DE');
    prism.setAttribute('stroke-width', '2');
    prism.setAttribute('opacity', '0.6');
    svg.appendChild(prism);

    // Refracted rays emerging from right side of prism
    const specColors = ['#009BBB', '#00914B', '#65DD35', '#FFA92D', '#E71846', '#93093F', '#33D2ED'];
    const startX = 280;
    const startY = 200;

    specColors.forEach((color, i) => {
      const angle = -30 + i * 10;
      const radians = angle * Math.PI / 180;
      const len = 150;
      const endX = startX + Math.cos(radians) * len;
      const endY = startY + Math.sin(radians) * len;

      // Ray as a thin triangle
      const perpX = Math.cos(radians + Math.PI / 2) * (3 + i * 1.5);
      const perpY = Math.sin(radians + Math.PI / 2) * (3 + i * 1.5);

      const ray = document.createElementNS(svgNS, 'polygon');
      ray.setAttribute('points', `${startX},${startY} ${endX + perpX},${endY + perpY} ${endX - perpX},${endY - perpY}`);
      ray.setAttribute('fill', color);
      ray.setAttribute('opacity', '0.7');
      svg.appendChild(ray);
    });

    // Incoming white ray
    const incoming = document.createElementNS(svgNS, 'polygon');
    incoming.setAttribute('points', `20,180 120,198 120,202`);
    incoming.setAttribute('fill', '#FFFFFF');
    incoming.setAttribute('opacity', '0.8');
    svg.appendChild(incoming);

    // Scattered small triangles around the prism for atmosphere
    for (let i = 0; i < 30; i++) {
      const x = rand(20, 380);
      const y = rand(20, 380);
      const size = rand(5, 15);
      const color = pick(VIBRANT);

      const tri = document.createElementNS(svgNS, 'polygon');
      const angle = rand(0, Math.PI * 2);
      const pts = [];
      for (let v = 0; v < 3; v++) {
        const a = angle + (Math.PI * 2 * v) / 3;
        pts.push(`${x + Math.cos(a) * size},${y + Math.sin(a) * size}`);
      }
      tri.setAttribute('points', pts.join(' '));
      tri.setAttribute('fill', color);
      tri.setAttribute('opacity', rand(0.1, 0.35).toFixed(2));
      svg.appendChild(tri);
    }
  }

  /* ----------------------------------------------------------
     Footer Polygons
     ---------------------------------------------------------- */
  function initFooterPolygons() {
    const container = document.getElementById('footerPolygons');
    if (!container) return;

    const count = 20;
    for (let i = 0; i < count; i++) {
      const size = rand(30, 100);
      const color = pick(VIBRANT);
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.left = rand(0, 100) + '%';
      el.style.top = rand(0, 100) + '%';
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.clipPath = 'polygon(50% 0%, 100% 100%, 0% 100%)';
      el.style.background = color;
      el.style.opacity = rand(0.05, 0.2);
      el.style.transform = `rotate(${rand(0, 360)}deg)`;
      container.appendChild(el);
    }
  }

  /* ----------------------------------------------------------
     Initialize Everything on DOM Ready
     ---------------------------------------------------------- */
  function init() {
    initNav();
    initScrollAnimations();
    initHeroGrid();
    initHeroPolygons();
    initMosaic();
    initInteractiveGrid();
    initReveal();
    initWave();
    initGallery();
    initFooterPolygons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

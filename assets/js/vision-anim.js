// ========================================
// Vision Page — Scroll-Driven Animation
// 5-phase desktop spectacle + mobile ambient
// ========================================

(function () {
  'use strict';

  // --- Feature detection ---
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;

  var isMobile = window.innerWidth < 768;

  // --- Palette (matches brand) ---
  var PALETTE = [
    { r: 147, g: 9, b: 63 },   // magenta
    { r: 231, g: 24, b: 70 },   // red
    { r: 255, g: 169, b: 45 },  // orange
    { r: 101, g: 221, b: 53 },  // green
    { r: 0, g: 145, b: 75 },    // emerald
    { r: 0, g: 155, b: 187 },   // teal
  ];

  var GREEN_FAMILY = [PALETTE[3], PALETTE[4]];
  var TEAL_FAMILY = [PALETTE[5], { r: 0, g: 120, b: 160 }];
  var ORANGE_FAMILY = [PALETTE[2], PALETTE[1]];

  // --- Canvas setup ---
  var canvas = document.getElementById('visionCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W, H, dpr;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // --- Scroll tracking ---
  var scrollProgress = 0;
  var scrollHeight = 1;

  function updateScroll() {
    var docH = document.documentElement.scrollHeight - window.innerHeight;
    scrollHeight = Math.max(docH, 1);
    scrollProgress = Math.min(1, Math.max(0, window.scrollY / scrollHeight));
  }

  // --- Performance monitoring ---
  var quality = 1; // 1 = full, 0.5 = reduced
  var frameTimes = [];

  function checkPerformance(dt) {
    frameTimes.push(dt);
    if (frameTimes.length > 30) frameTimes.shift();
    if (frameTimes.length >= 20) {
      var avg = 0;
      for (var i = 0; i < frameTimes.length; i++) avg += frameTimes[i];
      avg /= frameTimes.length;
      if (avg > 18) quality = Math.max(0.5, quality - 0.05);
      else if (avg < 14) quality = Math.min(1, quality + 0.02);
    }
  }

  // --- Visibility API ---
  var isVisible = true;
  document.addEventListener('visibilitychange', function () {
    isVisible = !document.hidden;
  });

  // --- Utility ---
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
  function dist(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function smoothstep(edge0, edge1, x) {
    var t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function colorStr(c, alpha) {
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (alpha || 1) + ')';
  }

  function lerpColor(a, b, t) {
    return {
      r: Math.round(lerp(a.r, b.r, t)),
      g: Math.round(lerp(a.g, b.g, t)),
      b: Math.round(lerp(a.b, b.b, t))
    };
  }

  function desaturate(c, amount) {
    var gray = Math.round(c.r * 0.299 + c.g * 0.587 + c.b * 0.114);
    return {
      r: Math.round(lerp(c.r, gray, amount)),
      g: Math.round(lerp(c.g, gray, amount)),
      b: Math.round(lerp(c.b, gray, amount))
    };
  }

  // ========================================
  // MOBILE ANIMATION (< 768px)
  // ========================================
  if (isMobile) {
    var mobileCount = W <= 320 ? 20 : W <= 480 ? 25 : W <= 640 ? 30 : 40;
    var mobileTris = [];
    var mobileRaf;
    var lastMobileTime = 0;
    var MOBILE_FRAME_MIN = 33; // ~30fps cap

    function MobileTri() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.size = 6 + Math.random() * 14;
      this.rotation = Math.random() * Math.PI * 2;
      this.rotSpeed = (Math.random() - 0.5) * 0.005;
      this.color = pickRandom(PALETTE);
      this.opacity = 0.15 + Math.random() * 0.2;
      this.phase = Math.random() * Math.PI * 2;
      this.phaseY = Math.random() * Math.PI * 2;
    }

    function initMobile() {
      mobileTris = [];
      for (var i = 0; i < mobileCount; i++) {
        mobileTris.push(new MobileTri());
      }
    }

    function drawMobileTri(t) {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.rotation);
      ctx.globalAlpha = t.opacity;
      ctx.fillStyle = colorStr(t.color);
      ctx.beginPath();
      var s = t.size;
      ctx.moveTo(0, -s * 0.58);
      ctx.lineTo(-s * 0.5, s * 0.42);
      ctx.lineTo(s * 0.5, s * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    var MOBILE_BOND_DIST = 120;

    function mobileLoop(time) {
      mobileRaf = requestAnimationFrame(mobileLoop);
      if (!isVisible) return;

      var dt = time - lastMobileTime;
      if (dt < MOBILE_FRAME_MIN) return;
      lastMobileTime = time;

      ctx.clearRect(0, 0, W, H);

      // Global horizontal drift — all triangles sway together
      var globalDriftX = Math.sin(time * 0.00015) * 0.3;

      for (var i = 0; i < mobileTris.length; i++) {
        var t = mobileTris[i];

        // Per-triangle organic sine/cosine drift
        t.x += globalDriftX + Math.sin(time * 0.0003 + t.phase) * 0.15;
        t.y += Math.cos(time * 0.00025 + t.phaseY) * 0.15;
        t.rotation += t.rotSpeed;
        t.opacity = 0.1 + Math.sin(time * 0.0004 + t.phase) * 0.08;

        // Soft wrap around (horizontal and vertical)
        if (t.x < -t.size * 2) t.x = W + t.size;
        if (t.x > W + t.size * 2) t.x = -t.size;
        if (t.y < -t.size * 2) t.y = H + t.size;
        if (t.y > H + t.size * 2) t.y = -t.size;
      }

      // Draw bond lines between nearby triangles
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 145, 75, 0.04)';
      ctx.lineWidth = 0.5;
      for (var i = 0; i < mobileTris.length; i++) {
        for (var j = i + 1; j < mobileTris.length; j++) {
          var a = mobileTris[i];
          var b = mobileTris[j];
          var dx = b.x - a.x;
          var dy = b.y - a.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < MOBILE_BOND_DIST) {
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
        }
      }
      ctx.stroke();

      // Draw triangles on top
      for (var i = 0; i < mobileTris.length; i++) {
        drawMobileTri(mobileTris[i]);
      }
    }

    // --- Mobile section reveals via IntersectionObserver ---
    function setupMobileReveals() {
      var sections = document.querySelectorAll('.vision-reveal');
      if (!sections.length) return;

      if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
              entries[i].target.classList.add('vision-reveal--visible');
            }
          }
        }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

        for (var i = 0; i < sections.length; i++) {
          observer.observe(sections[i]);
        }
      } else {
        // Fallback: show all
        for (var i = 0; i < sections.length; i++) {
          sections[i].classList.add('vision-reveal--visible');
        }
      }
    }

    // --- Mobile touch: tap triangle for brief flash ---
    canvas.addEventListener('click', function (e) {
      var cx = e.clientX, cy = e.clientY;
      for (var i = 0; i < mobileTris.length; i++) {
        var t = mobileTris[i];
        if (dist(cx, cy, t.x, t.y) < t.size * 1.5) {
          t.opacity = 0.6;
          t.size *= 1.3;
          setTimeout((function (tri, origSize) {
            return function () { tri.size = origSize; };
          })(t, t.size / 1.3), 300);
          break;
        }
      }
    });

    window.addEventListener('resize', function () {
      resize();
      isMobile = window.innerWidth < 768;
    });

    resize();
    initMobile();
    setupMobileReveals();
    mobileRaf = requestAnimationFrame(mobileLoop);
    return; // Exit early — rest is desktop only
  }

  // ========================================
  // DESKTOP ANIMATION (>= 768px)
  // ========================================

  // --- Configuration ---
  var CFG = {
    baseCount: 300,
    minSize: 8,
    maxSize: 26,
    dustCount: 80,
    dustSize: 1.5,
    dustSpeed: 0.12,
    bondDist: 1.2,
    bondSpring: 0.05,
    bondLineOpacity: 0.12,
    separation: 0.9,
    dampFree: 0.99,
    dampBonded: 0.93,
    attractRadius: 200,
    attractForce: 0.01,
    glowRadius: 5,
    glowOpacity: 0.1,
  };

  // Scale triangle count by viewport
  function getTriCount() {
    if (W >= 1536) return 300;
    if (W >= 1200) return 300;
    if (W >= 1024) return 220;
    return Math.round(lerp(220, 40, clamp((768 - W) / (768 - 640), 0, 1)));
  }

  // --- Spatial hash ---
  var CELL = 80;
  var grid = {};

  function hashKey(cx, cy) { return cx + ',' + cy; }

  function buildGrid(tris) {
    grid = {};
    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];
      var cx = Math.floor(t.x / CELL);
      var cy = Math.floor(t.y / CELL);
      var k = hashKey(cx, cy);
      if (!grid[k]) grid[k] = [];
      grid[k].push(i);
    }
  }

  function getNeighbors(x, y, r) {
    var result = [];
    var x0 = Math.floor((x - r) / CELL);
    var x1 = Math.floor((x + r) / CELL);
    var y0 = Math.floor((y - r) / CELL);
    var y1 = Math.floor((y + r) / CELL);
    for (var cx = x0; cx <= x1; cx++) {
      for (var cy = y0; cy <= y1; cy++) {
        var k = hashKey(cx, cy);
        if (grid[k]) {
          var arr = grid[k];
          for (var j = 0; j < arr.length; j++) result.push(arr[j]);
        }
      }
    }
    return result;
  }

  // --- Mouse (desktop only) ---
  var mouse = { x: -9999, y: -9999, active: false };

  canvas.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  });
  canvas.addEventListener('mouseleave', function () { mouse.active = false; });

  // --- Enhanced Triangle ---
  function Triangle(id) {
    this.id = id;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.size = 0; this.rotation = 0; this.rotSpeed = 0;
    this.color = PALETTE[0];
    this.baseColor = PALETTE[0];
    this.opacity = 0.5;
    this.baseOpacity = 0.5;
    this.skew = 1;
    this.bondCount = 0;
    this.trail = [];
    this.trailMax = 4;
    this.phase = Math.random() * Math.PI * 2;
    this.family = 0; // 0=natural, 1=human, 2=urban
    this.alive = true;
    // Mesh target positions for phase 5
    this.meshX = 0;
    this.meshY = 0;
  }

  Triangle.prototype.randomize = function () {
    this.x = Math.random() * W;
    this.y = Math.random() * H;
    this.vx = (Math.random() - 0.5) * 0.8;
    this.vy = (Math.random() - 0.5) * 0.8;
    this.size = rand(CFG.minSize, CFG.maxSize);
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.01;
    this.color = pickRandom(PALETTE);
    this.baseColor = this.color;
    this.opacity = 0.4 + Math.random() * 0.3;
    this.baseOpacity = this.opacity;
    this.skew = 0.85 + Math.random() * 0.3;
    this.bondCount = 0;
    this.trail = [];
  };

  // --- Dust ---
  var dust = [];

  function createDust() {
    dust = [];
    var count = Math.round(CFG.dustCount * quality);
    for (var i = 0; i < count; i++) {
      dust.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * CFG.dustSpeed,
        vy: (Math.random() - 0.5) * CFG.dustSpeed,
        size: 0.5 + Math.random() * CFG.dustSize,
        opacity: 0.06 + Math.random() * 0.1,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function updateDust(time) {
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      d.x += d.vx;
      d.y += d.vy;
      d.opacity = 0.04 + Math.sin(time * 0.0004 + d.phase) * 0.04;
      if (d.x < -10) d.x = W + 10;
      if (d.x > W + 10) d.x = -10;
      if (d.y < -10) d.y = H + 10;
      if (d.y > H + 10) d.y = -10;
    }
  }

  function drawDust() {
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      ctx.globalAlpha = d.opacity;
      ctx.fillStyle = '#8CA9BF';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- Draw single triangle ---
  function drawTriangle(t, customOpacity, customColor) {
    if (!t.alive) return;
    // Offscreen culling
    if (t.x < -100 || t.x > W + 100 || t.y < -100 || t.y > H + 100) return;

    var alpha = customOpacity !== undefined ? customOpacity : t.opacity;
    var col = customColor || t.color;

    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.rotation);
    ctx.globalAlpha = alpha;

    // Glow
    if (quality > 0.7 && alpha > 0.2) {
      ctx.fillStyle = colorStr(col, CFG.glowOpacity * alpha);
      ctx.beginPath();
      var gs = t.size * 1.5;
      ctx.moveTo(0, -gs * 0.58 * t.skew);
      ctx.lineTo(-gs * 0.5, gs * 0.42);
      ctx.lineTo(gs * 0.5, gs * 0.42);
      ctx.closePath();
      ctx.fill();
    }

    // Triangle body
    ctx.fillStyle = colorStr(col, alpha);
    ctx.beginPath();
    var s = t.size;
    ctx.moveTo(0, -s * 0.58 * t.skew);
    ctx.lineTo(-s * 0.5, s * 0.42);
    ctx.lineTo(s * 0.5, s * 0.42);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // --- Draw motion trail ---
  function drawTrails(tris) {
    if (quality < 0.7) return;
    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];
      if (!t.alive || t.trail.length < 2) continue;
      for (var j = 0; j < t.trail.length; j++) {
        var p = t.trail[j];
        var trailAlpha = (j / t.trail.length) * 0.08 * t.opacity;
        ctx.globalAlpha = trailAlpha;
        ctx.fillStyle = colorStr(t.color);
        ctx.beginPath();
        var ts = t.size * (0.4 + (j / t.trail.length) * 0.4);
        ctx.moveTo(p.x, p.y - ts * 0.3);
        ctx.lineTo(p.x - ts * 0.25, p.y + ts * 0.2);
        ctx.lineTo(p.x + ts * 0.25, p.y + ts * 0.2);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // --- Draw bond lines (batch — for phases 1,2,4,5) ---
  function drawBondsBatch(tris, bondSet) {
    if (!bondSet || !bondSet.size) return;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 145, 75, ' + CFG.bondLineOpacity + ')';
    ctx.lineWidth = 0.8;
    bondSet.forEach(function (key) {
      var parts = key.split('-');
      var a = tris[parseInt(parts[0])];
      var b = tris[parseInt(parts[1])];
      if (!a || !b || !a.alive || !b.alive) return;
      var mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 10;
      var my = (a.y + b.y) / 2 + (Math.random() - 0.5) * 10;
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
    });
    ctx.stroke();
  }

  // --- Draw bond lines (per-bond — for phase 3 oscillating bonds) ---
  function drawBondsPerBond(tris, bondLifecycles) {
    for (var key in bondLifecycles) {
      var bl = bondLifecycles[key];
      if (bl.strength <= 0.01) continue;
      var parts = key.split('-');
      var a = tris[parseInt(parts[0])];
      var b = tris[parseInt(parts[1])];
      if (!a || !b || !a.alive || !b.alive) continue;

      var alpha = CFG.bondLineOpacity * bl.strength * 1.5;
      var lw = 0.5 + bl.strength * 1.2;

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 145, 75, ' + alpha + ')';
      ctx.lineWidth = lw;
      var mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 8;
      var my = (a.y + b.y) / 2 + (Math.random() - 0.5) * 8;
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
    }
  }

  // --- Draw bond lines (mesh — for phase 5, subtle interwoven web) ---
  function drawBondsMesh(tris, bondSet) {
    if (!bondSet || !bondSet.size) return;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 145, 75, 0.06)';
    ctx.lineWidth = 0.5;
    bondSet.forEach(function (key) {
      var parts = key.split('-');
      var a = tris[parseInt(parts[0])];
      var b = tris[parseInt(parts[1])];
      if (!a || !b || !a.alive || !b.alive) return;
      var mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 6;
      var my = (a.y + b.y) / 2 + (Math.random() - 0.5) * 6;
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
    });
    ctx.stroke();
  }

  // --- Splash particles ---
  var splashes = [];

  function addSplash(x, y, color) {
    for (var i = 0; i < 4; i++) {
      splashes.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 3 - 1,
        size: 2 + Math.random() * 3,
        life: 1,
        color: color
      });
    }
  }

  function updateSplashes() {
    for (var i = splashes.length - 1; i >= 0; i--) {
      var s = splashes[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.05;
      s.life -= 0.025;
      if (s.life <= 0) splashes.splice(i, 1);
    }
  }

  function drawSplashes() {
    for (var i = 0; i < splashes.length; i++) {
      var s = splashes[i];
      ctx.globalAlpha = s.life * 0.6;
      ctx.fillStyle = colorStr(s.color);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ========================================
  // DYNAMIC PHASE SYSTEM
  // ========================================
  // Compute phase boundaries from actual section positions

  var sectionOffsets = []; // { phase, center } sorted by center
  var phaseBoundaries = []; // { start, end, phase }

  function computeSectionOffsets() {
    var sections = document.querySelectorAll('[data-phase]');
    if (!sections.length) return;

    var docH = document.documentElement.scrollHeight;
    var vpH = window.innerHeight;
    var scrollable = Math.max(docH - vpH, 1);

    // Gather unique phases and their centers
    var phaseMap = {}; // phase -> first center encountered
    var entries = [];

    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      var phase = parseInt(sec.getAttribute('data-phase'));
      var rect = sec.getBoundingClientRect();
      var absTop = rect.top + window.scrollY;
      var absCenter = absTop + rect.height / 2;
      // Phase 3: trigger when section top enters viewport (+ small offset)
      // instead of waiting for center, so the network appears earlier
      var triggerPoint = (phase === 3)
        ? absTop + vpH * 0.25
        : absCenter;
      // Convert to scroll progress (0-1)
      var centerProgress = Math.max(0, Math.min(1, (triggerPoint - vpH / 2) / scrollable));

      if (!(phase in phaseMap)) {
        phaseMap[phase] = centerProgress;
        entries.push({ phase: phase, center: centerProgress });
      }
    }

    // Sort by center position
    entries.sort(function (a, b) { return a.center - b.center; });
    sectionOffsets = entries;

    // Build boundaries: midpoints between consecutive section centers
    phaseBoundaries = [];
    for (var i = 0; i < entries.length; i++) {
      var start, end;
      if (i === 0) {
        start = 0;
      } else {
        start = (entries[i - 1].center + entries[i].center) / 2;
      }
      if (i === entries.length - 1) {
        end = 1;
      } else {
        end = (entries[i].center + entries[i + 1].center) / 2;
      }
      phaseBoundaries.push({
        phase: entries[i].phase,
        start: start,
        end: end
      });
    }
  }

  function getActivePhase(scroll) {
    for (var i = 0; i < phaseBoundaries.length; i++) {
      var pb = phaseBoundaries[i];
      if (scroll >= pb.start && scroll < pb.end) {
        var local = (pb.end - pb.start) > 0
          ? (scroll - pb.start) / (pb.end - pb.start)
          : 0;
        return { index: pb.phase, local: local };
      }
    }
    // Fallback: last phase
    if (phaseBoundaries.length > 0) {
      var last = phaseBoundaries[phaseBoundaries.length - 1];
      return { index: last.phase, local: 1 };
    }
    return { index: 1, local: 0 };
  }

  // ========================================
  // CREATE TRIANGLES
  // ========================================
  var tris = [];
  var bonds = new Set();

  function bondKey(a, b) { return a < b ? a + '-' + b : b + '-' + a; }

  function initTriangles() {
    var count = getTriCount();
    tris = [];
    bonds.clear();
    for (var i = 0; i < count; i++) {
      var t = new Triangle(i);
      t.randomize();
      // Assign family
      if (i < count / 3) t.family = 0;
      else if (i < (count * 2) / 3) t.family = 1;
      else t.family = 2;
      tris.push(t);
    }
    // Compute mesh target positions
    computeMeshPositions();
  }

  // ========================================
  // PHASE 1: CONTINUOUS RAIN (hero)
  // ========================================
  function phase1_init() {
    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];
      t.x = Math.random() * W;
      t.y = -rand(20, H * 1.5); // Start above viewport
      t.vx = 0;
      t.vy = rand(0.5, 2);
      t.opacity = rand(0.2, 0.5);
      t.color = pickRandom(PALETTE);
      t.baseColor = t.color;
    }
  }

  function phase1_update(local, time) {
    var wind = Math.sin(time * 0.0003) * 0.4;
    var TERMINAL_VY = 4; // max 4px/frame

    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];
      // Gravity
      t.vy += 0.08;
      // Terminal velocity cap
      if (t.vy > TERMINAL_VY) t.vy = TERMINAL_VY;
      // Wind
      t.vx += wind * 0.01;
      t.vx *= 0.98;
      // Rotation
      t.rotation += t.rotSpeed * 2;

      t.x += t.vx;
      t.y += t.vy;

      // When triangle passes bottom edge, splash and respawn at top
      if (t.y > H + 10) {
        if (quality > 0.7) addSplash(t.x, H, t.color);
        t.x = Math.random() * W;
        t.y = -rand(20, 80);
        t.vy = rand(0.5, 2);
        t.vx = 0;
      }

      // Trail
      t.trail.push({ x: t.x, y: t.y });
      if (t.trail.length > t.trailMax) t.trail.shift();
    }
  }

  // ========================================
  // PHASE 2: AWAKENING CHAOS (problem section)
  // ========================================
  var turbulenceTimer = 0;
  var turbulenceCenter = { x: 0, y: 0 };
  var turbulenceActive = false;

  function phase2_update(local, time) {
    bonds.clear();
    turbulenceTimer -= 1;

    // Turbulence burst every ~4 seconds
    if (turbulenceTimer <= 0) {
      turbulenceTimer = rand(180, 300); // 3-5s at 60fps
      turbulenceCenter.x = rand(W * 0.2, W * 0.8);
      turbulenceCenter.y = rand(H * 0.2, H * 0.8);
      turbulenceActive = true;
      setTimeout(function () { turbulenceActive = false; }, 600);
    }

    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];
      // Brownian drift
      t.vx += (Math.random() - 0.5) * 0.3;
      t.vy += (Math.random() - 0.5) * 0.3;

      // Turbulence burst
      if (turbulenceActive) {
        var dx = t.x - turbulenceCenter.x;
        var dy = t.y - turbulenceCenter.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 200 && d > 1) {
          var force = (1 - d / 200) * 1.5;
          t.vx += (dx / d) * force;
          t.vy += (dy / d) * force;
        }
      }

      // Reduced damping (restless)
      t.vx *= 0.985;
      t.vy *= 0.985;
      t.x += t.vx;
      t.y += t.vy;

      // Desaturate colors
      t.color = desaturate(t.baseColor, 0.3 + local * 0.4);
      t.opacity = lerp(t.baseOpacity, t.baseOpacity * 0.7, local);

      // Faster rotation
      t.rotation += t.rotSpeed * 3;

      // Wrap
      if (t.x < -30) t.x = W + 30;
      if (t.x > W + 30) t.x = -30;
      if (t.y < -30) t.y = H + 30;
      if (t.y > H + 30) t.y = -30;

      // Trail
      t.trail.push({ x: t.x, y: t.y });
      if (t.trail.length > t.trailMax) t.trail.shift();
    }
  }

  // ========================================
  // PHASE 3: OSCILLATING BOND NETWORK (system approach)
  // ========================================
  // Bond lifecycles: key -> { birth, lifespan, strength, fadingOut }
  var bondLifecycles = {};

  function phase3_update(local, time) {
    bonds.clear();

    // Gentle attractor to keep triangles distributed (not clustering)
    var centerX = W / 2;
    var centerY = H / 2;

    buildGrid(tris);

    var now = time;

    // Update existing bond lifecycles
    for (var key in bondLifecycles) {
      var bl = bondLifecycles[key];
      var age = (now - bl.birth) / 1000; // seconds

      if (age > bl.lifespan && !bl.fadingOut) {
        bl.fadingOut = true;
        bl.fadeStart = now;
      }

      if (bl.fadingOut) {
        var fadeProgress = (now - bl.fadeStart) / 1000; // 1s fade out
        bl.strength = Math.max(0, 1 - fadeProgress);
        if (bl.strength <= 0) {
          delete bondLifecycles[key];
          continue;
        }
      } else if (age < 0.6) {
        // Fade in (600ms)
        bl.strength = age / 0.6;
      } else {
        // Breathing oscillation while alive
        bl.strength = 0.6 + Math.sin(now * 0.003 + bl.birth * 0.01) * 0.4;
      }
    }

    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];

      // Very gentle attractor pull toward viewport center to keep distributed
      var dx = centerX - t.x;
      var dy = centerY - t.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > 200) {
        var pullF = 0.0005;
        t.vx += (dx / d) * pullF;
        t.vy += (dy / d) * pullF;
      }

      // Bond detection with nearby triangles
      var neighbors = getNeighbors(t.x, t.y, t.size * 4);
      t.bondCount = 0;

      for (var ni = 0; ni < neighbors.length; ni++) {
        var j = neighbors[ni];
        if (j <= i) continue;
        var b = tris[j];
        var bdx = b.x - t.x;
        var bdy = b.y - t.y;
        var bd = Math.sqrt(bdx * bdx + bdy * bdy);
        var idealDist = (t.size + b.size) * CFG.bondDist;
        var bondRange = idealDist * 2;

        if (bd < bondRange && local > 0.15) {
          var bk = bondKey(i, j);

          // Create new bond lifecycle if not existing
          if (!bondLifecycles[bk]) {
            bondLifecycles[bk] = {
              birth: now,
              lifespan: 3 + Math.random() * 12, // 3-15s
              strength: 0,
              fadingOut: false,
              fadeStart: 0
            };
          }

          var bl = bondLifecycles[bk];
          if (bl.strength > 0.01) {
            bonds.add(bk);
            t.bondCount++;
            b.bondCount++;

            // Spring force modulated by bond strength
            if (bd > idealDist) {
              var springF = (bd - idealDist) * CFG.bondSpring * local * bl.strength;
              t.vx += (bdx / bd) * springF;
              t.vy += (bdy / bd) * springF;
              b.vx -= (bdx / bd) * springF;
              b.vy -= (bdy / bd) * springF;
            }
          }
        }
      }

      // Separation — stronger than default to prevent clustering with weak attractor
      for (var ni = 0; ni < neighbors.length; ni++) {
        var j = neighbors[ni];
        if (j <= i) continue;
        var b = tris[j];
        var bdx = b.x - t.x;
        var bdy = b.y - t.y;
        var bd = Math.sqrt(bdx * bdx + bdy * bdy);
        var sepThresh = (t.size + b.size) * CFG.separation * 1.4;
        if (bd < sepThresh && bd > 0) {
          var sep = (sepThresh - bd) * 0.1;
          t.vx -= (bdx / bd) * sep;
          t.vy -= (bdy / bd) * sep;
          b.vx += (bdx / bd) * sep;
          b.vy += (bdy / bd) * sep;
        }
      }

      // Damping
      var damp = t.bondCount > 0 ? CFG.dampBonded : CFG.dampFree;
      t.vx *= damp;
      t.vy *= damp;
      t.x += t.vx;
      t.y += t.vy;

      // Resaturate colors
      t.color = lerpColor(desaturate(t.baseColor, 0.5), t.baseColor, local);
      t.opacity = lerp(t.baseOpacity * 0.7, t.baseOpacity, local);
      t.rotation += t.rotSpeed;

      // Trail
      t.trail.push({ x: t.x, y: t.y });
      if (t.trail.length > t.trailMax) t.trail.shift();

      // Soft boundary
      if (t.x < -50) t.vx += 0.5;
      if (t.x > W + 50) t.vx -= 0.5;
      if (t.y < -50) t.vy += 0.5;
      if (t.y > H + 50) t.vy -= 0.5;
    }
  }

  // ========================================
  // PHASE 4: CALM CONVERGENCE (regeneration)
  // ========================================
  function phase4_update(local, time) {
    // TWO side attractors at ~25% and ~75% of viewport width
    var attractorLX = W * 0.25;
    var attractorRX = W * 0.75;
    var attractorY = H / 2;
    // Slow breathing (14s cycle) with per-triangle phase offset
    var breathBase = time * 0.000449; // 2*PI/14000
    // Gentle center attraction (3x weaker than old convergence: 0.008 vs 0.025)
    var pullStrength = smoothstep(0, 0.5, local) * 0.008;

    buildGrid(tris);
    bonds.clear();

    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];

      // Assign attractor: left half of initial x goes to left attractor, right to right
      // Use triangle id parity as a stable split (roughly 50/50)
      var isLeftGroup = (t.id % 2 === 0);
      var targetX = isLeftGroup ? attractorLX : attractorRX;
      // Per-triangle breathing phase offset for de-synchronized pulsing
      var breathOffset = t.phase; // randomized at creation
      var breath = Math.sin(breathBase + breathOffset) * 35;

      // Pull toward assigned attractor
      var dx = targetX - t.x;
      var dy = attractorY + breath - t.y;
      var d = Math.sqrt(dx * dx + dy * dy);

      if (d > 1) {
        t.vx += (dx / d) * pullStrength * Math.min(d, 200) * 0.05;
        t.vy += (dy / d) * pullStrength * Math.min(d, 200) * 0.05;
      }

      // Burst emission every ~4s
      var burstPhase = Math.sin(time * 0.0016) * 0.5 + 0.5; // 0-1 cycle ~4s
      if (burstPhase > 0.92 && d < 80) {
        // Burst: push triangles outward from attractor
        t.vx += (t.x - targetX) * 0.02;
        t.vy += (t.y - (attractorY + breath)) * 0.02;
      }

      // Close-range repulsion
      if (d < 15 && d > 0) {
        t.vx += (t.x - targetX) / d * 0.3;
        t.vy += (t.y - attractorY) / d * 0.3;
      }

      // Gentle orbital drift with noise for less rigid orbits
      var orbitCenterX = isLeftGroup ? attractorLX : attractorRX;
      var orbitAngle = Math.atan2(t.y - attractorY, t.x - orbitCenterX);
      var orbitNoise = Math.sin(time * 0.0005 + t.phase * 2.7) * 0.015;
      t.vx += Math.cos(orbitAngle + Math.PI / 2) * (0.02 + orbitNoise);
      t.vy += Math.sin(orbitAngle + Math.PI / 2) * (0.02 + orbitNoise);

      // Standard bonding
      var neighbors = getNeighbors(t.x, t.y, t.size * 3);
      t.bondCount = 0;

      for (var ni = 0; ni < neighbors.length; ni++) {
        var j = neighbors[ni];
        if (j <= i) continue;
        var b = tris[j];
        var bdx = b.x - t.x;
        var bdy = b.y - t.y;
        var bd = Math.sqrt(bdx * bdx + bdy * bdy);
        var idealDist = (t.size + b.size) * CFG.bondDist * 0.9;

        if (bd < idealDist * 1.8) {
          bonds.add(bondKey(i, j));
          t.bondCount++;
          b.bondCount++;
          if (bd > idealDist) {
            var springF = (bd - idealDist) * CFG.bondSpring * 1.2;
            t.vx += (bdx / bd) * springF;
            t.vy += (bdy / bd) * springF;
            b.vx -= (bdx / bd) * springF;
            b.vy -= (bdy / bd) * springF;
          }
        }

        if (bd < (t.size + b.size) * CFG.separation && bd > 0) {
          var sep = ((t.size + b.size) * CFG.separation - bd) * 0.05;
          t.vx -= (bdx / bd) * sep;
          t.vy -= (bdy / bd) * sep;
          b.vx += (bdx / bd) * sep;
          b.vy += (bdy / bd) * sep;
        }
      }

      // Strong damping for calm feel
      var damp = t.bondCount > 0 ? 0.90 : 0.95;
      t.vx *= damp;
      t.vy *= damp;
      t.x += t.vx;
      t.y += t.vy;

      // Restore full color
      t.color = t.baseColor;
      t.opacity = t.baseOpacity;
      t.rotation += t.rotSpeed * 0.5;

      // Trail
      t.trail.push({ x: t.x, y: t.y });
      if (t.trail.length > t.trailMax) t.trail.shift();
    }

    // Subtle ripple opacity waves at half speed — emanate from both attractors
    if (local > 0.3 && quality > 0.7) {
      var ripplePhase = time * 0.001;
      for (var i = 0; i < tris.length; i++) {
        var t = tris[i];
        var isLeft = (t.id % 2 === 0);
        var rCenterX = isLeft ? attractorLX : attractorRX;
        var rd = dist(t.x, t.y, rCenterX, attractorY);
        var ripple = Math.sin(rd * 0.03 - ripplePhase) * 0.5 + 0.5;
        t.opacity = lerp(t.baseOpacity * 0.7, t.baseOpacity, ripple);
      }
    }
  }

  // ========================================
  // PHASE 5: MESH NETWORK (RIS through footer — FINAL STATE)
  // ========================================
  function computeMeshPositions() {
    if (!tris.length) return;
    // Distribute target positions across full viewport in a relaxed grid
    var count = tris.length;
    var cols = Math.ceil(Math.sqrt(count * (W / H)));
    var rows = Math.ceil(count / cols);
    var cellW = W / cols;
    var cellH = H / rows;

    for (var i = 0; i < count; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      // Center of cell with random jitter
      tris[i].meshX = (col + 0.5) * cellW + (Math.random() - 0.5) * cellW * 0.4;
      tris[i].meshY = (row + 0.5) * cellH + (Math.random() - 0.5) * cellH * 0.4;
    }
  }

  function phase5_update(local, time) {
    bonds.clear();

    // Bond detection range grows gently with scroll (densifies the network grid)
    var bondRangeMultiplier = 1.0 + local * 1.2; // 1.0 -> 2.2

    // Shared wavy drift — all triangles sway together in slow unison
    var waveX = Math.sin(time * 0.00008) * 0.03;
    var waveY = Math.cos(time * 0.00006) * 0.02;

    buildGrid(tris);

    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];

      // Gentle per-triangle organic drift (each one unique)
      t.vx += Math.sin(time * 0.00012 + t.phase) * 0.012;
      t.vy += Math.cos(time * 0.00008 + t.phase * 1.3) * 0.012;

      // Shared wave — moves everything in soft unison
      t.vx += waveX;
      t.vy += waveY;

      // Bond detection + balanced spring: light attraction at range, equal repulsion up close
      var searchRange = t.size * 3 * bondRangeMultiplier;
      var neighbors = getNeighbors(t.x, t.y, searchRange);
      t.bondCount = 0;

      for (var ni = 0; ni < neighbors.length; ni++) {
        var j = neighbors[ni];
        if (j <= i) continue;
        var b = tris[j];
        var bdx = b.x - t.x;
        var bdy = b.y - t.y;
        var bd = Math.sqrt(bdx * bdx + bdy * bdy);
        var idealDist = (t.size + b.size) * CFG.bondDist;
        var threshold = idealDist * 1.5 * bondRangeMultiplier;

        if (bd < threshold) {
          bonds.add(bondKey(i, j));
          t.bondCount++;
          b.bondCount++;

          // Balanced spring: pull toward idealDist, push away if closer
          // Same strength in both directions — no net clustering
          var displacement = bd - idealDist;
          var springF = displacement * 0.0004;
          t.vx += (bdx / bd) * springF;
          t.vy += (bdy / bd) * springF;
          b.vx -= (bdx / bd) * springF;
          b.vy -= (bdy / bd) * springF;
        }

        // Equal repulsion when too close — mirrors the attraction strength
        if (bd < idealDist * 0.7 && bd > 0) {
          var repel = (idealDist * 0.7 - bd) * 0.001;
          t.vx -= (bdx / bd) * repel;
          t.vy -= (bdy / bd) * repel;
          b.vx += (bdx / bd) * repel;
          b.vy += (bdy / bd) * repel;
        }
      }

      // Damping — keeps movement calm and wavy
      t.vx *= 0.94;
      t.vy *= 0.94;
      t.x += t.vx;
      t.y += t.vy;

      // Soft viewport boundary
      var margin = 40;
      if (t.x < margin) t.vx += (margin - t.x) * 0.01;
      if (t.x > W - margin) t.vx -= (t.x - (W - margin)) * 0.01;
      if (t.y < margin) t.vy += (margin - t.y) * 0.01;
      if (t.y > H - margin) t.vy -= (t.y - (H - margin)) * 0.01;

      // Restore full color
      t.color = t.baseColor;
      t.opacity = t.baseOpacity;
      t.rotation += t.rotSpeed * 0.3;

      // Trail
      t.trail.push({ x: t.x, y: t.y });
      if (t.trail.length > t.trailMax) t.trail.shift();
    }
  }

  // ========================================
  // TRANSITION HELPERS
  // ========================================
  var currentPhase = -1;

  function transitionPhase(newPhase) {
    if (newPhase === currentPhase) return;
    var prevPhase = currentPhase;
    currentPhase = newPhase;

    if (newPhase === 1 && prevPhase === -1) {
      phase1_init();
    }

    // Clear bond lifecycles when leaving phase 3
    if (prevPhase === 3 && newPhase !== 3) {
      bondLifecycles = {};
    }

    // Compute mesh positions when entering phase 5
    if (newPhase === 5 && prevPhase !== 5) {
      computeMeshPositions();
    }
  }

  // ========================================
  // MAIN RENDER LOOP
  // ========================================
  var lastTime = 0;
  var usePerBondRendering = false;

  function frame(time) {
    requestAnimationFrame(frame);
    if (!isVisible) return;

    var dt = time - lastTime;
    lastTime = time;
    checkPerformance(dt);
    updateScroll();

    ctx.clearRect(0, 0, W, H);

    var p = getActivePhase(scrollProgress);
    transitionPhase(p.index);
    usePerBondRendering = (p.index === 3);
    var useMeshBondRendering = (p.index === 5);

    // Update dust
    updateDust(time);

    // Update triangles per phase
    switch (p.index) {
      case 1: phase1_update(p.local, time); break;
      case 2: phase2_update(p.local, time); break;
      case 3: phase3_update(p.local, time); break;
      case 4: phase4_update(p.local, time); break;
      case 5: phase5_update(p.local, time); break;
    }

    // Update splashes
    updateSplashes();

    // --- Draw layers ---
    // 1. Dust (background)
    drawDust();

    // 2. Motion trails
    drawTrails(tris);

    // 3. Bond lines (phase-aware rendering)
    if (usePerBondRendering) {
      drawBondsPerBond(tris, bondLifecycles);
    } else if (useMeshBondRendering) {
      drawBondsMesh(tris, bonds);
    } else {
      drawBondsBatch(tris, bonds);
    }

    // 4. Triangles
    for (var i = 0; i < tris.length; i++) {
      drawTriangle(tris[i]);
    }

    // 5. Splashes (foreground)
    drawSplashes();
  }

  // --- Section reveals (desktop also uses these for content) ---
  function setupDesktopReveals() {
    var sections = document.querySelectorAll('.vision-reveal');
    if (!sections.length) return;

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            entries[i].target.classList.add('vision-reveal--visible');
          }
        }
      }, { threshold: 0.1 });

      for (var i = 0; i < sections.length; i++) {
        observer.observe(sections[i]);
      }
    } else {
      for (var i = 0; i < sections.length; i++) {
        sections[i].classList.add('vision-reveal--visible');
      }
    }
  }

  // --- Init ---
  window.addEventListener('resize', function () {
    resize();
    computeSectionOffsets();
    // If crossing mobile/desktop threshold, reload
    var nowMobile = window.innerWidth < 768;
    if (nowMobile !== isMobile) {
      window.location.reload();
    }
  });

  window.addEventListener('scroll', updateScroll, { passive: true });

  resize();
  initTriangles();
  createDust();
  phase1_init();
  updateScroll();
  computeSectionOffsets();
  setupDesktopReveals();
  requestAnimationFrame(frame);

})();

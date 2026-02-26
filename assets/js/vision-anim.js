// ========================================
// Vision Page — Scroll-Driven Animation
// 6-phase desktop spectacle + mobile ambient
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
      this.speed = 0.15 + Math.random() * 0.35;
      this.drift = (Math.random() - 0.5) * 0.3;
      this.rotation = Math.random() * Math.PI * 2;
      this.rotSpeed = (Math.random() - 0.5) * 0.005;
      this.color = pickRandom(PALETTE);
      this.opacity = 0.15 + Math.random() * 0.2;
      this.parallax = 0.3 + (this.size / 20) * 0.7; // larger = slower
      this.phase = Math.random() * Math.PI * 2;
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

    function mobileLoop(time) {
      mobileRaf = requestAnimationFrame(mobileLoop);
      if (!isVisible) return;

      var dt = time - lastMobileTime;
      if (dt < MOBILE_FRAME_MIN) return;
      lastMobileTime = time;

      ctx.clearRect(0, 0, W, H);

      for (var i = 0; i < mobileTris.length; i++) {
        var t = mobileTris[i];
        t.y -= t.speed * t.parallax;
        t.x += t.drift + Math.sin(time * 0.0003 + t.phase) * 0.2;
        t.rotation += t.rotSpeed;
        t.opacity = 0.1 + Math.sin(time * 0.0004 + t.phase) * 0.08;

        // Wrap around
        if (t.y < -t.size * 2) { t.y = H + t.size * 2; t.x = Math.random() * W; }
        if (t.x < -t.size * 2) t.x = W + t.size;
        if (t.x > W + t.size * 2) t.x = -t.size;

        drawMobileTri(t);
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

  // --- Mouse (desktop only, re-enabled in phase 6) ---
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
    this.family = 0; // 0=natural, 1=human, 2=urban (used in phase 5)
    this.alive = true;
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

  // --- Draw bond lines ---
  function drawBonds(tris, bondSet) {
    if (!bondSet || !bondSet.size) return;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 145, 75, ' + CFG.bondLineOpacity + ')';
    ctx.lineWidth = 0.8;
    bondSet.forEach(function (key) {
      var parts = key.split('-');
      var a = tris[parseInt(parts[0])];
      var b = tris[parseInt(parts[1])];
      if (!a || !b || !a.alive || !b.alive) return;
      // Curved bezier
      var mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 10;
      var my = (a.y + b.y) / 2 + (Math.random() - 0.5) * 10;
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
  // PHASE DIRECTOR
  // ========================================
  // Maps scroll 0→1 to phase 1→6
  var phases = [
    { start: 0,    end: 0.15 }, // Phase 1: Genesis Rain
    { start: 0.15, end: 0.30 }, // Phase 2: Awakening Chaos
    { start: 0.30, end: 0.50 }, // Phase 3: System Emergence
    { start: 0.50, end: 0.65 }, // Phase 4: Regeneration Waterfall
    { start: 0.65, end: 0.85 }, // Phase 5: Three Swarms
    { start: 0.85, end: 1.00 }, // Phase 6: Convergence
  ];

  function getActivePhase(scroll) {
    for (var i = 0; i < phases.length; i++) {
      if (scroll >= phases[i].start && scroll < phases[i].end) {
        var local = (scroll - phases[i].start) / (phases[i].end - phases[i].start);
        return { index: i, local: local };
      }
    }
    return { index: 5, local: 1 };
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
      // Assign family for phase 5
      if (i < count / 3) t.family = 0;
      else if (i < (count * 2) / 3) t.family = 1;
      else t.family = 2;
      tris.push(t);
    }
  }

  // ========================================
  // PHASE 1: GENESIS RAIN (0–15%)
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
    var splashY = H * 0.8;
    var wind = Math.sin(time * 0.0003) * 0.4;

    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];
      // Gravity
      t.vy += 0.08;
      // Wind
      t.vx += wind * 0.01;
      t.vx *= 0.98;
      // Rotation
      t.rotation += t.rotSpeed * 2;

      t.x += t.vx;
      t.y += t.vy;

      // Splash at threshold
      if (t.y > splashY && t.vy > 0) {
        t.vy *= -0.3;
        t.vx += (Math.random() - 0.5) * 2;
        t.y = splashY;
        if (quality > 0.7) addSplash(t.x, t.y, t.color);
      }

      // Reset above viewport when fallen too far
      if (t.y > H + 40) {
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
  // PHASE 2: AWAKENING CHAOS (15–30%)
  // ========================================
  var turbulenceTimer = 0;
  var turbulenceCenter = { x: 0, y: 0 };
  var turbulenceActive = false;

  function phase2_update(local, time) {
    bonds.clear();
    turbulenceTimer -= 1;

    // Turbulence burst every ~4 seconds
    if (turbulenceTimer <= 0) {
      turbulenceTimer = rand(180, 300); // 3–5s at 60fps
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
  // PHASE 3: SYSTEM EMERGENCE (30–50%)
  // ========================================
  function phase3_update(local, time) {
    // 3 attractor points that grow stronger
    var attractors = [
      { x: W * 0.25, y: H * 0.4 },
      { x: W * 0.5,  y: H * 0.55 },
      { x: W * 0.75, y: H * 0.4 },
    ];

    var strength = smoothstep(0, 0.5, local) * 0.015;
    bonds.clear();

    buildGrid(tris);

    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];

      // Attract toward nearest attractor
      var closest = 0, closestD = Infinity;
      for (var a = 0; a < attractors.length; a++) {
        var d = dist(t.x, t.y, attractors[a].x, attractors[a].y);
        if (d < closestD) { closestD = d; closest = a; }
      }

      var ax = attractors[closest].x;
      var ay = attractors[closest].y;
      var dx = ax - t.x;
      var dy = ay - t.y;
      var d = Math.sqrt(dx * dx + dy * dy);

      if (d > 1) {
        var f = strength * Math.min(1, d / 200);
        t.vx += (dx / d) * f * d * 0.05;
        t.vy += (dy / d) * f * d * 0.05;
      }

      // Bonding with nearby triangles
      var neighbors = getNeighbors(t.x, t.y, t.size * 3);
      t.bondCount = 0;

      for (var ni = 0; ni < neighbors.length; ni++) {
        var j = neighbors[ni];
        if (j <= i) continue;
        var b = tris[j];
        var bdx = b.x - t.x;
        var bdy = b.y - t.y;
        var bd = Math.sqrt(bdx * bdx + bdy * bdy);
        var idealDist = (t.size + b.size) * CFG.bondDist;

        if (bd < idealDist * 1.5 && local > 0.3) {
          bonds.add(bondKey(i, j));
          t.bondCount++;
          b.bondCount++;

          // Spring force
          if (bd > idealDist) {
            var springF = (bd - idealDist) * CFG.bondSpring * local;
            t.vx += (bdx / bd) * springF;
            t.vy += (bdy / bd) * springF;
            b.vx -= (bdx / bd) * springF;
            b.vy -= (bdy / bd) * springF;
          }
        }

        // Separation
        if (bd < (t.size + b.size) * CFG.separation && bd > 0) {
          var sep = ((t.size + b.size) * CFG.separation - bd) * 0.05;
          t.vx -= (bdx / bd) * sep;
          t.vy -= (bdy / bd) * sep;
          b.vx += (bdx / bd) * sep;
          b.vy += (bdy / bd) * sep;
        }
      }

      // Damping depends on bonding
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

      // Boundary
      if (t.x < -50) t.vx += 0.5;
      if (t.x > W + 50) t.vx -= 0.5;
      if (t.y < -50) t.vy += 0.5;
      if (t.y > H + 50) t.vy -= 0.5;
    }
  }

  // ========================================
  // PHASE 4: REGENERATION WATERFALL (50–65%)
  // ========================================
  function phase4_update(local, time) {
    bonds.clear();
    var streams = [
      { x: W * 0.3, family: GREEN_FAMILY },
      { x: W * 0.5, family: TEAL_FAMILY },
      { x: W * 0.7, family: ORANGE_FAMILY },
    ];
    var arcY = H * 0.75;

    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];
      var streamIdx = i % 3;
      var stream = streams[streamIdx];
      var streamX = stream.x + Math.sin(time * 0.001 + i * 0.1) * 30;

      // Cascade down
      if (t.y < arcY) {
        // Falling phase: attract toward stream and fall
        var pullX = (streamX - t.x) * 0.02;
        t.vx += pullX;
        t.vy += 0.12; // gravity
        t.vx += (Math.random() - 0.5) * 0.3; // turbulence

        // Muted/smaller
        t.opacity = lerp(t.baseOpacity * 0.5, t.baseOpacity * 0.7, t.y / arcY);
        t.color = desaturate(pickRandom(stream.family), 0.3);
      } else {
        // Rising phase: parabolic arc outward then rise
        t.vy -= 0.15; // buoyancy
        t.vx += (t.x > W / 2 ? 0.05 : -0.05) * (1 + Math.sin(time * 0.002));

        // Vivid/growing
        t.opacity = lerp(t.baseOpacity, Math.min(0.8, t.baseOpacity * 1.3), (t.y - arcY) / (H - arcY));
        t.color = pickRandom(stream.family);
        t.size = lerp(t.size, t.size * 1.002, 0.1);
        t.size = Math.min(t.size, CFG.maxSize * 1.3);
      }

      t.vx *= 0.98;
      t.vy *= 0.98;
      t.x += t.vx;
      t.y += t.vy;
      t.rotation += t.rotSpeed * 2;

      // Reset: wrap vertically
      if (t.y < -60) {
        t.y = H + rand(20, 60);
        t.x = stream.x + rand(-60, 60);
        t.vy = 0;
        t.vx = 0;
      }
      if (t.y > H + 60) {
        t.y = -rand(20, 60);
        t.x = stream.x + rand(-60, 60);
        t.vy = rand(0.5, 2);
        t.vx = 0;
      }

      // Motion trail
      t.trail.push({ x: t.x, y: t.y });
      if (t.trail.length > 6) t.trail.shift();
    }
  }

  // ========================================
  // PHASE 5: THREE SWARMS (65–85%)
  // ========================================
  function phase5_update(local, time) {
    bonds.clear();

    var swarmCenters = [
      { x: W * 0.22, y: H * 0.5 },  // Natural (green) — left
      { x: W * 0.5,  y: H * 0.5 },  // Human (teal) — center
      { x: W * 0.78, y: H * 0.5 },  // Urban (orange) — right
    ];

    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];
      var f = t.family; // 0, 1, 2
      var center = swarmCenters[f];

      // Set color family
      if (f === 0) t.color = pickRandom(GREEN_FAMILY);
      else if (f === 1) t.color = pickRandom(TEAL_FAMILY);
      else t.color = pickRandom(ORANGE_FAMILY);

      t.opacity = t.baseOpacity;

      var dx = center.x - t.x;
      var dy = center.y - t.y;
      var d = Math.sqrt(dx * dx + dy * dy);

      // Swarm-specific behaviors
      if (f === 0) {
        // Natural: Boids flocking, canopy oscillation
        var oscillate = Math.sin(time * 0.0008 + t.phase) * 40;
        var targetY = center.y + oscillate;
        t.vx += (center.x - t.x) * 0.003;
        t.vy += (targetY - t.y) * 0.003;
        // Boid alignment: gentle steering
        t.vx += Math.cos(time * 0.0005 + i * 0.2) * 0.05;
        t.vy += Math.sin(time * 0.0005 + i * 0.2) * 0.05;
        t.rotation += 0.003;
      } else if (f === 1) {
        // Human: Heartbeat expand/contract
        var heartbeat = Math.sin(time * 0.0015) * 0.5 + 0.5; // 0→1
        var targetDist = 60 + heartbeat * 80;
        if (d > 1) {
          var pullStrength = (d > targetDist) ? 0.01 : -0.005;
          t.vx += (dx / d) * pullStrength * d * 0.05;
          t.vy += (dy / d) * pullStrength * d * 0.05;
        }
        // Synchronized rotation
        t.rotation = Math.sin(time * 0.001 + t.phase) * 0.5;
      } else {
        // Urban: Grid formation ↔ organic distortion
        var gridPhase = Math.sin(time * 0.001) * 0.5 + 0.5; // 0→1
        var perRow = Math.ceil(Math.sqrt(tris.length / 3));
        var localIdx = i - Math.floor(tris.length * 2 / 3);
        var gridX = center.x - 80 + (localIdx % perRow) * 20;
        var gridY = center.y - 80 + Math.floor(localIdx / perRow) * 20;
        var organicX = center.x + Math.cos(t.phase + time * 0.0005) * 60;
        var organicY = center.y + Math.sin(t.phase + time * 0.0005) * 60;
        var tx = lerp(organicX, gridX, gridPhase);
        var ty = lerp(organicY, gridY, gridPhase);
        t.vx += (tx - t.x) * 0.02;
        t.vy += (ty - t.y) * 0.02;
        // Snap rotation in grid phase
        t.rotation = lerp(t.rotation, 0, gridPhase * 0.05);
      }

      t.vx *= 0.96;
      t.vy *= 0.96;
      t.x += t.vx;
      t.y += t.vy;

      // Trail
      t.trail.push({ x: t.x, y: t.y });
      if (t.trail.length > t.trailMax) t.trail.shift();
    }

    // Cross-swarm connection lines (faint)
    if (quality > 0.7 && local > 0.3) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(87, 129, 161, 0.04)';
      ctx.lineWidth = 0.5;
      for (var s = 0; s < 3; s++) {
        var next = (s + 1) % 3;
        // Draw a few connecting lines between nearest triangles of different swarms
        var startIdx = Math.floor(tris.length * s / 3);
        var endIdx = Math.floor(tris.length * next / 3);
        for (var j = 0; j < 3; j++) {
          var ai = startIdx + Math.floor(Math.random() * (tris.length / 3));
          var bi = endIdx + Math.floor(Math.random() * (tris.length / 3));
          if (ai < tris.length && bi < tris.length) {
            ctx.moveTo(tris[ai].x, tris[ai].y);
            ctx.lineTo(tris[bi].x, tris[bi].y);
          }
        }
      }
      ctx.stroke();
    }
  }

  // ========================================
  // PHASE 6: CONVERGENCE (85–100%)
  // ========================================
  function phase6_update(local, time) {
    var centerX = W / 2;
    var centerY = H / 2;
    var breath = Math.sin(time * 0.001) * 15;
    var pullStrength = smoothstep(0, 0.5, local) * 0.025;

    buildGrid(tris);

    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];

      // Pull toward center
      var dx = centerX - t.x;
      var dy = centerY + breath - t.y;
      var d = Math.sqrt(dx * dx + dy * dy);

      if (d > 1) {
        t.vx += (dx / d) * pullStrength * Math.min(d, 200) * 0.05;
        t.vy += (dy / d) * pullStrength * Math.min(d, 200) * 0.05;
      }

      // Bonding (strong)
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
            var springF = (bd - idealDist) * CFG.bondSpring * 1.5;
            t.vx += (bdx / bd) * springF;
            t.vy += (bdy / bd) * springF;
            b.vx -= (bdx / bd) * springF;
            b.vy -= (bdy / bd) * springF;
          }
        }

        if (bd < (t.size + b.size) * CFG.separation && bd > 0) {
          var sep = ((t.size + b.size) * CFG.separation - bd) * 0.06;
          t.vx -= (bdx / bd) * sep;
          t.vy -= (bdy / bd) * sep;
          b.vx += (bdx / bd) * sep;
          b.vy += (bdy / bd) * sep;
        }
      }

      // Mouse interaction (re-enabled in phase 6)
      if (mouse.active && local > 0.3) {
        var mdx = mouse.x - t.x;
        var mdy = mouse.y - t.y;
        var md = Math.sqrt(mdx * mdx + mdy * mdy);
        if (md < CFG.attractRadius && md > 1) {
          var mf = CFG.attractForce * (1 - md / CFG.attractRadius) * local;
          t.vx += (mdx / md) * mf * md * 0.1;
          t.vy += (mdy / md) * mf * md * 0.1;
        }
      }

      // Damping
      var damp = t.bondCount > 0 ? CFG.dampBonded : CFG.dampFree;
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

    // Ripple waves through formation
    if (local > 0.5 && quality > 0.7) {
      var ripplePhase = time * 0.002;
      for (var i = 0; i < tris.length; i++) {
        var t = tris[i];
        var rd = dist(t.x, t.y, centerX, centerY);
        var ripple = Math.sin(rd * 0.03 - ripplePhase) * 0.5 + 0.5;
        t.opacity = lerp(t.baseOpacity * 0.7, t.baseOpacity, ripple);
      }
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

    if (newPhase === 0 && prevPhase === -1) {
      phase1_init();
    }

    // Smooth repositioning for major phase changes
    if (newPhase === 3 && prevPhase !== 3) {
      // Entering waterfall: spread triangles across streams
      var streams = [W * 0.3, W * 0.5, W * 0.7];
      for (var i = 0; i < tris.length; i++) {
        var si = i % 3;
        tris[i].x = lerp(tris[i].x, streams[si] + rand(-40, 40), 0.3);
        tris[i].y = lerp(tris[i].y, rand(-60, H * 0.3), 0.3);
      }
    }
  }

  // ========================================
  // MAIN RENDER LOOP
  // ========================================
  var lastTime = 0;

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

    // Update dust
    updateDust(time);

    // Update triangles per phase
    switch (p.index) {
      case 0: phase1_update(p.local, time); break;
      case 1: phase2_update(p.local, time); break;
      case 2: phase3_update(p.local, time); break;
      case 3: phase4_update(p.local, time); break;
      case 4: phase5_update(p.local, time); break;
      case 5: phase6_update(p.local, time); break;
    }

    // Update splashes
    updateSplashes();

    // --- Draw layers ---
    // 1. Dust (background)
    drawDust();

    // 2. Motion trails
    drawTrails(tris);

    // 3. Bond lines
    drawBonds(tris, bonds);

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
  setupDesktopReveals();
  requestAnimationFrame(frame);

})();

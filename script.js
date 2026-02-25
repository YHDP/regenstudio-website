// ========================================
// Regen Studio — Combined Script
// Trial2 triangle simulation (hero) +
// Page interactions & scroll animations
// ========================================

(function () {
  'use strict';

  // --- i18n helper ---
  var _i18n = window.__i18n || { t: function (k, f) { return f || k; }, lang: 'en' };
  function t(key, fallback) { return _i18n.t(key, fallback); }

  // =============================================
  // 1. TRIANGLE SIMULATION (from trial2)
  // =============================================

  var isMobile = window.innerWidth < 768;
  var isLowEnd = isMobile && (navigator.hardwareConcurrency || 4) < 4;

  const CFG = {
    count: isLowEnd ? 60 : isMobile ? 40 : 180,
    minSize: 10,
    maxSize: 28,
    driftSpeed: 0.4,
    attractRadius: isMobile ? 160 : 220,
    attractForce: 0.012,
    bondDist: 1.18,
    bondSpring: 0.055,
    separation: 0.85,
    separationRadius: 1.0,
    disperseForce: 2.8,
    dampFree: 0.989,
    dampBonded: 0.92,
    bondLineOpacity: 0.14,
    glowRadius: isMobile ? 0 : 6,
    glowOpacity: 0.12,
    dustCount: isLowEnd ? 20 : isMobile ? 15 : 60,
    dustSize: 1.5,
    dustSpeed: 0.15,
  };

  const PALETTE = [
    { r: 147, g: 9, b: 63 },
    { r: 231, g: 24, b: 70 },
    { r: 255, g: 169, b: 45 },
    { r: 101, g: 221, b: 53 },
    { r: 0, g: 145, b: 75 },
    { r: 0, g: 155, b: 187 },
  ];

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const canvasWrap = document.querySelector('.hero-canvas-wrap');
  let W, H, dpr;

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

  // --- Mouse ---
  const mouse = { x: -9999, y: -9999, active: false };
  const RETAIN_MS = 25000;

  // --- Drag state ---
  // drag.anchorId: the triangle directly grabbed (follows cursor rigidly)
  // drag.clusterIds: Set of all cluster member IDs (follow via physics)
  var drag = { active: false, anchorId: -1, clusterIds: new Set(), offsetX: 0, offsetY: 0, startX: 0, startY: 0, moved: false };
  var DRAG_THRESHOLD = 6;

  function findTriangleAt(x, y) {
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];
      var dx = x - t.x;
      var dy = y - t.y;
      var d = dx * dx + dy * dy;
      if (d < t.radius * t.radius * 4 && d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  function findClusterOf(tri) {
    // If the triangle is bonded, flood-fill to get the whole cluster
    if (tri.bondCount < 1 || tri.attractT < 0.05) return null;

    var cluster = new Set();
    var queue = [tri.id];
    cluster.add(tri.id);
    while (queue.length > 0) {
      var id = queue.shift();
      bonds.forEach(function (key) {
        var parts = key.split('-');
        var a = parseInt(parts[0]);
        var b = parseInt(parts[1]);
        if (a === id && !cluster.has(b)) { cluster.add(b); queue.push(b); }
        if (b === id && !cluster.has(a)) { cluster.add(a); queue.push(a); }
      });
    }
    return cluster.size > 1 ? cluster : null;
  }

  function disperseCluster(cluster) {
    cluster.forEach(function (id) {
      var t = tris[id];
      t.attracted = false;
      t.attractT = 0.03;
      t.retainUntil = 0;
      var angle = Math.random() * Math.PI * 2;
      t.vx += Math.cos(angle) * CFG.disperseForce * 1.5;
      t.vy += Math.sin(angle) * CFG.disperseForce * 1.5;
    });
  }

  function startDrag(x, y) {
    var hit = findTriangleAt(x, y);
    if (!hit) return false;

    drag.startX = x;
    drag.startY = y;
    drag.moved = false;
    drag.active = true;
    drag.anchorId = hit.id;
    drag.offsetX = hit.x - x;
    drag.offsetY = hit.y - y;
    mouse.active = false;

    // Check if the triangle is part of a cluster
    var cluster = findClusterOf(hit);
    drag.clusterIds = cluster || new Set([hit.id]);

    // Store each member's relative offset from anchor for shape preservation
    drag.offsets = {};
    drag.clusterIds.forEach(function (id) {
      var t = tris[id];
      drag.offsets[id] = { rx: t.x - hit.x, ry: t.y - hit.y };
    });

    // Snapshot existing bonds between cluster members so they persist
    drag.frozenBonds = new Set();
    bonds.forEach(function (key) {
      var parts = key.split('-');
      var a = parseInt(parts[0]);
      var b = parseInt(parts[1]);
      if (drag.clusterIds.has(a) && drag.clusterIds.has(b)) {
        drag.frozenBonds.add(key);
      }
    });

    return true;
  }

  function moveDrag(x, y) {
    if (!drag.active) return;

    // Check if we've exceeded the drag threshold
    if (!drag.moved) {
      var dx = x - drag.startX;
      var dy = y - drag.startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
      drag.moved = true;
    }

    var now = performance.now();

    // Only the anchor triangle follows the cursor rigidly
    var anchor = tris[drag.anchorId];
    anchor.x = x + drag.offsetX;
    anchor.y = y + drag.offsetY;
    anchor.vx = 0;
    anchor.vy = 0;
    anchor.attracted = true;
    anchor.attractT = 1;
    anchor.retainUntil = now + RETAIN_MS;

    // Keep cluster members attracted and bonded — physics pulls them along
    drag.clusterIds.forEach(function (id) {
      if (id === drag.anchorId) return;
      var t = tris[id];
      t.attracted = true;
      t.attractT = 1;
      t.retainUntil = now + RETAIN_MS;
    });

    canvas.style.cursor = 'grabbing';
  }

  function endDrag() {
    if (!drag.active) return;

    // If we never moved past threshold, treat as a click → disperse
    if (!drag.moved && drag.clusterIds.size > 1) {
      disperseCluster(drag.clusterIds);
    }

    drag.active = false;
    drag.anchorId = -1;
    drag.clusterIds = new Set();
    drag.offsets = {};
    drag.frozenBonds = new Set();
    mouse.active = true;
    canvas.style.cursor = '';
  }

  canvas.addEventListener('mousedown', function (e) {
    startDrag(e.clientX, e.clientY);
  });

  canvas.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (drag.active) {
      moveDrag(e.clientX, e.clientY);
    } else {
      mouse.active = true;
      var hover = findTriangleAt(e.clientX, e.clientY);
      canvas.style.cursor = hover ? 'grab' : '';
    }
  });

  canvas.addEventListener('mouseup', function () {
    endDrag();
  });

  canvas.addEventListener('mouseleave', function () {
    mouse.active = false;
    if (drag.active) {
      drag.active = false;
      drag.clusterIds = new Set();
    }
  });

  // Touch interaction only on desktop — mobile gets ambient animation only
  if (!isMobile) {
    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var touch = e.touches[0];
      if (!startDrag(touch.clientX, touch.clientY)) {
        mouse.x = touch.clientX;
        mouse.y = touch.clientY;
        mouse.active = true;
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      var touch = e.touches[0];
      if (drag.active) {
        moveDrag(touch.clientX, touch.clientY);
      } else {
        mouse.x = touch.clientX;
        mouse.y = touch.clientY;
      }
    }, { passive: false });

    canvas.addEventListener('touchend', function () {
      endDrag();
      mouse.active = false;
    });
    canvas.addEventListener('touchcancel', function () {
      drag.active = false;
      drag.clusterIds = new Set();
      mouse.active = false;
    });
  }

  // --- Ambient dust particles ---
  var dust = [];

  function createDust() {
    dust = [];
    for (var i = 0; i < CFG.dustCount; i++) {
      dust.push({
        x: Math.random() * W,
        y: 90 + Math.random() * (H - 90),
        vx: (Math.random() - 0.5) * CFG.dustSpeed,
        vy: (Math.random() - 0.5) * CFG.dustSpeed,
        size: 0.5 + Math.random() * CFG.dustSize,
        opacity: 0.08 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function updateDust(time) {
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      d.x += d.vx;
      d.y += d.vy;
      d.opacity = 0.06 + Math.sin(time * 0.0005 + d.phase) * 0.06;

      if (d.x < -10) d.x = W + 10;
      if (d.x > W + 10) d.x = -10;
      if (d.y < 90) d.y = 90;
      if (d.y > H + 10) d.y = 90;
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

  // --- Triangle ---
  function Triangle(i) {
    this.id = i;
    this.init();
  }

  Triangle.prototype.init = function () {
    // Spawn on right half, below nav area
    var navClear = 90;
    this.x = W * 0.5 + Math.random() * W * 0.5;
    this.y = navClear + Math.random() * (H - navClear);
    this.vx = (Math.random() - 0.5) * CFG.driftSpeed * 2;
    this.vy = (Math.random() - 0.5) * CFG.driftSpeed * 2;
    this.size = CFG.minSize + Math.random() * (CFG.maxSize - CFG.minSize);
    this.radius = this.size * 0.58;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.01;
    this.color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    this.opacity = 0.5 + Math.random() * 0.25;
    this.baseOpacity = this.opacity;
    this.skew = 0.85 + Math.random() * 0.3;
    this.attracted = false;
    this.attractT = 0;
    this.bondCount = 0;
    this.retainUntil = 0;
    this.trail = [];
    this.trailMax = 4;
  };

  // --- Bond tracking ---
  var bonds = new Set();

  function bondKey(a, b) {
    return a < b ? a + '-' + b : b + '-' + a;
  }

  // --- Triangles ---
  var tris = [];

  function createTriangles() {
    tris = [];
    bonds.clear();
    for (var i = 0; i < CFG.count; i++) {
      tris.push(new Triangle(i));
    }
  }

  // --- Spatial hash ---
  var CELL = 80;
  var grid = {};

  function hashKey(cx, cy) { return cx + ',' + cy; }

  function buildGrid() {
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

  function getNeighborIndices(x, y, r) {
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

  // --- Physics ---
  function update() {
    buildGrid();

    var ar = CFG.attractRadius;
    var ar2 = ar * ar;
    var isHovering = mouse.active;
    var now = performance.now();

    // Phase 1: Attraction state (per-triangle retention)
    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];

      var inRadius = false;
      if (isHovering) {
        var dx = mouse.x - t.x;
        var dy = mouse.y - t.y;
        inRadius = (dx * dx + dy * dy < ar2);
      }

      if (inRadius) {
        t.attracted = true;
        t.attractT = Math.min(1, t.attractT + 0.045);
        t.retainUntil = now + RETAIN_MS;
      } else if (t.attractT > 0.05 && now < t.retainUntil) {
        t.attracted = true;
        var remaining = (t.retainUntil - now) / RETAIN_MS;
        var decay = 0.001 * (1 - remaining);
        t.attractT = Math.max(0.05, t.attractT - decay);
      } else {
        t.attracted = false;
        t.attractT = Math.max(0, t.attractT - 0.025);
      }
    }

    // Build lookup: which triangles are actively in the mouse radius right now
    var inRadiusLookup = new Uint8Array(tris.length);
    if (isHovering) {
      for (var i = 0; i < tris.length; i++) {
        var t = tris[i];
        var dx = mouse.x - t.x;
        var dy = mouse.y - t.y;
        if (dx * dx + dy * dy < ar2) inRadiusLookup[i] = 1;
      }
    }

    // Phase 2: Attraction force
    if (isHovering) {
      for (var i = 0; i < tris.length; i++) {
        var t = tris[i];
        if (t.attractT < 0.01) continue;

        var dx = mouse.x - t.x;
        var dy = mouse.y - t.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1) continue;

        var closeness = Math.max(0, 1 - d / ar);
        var distFactor = Math.min(1, d / 45);
        var force = CFG.attractForce * closeness * distFactor * t.attractT;

        t.vx += (dx / d) * force * d * 0.14;
        t.vy += (dy / d) * force * d * 0.14;
      }
    }

    // Phase 2b: Drag cluster — shape-preserving tether with fluid motion
    var isDragging = drag.active && drag.moved && drag.anchorId >= 0;
    if (isDragging) {
      var anchor = tris[drag.anchorId];
      drag.clusterIds.forEach(function (id) {
        if (id === drag.anchorId) return;
        var t = tris[id];
        var off = drag.offsets[id];
        // Target position = anchor + original relative offset
        var targetX = anchor.x + off.rx;
        var targetY = anchor.y + off.ry;
        var dx = targetX - t.x;
        var dy = targetY - t.y;
        // Smooth interpolation toward target — preserves shape, allows fluid lag
        t.vx += dx * 0.08;
        t.vy += dy * 0.08;
      });
    }

    // Phase 3: Separation + bonding
    var activeBonds = 0;
    var newBonds = new Set();

    for (var i = 0; i < tris.length; i++) {
      var a = tris[i];
      if (a.attractT < 0.05) continue;

      var neighbors = getNeighborIndices(a.x, a.y, a.radius * 3 + CFG.maxSize);
      a.bondCount = 0;

      for (var ni = 0; ni < neighbors.length; ni++) {
        var j = neighbors[ni];
        if (j <= i) continue;
        var b = tris[j];
        if (b.attractT < 0.05) continue;

        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var d2 = dx * dx + dy * dy;
        var combinedR = a.radius + b.radius;
        var bondThresh = combinedR * CFG.bondDist;

        // During drag, never break bonds between cluster members
        var isFrozen = isDragging && drag.frozenBonds.has(bondKey(a.id, b.id));
        if (!isFrozen && d2 > bondThresh * bondThresh) continue;

        var d = Math.sqrt(d2);
        if (d < 0.5) continue;

        var nx = dx / d;
        var ny = dy / d;

        // Soften forces when cluster is being dragged
        var aDragged = isDragging && drag.clusterIds.has(a.id);
        var bDragged = isDragging && drag.clusterIds.has(b.id);
        var dragScale = (aDragged || bDragged) ? 0.15 : 1;

        // Separation
        var sepThresh = combinedR * CFG.separationRadius;
        if (d < sepThresh) {
          var overlap = sepThresh - d;
          var push = overlap * CFG.separation * dragScale;
          a.vx -= nx * push;
          a.vy -= ny * push;
          b.vx += nx * push;
          b.vy += ny * push;
        }

        // Bond spring
        var idealDist = combinedR * 1.02;
        var spring = (d - idealDist) * CFG.bondSpring * dragScale;
        a.vx += nx * spring;
        a.vy += ny * spring;
        b.vx -= nx * spring;
        b.vy -= ny * spring;

        newBonds.add(bondKey(a.id, b.id));
        a.bondCount++;
        b.bondCount++;
        activeBonds++;
      }
    }

    bonds.clear();
    newBonds.forEach(function (k) { bonds.add(k); });
    // Ensure frozen bonds persist during drag even if not recalculated
    if (isDragging) {
      drag.frozenBonds.forEach(function (k) { bonds.add(k); });
    }

    // Phase 4: Integration
    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];

      // Only the anchor triangle is pinned to cursor — skip its physics
      if (isDragging && t.id === drag.anchorId) continue;

      // Fluid damping for dragged cluster members — underwater feel
      if (isDragging && drag.clusterIds.has(t.id)) {
        t.vx *= 0.85;
        t.vy *= 0.85;
      }

      // Store trail
      if (t.attractT > 0.1) {
        t.trail.push({ x: t.x, y: t.y });
        if (t.trail.length > t.trailMax) t.trail.shift();
      } else if (t.trail.length > 0) {
        t.trail.shift();
      }

      var triRetaining = t.attracted && !inRadiusLookup[i] && now < t.retainUntil;

      if (t.attractT < 0.01) {
        // Free-floating
        var speed = Math.sqrt(t.vx * t.vx + t.vy * t.vy);
        if (speed < CFG.driftSpeed * 0.25) {
          var angle = Math.random() * Math.PI * 2;
          t.vx += Math.cos(angle) * 0.05;
          t.vy += Math.sin(angle) * 0.05;
        }
        t.vx *= CFG.dampFree;
        t.vy *= CFG.dampFree;
        t.opacity += (t.baseOpacity - t.opacity) * 0.035;
        t.rotSpeed += ((Math.random() - 0.5) * 0.01 - t.rotSpeed) * 0.008;
      } else if (triRetaining && t.bondCount > 0) {
        // Retention: heavy damping to freeze the structure in place
        t.vx *= 0.86;
        t.vy *= 0.86;
        t.rotSpeed *= 0.94;
        var retainOpacity = t.baseOpacity + t.attractT * 0.3;
        t.opacity += (retainOpacity - t.opacity) * 0.02;
      } else {
        // Actively attracted (mouse pulling)
        t.vx *= CFG.dampBonded;
        t.vy *= CFG.dampBonded;
        t.opacity += (Math.min(1, t.baseOpacity + t.attractT * 0.4) - t.opacity) * 0.06;
        if (t.bondCount > 0) {
          t.rotSpeed *= 0.9;
        }
      }

      // Disperse only after this triangle's retention period ends
      if (!t.attracted && t.attractT > 0.01 && t.attractT < 0.04) {
        var angle = Math.random() * Math.PI * 2;
        t.vx += Math.cos(angle) * CFG.disperseForce;
        t.vy += Math.sin(angle) * CFG.disperseForce;
      }

      t.x += t.vx;
      t.y += t.vy;
      t.rotation += t.rotSpeed;

      var pad = t.size * 2;
      var navClear = 90;
      if (t.x < -pad) t.x += W + pad * 2;
      if (t.x > W + pad) t.x -= W + pad * 2;
      if (t.y < navClear) { t.y = navClear; t.vy = Math.abs(t.vy) * 0.5; }
      if (t.y > H + pad) t.y -= H - navClear + pad * 2;
    }

    return activeBonds;
  }

  // --- Rendering ---
  function drawTrianglePath(s, h) {
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.667);
    ctx.lineTo(s * 0.5, h * 0.333);
    ctx.lineTo(-s * 0.5, h * 0.333);
    ctx.closePath();
  }

  function draw(activeBonds, time) {
    ctx.clearRect(0, 0, W, H);

    // Ambient dust
    drawDust();

    // Bond lines
    if (bonds.size > 0) {
      bonds.forEach(function (key) {
        var parts = key.split('-');
        var a = tris[parseInt(parts[0])];
        var b = tris[parseInt(parts[1])];
        var alpha = CFG.bondLineOpacity * Math.min(a.attractT, b.attractT);
        if (alpha < 0.004) return;

        var r = Math.round((a.color.r + b.color.r) / 2);
        var g = Math.round((a.color.g + b.color.g) / 2);
        var bl = Math.round((a.color.b + b.color.b) / 2);

        ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + bl + ',' + alpha + ')';
        ctx.lineWidth = 0.8;

        var mx = (a.x + b.x) / 2;
        var my = (a.y + b.y) / 2;
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var perpX = -dy * 0.05;
        var perpY = dx * 0.05;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx + perpX, my + perpY, b.x, b.y);
        ctx.stroke();
      });
    }

    // Trails for attracted triangles
    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];
      if (t.trail.length < 2) continue;

      var c = t.color;
      for (var j = 0; j < t.trail.length - 1; j++) {
        var progress = j / t.trail.length;
        var alpha = progress * 0.06 * t.attractT;
        if (alpha < 0.002) continue;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';

        var tp = t.trail[j];
        var trailSize = t.size * 0.4 * progress;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, trailSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Triangles
    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];
      var c = t.color;
      var s = t.size;
      var h = s * 0.866 * t.skew;

      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.rotation);

      // Soft glow behind bonded triangles
      if (CFG.glowRadius > 0 && t.bondCount > 0 && t.attractT > 0.2) {
        ctx.globalAlpha = t.attractT * CFG.glowOpacity;
        ctx.shadowColor = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
        ctx.shadowBlur = CFG.glowRadius * t.attractT;
        drawTrianglePath(s * 1.1, h * 1.1);
        ctx.fillStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0.3)';
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Main triangle
      ctx.globalAlpha = t.opacity;
      drawTrianglePath(s, h);
      ctx.fillStyle = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
      ctx.fill();

      // Subtle edge stroke on bonded
      if (t.bondCount > 0 && t.attractT > 0.15) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (t.attractT * 0.2) + ')';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      ctx.restore();
    }

    // Mouse attraction field
    if (mouse.active) {
      var grad = ctx.createRadialGradient(
        mouse.x, mouse.y, 0,
        mouse.x, mouse.y, CFG.attractRadius
      );
      grad.addColorStop(0, 'rgba(0, 145, 75, 0.03)');
      grad.addColorStop(0.5, 'rgba(0, 155, 187, 0.015)');
      grad.addColorStop(1, 'rgba(0, 145, 75, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, CFG.attractRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Canvas scroll fade ---
  var simulationRunning = true;
  var frozen = false;

  // --- Freeze button ---
  var freezeBtn = document.getElementById('freezeBtn');
  if (freezeBtn) {
    var freezePanel = document.getElementById('freezePanel');

    freezeBtn.addEventListener('click', function () {
      frozen = !frozen;
      freezeBtn.classList.toggle('frozen', frozen);
      var textEl = freezeBtn.querySelector('.freeze-btn__text');
      var iconEl = freezeBtn.querySelector('.freeze-btn__icon');
      if (frozen) {
        textEl.textContent = t('hero.unfreeze', 'Unfreeze');
        iconEl.innerHTML = '<polygon points="6,3 20,12 6,21" fill="currentColor" stroke="none"/>';
        if (freezePanel) freezePanel.classList.add('visible');
      } else {
        textEl.textContent = t('hero.freeze', 'Freeze your creation');
        iconEl.innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>';
        if (freezePanel) freezePanel.classList.remove('visible');
      }
    });

    // --- Export template compositing ---
    // --- Centralized social profiles & company info ---
    var COMPANY = {
      name: 'Regen Studio',
      url: 'https://www.regenstudio.world',
      tagline: 'Designing innovations that regenerate humans, cities and nature.',
      email: 'info@regenstudio.world',
      profiles: {
        linkedin: 'https://www.linkedin.com/company/regen-studio-world/',
        bluesky: 'https://bsky.app/profile/regen-studio.bsky.social',
        mastodon: 'https://mastodon.social/@regen_studio',
      }
    };

    var shareUrl = COMPANY.url;
    var companyName = COMPANY.name;
    var linkedInPage = COMPANY.profiles.linkedin;
    var blueskyHandle = '@regen-studio.bsky.social';

    // Per-platform pre-formatted messages
    var shareMessages = {
      bluesky: 'I just created emergent art from an ecosystem of triangles\n\nMade with ' + blueskyHandle + ' — designing innovations that regenerate humans, cities and nature.\n\n' + shareUrl,
      linkedin: 'I just created emergent art from an ecosystem of interactive triangles at ' + companyName + ' — designing innovations that regenerate humans, cities and nature.\n\nTry it yourself: ' + shareUrl + '\n\nFollow ' + companyName + ': ' + linkedInPage,
      mastodon: 'I just created emergent art from an ecosystem of triangles\n\nMade with @regen_studio@mastodon.social — designing innovations that regenerate humans, cities and nature.\n\n' + shareUrl + '\n\n#RegenerativeDesign #GenerativeArt #Innovation',
      reddit: 'Emergent Art — Interactive triangle ecosystem by Regen Studio',
      whatsapp: 'I just created emergent art from an ecosystem of triangles at ' + companyName + ' — try it yourself! ' + shareUrl,
      email: {
        subject: 'Emergent Art — Made with ' + companyName,
        body: 'I just created emergent art from an interactive ecosystem of triangles at ' + companyName + '.\n\n' + companyName + ' designs innovations that regenerate humans, cities and nature.\n\nTry it yourself: ' + shareUrl + '\n\nLearn more: ' + linkedInPage
      },
      native: 'I just created emergent art from an ecosystem of triangles at ' + companyName + ' — designing innovations that regenerate humans, cities and nature.'
    };

    // Preload the logo SVG as an Image
    var logoImg = new Image();
    var logoLoaded = false;
    logoImg.onload = function () { logoLoaded = true; };
    logoImg.src = 'Images/Logo-Text-on-the-sideAtivo 2.svg';

    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    function createExportImage(callback) {
      // 2x resolution for crisp output (1x on mobile to avoid large pixel buffers)
      var S = isMobile ? 1 : 2;
      var EW = 1200 * S;
      var EH = 630 * S;
      var ex = document.createElement('canvas');
      ex.width = EW;
      ex.height = EH;
      var ec = ex.getContext('2d');
      ec.scale(S, S);
      // Work in logical 1200x630 coords from here

      var LW = 1200;
      var LH = 630;

      // 1. White background
      ec.fillStyle = '#FAFBFC';
      ec.fillRect(0, 0, LW, LH);

      // 2. Subtle gradient accent
      var grad = ec.createRadialGradient(0, LH, 0, 0, LH, LW * 0.5);
      grad.addColorStop(0, 'rgba(0, 145, 75, 0.035)');
      grad.addColorStop(0.5, 'rgba(0, 155, 187, 0.02)');
      grad.addColorStop(1, 'transparent');
      ec.fillStyle = grad;
      ec.fillRect(0, 0, LW, LH);

      // 3. Triangle art — right side, large, cropped from right 65% of canvas
      var pad = 28;
      var srcX = canvas.width * 0.3;
      var srcY = 0;
      var srcW = canvas.width * 0.7;
      var srcH = canvas.height;

      // Art takes ~72% of export width
      var destW = LW * 0.72;
      var destH = LH - pad * 2;
      var destX = LW - destW - pad;
      var destY = pad;

      // Rounded clip
      var cr = 16;
      ec.save();
      roundRect(ec, destX, destY, destW, destH, cr);
      ec.clip();
      ec.drawImage(canvas, srcX, srcY, srcW, srcH, destX, destY, destW, destH);
      ec.restore();

      // Soft border
      ec.save();
      roundRect(ec, destX, destY, destW, destH, cr);
      ec.strokeStyle = 'rgba(36, 54, 68, 0.05)';
      ec.lineWidth = 1;
      ec.stroke();
      ec.restore();

      // 4. Left panel — beautiful branded composition
      var leftW = destX - pad;
      var centerX = pad + leftW / 2;

      // --- Background beauty layer ---
      // Soft emerald glow orb (top-left of panel)
      var orbGrad = ec.createRadialGradient(
        centerX - leftW * 0.2, LH * 0.25, 0,
        centerX - leftW * 0.2, LH * 0.25, leftW * 0.7
      );
      orbGrad.addColorStop(0, 'rgba(0, 145, 75, 0.06)');
      orbGrad.addColorStop(0.5, 'rgba(0, 155, 187, 0.03)');
      orbGrad.addColorStop(1, 'transparent');
      ec.fillStyle = orbGrad;
      ec.fillRect(0, 0, destX, LH);

      // Soft teal glow orb (bottom-right of panel)
      var orbGrad2 = ec.createRadialGradient(
        centerX + leftW * 0.3, LH * 0.75, 0,
        centerX + leftW * 0.3, LH * 0.75, leftW * 0.5
      );
      orbGrad2.addColorStop(0, 'rgba(0, 155, 187, 0.04)');
      orbGrad2.addColorStop(1, 'transparent');
      ec.fillStyle = orbGrad2;
      ec.fillRect(0, 0, destX, LH);

      // Scatter a few tiny decorative triangles in the left panel
      ec.save();
      var decoTris = [
        { x: centerX - leftW * 0.35, y: LH * 0.15, size: 8, rot: 0.3, color: 'rgba(0, 145, 75, 0.07)' },
        { x: centerX + leftW * 0.3, y: LH * 0.22, size: 6, rot: -0.5, color: 'rgba(0, 155, 187, 0.06)' },
        { x: centerX - leftW * 0.25, y: LH * 0.82, size: 10, rot: 0.8, color: 'rgba(255, 169, 45, 0.06)' },
        { x: centerX + leftW * 0.35, y: LH * 0.88, size: 7, rot: -0.2, color: 'rgba(231, 24, 70, 0.05)' },
        { x: centerX - leftW * 0.1, y: LH * 0.12, size: 5, rot: 1.2, color: 'rgba(101, 221, 53, 0.06)' },
        { x: centerX + leftW * 0.15, y: LH * 0.9, size: 9, rot: 2.0, color: 'rgba(147, 9, 63, 0.05)' },
      ];
      decoTris.forEach(function (dt) {
        ec.save();
        ec.translate(dt.x, dt.y);
        ec.rotate(dt.rot);
        ec.beginPath();
        var h = dt.size * 0.866;
        ec.moveTo(0, -h * 0.667);
        ec.lineTo(dt.size * 0.5, h * 0.333);
        ec.lineTo(-dt.size * 0.5, h * 0.333);
        ec.closePath();
        ec.fillStyle = dt.color;
        ec.fill();
        ec.restore();
      });
      ec.restore();

      // --- Text content — vertically centered ---
      ec.textAlign = 'center';
      var spacing = 18;
      var y = LH / 2 - 70;

      // Title
      ec.font = '600 20px Inter, -apple-system, sans-serif';
      ec.fillStyle = '#243644';
      ec.fillText('Emergent Art', centerX, y);
      y += spacing;

      // Decorative line — three tiny triangles instead of a plain line
      var triSize = 4;
      var triGap = 14;
      var triColors = ['rgba(0, 145, 75, 0.35)', 'rgba(0, 155, 187, 0.3)', 'rgba(255, 169, 45, 0.3)'];
      for (var ti = -1; ti <= 1; ti++) {
        ec.save();
        ec.translate(centerX + ti * triGap, y);
        ec.rotate(ti * 0.3);
        ec.beginPath();
        var th = triSize * 0.866;
        ec.moveTo(0, -th * 0.667);
        ec.lineTo(triSize * 0.5, th * 0.333);
        ec.lineTo(-triSize * 0.5, th * 0.333);
        ec.closePath();
        ec.fillStyle = triColors[ti + 1];
        ec.fill();
        ec.restore();
      }
      y += spacing;

      // "Made with"
      ec.font = '400 11px Inter, -apple-system, sans-serif';
      ec.fillStyle = 'rgba(36, 54, 68, 0.4)';
      ec.fillText('Made with', centerX, y);
      y += 14;

      // Logo
      if (logoLoaded) {
        var logoMaxW = leftW * 0.75;
        var logoAspect = logoImg.naturalWidth / logoImg.naturalHeight;
        var logoW = Math.min(logoMaxW, 34 * logoAspect);
        var logoH = logoW / logoAspect;
        var logoX = centerX - logoW / 2;
        ec.drawImage(logoImg, logoX, y, logoW, logoH);
        y += logoH + spacing;
      }

      // Tagline
      ec.font = '300 10px Inter, -apple-system, sans-serif';
      ec.fillStyle = 'rgba(36, 54, 68, 0.28)';
      ec.fillText('Designing innovations that regenerate', centerX, y);
      y += 14;
      ec.fillText('humans, cities and nature.', centerX, y);
      y += spacing;

      // Website URL
      ec.font = '500 11.5px Inter, -apple-system, sans-serif';
      ec.fillStyle = 'rgba(0, 145, 75, 0.55)';
      ec.fillText('www.regenstudio.world', centerX, y);

      ec.textAlign = 'left';

      callback(ex.toDataURL('image/png'));
    }

    // Download button — saves image and reveals share step
    var downloadBtn = document.getElementById('freezeDownload');
    var shareStep = document.getElementById('freezeShareStep');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', function () {
        createExportImage(function (dataUrl) {
          var link = document.createElement('a');
          link.download = 'regen-studio-creation.png';
          link.href = dataUrl;
          link.click();
          downloadBtn.classList.add('downloaded');
          downloadBtn.querySelector('span').textContent = 'Saved! Download again';
          if (shareStep) shareStep.classList.add('revealed');
        });
      });
    }

    function showToast(msg) {
      var existing = document.querySelector('.share-toast');
      if (existing) existing.remove();
      var toast = document.createElement('div');
      toast.className = 'share-toast';
      toast.textContent = msg;
      document.body.appendChild(toast);
      requestAnimationFrame(function () { toast.classList.add('visible'); });
      setTimeout(function () {
        toast.classList.remove('visible');
        setTimeout(function () { toast.remove(); }, 400);
      }, 3000);
    }

    // Native share button — uses device share sheet
    var shareNativeBtn = document.getElementById('freezeShareNative');
    if (shareNativeBtn) {
      if (!navigator.share) {
        shareNativeBtn.style.display = 'none';
      } else {
        shareNativeBtn.addEventListener('click', function () {
          navigator.share({ title: 'Emergent Art — ' + companyName, text: shareMessages.native, url: shareUrl }).catch(function () {});
        });
      }
    }

    // Bluesky — open compose intent with pre-filled message
    var shareBskyBtn = document.getElementById('freezeShareBluesky');
    if (shareBskyBtn) {
      shareBskyBtn.addEventListener('click', function () {
        window.open('https://bsky.app/intent/compose?text=' + encodeURIComponent(shareMessages.bluesky), '_blank', 'width=600,height=500');
        showToast('Attach your saved image to the post!');
      });
    }

    // LinkedIn — pre-fill text in composer, prompt user to @tag
    var shareLinkedInBtn = document.getElementById('freezeShareLinkedIn');
    if (shareLinkedInBtn) {
      shareLinkedInBtn.addEventListener('click', function () {
        window.open('https://www.linkedin.com/feed/?shareActive=true&text=' + encodeURIComponent(shareMessages.linkedin), '_blank', 'width=600,height=600');
        showToast('Type @Regen Studio in the post to tag us!');
      });
    }

    // Mastodon — via Share2Fedi (handles instance selection)
    var shareMastodonBtn = document.getElementById('freezeShareMastodon');
    if (shareMastodonBtn) {
      shareMastodonBtn.addEventListener('click', function () {
        window.open('https://s2f.kytta.dev/?text=' + encodeURIComponent(shareMessages.mastodon), '_blank', 'width=600,height=500');
        showToast('Attach your saved image to the post!');
      });
    }

    // Reddit — open submit page with pre-filled title and URL
    var shareRedditBtn = document.getElementById('freezeShareReddit');
    if (shareRedditBtn) {
      shareRedditBtn.addEventListener('click', function () {
        window.open('https://reddit.com/submit?url=' + encodeURIComponent(shareUrl) + '&title=' + encodeURIComponent(shareMessages.reddit), '_blank', 'width=600,height=500');
        showToast('Attach your saved image to the post!');
      });
    }

    // WhatsApp — open with message text
    var shareWhatsAppBtn = document.getElementById('freezeShareWhatsApp');
    if (shareWhatsAppBtn) {
      shareWhatsAppBtn.addEventListener('click', function () {
        window.open('https://wa.me/?text=' + encodeURIComponent(shareMessages.whatsapp), '_blank');
      });
    }

    // Email — mailto with formatted subject and body
    var shareEmailBtn = document.getElementById('freezeShareEmail');
    if (shareEmailBtn) {
      shareEmailBtn.addEventListener('click', function () {
        window.location.href = 'mailto:?subject=' + encodeURIComponent(shareMessages.email.subject) + '&body=' + encodeURIComponent(shareMessages.email.body);
      });
    }
  }

  function updateCanvasScrollFade() {
    var scrollY = window.scrollY || window.pageYOffset;
    var viewH = window.innerHeight;
    var progress = Math.min(1, scrollY / viewH);
    var opacity = 1 - progress;

    if (canvasWrap) {
      canvasWrap.style.opacity = opacity;
      // Disable pointer events when scrolled past hero
      canvasWrap.style.pointerEvents = opacity < 0.1 ? 'none' : '';
    }

    // Pause simulation when fully scrolled past
    if (opacity <= 0 && simulationRunning) {
      simulationRunning = false;
    } else if (opacity > 0 && !simulationRunning) {
      simulationRunning = true;
    }

    // Hide freeze button and panel when scrolled past hero
    if (freezeBtn) {
      freezeBtn.classList.toggle('hidden', progress > 0.8);
    }
    var fp = document.getElementById('freezePanel');
    if (fp && progress > 0.8) {
      fp.classList.remove('visible');
    }
  }

  // --- Simulation main loop ---
  function loop(time) {
    if (simulationRunning && !frozen) {
      updateDust(time);
      var activeBonds = update();
      draw(activeBonds, time);
    }
    requestAnimationFrame(loop);
  }

  // --- Simulation init ---
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initSimulation() {
    resize();
    createTriangles();
    createDust();
    if (prefersReducedMotion) {
      // Draw a single static frame and stop
      updateDust(0);
      var activeBonds = update();
      draw(activeBonds, 0);
      simulationRunning = false;
    } else {
      requestAnimationFrame(loop);
    }
  }

  window.addEventListener('resize', function () {
    resize();
    createDust();
    if (prefersReducedMotion) {
      // Redraw static frame on resize, don't restart loop
      updateDust(0);
      var activeBonds = update();
      draw(activeBonds, 0);
    }
  });

  // =============================================
  // 2. PAGE INTERACTIONS
  // =============================================

  // --- Blog preview loader ---
  // --- Client logos loader ---
  function loadClientLogos() {
    var track = document.getElementById('clientLogosTrack');
    if (!track) return;

    fetch('Images/client-logos/logos.json')
      .then(function (r) { return r.json(); })
      .then(function (files) {
        if (!files.length) return;

        // Create two sets for seamless infinite scroll
        var html = '';
        for (var round = 0; round < 2; round++) {
          files.forEach(function (file) {
            html += '<img src="Images/client-logos/' + file + '" alt="Client logo" loading="lazy">';
          });
        }
        track.innerHTML = html;

        // Adjust animation speed based on number of logos
        var duration = Math.max(20, files.length * 4);
        track.style.animationDuration = duration + 's';
      })
      .catch(function () {
        // Fetch failed (e.g. file:// protocol) — keep placeholders visible
      });
  }

  function loadBlogPreview() {
    var grid = document.getElementById('blogPreviewGrid');
    if (!grid) return;

    fetch('Blogs/blogs.json')
      .then(function (r) { return r.json(); })
      .then(function (folders) {
        return Promise.all(folders.map(function (folder) {
          return fetch('Blogs/' + folder + '/meta.json')
            .then(function (r) { return r.json(); })
            .then(function (meta) { meta._folder = folder; return meta; });
        }));
      })
      .then(function (blogs) {
        var published = blogs
          .filter(function (b) { return b.published; })
          .sort(function (a, b) { return new Date(b.date) - new Date(a.date); })
          .slice(0, 3);

        published.forEach(function (blog) {
          var card = document.createElement('a');
          card.className = 'blog-card';
          card.href = '/blog/' + encodeURIComponent(blog.slug) + '/';

          var imageHtml;
          if (blog.featuredImage) {
            imageHtml = '<img class="blog-card__image" src="Blogs/' + blog._folder + '/' + blog.featuredImage + '" alt="' + (blog.featuredImageAlt || '') + '">';
          } else {
            imageHtml = '<div class="blog-card__placeholder"></div>';
          }

          var category = blog.categories && blog.categories[0] ? blog.categories[0] : 'Insight';
          var date = new Date(blog.date + 'T00:00:00');
          var dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

          card.innerHTML =
            imageHtml +
            '<div class="blog-card__body">' +
              '<span class="blog-card__category">' + category + '</span>' +
              '<h3 class="blog-card__title">' + blog.title + '</h3>' +
              '<p class="blog-card__excerpt">' + (blog.excerpt || blog.subtitle || '') + '</p>' +
              '<div class="blog-card__meta">' +
                '<span>' + dateStr + '</span>' +
                '<span class="blog-card__read">Read more &rarr;</span>' +
              '</div>' +
            '</div>';

          grid.appendChild(card);
        });

        // Apply reveal to dynamically added cards
        grid.querySelectorAll('.blog-card').forEach(function (el, i) {
          el.classList.add('reveal', 'reveal-delay-' + (i + 1));
          var obs = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                obs.unobserve(entry.target);
              }
            });
          }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
          obs.observe(el);
        });
      });
  }

  function initPage() {
    var nav = document.getElementById('nav');
    var navToggle = document.getElementById('navToggle');
    var navLinks = document.getElementById('navLinks');

    // --- Navbar scroll effect (rAF-batched) ---
    var scrollRafPending = false;
    function onScroll() {
      nav.classList.toggle('nav--scrolled', window.scrollY > 60);
      if (!scrollRafPending) {
        scrollRafPending = true;
        requestAnimationFrame(function () {
          scrollRafPending = false;
          updateCanvasScrollFade();
        });
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // --- Viewport toggle (desktop ↔ mobile preview) ---
    var viewportToggle = document.getElementById('viewportToggle');
    var mobileFrame = null;
    var mobileOverlay = null;

    // Hide toggle if inside an iframe (prevents recursion)
    if (window.self !== window.top && viewportToggle) {
      viewportToggle.style.display = 'none';
    }

    if (viewportToggle && window.self === window.top) {
      viewportToggle.addEventListener('click', function () {
        var isActive = viewportToggle.classList.toggle('active');

        if (isActive) {
          // Create overlay
          mobileOverlay = document.createElement('div');
          mobileOverlay.className = 'mobile-viewport-overlay';
          document.body.appendChild(mobileOverlay);

          // Create phone frame
          mobileFrame = document.createElement('div');
          mobileFrame.className = 'mobile-viewport-frame';
          mobileFrame.innerHTML = '<iframe src="' + window.location.href + '"></iframe>';
          document.body.appendChild(mobileFrame);

          // Animate in
          requestAnimationFrame(function () {
            mobileOverlay.classList.add('visible');
            mobileFrame.classList.add('visible');
          });

          // Close on overlay click
          mobileOverlay.addEventListener('click', function () {
            viewportToggle.click();
          });
        } else {
          // Animate out
          if (mobileFrame) mobileFrame.classList.remove('visible');
          if (mobileOverlay) mobileOverlay.classList.remove('visible');

          setTimeout(function () {
            if (mobileFrame) { mobileFrame.remove(); mobileFrame = null; }
            if (mobileOverlay) { mobileOverlay.remove(); mobileOverlay = null; }
          }, 400);
        }
      });
    }

    // --- Nav contact popover ---
    var navContactBtn = document.getElementById('navContactBtn');
    var navContactPopover = document.getElementById('navContactPopover');
    if (navContactBtn && navContactPopover) {
      navContactBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        navContactPopover.classList.toggle('open');
      });
      document.addEventListener('click', function (e) {
        if (!e.target.closest('.nav__contact-wrap')) {
          navContactPopover.classList.remove('open');
        }
      });
    }

    // --- Mobile menu toggle (iOS scroll lock) ---
    var savedScrollY = 0;

    function openNav() {
      savedScrollY = window.scrollY;
      document.body.classList.add('nav-open');
      document.body.style.top = -savedScrollY + 'px';
      navToggle.classList.add('active');
      navLinks.classList.add('open');
    }

    function closeNav() {
      document.body.classList.remove('nav-open');
      document.body.style.top = '';
      window.scrollTo(0, savedScrollY);
      navToggle.classList.remove('active');
      navLinks.classList.remove('open');
    }

    navToggle.addEventListener('click', function () {
      if (navLinks.classList.contains('open')) {
        closeNav();
      } else {
        openNav();
      }
    });

    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        closeNav();
      });
    });

    // --- Close menu on orientation change ---
    window.addEventListener('orientationchange', function () {
      if (navLinks.classList.contains('open')) {
        closeNav();
      }
    });

    // --- Hero entrance animations ---
    var heroElements = document.querySelectorAll('.hero .animate-in');
    heroElements.forEach(function (el, i) {
      setTimeout(function () {
        el.classList.add('visible');
      }, 200 + i * 150);
    });

    // --- Scroll-reveal animations ---
    // --- Load blog preview ---
    loadBlogPreview();
    loadClientLogos();

    var revealSelectors = [
      '.section__label',
      '.section__title',
      '.focus__card',
      '.service',
      '.client-type',
      '.about__text',
      '.about__visual',
      '.approach__banner',
      '.blog-card',
      '.cta__inner'
    ];

    revealSelectors.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (el, i) {
        if (!el.classList.contains('reveal')) {
          el.classList.add('reveal');
          if (selector === '.focus__card' || selector === '.service' || selector === '.client-type') {
            el.classList.add('reveal-delay-' + ((i % 6) + 1));
          }
        }
      });
    });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px'
    });

    document.querySelectorAll('.reveal').forEach(function (el) {
      observer.observe(el);
    });

    // --- Smooth scroll for anchor links ---
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        var target = document.querySelector(link.getAttribute('href'));
        if (target) {
          e.preventDefault();
          var offset = nav.offsetHeight + 20;
          var top = target.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({ top: top, behavior: 'smooth' });
        }
      });
    });

    // --- Copy-to-clipboard for email buttons ---
    document.addEventListener('click', function (e) {
      // CTA copyable email button
      var copyBtn = e.target.closest('.copyable-email__btn');
      if (copyBtn) {
        var email = copyBtn.getAttribute('data-email');
        navigator.clipboard.writeText(email).then(function () {
          var label = copyBtn.querySelector('.copyable-email__label');
          copyBtn.classList.add('copied');
          if (label) label.textContent = t('nav.copied', 'Copied!');
          showToast(t('toast.email_copied', 'Email copied to clipboard!'));
          setTimeout(function () {
            copyBtn.classList.remove('copied');
            if (label) label.textContent = t('nav.copy', 'Copy');
          }, 2000);
        });
        return;
      }

      // Footer copy button
      var footerBtn = e.target.closest('.footer__copy-btn');
      if (footerBtn) {
        var email = footerBtn.getAttribute('data-email');
        navigator.clipboard.writeText(email).then(function () {
          footerBtn.classList.add('copied');
          showToast(t('toast.email_copied', 'Email copied to clipboard!'));
          setTimeout(function () {
            footerBtn.classList.remove('copied');
          }, 2000);
        });
        return;
      }
    });

    // --- Active nav link on scroll ---
    var sections = document.querySelectorAll('section[id]');
    function updateActiveLink() {
      var scrollPos = window.scrollY + 200;
      sections.forEach(function (section) {
        var top = section.offsetTop;
        var height = section.offsetHeight;
        var id = section.getAttribute('id');
        var link = document.querySelector('.nav__links a[href="#' + id + '"]');
        if (link) {
          if (scrollPos >= top && scrollPos < top + height) {
            link.style.color = 'var(--color-text)';
          } else {
            link.style.color = '';
          }
        }
      });
    }

    var activeLinkRafPending = false;
    window.addEventListener('scroll', function () {
      if (!activeLinkRafPending) {
        activeLinkRafPending = true;
        requestAnimationFrame(function () {
          activeLinkRafPending = false;
          updateActiveLink();
        });
      }
    }, { passive: true });
  }

  // =============================================
  // 3. CONTACT FORM
  // =============================================

  function initContactForms() {
    var EDGE_FUNCTION_URL = 'https://uemspezaqxmkhenimwuf.supabase.co/functions/v1/contact-form';
    var form = document.getElementById('contact-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var submitBtn = form.querySelector('.regen-form__submit');
      var originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = t('form.sending', 'Sending...');

      // Clear previous errors
      var existingError = form.querySelector('.regen-form__error');
      if (existingError) existingError.remove();

      var formData = new FormData(form);
      var nlCheckbox = form.querySelector('input[name="newsletter_opt_in"]');
      var payload = {
        name: formData.get('name') || '',
        email: formData.get('email') || '',
        message: formData.get('message') || '',
        source: 'website_contact',
        page_url: window.location.href,
        newsletter_opt_in: nlCheckbox ? nlCheckbox.checked : false,
      };

      fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            throw new Error(data.error || 'Something went wrong');
          });
        }
        // Success — redirect to thank-you page
        var langPrefix = document.documentElement.lang === 'nl' ? '/nl' : document.documentElement.lang === 'pt-BR' ? '/pt' : '';
        window.location.href = langPrefix + '/thank-you.html';
        // Fallback if redirect blocked
        form.style.display = 'none';
        var successEl = document.getElementById('contact-success');
        if (successEl) successEl.style.display = 'flex';
      })
      .catch(function (err) {
        var errorEl = document.createElement('p');
        errorEl.className = 'regen-form__error';
        errorEl.textContent = err.message || t('form.error_default', 'Failed to send. Please try again.');
        submitBtn.parentNode.insertBefore(errorEl, submitBtn.nextSibling);
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      });
    });
  }

  // =============================================
  // 4. BOOT
  // =============================================

  function boot() {
    initSimulation();
    initPage();
    initContactForms();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();

/* ========================================
   Privacy Banner
   ======================================== */
(function () {
  'use strict';

  try { if (sessionStorage.getItem('_regen_no_cookies')) return; } catch (e) { return; }

  function dismiss(banner) {
    banner.classList.add('privacy-banner--closing');
    setTimeout(function () { banner.remove(); }, 300);
    try { sessionStorage.setItem('_regen_no_cookies', '1'); } catch (e) {}
  }

  setTimeout(function () {
    var banner = document.createElement('div');
    banner.className = 'privacy-banner';

    var privacyHref = 'privacy.html';
    var depth = window.location.pathname.replace(/\/[^/]*$/, '').split('/').filter(Boolean).length;
    if (depth > 0) privacyHref = new Array(depth + 1).join('../') + 'privacy.html';

    banner.innerHTML =
      '<div class="privacy-banner__inner">' +
        '<svg class="privacy-banner__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
        '<p class="privacy-banner__text"><strong>Your visit is private.</strong> No cookies, no trackers, no data collection. ' +
          '<a class="privacy-banner__link" href="' + privacyHref + '">How we protect your privacy</a></p>' +
        '<button class="privacy-banner__btn" type="button" aria-label="Dismiss">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>';

    document.body.appendChild(banner);

    banner.querySelector('.privacy-banner__btn').addEventListener('click', function () { dismiss(banner); });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape' && document.querySelector('.privacy-banner')) {
        dismiss(banner);
        document.removeEventListener('keydown', onEsc);
      }
    });
  }, 800);
})();

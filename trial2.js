// ========================================
// Trial 2 — Emergent Systems
// Premium interactive triangle simulation
// with glow, ambient dust, and smooth physics
// ========================================

(function () {
  'use strict';

  const CFG = {
    count: 180,
    minSize: 10,
    maxSize: 28,
    driftSpeed: 0.4,
    attractRadius: 220,
    attractForce: 0.012,
    bondDist: 1.18,
    bondSpring: 0.055,
    separation: 0.85,
    separationRadius: 1.0,
    disperseForce: 2.8,
    dampFree: 0.989,
    dampBonded: 0.92,
    bondLineOpacity: 0.14,
    // Glow
    glowRadius: 6,
    glowOpacity: 0.12,
    // Ambient dust
    dustCount: 60,
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
  const RETAIN_MS = 5000;

  canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  });
  canvas.addEventListener('mouseleave', () => { mouse.active = false; });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    mouse.x = t.clientX;
    mouse.y = t.clientY;
    mouse.active = true;
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    mouse.x = t.clientX;
    mouse.y = t.clientY;
  }, { passive: false });
  canvas.addEventListener('touchend', () => { mouse.active = false; });
  canvas.addEventListener('touchcancel', () => { mouse.active = false; });

  // --- Ambient dust particles ---
  let dust = [];

  function createDust() {
    dust = [];
    for (let i = 0; i < CFG.dustCount; i++) {
      dust.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * CFG.dustSpeed,
        vy: (Math.random() - 0.5) * CFG.dustSpeed,
        size: 0.5 + Math.random() * CFG.dustSize,
        opacity: 0.08 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function updateDust(time) {
    for (let i = 0; i < dust.length; i++) {
      const d = dust[i];
      d.x += d.vx;
      d.y += d.vy;
      d.opacity = 0.06 + Math.sin(time * 0.0005 + d.phase) * 0.06;

      if (d.x < -10) d.x = W + 10;
      if (d.x > W + 10) d.x = -10;
      if (d.y < -10) d.y = H + 10;
      if (d.y > H + 10) d.y = -10;
    }
  }

  function drawDust() {
    for (let i = 0; i < dust.length; i++) {
      const d = dust[i];
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
    this.x = Math.random() * W;
    this.y = Math.random() * H;
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
    this.retainUntil = 0; // timestamp until which this triangle holds its cluster
    // Trail history (last few positions)
    this.trail = [];
    this.trailMax = 4;
  };

  // --- Bond tracking ---
  const bonds = new Set();

  function bondKey(a, b) {
    return a < b ? a + '-' + b : b + '-' + a;
  }

  // --- Triangles ---
  let tris = [];

  function createTriangles() {
    tris = [];
    bonds.clear();
    for (let i = 0; i < CFG.count; i++) {
      tris.push(new Triangle(i));
    }
  }

  // --- Spatial hash ---
  const CELL = 80;
  let grid = {};

  function hashKey(cx, cy) { return cx + ',' + cy; }

  function buildGrid() {
    grid = {};
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      const cx = Math.floor(t.x / CELL);
      const cy = Math.floor(t.y / CELL);
      const k = hashKey(cx, cy);
      if (!grid[k]) grid[k] = [];
      grid[k].push(i);
    }
  }

  function getNeighborIndices(x, y, r) {
    const result = [];
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL);
    const y1 = Math.floor((y + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = hashKey(cx, cy);
        if (grid[k]) {
          const arr = grid[k];
          for (let j = 0; j < arr.length; j++) result.push(arr[j]);
        }
      }
    }
    return result;
  }

  // --- Physics ---
  function update() {
    buildGrid();

    const ar = CFG.attractRadius;
    const ar2 = ar * ar;
    const isHovering = mouse.active;
    const now = performance.now();

    // Phase 1: Attraction state (per-triangle retention)
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];

      // Check if mouse is currently pulling this triangle
      let inRadius = false;
      if (isHovering) {
        const dx = mouse.x - t.x;
        const dy = mouse.y - t.y;
        inRadius = (dx * dx + dy * dy < ar2);
      }

      if (inRadius) {
        // Actively attracted — keep refreshing the retain timer
        t.attracted = true;
        t.attractT = Math.min(1, t.attractT + 0.045);
        t.retainUntil = now + RETAIN_MS;
      } else if (t.attractT > 0.05 && now < t.retainUntil) {
        // Retention phase: hold structure, very gentle decay
        t.attracted = true;
        const remaining = (t.retainUntil - now) / RETAIN_MS; // 1 → 0
        const decay = 0.001 * (1 - remaining); // nearly zero at start, ramps up at end
        t.attractT = Math.max(0.05, t.attractT - decay);
      } else {
        // Fully released
        t.attracted = false;
        t.attractT = Math.max(0, t.attractT - 0.025);
      }
    }

    // Build lookup: which triangles are actively in the mouse radius right now
    const inRadiusLookup = new Uint8Array(tris.length);
    if (isHovering) {
      for (let i = 0; i < tris.length; i++) {
        const t = tris[i];
        const dx = mouse.x - t.x;
        const dy = mouse.y - t.y;
        if (dx * dx + dy * dy < ar2) inRadiusLookup[i] = 1;
      }
    }

    // Phase 2: Attraction force
    if (isHovering) {
      for (let i = 0; i < tris.length; i++) {
        const t = tris[i];
        if (t.attractT < 0.01) continue;

        const dx = mouse.x - t.x;
        const dy = mouse.y - t.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1) continue;

        const closeness = Math.max(0, 1 - d / ar);
        const distFactor = Math.min(1, d / 45);
        const force = CFG.attractForce * closeness * distFactor * t.attractT;

        t.vx += (dx / d) * force * d * 0.14;
        t.vy += (dy / d) * force * d * 0.14;
      }
    }

    // Phase 3: Separation + bonding
    let activeBonds = 0;
    const newBonds = new Set();

    for (let i = 0; i < tris.length; i++) {
      const a = tris[i];
      if (a.attractT < 0.05) continue;

      const neighbors = getNeighborIndices(a.x, a.y, a.radius * 3 + CFG.maxSize);
      a.bondCount = 0;

      for (let ni = 0; ni < neighbors.length; ni++) {
        const j = neighbors[ni];
        if (j <= i) continue;
        const b = tris[j];
        if (b.attractT < 0.05) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const combinedR = a.radius + b.radius;
        const bondThresh = combinedR * CFG.bondDist;

        if (d2 > bondThresh * bondThresh) continue;

        const d = Math.sqrt(d2);
        if (d < 0.5) continue;

        const nx = dx / d;
        const ny = dy / d;

        // Separation
        const sepThresh = combinedR * CFG.separationRadius;
        if (d < sepThresh) {
          const overlap = sepThresh - d;
          const push = overlap * CFG.separation;
          a.vx -= nx * push;
          a.vy -= ny * push;
          b.vx += nx * push;
          b.vy += ny * push;
        }

        // Bond spring
        const idealDist = combinedR * 1.02;
        const spring = (d - idealDist) * CFG.bondSpring;
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
    for (const k of newBonds) bonds.add(k);

    // Phase 4: Integration
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];

      // Store trail
      if (t.attractT > 0.1) {
        t.trail.push({ x: t.x, y: t.y });
        if (t.trail.length > t.trailMax) t.trail.shift();
      } else if (t.trail.length > 0) {
        t.trail.shift();
      }

      const triRetaining = t.attracted && !inRadiusLookup[i] && now < t.retainUntil;

      if (t.attractT < 0.01) {
        // Free-floating
        const speed = Math.sqrt(t.vx * t.vx + t.vy * t.vy);
        if (speed < CFG.driftSpeed * 0.25) {
          const angle = Math.random() * Math.PI * 2;
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
        const retainOpacity = t.baseOpacity + t.attractT * 0.3;
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
        const angle = Math.random() * Math.PI * 2;
        t.vx += Math.cos(angle) * CFG.disperseForce;
        t.vy += Math.sin(angle) * CFG.disperseForce;
      }

      t.x += t.vx;
      t.y += t.vy;
      t.rotation += t.rotSpeed;

      const pad = t.size * 2;
      if (t.x < -pad) t.x += W + pad * 2;
      if (t.x > W + pad) t.x -= W + pad * 2;
      if (t.y < -pad) t.y += H + pad * 2;
      if (t.y > H + pad) t.y -= H + pad * 2;
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

    // Bond lines — subtle curved connections
    if (bonds.size > 0) {
      for (const key of bonds) {
        const parts = key.split('-');
        const a = tris[parseInt(parts[0])];
        const b = tris[parseInt(parts[1])];
        const alpha = CFG.bondLineOpacity * Math.min(a.attractT, b.attractT);
        if (alpha < 0.004) continue;

        const r = Math.round((a.color.r + b.color.r) / 2);
        const g = Math.round((a.color.g + b.color.g) / 2);
        const bl = Math.round((a.color.b + b.color.b) / 2);

        ctx.strokeStyle = `rgba(${r},${g},${bl},${alpha})`;
        ctx.lineWidth = 0.8;

        // Slight curve via midpoint offset
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const perpX = -dy * 0.05;
        const perpY = dx * 0.05;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx + perpX, my + perpY, b.x, b.y);
        ctx.stroke();
      }
    }

    // Trails for attracted triangles
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      if (t.trail.length < 2) continue;

      const c = t.color;
      for (let j = 0; j < t.trail.length - 1; j++) {
        const progress = j / t.trail.length;
        const alpha = progress * 0.06 * t.attractT;
        if (alpha < 0.002) continue;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;

        const tp = t.trail[j];
        const trailSize = t.size * 0.4 * progress;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, trailSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Triangles
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      const c = t.color;
      const s = t.size;
      const h = s * 0.866 * t.skew;

      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.rotation);

      // Soft glow behind bonded triangles
      if (t.bondCount > 0 && t.attractT > 0.2) {
        ctx.globalAlpha = t.attractT * CFG.glowOpacity;
        ctx.shadowColor = `rgb(${c.r},${c.g},${c.b})`;
        ctx.shadowBlur = CFG.glowRadius * t.attractT;
        drawTrianglePath(s * 1.1, h * 1.1);
        ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.3)`;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Main triangle
      ctx.globalAlpha = t.opacity;
      drawTrianglePath(s, h);
      ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
      ctx.fill();

      // Subtle edge stroke on bonded
      if (t.bondCount > 0 && t.attractT > 0.15) {
        ctx.strokeStyle = `rgba(255,255,255,${t.attractT * 0.2})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      ctx.restore();
    }

    // Mouse attraction field
    if (mouse.active) {
      const grad = ctx.createRadialGradient(
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

    updateHUD(activeBonds);
  }

  // --- Cluster counting ---
  function countClusters() {
    if (bonds.size === 0) return 0;
    const adj = {};
    for (const key of bonds) {
      const parts = key.split('-');
      const a = parseInt(parts[0]);
      const b = parseInt(parts[1]);
      if (!adj[a]) adj[a] = [];
      if (!adj[b]) adj[b] = [];
      adj[a].push(b);
      adj[b].push(a);
    }

    const visited = new Set();
    let clusters = 0;
    for (const s in adj) {
      const start = parseInt(s);
      if (visited.has(start)) continue;
      clusters++;
      const q = [start];
      visited.add(start);
      while (q.length > 0) {
        const node = q.shift();
        const nb = adj[node];
        if (!nb) continue;
        for (let i = 0; i < nb.length; i++) {
          if (!visited.has(nb[i])) {
            visited.add(nb[i]);
            q.push(nb[i]);
          }
        }
      }
    }
    return clusters;
  }

  // --- HUD ---
  const hudCount = document.getElementById('hudCount');
  const hudClusters = document.getElementById('hudClusters');
  const hudBonds = document.getElementById('hudBonds');
  let frame = 0;

  // Smoothly animated HUD values
  const hudSmooth = { count: 0, clusters: 0, bonds: 0 };

  function updateHUD(activeBonds) {
    frame++;
    if (frame % 6 !== 0) return;

    const targetClusters = countClusters();

    // Lerp for smooth number transitions
    hudSmooth.count += (CFG.count - hudSmooth.count) * 0.3;
    hudSmooth.clusters += (targetClusters - hudSmooth.clusters) * 0.25;
    hudSmooth.bonds += (activeBonds - hudSmooth.bonds) * 0.25;

    hudCount.textContent = Math.round(hudSmooth.count);
    hudClusters.textContent = Math.round(hudSmooth.clusters);
    hudBonds.textContent = Math.round(hudSmooth.bonds);
  }

  // --- Hero text fade on interaction ---
  const heroOverlay = document.getElementById('heroOverlay');
  let heroOpacity = 1;
  let heroTarget = 1;

  function updateHeroFade() {
    // Fade hero text when there are active bonds nearby
    const anyBonds = bonds.size > 0;
    heroTarget = anyBonds ? 0.15 : 1;
    heroOpacity += (heroTarget - heroOpacity) * 0.03;
    heroOverlay.style.opacity = heroOpacity;
  }

  // --- Main loop ---
  function loop(time) {
    updateDust(time);
    const activeBonds = update();
    draw(activeBonds, time);
    updateHeroFade();
    requestAnimationFrame(loop);
  }

  // --- Init ---
  function init() {
    resize();
    createTriangles();
    createDust();
    hudCount.textContent = CFG.count;
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', () => {
    resize();
    // Recreate dust for new dimensions
    createDust();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

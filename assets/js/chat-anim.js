/**
 * chat-anim.js — bond-mesh triangle field flanking the assistant column.
 *
 * The vocabulary is lifted from vision-anim.js rather than invented: the same six brand
 * colours, the same idea of triangles that drift, rotate and bond to their neighbours with
 * faint quadratic curves. What is deliberately NOT borrowed is that page's louder effects.
 * Splashes, trails and dust suit a hero people came to play with; beside a column of text
 * they compete with the reading. The mesh is the quiet one, and it is the one that rewards
 * a second look, because the bond set changes as the triangles drift past each other.
 *
 * Three constraints shaped it:
 *   - it flanks the column and must never take a click, so the canvases are pointer-events:none
 *   - it is off entirely under prefers-reduced-motion, the way vision-anim.js returns early
 *   - it stops when the tab is hidden, so a background tab costs nothing
 */
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var host = document.getElementById('chatAnim');
  if (!host) return;

  // Below this there is no room beside the column, and the canvases would sit under it.
  var MIN_WIDTH = 1100;

  var PALETTE = [
    { r: 147, g: 9,   b: 63  },   // magenta
    { r: 231, g: 24,  b: 70  },   // red
    { r: 255, g: 169, b: 45  },   // orange
    { r: 101, g: 221, b: 53  },   // green
    { r: 0,   g: 145, b: 75  },   // emerald
    { r: 0,   g: 155, b: 187 }    // teal
  ];

  // Tuned on the rendered page, not guessed. At 13 triangles and 96px the bonds almost
  // never formed across a 190x1000 strip, so it read as scattered confetti rather than a
  // mesh. These numbers show the interweaving without becoming a texture that competes
  // with the column.
  var BOND_DIST = 132;
  // Scaled to the panel, because the panel is no longer a fixed 190px: it now fills the
  // gutter, which is 264px at 1280 and 344px at 1440. A fixed count would thin out into
  // scattered dots on a wide screen and lose the mesh.
  var PER_SIDE_BASE = 20;
  var PER_SIDE_REF_W = 190;
  var raf = null;
  var panels = [];

  function rand(a, b) { return a + Math.random() * (b - a); }

  function Triangle(w, h) {
    this.reset(w, h, true);
  }
  Triangle.prototype.reset = function (w, h, initial) {
    this.x = rand(0, w);
    this.y = initial ? rand(0, h) : rand(-40, h + 40);
    this.size = rand(4, 11);
    this.angle = rand(0, Math.PI * 2);
    this.spin = rand(-0.0035, 0.0035);
    this.vx = rand(-0.09, 0.09);
    this.vy = rand(-0.14, -0.03);          // a slow upward drift, like the vision field
    this.color = PALETTE[(Math.random() * PALETTE.length) | 0];
    this.alpha = rand(0.16, 0.42);
    this.phase = rand(0, Math.PI * 2);
    this.wander = rand(0.0004, 0.0011);
  };
  Triangle.prototype.step = function (w, h, t) {
    // The wander is what stops this reading as a particle system on rails.
    this.x += this.vx + Math.sin(t * this.wander + this.phase) * 0.16;
    this.y += this.vy;
    this.angle += this.spin;
    if (this.y < -30 || this.y > h + 30 || this.x < -30 || this.x > w + 30) {
      this.reset(w, h, false);
      this.y = h + 20;
    }
  };

  function drawTriangle(ctx, t) {
    var c = t.color;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.angle);
    ctx.beginPath();
    ctx.moveTo(0, -t.size);
    ctx.lineTo(t.size * 0.866, t.size * 0.5);
    ctx.lineTo(-t.size * 0.866, t.size * 0.5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + t.alpha + ')';
    ctx.fill();
    ctx.restore();
  }

  /** vision-anim.js drawBondsMesh, with the bond set recomputed per frame from distance. */
  function drawBonds(ctx, tris) {
    for (var i = 0; i < tris.length; i++) {
      for (var j = i + 1; j < tris.length; j++) {
        var a = tris[i], b = tris[j];
        var dx = a.x - b.x, dy = a.y - b.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > BOND_DIST) continue;
        // Fade the bond out as it stretches, so links appear and dissolve rather than snap.
        var o = (1 - d / BOND_DIST) * 0.16;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0,133,69,' + o.toFixed(3) + ')';
        ctx.lineWidth = 0.6;
        var mx = (a.x + b.x) / 2 + Math.sin((a.phase + b.phase) * 2) * 5;
        var my = (a.y + b.y) / 2 + Math.cos((a.phase + b.phase) * 2) * 5;
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.stroke();
      }
    }
  }

  function sizePanel(p) {
    var r = p.canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    p.w = r.width;
    p.h = r.height;
    p.canvas.width = Math.max(1, Math.round(r.width * dpr));
    p.canvas.height = Math.max(1, Math.round(r.height * dpr));
    p.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function build() {
    panels = [];
    var canvases = host.querySelectorAll('canvas');
    for (var i = 0; i < canvases.length; i++) {
      var p = { canvas: canvases[i], ctx: canvases[i].getContext('2d') };
      sizePanel(p);
      p.tris = [];
      var count = Math.max(12, Math.round(PER_SIDE_BASE * (p.w / PER_SIDE_REF_W)));
      for (var n = 0; n < count; n++) p.tris.push(new Triangle(p.w, p.h));
      panels.push(p);
    }
  }

  function frame(t) {
    for (var i = 0; i < panels.length; i++) {
      var p = panels[i];
      if (p.w <= 0 || p.h <= 0) continue;
      p.ctx.clearRect(0, 0, p.w, p.h);
      for (var n = 0; n < p.tris.length; n++) p.tris[n].step(p.w, p.h, t);
      drawBonds(p.ctx, p.tris);
      for (var m = 0; m < p.tris.length; m++) drawTriangle(p.ctx, p.tris[m]);
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf !== null) return;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf === null) return;
    cancelAnimationFrame(raf);
    raf = null;
  }

  function apply() {
    if (window.innerWidth < MIN_WIDTH) {
      host.hidden = true;
      stop();
      return;
    }
    host.hidden = false;
    build();
    start();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else if (!host.hidden) start();
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(apply, 180);
  });

  apply();
})();

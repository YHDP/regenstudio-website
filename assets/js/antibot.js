/**
 * antibot.js — Self-hosted anti-bot protection for Regen Studio
 *
 * Layers: honeypot, time check, proof-of-work (SHA-256), triangle CAPTCHA
 * Exposes window.Antibot with protect() and validate() methods.
 */
(function () {
  'use strict';

  // i18n helper — uses window.__i18n if available, else English fallback
  function t(key, fallback) {
    if (window.__i18n && typeof window.__i18n.t === 'function') {
      return window.__i18n.t(key, fallback);
    }
    return fallback;
  }

  // =============================================
  // 1. HONEYPOT
  // =============================================

  function injectHoneypot(form) {
    if (form.querySelector('.antibot-hp')) return;
    var wrapper = document.createElement('div');
    wrapper.className = 'antibot-hp';
    wrapper.setAttribute('aria-hidden', 'true');
    var input = document.createElement('input');
    input.type = 'text';
    input.name = 'website_url';
    input.tabIndex = -1;
    input.autocomplete = 'off';
    wrapper.appendChild(input);
    form.appendChild(wrapper);
  }

  // =============================================
  // 2. TIME TRACKING
  // =============================================

  function recordTimestamp(form) {
    if (!form.dataset.antibotTs) {
      form.dataset.antibotTs = String(Date.now());
    }
  }

  // =============================================
  // 3. PROOF-OF-WORK (SHA-256 via crypto.subtle)
  // =============================================

  function hexFromBuffer(buf) {
    var arr = new Uint8Array(buf);
    var hex = '';
    for (var i = 0; i < arr.length; i++) {
      hex += ('0' + arr[i].toString(16)).slice(-2);
    }
    return hex;
  }

  function sha256(str) {
    var encoder = new TextEncoder();
    return crypto.subtle.digest('SHA-256', encoder.encode(str)).then(hexFromBuffer);
  }

  /**
   * Find a counter N such that SHA-256(nonce + ':' + N) starts with '0000'.
   * Yields to the event loop every 500 iterations to avoid freezing UI.
   */
  function solvePoW(nonce) {
    return new Promise(function (resolve) {
      var counter = 0;
      var batchSize = 500;

      function batch() {
        var end = counter + batchSize;
        var promises = [];
        for (var i = counter; i < end; i++) {
          promises.push({ index: i, promise: sha256(nonce + ':' + i) });
        }

        Promise.all(promises.map(function (p) { return p.promise; })).then(function (hashes) {
          for (var j = 0; j < hashes.length; j++) {
            if (hashes[j].substring(0, 4) === '0000') {
              resolve({ nonce: nonce, solution: counter + j, hash: hashes[j] });
              return;
            }
          }
          counter = end;
          setTimeout(batch, 0);
        });
      }

      batch();
    });
  }

  function generateNonce() {
    var ts = Date.now().toString(16);
    var rand = Math.random().toString(36).substring(2, 10);
    return ts + '_' + rand;
  }

  // =============================================
  // 4. TRIANGLE CAPTCHA
  // =============================================

  function TriangleCaptcha(container) {
    this.solved = false;
    this.container = container;
    this.size = 120;
    this.tolerance = 15; // degrees
    // Random start angle between 45 and 315
    this.angle = 45 + Math.floor(Math.random() * 270);
    this.targetAngle = 0; // upright

    this.dragging = false;
    this.lastPointerAngle = 0;

    this.init();
  }

  TriangleCaptcha.prototype.init = function () {
    var self = this;

    // Label
    var label = document.createElement('span');
    label.className = 'antibot-captcha__label';
    label.textContent = t('antibot.captcha_label', 'Quick verification');
    this.container.appendChild(label);

    // Hint
    var hint = document.createElement('span');
    hint.className = 'antibot-captcha__hint';
    hint.textContent = t('antibot.captcha_hint', 'Rotate the triangle to point upward');
    this.hintEl = hint;
    this.container.appendChild(hint);

    // Canvas
    var canvas = document.createElement('canvas');
    canvas.width = this.size;
    canvas.height = this.size;
    canvas.className = 'antibot-captcha__canvas';
    canvas.setAttribute('role', 'slider');
    canvas.setAttribute('aria-label', t('antibot.captcha_hint', 'Rotate the triangle to point upward'));
    canvas.setAttribute('aria-valuemin', '0');
    canvas.setAttribute('aria-valuemax', '360');
    canvas.setAttribute('aria-valuenow', String(this.angle));
    canvas.setAttribute('tabindex', '0');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.container.appendChild(canvas);

    // Status
    var status = document.createElement('div');
    status.className = 'antibot-captcha__status';
    status.setAttribute('aria-live', 'polite');
    this.statusEl = status;
    this.container.appendChild(status);

    this.draw();

    // Mouse events
    canvas.addEventListener('mousedown', function (e) { self.onPointerDown(e); });
    document.addEventListener('mousemove', function (e) { self.onPointerMove(e); });
    document.addEventListener('mouseup', function () { self.onPointerUp(); });

    // Touch events
    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      self.onPointerDown(e.touches[0]);
    }, { passive: false });
    document.addEventListener('touchmove', function (e) {
      if (self.dragging) {
        e.preventDefault();
        self.onPointerMove(e.touches[0]);
      }
    }, { passive: false });
    document.addEventListener('touchend', function () { self.onPointerUp(); });

    // Keyboard events
    canvas.addEventListener('keydown', function (e) {
      if (self.solved) return;
      var step = 5;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        self.angle = (self.angle - step + 360) % 360;
        self.canvas.setAttribute('aria-valuenow', String(Math.round(self.angle)));
        self.draw();
        self.checkSolved();
        e.preventDefault();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        self.angle = (self.angle + step) % 360;
        self.canvas.setAttribute('aria-valuenow', String(Math.round(self.angle)));
        self.draw();
        self.checkSolved();
        e.preventDefault();
      } else if (e.key === 'Enter') {
        self.checkSolved();
        e.preventDefault();
      }
    });
  };

  TriangleCaptcha.prototype.getPointerAngle = function (e) {
    var rect = this.canvas.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    return Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
  };

  TriangleCaptcha.prototype.onPointerDown = function (e) {
    if (this.solved) return;
    this.dragging = true;
    this.lastPointerAngle = this.getPointerAngle(e);
  };

  TriangleCaptcha.prototype.onPointerMove = function (e) {
    if (!this.dragging || this.solved) return;
    var newAngle = this.getPointerAngle(e);
    var delta = newAngle - this.lastPointerAngle;
    // Handle wrap-around
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    this.angle = (this.angle + delta + 360) % 360;
    this.lastPointerAngle = newAngle;
    this.canvas.setAttribute('aria-valuenow', String(Math.round(this.angle)));
    this.draw();
  };

  TriangleCaptcha.prototype.onPointerUp = function () {
    if (!this.dragging) return;
    this.dragging = false;
    this.checkSolved();
  };

  TriangleCaptcha.prototype.checkSolved = function () {
    if (this.solved) return;
    // Check if angle is within tolerance of 0 (upright)
    var a = this.angle % 360;
    var diff = Math.min(a, 360 - a);
    if (diff <= this.tolerance) {
      this.solved = true;
      this.animateSnap();
    }
  };

  TriangleCaptcha.prototype.animateSnap = function () {
    var self = this;
    var startAngle = this.angle;
    // Calculate shortest path to 0
    var target = 0;
    if (startAngle > 180) startAngle = startAngle - 360;
    var startTime = performance.now();
    var duration = 200;

    function animate(now) {
      var elapsed = now - startTime;
      var progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      var eased = 1 - Math.pow(1 - progress, 3);
      self.angle = startAngle * (1 - eased);
      self.draw();
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        self.angle = 0;
        self.draw();
        self.onSolved();
      }
    }

    requestAnimationFrame(animate);
  };

  TriangleCaptcha.prototype.onSolved = function () {
    this.container.classList.add('antibot-captcha--solved');
    this.statusEl.textContent = t('antibot.captcha_verified', 'Verified') + ' \u25B2';
    this.hintEl.style.display = 'none';
  };

  TriangleCaptcha.prototype.draw = function () {
    var ctx = this.ctx;
    var size = this.size;
    var cx = size / 2;
    var cy = size / 2;
    var r = size * 0.35; // triangle radius

    ctx.clearRect(0, 0, size, size);

    // Background circle (subtle guide)
    ctx.beginPath();
    ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
    ctx.strokeStyle = this.solved ? 'rgba(0,145,75,0.15)' : 'rgba(0,155,187,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Upright ghost triangle (target hint)
    if (!this.solved) {
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.translate(cx, cy);
      this.drawTriangle(ctx, r, '#009BBB');
      ctx.restore();
    }

    // Main triangle
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.angle * Math.PI / 180);
    var color = this.solved ? '#00914B' : '#009BBB';
    this.drawTriangle(ctx, r, color);
    ctx.restore();
  };

  TriangleCaptcha.prototype.drawTriangle = function (ctx, r, color) {
    // Equilateral triangle pointing up (at angle 0)
    ctx.beginPath();
    ctx.moveTo(0, -r); // top
    ctx.lineTo(r * Math.cos(Math.PI / 6), r * Math.sin(Math.PI / 6)); // bottom-right
    ctx.lineTo(-r * Math.cos(Math.PI / 6), r * Math.sin(Math.PI / 6)); // bottom-left
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  // =============================================
  // 5. PUBLIC API
  // =============================================

  /**
   * Antibot.protect(form) — Call once per form.
   * Injects honeypot, records timestamp, renders CAPTCHA widget after textarea.
   */
  function protect(form) {
    if (form.dataset.antibotProtected) return;
    form.dataset.antibotProtected = '1';

    injectHoneypot(form);
    recordTimestamp(form);

    // Create CAPTCHA container and insert after textarea (or before submit button)
    var captchaContainer = document.createElement('div');
    captchaContainer.className = 'antibot-captcha';

    var textarea = form.querySelector('textarea');
    var submitBtn = form.querySelector('[type="submit"], .regen-form__submit, .contact-submit');
    if (textarea) {
      // Insert after textarea — use nextSibling to handle text nodes too
      textarea.parentNode.insertBefore(captchaContainer, textarea.nextSibling);
    } else if (submitBtn) {
      submitBtn.parentNode.insertBefore(captchaContainer, submitBtn);
    } else {
      form.appendChild(captchaContainer);
    }

    var captcha = new TriangleCaptcha(captchaContainer);
    form._antibotCaptcha = captcha;
  }

  /**
   * Antibot.validate(form) → Promise<payload>
   * Checks honeypot, time, CAPTCHA solved, then runs PoW.
   * Resolves with antibot fields to merge into submission payload.
   * Rejects with user-friendly error string.
   */
  function validate(form) {
    return new Promise(function (resolve, reject) {
      // 1. Honeypot check
      var hpField = form.querySelector('input[name="website_url"]');
      if (hpField && hpField.value) {
        // Silently resolve with a flag — server will drop it
        resolve({
          website_url: hpField.value,
          antibot_ts: 0,
          antibot_captcha: false,
          antibot_pow_nonce: '',
          antibot_pow_solution: 0,
          antibot_pow_hash: ''
        });
        return;
      }

      // 2. Time check (minimum 3 seconds)
      var ts = parseInt(form.dataset.antibotTs || '0', 10);
      var elapsed = Date.now() - ts;
      if (elapsed < 3000) {
        reject(t('antibot.error_too_fast', 'Please take a moment to fill out the form.'));
        return;
      }

      // 3. CAPTCHA check
      var captcha = form._antibotCaptcha;
      if (!captcha || !captcha.solved) {
        reject(t('antibot.error_captcha', 'Please complete the triangle verification.'));
        return;
      }

      // 4. Proof-of-Work
      var nonce = generateNonce();

      // Show spinner in status
      var statusEl = captcha.statusEl;
      var prevStatus = statusEl.textContent;
      statusEl.innerHTML = '<span class="antibot-pow-spinner"></span>' + t('antibot.pow_solving', 'Verifying...');

      solvePoW(nonce).then(function (result) {
        statusEl.textContent = prevStatus;
        resolve({
          website_url: '',
          antibot_ts: ts,
          antibot_captcha: true,
          antibot_pow_nonce: result.nonce,
          antibot_pow_solution: result.solution,
          antibot_pow_hash: result.hash
        });
      }).catch(function () {
        statusEl.textContent = prevStatus;
        reject(t('antibot.error_generic', 'Verification failed. Please try again.'));
      });
    });
  }

  window.Antibot = {
    protect: protect,
    validate: validate
  };

})();

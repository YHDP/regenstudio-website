/* One-slide-at-a-time viewer for a deck inside a blog post, optionally behind content-gate.js.
 *
 * Markup: `.slide-viewer` holding `.slide-viewer__slide` figures (in order), prev/next buttons
 * (`[data-sv-prev]`, `[data-sv-next]`), a counter (`.slide-viewer__count`) and, when gated, a
 * `.slide-viewer__dialog` with the gate form. `data-sv-open` on the viewer is the number of slides
 * shown without unlocking (default 2). While the enclosing `.content-gate` is locked, a later slide
 * is blurred and the dialog opens over it; Esc or the close button hides the dialog, the slide stays
 * blurred, and clicking it reopens the dialog. `content-gate:unlocked` lifts the blur. */
(function () {
  function init(v) {
    if (v.getAttribute('data-ready')) return;
    v.setAttribute('data-ready', '1');
    var slides = v.querySelectorAll('.slide-viewer__slide');
    var count = v.querySelector('.slide-viewer__count');
    var dialog = v.querySelector('.slide-viewer__dialog');
    var gate = v.closest('.content-gate');
    var open = parseInt(v.getAttribute('data-sv-open') || '2', 10);
    var i = 0, lastFocus = null;

    function locked() { return !!(gate && gate.classList.contains('content-gate--locked')); }

    function showDialog() {
      if (!dialog) return;
      lastFocus = document.activeElement;
      dialog.hidden = false;
      var first = dialog.querySelector('input, button');
      if (first) first.focus();
    }
    function hideDialog() {
      if (!dialog || dialog.hidden) return;
      dialog.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function go(n) {
      i = Math.max(0, Math.min(slides.length - 1, n));
      [].forEach.call(slides, function (s, k) { s.hidden = k !== i; });
      var img = slides[i].querySelector('img');
      if (img) img.loading = 'eager';
      count.textContent = (i + 1) + ' / ' + slides.length;
      var gated = locked() && i >= open;
      v.classList.toggle('slide-viewer--blurred', gated);
      if (gated) showDialog(); else hideDialog();
    }

    v.querySelector('[data-sv-prev]').addEventListener('click', function () { go(i - 1); });
    v.querySelector('[data-sv-next]').addEventListener('click', function () { go(i + 1); });
    v.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { hideDialog(); return; }
      if (dialog && !dialog.hidden) {
        if (e.key === 'Tab') {
          var f = dialog.querySelectorAll('a[href], input, button, [tabindex]:not([tabindex="-1"])');
          var a = f[0], z = f[f.length - 1];
          if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
          else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
        }
        return;
      }
      if (e.key === 'ArrowLeft') go(i - 1);
      if (e.key === 'ArrowRight') go(i + 1);
    });
    v.querySelector('.slide-viewer__stage').addEventListener('click', function () {
      if (locked() && i >= open) showDialog();
    });
    [].forEach.call(v.querySelectorAll('[data-sv-close]'), function (b) { b.addEventListener('click', hideDialog); });
    if (gate) gate.addEventListener('content-gate:unlocked', function () { go(i); });
    go(0);
  }

  function run() { [].forEach.call(document.querySelectorAll('.slide-viewer'), init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();

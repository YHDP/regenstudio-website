/* Email gate for content inside a blog post (slides, a prototype, a table).
 *
 * Markup: a `.content-gate` element with a `.content-gate__form` inside it. The element's
 * data attributes carry what differs per post and per language:
 *   data-gate-key      localStorage key for the unlock timestamp
 *   data-gate-source   `source` sent to the contact-form Edge Function
 *   data-gate-message  `message` sent with it (lands in the notification to info@)
 *   data-msg-email, data-msg-privacy, data-msg-busy, data-msg-fail  visitor-facing strings
 * The gate adds `content-gate--locked` while locked; the post's own CSS decides what that hides.
 * On unlock it dispatches `content-gate:unlocked` on the gate element. Review renders
 * (/_comment-stage/, /_review/) are never locked, so reviewers see the whole content.
 *
 * Consolidates the inline gates of the PPWR, DSR and EV-charger posts and fixes what they got
 * wrong: antibot.js loads deferred, so it is awaited before protect() (a submission without its
 * fields is stored nowhere); the privacy checkbox and consent_version write a consent record;
 * the unlock lasts 24 hours, as privacy.html states. */
(function () {
  var FN = 'https://uemspezaqxmkhenimwuf.supabase.co/functions/v1/contact-form';
  var CONSENT_VERSION = '2026-04-24';
  var TTL = 86400000;

  function whenAntibot(cb) {
    if (window.Antibot) return cb();
    var tries = 0;
    var iv = setInterval(function () {
      if (window.Antibot) { clearInterval(iv); cb(); }
      else if (++tries > 100) clearInterval(iv);
    }, 50);
  }

  function unlockedAt(key) {
    try { return parseInt(localStorage.getItem(key) || '0', 10); } catch (e) { return 0; }
  }

  function init(gate) {
    var d = gate.dataset;
    var form = gate.querySelector('.content-gate__form');
    if (!form || gate.getAttribute('data-ready')) return;
    gate.setAttribute('data-ready', '1');

    if (/\/_(comment-stage|review)\//.test(window.location.pathname)) return;
    var ts = unlockedAt(d.gateKey);
    if (ts > 0 && Date.now() - ts < TTL) return;
    try { localStorage.removeItem(d.gateKey); } catch (e) {}
    gate.classList.add('content-gate--locked');

    var btn = form.querySelector('.content-gate__btn');
    var err = form.querySelector('.content-gate__err');
    var label = btn.textContent;
    function showErr(m) { err.textContent = m || d.msgFail; err.hidden = false; btn.disabled = false; btn.textContent = label; }

    whenAntibot(function () {
      window.Antibot.protect(form);
      var captcha = form.querySelector('.antibot-captcha');
      if (captcha) form.insertBefore(captcha, err);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true;
      var email = (form.querySelector('input[name="email"]').value || '').trim();
      var pp = form.querySelector('input[name="privacy_policy_accepted"]');
      var nl = form.querySelector('input[name="newsletter_opt_in"]');
      if (!email || email.indexOf('@') < 1) return showErr(d.msgEmail);
      if (!pp.checked) return showErr(d.msgPrivacy);
      if (!window.Antibot) return showErr(d.msgFail);
      btn.disabled = true;
      btn.textContent = d.msgBusy;

      window.Antibot.validate(form).then(function (antibot) {
        var payload = {
          name: '', email: email, message: d.gateMessage, source: d.gateSource,
          page_url: window.location.href, newsletter_opt_in: !!(nl && nl.checked),
          ai_processing_opt_in: false, privacy_policy_accepted: true, consent_version: CONSENT_VERSION
        };
        for (var k in antibot) if (Object.prototype.hasOwnProperty.call(antibot, k)) payload[k] = antibot[k];
        return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }).then(function (res) {
        if (!res.ok) return res.json().catch(function () { return {}; }).then(function (b) { throw new Error(b.error); });
        try { localStorage.setItem(d.gateKey, Date.now().toString()); } catch (e2) {}
        gate.classList.remove('content-gate--locked');
        gate.dispatchEvent(new CustomEvent('content-gate:unlocked'));
      }).catch(function (e3) { showErr(typeof e3 === 'string' ? e3 : e3 && e3.message); });
    });
  }

  function run() { [].forEach.call(document.querySelectorAll('.content-gate'), init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();

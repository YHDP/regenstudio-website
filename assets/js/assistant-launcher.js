/**
 * assistant-launcher.js — one floating surface, two ways to reach us, on every public page.
 *
 * Loaded by nav.js rather than by a script tag on each page. That is not only to avoid
 * editing ~66 files: nav.js is absent from exactly the 21 pages where this would be wrong,
 * the DPA contract and signing flows, manage-consent, admin, linktree and the internal
 * tools. Scope comes out right by construction instead of by an exclusion list somebody has
 * to remember to update.
 *
 * It replaces the blog's floating .scroll-cta rather than sitting beside it. Below 1100px
 * that CTA became a full-width bottom bar, which is exactly where this lives, and two
 * floating calls to action on one phone screen is chrome, not help. The in-article
 * #post-cta-banner with its contact form is untouched and remains each post's real CTA.
 *
 * It does not reimplement the chat. A question hands off to chat.html?q=…, the same entry
 * the homepage hero uses and which chat.html answers on arrival. One assistant, one set of
 * guardrails, one place where citations are validated.
 */
(function () {
  'use strict';

  // chat.html and Images/ sit at the site root while this loads from /, /nl/ and
  // /blog/<slug>/, so the prefix comes from this script's own URL rather than a guess.
  var here = document.currentScript && document.currentScript.src;
  var ROOT = here ? here.replace(/assets\/js\/assistant-launcher\.js.*$/, '') : '';

  /* Which language the visitor is actually reading, taken from the path rather than from
     window.__i18n, which is deferred and was measured on 2026-09-15 answering "en" on /pt/
     while the page was already Portuguese.

     The launcher has to hand off to the chat page in the SAME language. It did not: a
     tester on an English browser reached the Portuguese site through a search engine,
     opened this panel, and was sent to the root chat.html, which asked the English corpus a
     Portuguese question and refused. Empty string for English, so ROOT + '' + 'chat.html'
     is the unchanged root path. */
  var LANG_DIR = (location.pathname.match(/^\/(nl|pt)\//) || ['', ''])[1];
  if (LANG_DIR) LANG_DIR += '/';

  if (/\/chat\.html$/.test(location.pathname)) return;   // already there

  var KEY = 'regen_assistant_launcher_closed';
  var EMAIL = 'info@regenstudio.world';

  function t(key, fallback) {
    return (window.__i18n && window.__i18n.t) ? window.__i18n.t(key, fallback) : fallback;
  }

  function boot() {
    try { if (sessionStorage.getItem(KEY) === '1') return; } catch (e) { /* private mode */ }
    if (document.querySelector('.launcher')) return;

    var avatar = ROOT + 'Images/assistant-avatar.svg';
    var label = t('launcher.label', 'Ask us anything');

    // A blog post already has a contact form at the end of the article; point at it rather
    // than duplicating it here. Other pages have no such anchor, so the row is left off.
    var hasPostForm = !!document.getElementById('postContent');

    var wrap = document.createElement('div');
    wrap.className = 'launcher';
    wrap.innerHTML =
      '<div class="launcher__panel" id="launcherPanel" role="dialog" aria-label="' + label + '" hidden>' +
        '<div class="launcher__head">' +
          '<img class="launcher__face" src="' + avatar + '" alt="" width="42" height="42" decoding="async" fetchpriority="low">' +
          '<div>' +
            '<p class="launcher__title">' + t('launcher.title', 'Ask our Digital Assistant') + '</p>' +
            '<p class="launcher__sub">' +
              t('launcher.sub', 'It answers from this site and shows you the page it came from.') +
            '</p>' +
          '</div>' +
          '<button class="launcher__close" type="button" id="launcherClose" aria-label="' +
            t('launcher.close', 'Close') + '">&times;</button>' +
        '</div>' +

        '<form class="launcher__form" id="launcherForm" action="' + ROOT + LANG_DIR + 'chat.html" method="get">' +
          '<label class="sr-only" for="launcherInput">' + label + '</label>' +
          '<input class="launcher__input" type="text" id="launcherInput" name="q" maxlength="500" ' +
            'autocomplete="off" placeholder="' +
            t('launcher.placeholder', 'What would you like to know?') + '">' +
          '<button class="launcher__send" type="submit">' + t('launcher.send', 'Ask') + '</button>' +
        '</form>' +
        '<p class="launcher__note">' +
          t('launcher.note', 'Please do not type personal details.') +
          ' <a href="' + ROOT + LANG_DIR + 'privacy.html#ai-assistant">' + t('launcher.why', 'Why') + '</a></p>' +

        '<div class="launcher__human">' +
          '<p class="launcher__human-label">' + t('launcher.human', 'Prefer a person?') + '</p>' +
          '<div class="launcher__email-row">' +
            '<a href="mailto:' + EMAIL + '">' + EMAIL + '</a>' +
            // Same class and icon pair as the blog CTA, so nav.js's delegated handler and
            // its copied state work here with no JavaScript of its own.
            '<button class="copyable-email__btn copyable-email__btn--small" type="button" ' +
              'data-email="' + EMAIL + '" aria-label="' + t('launcher.copy', 'Copy email address') + '">' +
              '<svg class="copyable-email__icon copyable-email__icon--copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
              '<svg class="copyable-email__icon copyable-email__icon--check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' +
            '</button>' +
          '</div>' +
          (hasPostForm
            ? '<a class="launcher__form-link" href="#post-cta-banner" data-track="launcher">' +
              t('launcher.message_link', 'or send us a message') + ' &darr;</a>'
            : '') +
        '</div>' +
      '</div>' +

      // aria-label because below 560px the text label is display:none and the avatar is
      // decorative, which left phone screen-reader users an unnamed button.
      '<button class="launcher__btn" type="button" id="launcherBtn" aria-expanded="false" ' +
        'aria-controls="launcherPanel" aria-label="' + label + '">' +
        '<img src="' + avatar + '" alt="" width="34" height="34" decoding="async" fetchpriority="low">' +
        // Both labels ship; CSS picks one. On a phone the pill used to collapse to the bare
        // chameleon mark, which reads as the logo rather than as an assistant you can talk to.
        '<span class="launcher__btn-label">' + label + '</span>' +
        '<span class="launcher__btn-label launcher__btn-label--short">' +
          t('launcher.label_short', 'Ask AI') + '</span>' +
      '</button>';

    document.body.appendChild(wrap);

    var btn = wrap.querySelector('#launcherBtn');
    var panel = wrap.querySelector('#launcherPanel');

    function setOpen(open) {
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) wrap.querySelector('#launcherInput').focus();
    }

    btn.addEventListener('click', function () { setOpen(panel.hidden); });

    wrap.querySelector('#launcherClose').addEventListener('click', function () {
      // For this visit, not for ever. Dismissing on one page should not make it reappear on
      // the next four; coming back next week probably should.
      try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* private mode */ }
      wrap.remove();
    });

    // Following the anchor to the article's own form should close this, or the panel sits
    // over the thing it just sent you to.
    var formLink = wrap.querySelector('.launcher__form-link');
    if (formLink) formLink.addEventListener('click', function () { setOpen(false); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { setOpen(false); btn.focus(); }
    });

    // The privacy banner is full-width along the bottom at a higher z-index, so lift clear
    // of it while it is showing rather than sitting underneath it.
    //
    // Visibility is measured from the box, not from offsetParent. offsetParent is null for
    // ANY position:fixed element whether or not it is on screen, and .privacy-banner is
    // fixed, so the obvious test silently reported "hidden" while the banner sat squarely
    // on top of the launcher. Its real height is what matters, and it also tells us how far
    // to lift, which a boolean could not.
    //
    // The banner is injected after this script runs, so it is looked up on every check
    // rather than captured once. Holding a reference at boot found nothing and silently
    // skipped the lift for the whole page life.
    var track = function () {
      var banner = document.querySelector('.privacy-banner');
      var showing = false;
      var h = 0;
      if (banner) {
        var box = banner.getBoundingClientRect();
        h = Math.ceil(box.height);
        showing = h > 0 && box.bottom > window.innerHeight - 4;
      }
      wrap.classList.toggle('launcher--banner', showing);
      wrap.style.setProperty('--launcher-banner-h', showing ? h + 'px' : '0px');
    };
    track();

    // Two narrow watchers rather than one broad one. Observing document.body with
    // subtree+attributes would fire on every reveal class the page toggles while scrolling,
    // and each call measures a box, which forces layout. This watches only what matters:
    // direct children of body, until the banner turns up (script.js:1652 appends it there),
    // and then the banner's own attributes for its open and closing classes.
    var bannerWatch = null;
    var bodyWatch = new MutationObserver(function () {
      track();
      var banner = document.querySelector('.privacy-banner');
      if (banner && !bannerWatch) {
        bannerWatch = new MutationObserver(track);
        bannerWatch.observe(banner, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
      }
      if (!banner && bannerWatch) { bannerWatch.disconnect(); bannerWatch = null; }
    });
    bodyWatch.observe(document.body, { childList: true });

    window.addEventListener('resize', track, { passive: true });
  }

  /**
   * Built after the page has finished loading, not at DOMContentLoaded.
   *
   * Measured: booting early put the 18 KB avatar into the network at 186ms, against a first
   * paint at 2.4s, so it was competing for bandwidth with the hero it sits on top of. A
   * floating affordance in the corner is by definition not what the visitor came for, and
   * it costs nothing to let the page render first. requestIdleCallback where it exists, a
   * short timeout where it does not.
   */
  /**
   * Boot only once the translations are in.
   *
   * Both this and i18n.js are deferred, and this one waits for an idle moment on top of
   * that, so which of the two lands first is a race. When this one won it, every string
   * came from the English fallbacks in t(), and a Dutch page showed an English launcher:
   * measured live on 2026-09-15, where /pt/ rendered "Ask AI" while __i18n.t() already
   * answered "Pergunte a IA" for the same key.
   *
   * Three routes in, because i18n.js may have finished, may be mid-flight, or may never
   * arrive: onReady fires straight away when it is already done, the event covers the
   * in-flight case, and the timeout means a missing or broken locale costs English
   * strings rather than the whole launcher. Whichever arrives first wins; the rest no-op.
   */
  function bootTranslated() {
    var booted = false;
    function go() {
      if (booted) return;
      booted = true;
      boot();
    }
    document.addEventListener('i18nReady', go);
    if (window.__i18n && window.__i18n.onReady) window.__i18n.onReady(go);
    setTimeout(go, 3000);
  }

  function schedule() {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(bootTranslated, { timeout: 2000 });
    } else {
      setTimeout(bootTranslated, 400);
    }
  }

  if (document.readyState === 'complete') {
    schedule();
  } else {
    window.addEventListener('load', schedule);
  }
})();

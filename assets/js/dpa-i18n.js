/**
 * dpa-i18n.js — Page-scoped i18n loader for the DPA signing flow
 *
 * Sister to assets/js/i18n.js (which detects from URL prefix). The DPA flow's
 * magic-link URLs carry only a token — language must be derived from the
 * dpa-verify-token response (engagement_profile.default_language).
 *
 * Locale files live at /locales/dpa.{nl,en,pt}.json. Keys use dot-notation
 * (welcome.slide.greeting, contract.cover.title, etc.). NL is loaded
 * alongside the requested language as fallback so partial EN/PT translations
 * never break the page.
 *
 * Attribute conventions match assets/js/i18n.js:
 *   data-i18n            → textContent
 *   data-i18n-html       → innerHTML (for embedded links/markup)
 *   data-i18n-placeholder → placeholder attribute (form inputs)
 *   data-i18n-aria       → aria-label attribute
 *   data-i18n-title      → title attribute
 *   data-i18n-attr       → arbitrary attributes, format "attr:key,attr:key"
 *
 * Page usage:
 *   await window.dpaI18n.load('en');
 *   window.dpaI18n.apply();
 *   var label = window.dpaI18n.t('welcome.slide.greeting', 'Welcome');
 *
 * Privacy: self-hosted, no external services, no cookies.
 * Size: ~3KB minified.
 */
(function () {
  "use strict";

  var SUPPORTED = ["nl", "en", "pt"];
  var FALLBACK_LANG = "nl";

  var state = {
    lang: FALLBACK_LANG,
    strings: {},        // requested-lang strings (may be partial)
    fallbackStrings: {} // nl strings (always-complete baseline)
  };

  var cache = {}; // lang → strings

  // --- Locale fetch ---

  function fetchLocale(lang) {
    if (cache[lang]) return Promise.resolve(cache[lang]);
    return fetch("/locales/dpa." + lang + ".json", { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) return {};
        return r.json().catch(function () { return {}; });
      })
      .then(function (j) { cache[lang] = j || {}; return cache[lang]; })
      .catch(function () { cache[lang] = {}; return cache[lang]; });
  }

  // --- Dot-notation lookup ---

  function lookup(obj, key) {
    if (!obj || typeof key !== "string") return null;
    var parts = key.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur && typeof cur === "object" && parts[i] in cur) {
        cur = cur[parts[i]];
      } else {
        return null;
      }
    }
    return (typeof cur === "string") ? cur : null;
  }

  // --- Public: t(key, fallback) ---
  // Resolution chain: requested-lang → nl → fallback arg → key
  function t(key, fallback) {
    var s = lookup(state.strings, key);
    if (s !== null) return s;
    s = lookup(state.fallbackStrings, key);
    if (s !== null) return s;
    if (typeof fallback === "string") return fallback;
    return key;
  }

  // --- Public: load(lang) ---
  function load(lang) {
    var resolvedLang = (SUPPORTED.indexOf(lang) >= 0) ? lang : FALLBACK_LANG;
    state.lang = resolvedLang;

    // Always load NL as fallback baseline. If requested === nl, reuse same fetch.
    var langPromise = fetchLocale(resolvedLang);
    var nlPromise = (resolvedLang === FALLBACK_LANG) ? langPromise : fetchLocale(FALLBACK_LANG);

    return Promise.all([langPromise, nlPromise]).then(function (results) {
      state.strings = results[0] || {};
      state.fallbackStrings = results[1] || {};
      return state.lang;
    });
  }

  // --- Public: apply() — DOM string-swap ---
  function apply() {
    // textContent
    var els = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < els.length; i++) {
      var key = els[i].getAttribute("data-i18n");
      var s = t(key, null);
      if (s !== null && s !== key) els[i].textContent = s;
    }

    // innerHTML
    var htmlEls = document.querySelectorAll("[data-i18n-html]");
    for (var h = 0; h < htmlEls.length; h++) {
      var hKey = htmlEls[h].getAttribute("data-i18n-html");
      var hs = t(hKey, null);
      if (hs !== null && hs !== hKey) htmlEls[h].innerHTML = hs;
    }

    // placeholder
    var phEls = document.querySelectorAll("[data-i18n-placeholder]");
    for (var p = 0; p < phEls.length; p++) {
      var pKey = phEls[p].getAttribute("data-i18n-placeholder");
      var ps = t(pKey, null);
      if (ps !== null && ps !== pKey) phEls[p].setAttribute("placeholder", ps);
    }

    // aria-label
    var arEls = document.querySelectorAll("[data-i18n-aria]");
    for (var a = 0; a < arEls.length; a++) {
      var aKey = arEls[a].getAttribute("data-i18n-aria");
      var as = t(aKey, null);
      if (as !== null && as !== aKey) arEls[a].setAttribute("aria-label", as);
    }

    // title attribute
    var tiEls = document.querySelectorAll("[data-i18n-title]");
    for (var ti = 0; ti < tiEls.length; ti++) {
      var tiKey = tiEls[ti].getAttribute("data-i18n-title");
      var tis = t(tiKey, null);
      if (tis !== null && tis !== tiKey) tiEls[ti].setAttribute("title", tis);
    }

    // arbitrary attrs: data-i18n-attr="title:foo.bar,alt:foo.baz"
    var atEls = document.querySelectorAll("[data-i18n-attr]");
    for (var at = 0; at < atEls.length; at++) {
      var spec = atEls[at].getAttribute("data-i18n-attr") || "";
      var pairs = spec.split(",");
      for (var pi = 0; pi < pairs.length; pi++) {
        var pair = pairs[pi].split(":");
        if (pair.length !== 2) continue;
        var attrName = pair[0].trim();
        var attrKey = pair[1].trim();
        if (!attrName || !attrKey) continue;
        var ats = t(attrKey, null);
        if (ats !== null && ats !== attrKey) atEls[at].setAttribute(attrName, ats);
      }
    }

    // Document-level: <html lang> + <title>
    if (state.lang) document.documentElement.setAttribute("lang", state.lang);
    var pageTitleKey = document.documentElement.getAttribute("data-i18n-doc-title");
    if (pageTitleKey) {
      var newTitle = t(pageTitleKey, null);
      if (newTitle && newTitle !== pageTitleKey) document.title = newTitle;
    }
  }

  // Expose
  window.dpaI18n = {
    SUPPORTED: SUPPORTED,
    FALLBACK_LANG: FALLBACK_LANG,
    get lang() { return state.lang; },
    load: load,
    apply: apply,
    t: t
  };
})();

/**
 * i18n.js — Lightweight internationalisation for Regen Studio
 *
 * Detects language from URL prefix (/nl/, /pt/) and swaps shared UI strings
 * (nav, footer, forms, buttons) at runtime. Page content is static HTML per language.
 *
 * Also exposes window.__i18n.t(key, fallback) for other scripts (blog.js, script.js)
 * to translate dynamically rendered strings.
 *
 * Privacy: self-hosted, no external services, no cookies.
 * Size: ~3KB minified.
 */
(function () {
  "use strict";

  // --- Language detection ---

  var SUPPORTED = ["en", "nl", "pt"];
  var DEFAULT_LANG = "en";

  function detectLang() {
    var path = window.location.pathname;
    if (path.indexOf("/nl/") === 0 || path === "/nl") return "nl";
    if (path.indexOf("/pt/") === 0 || path === "/pt") return "pt";
    return DEFAULT_LANG;
  }

  var LANG = detectLang();

  // --- Readiness tracking ---

  var _strings = {};
  var _ready = false;
  var _callbacks = [];

  function markReady(strings) {
    _strings = strings || {};
    _ready = true;
    window.__i18n.strings = _strings;
    window.__i18n.ready = true;
    for (var i = 0; i < _callbacks.length; i++) {
      try { _callbacks[i](); } catch (e) { /* ignore */ }
    }
    _callbacks = [];
    // Fire custom event for loosely-coupled listeners
    if (typeof CustomEvent === "function") {
      document.dispatchEvent(new CustomEvent("i18nReady"));
    }
  }

  // --- Locale loading ---

  var localeCache = {};

  function getLocaleUrl() {
    // Determine base path: if we're in a subdirectory like /nl/about.html,
    // the locales folder is at /locales/. If in /nl/digital-identities/,
    // still /locales/. Always use absolute path.
    return "/locales/" + LANG + ".json";
  }

  function loadLocale(callback) {
    if (LANG === DEFAULT_LANG) {
      // English is the source — no swapping needed, but load for reference
      callback({});
      return;
    }

    if (localeCache[LANG]) {
      callback(localeCache[LANG]);
      return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open("GET", getLocaleUrl(), true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            localeCache[LANG] = JSON.parse(xhr.responseText);
          } catch (e) {
            localeCache[LANG] = {};
          }
        } else {
          localeCache[LANG] = {};
        }
        callback(localeCache[LANG]);
      }
    };
    xhr.send();
  }

  // --- Text swapping ---

  function applyTranslations(strings) {
    if (!strings || Object.keys(strings).length === 0) return;

    // Swap elements with data-i18n attribute
    var elements = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < elements.length; i++) {
      var key = elements[i].getAttribute("data-i18n");
      if (strings[key]) {
        elements[i].textContent = strings[key];
      }
    }

    // Swap elements with data-i18n-placeholder (form inputs)
    var placeholders = document.querySelectorAll("[data-i18n-placeholder]");
    for (var j = 0; j < placeholders.length; j++) {
      var pKey = placeholders[j].getAttribute("data-i18n-placeholder");
      if (strings[pKey]) {
        placeholders[j].setAttribute("placeholder", strings[pKey]);
      }
    }

    // Swap elements with data-i18n-aria (aria-label)
    var ariaEls = document.querySelectorAll("[data-i18n-aria]");
    for (var k = 0; k < ariaEls.length; k++) {
      var aKey = ariaEls[k].getAttribute("data-i18n-aria");
      if (strings[aKey]) {
        ariaEls[k].setAttribute("aria-label", strings[aKey]);
      }
    }

    // Swap elements with data-i18n-html (innerHTML, for links within text)
    var htmlEls = document.querySelectorAll("[data-i18n-html]");
    for (var h = 0; h < htmlEls.length; h++) {
      var hKey = htmlEls[h].getAttribute("data-i18n-html");
      if (strings[hKey]) {
        htmlEls[h].innerHTML = strings[hKey];
      }
    }
  }

  // --- Language switcher ---

  function buildSwitcherUrl(targetLang) {
    var path = window.location.pathname;

    // Strip current language prefix if present
    if (path.indexOf("/nl/") === 0 || path === "/nl") {
      path = path.substring(3) || "/";
    } else if (path.indexOf("/pt/") === 0 || path === "/pt") {
      path = path.substring(3) || "/";
    }

    // Add target prefix (unless English = root)
    if (targetLang === DEFAULT_LANG) {
      return path;
    }
    return "/" + targetLang + path;
  }

  function injectSwitcher() {
    // Inject language switcher into nav if not already present
    var existing = document.querySelector(".lang-switcher");
    if (existing) return;

    var nav = document.querySelector(".nav__links");
    if (!nav) return;

    var li = document.createElement("li");
    li.className = "lang-switcher";
    li.setAttribute("aria-label", "Language");

    var html = "";
    for (var i = 0; i < SUPPORTED.length; i++) {
      var lang = SUPPORTED[i];
      var label = lang.toUpperCase();
      var href = buildSwitcherUrl(lang);
      var active = lang === LANG ? " lang-switcher__link--active" : "";
      var aria = lang === LANG ? ' aria-current="true"' : "";
      if (i > 0) html += '<span class="lang-switcher__sep">|</span>';
      html +=
        '<a href="' + href + '" class="lang-switcher__link' + active + '"' +
        ' data-lang="' + lang + '"' + aria +
        ' hreflang="' + lang + '">' + label + "</a>";
    }
    li.innerHTML = html;

    // Insert before the contact button (last li)
    var contactWrap = nav.querySelector(".nav__contact-wrap");
    if (contactWrap) {
      nav.insertBefore(li, contactWrap);
    } else {
      nav.appendChild(li);
    }
  }

  function initSwitcher() {
    // First inject the switcher HTML
    injectSwitcher();

    // Then update any existing switcher links (in case they were in the HTML)
    var switchers = document.querySelectorAll(".lang-switcher__link");
    for (var i = 0; i < switchers.length; i++) {
      var link = switchers[i];
      var targetLang = link.getAttribute("data-lang");
      if (targetLang) {
        link.href = buildSwitcherUrl(targetLang);
        if (targetLang === LANG) {
          link.classList.add("lang-switcher__link--active");
          link.setAttribute("aria-current", "true");
        }
      }
    }
  }

  // --- Initialise ---

  function init() {
    // Set html lang attribute
    document.documentElement.lang = LANG;

    // Initialise language switcher links
    initSwitcher();

    // Load and apply translations
    if (LANG !== DEFAULT_LANG) {
      loadLocale(function (strings) {
        applyTranslations(strings);
        markReady(strings);
      });
    } else {
      // English — no locale to load, mark ready immediately
      markReady({});
    }
  }

  // Run on DOMContentLoaded or immediately if already loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose for external use by blog.js, script.js, etc.
  window.__i18n = {
    lang: LANG,
    supported: SUPPORTED,
    ready: false,
    strings: {},
    buildSwitcherUrl: buildSwitcherUrl,

    /**
     * Translate a key. Returns the translated string for the current language,
     * or the fallback (English) if no translation exists.
     * Usage: window.__i18n.t("blog.backToBlog", "Back to Blog")
     */
    t: function (key, fallback) {
      return _strings[key] || fallback || key;
    },

    /**
     * Register a callback to run when translations are loaded.
     * If already loaded, runs immediately.
     * Usage: window.__i18n.onReady(function() { renderUI(); })
     */
    onReady: function (cb) {
      if (_ready) { cb(); return; }
      _callbacks.push(cb);
    },
  };
})();

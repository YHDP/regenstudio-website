/**
 * RegenTracker — Privacy-preserving universal analytics tracker
 * ES5-compatible IIFE. Auto-initializes on load.
 *
 * Configured for: www.regenstudio.world (site: 'www')
 *
 * Features:
 * - page_view with referrer_domain + from_page (sessionStorage)
 * - scroll depth: 25/50/75/100%
 * - click tracking on [data-track] elements
 * - page_exit with time_on_page_ms
 * - Public API: window.RegenTracker.track(eventType, extra)
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://uemspezaqxmkhenimwuf.supabase.co/functions/v1/track-report-event';
  var SITE = 'www';
  var pageLoadTime = Date.now();

  // ── Send helper ──
  function send(payload) {
    try {
      payload.site = SITE;
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function () {});
    } catch (e) {
      // Analytics must never break the page
    }
  }

  // ── Referrer domain ──
  var referrerDomain = null;
  try {
    if (document.referrer) referrerDomain = new URL(document.referrer).hostname;
  } catch (e) { /* malformed referrer */ }

  // ── From-page tracking (sessionStorage, tab-scoped, no personal data) ──
  var fromPage = null;
  try {
    fromPage = sessionStorage.getItem('_rt_prev_page') || null;
  } catch (e) { /* private browsing */ }

  var currentPath = window.location.pathname;

  try {
    sessionStorage.setItem('_rt_prev_page', currentPath);
  } catch (e) { /* private browsing */ }

  // ── Public API ──
  function track(eventType, extra) {
    var payload = {
      event_type: eventType,
      pathname: currentPath,
      referrer_domain: referrerDomain
    };
    if (fromPage) payload.from_page = fromPage;
    if (extra) {
      if (extra.target) payload.target = extra.target;
      if (extra.section) payload.section = extra.section;
      if (extra.from_page) payload.from_page = extra.from_page;
      if (typeof extra.time_on_page_ms === 'number') payload.time_on_page_ms = extra.time_on_page_ms;
    }
    send(payload);
  }

  window.RegenTracker = { track: track };

  // ── Auto page_view ──
  track('page_view');

  // ── Scroll depth tracking ──
  var scrollThresholds = [25, 50, 75, 100];
  var firedThresholds = {};

  function onScroll() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    if (docHeight <= 0) return;
    var percent = Math.round((scrollTop / docHeight) * 100);
    for (var i = 0; i < scrollThresholds.length; i++) {
      var t = scrollThresholds[i];
      if (percent >= t && !firedThresholds[t]) {
        firedThresholds[t] = true;
        track('scroll_' + t);
      }
    }
  }

  if (window.addEventListener) {
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ── Click tracking on [data-track] elements ──
  function onDocClick(e) {
    var el = e.target;
    // Walk up to find nearest [data-track]
    while (el && el !== document.body) {
      if (el.getAttribute && el.getAttribute('data-track')) {
        var targetName = el.getAttribute('data-track');
        // Find nearest [data-section] ancestor (or self)
        var sectionName = '';
        var sec = el;
        while (sec && sec !== document.body) {
          if (sec.getAttribute && sec.getAttribute('data-section')) {
            sectionName = sec.getAttribute('data-section');
            break;
          }
          sec = sec.parentElement;
        }
        track('click', { target: targetName, section: sectionName });
        return;
      }
      el = el.parentElement;
    }
  }

  if (document.addEventListener) {
    document.addEventListener('click', onDocClick, false);
  }

  // ── Page exit with time on page ──
  var exitFired = false;

  function fireExit() {
    if (exitFired) return;
    exitFired = true;
    var timeOnPage = Date.now() - pageLoadTime;
    track('page_exit', { time_on_page_ms: timeOnPage });
  }

  if (document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') fireExit();
    }, false);
    window.addEventListener('pagehide', fireExit, false);
    window.addEventListener('beforeunload', fireExit, false);
  }

})();

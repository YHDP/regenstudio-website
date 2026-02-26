// ========================================
// Regen Studio — Shared Nav & UI
// Loaded on every page
// ========================================

(function () {
  'use strict';

  // --- Navbar scroll effect ---
  var nav = document.getElementById('nav');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('nav--scrolled', window.scrollY > 60);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // --- Desktop "Menu" dropdown toggle ---
  var menuBtn = document.querySelector('.nav__menu-btn');
  var menuDropdown = document.querySelector('.nav__dropdown');
  if (menuBtn && menuDropdown) {
    menuBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = menuDropdown.classList.toggle('open');
      menuBtn.classList.toggle('open', isOpen);
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.nav__dropdown') && !e.target.closest('.nav__menu-btn')) {
        menuDropdown.classList.remove('open');
        menuBtn.classList.remove('open');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuDropdown.classList.contains('open')) {
        menuDropdown.classList.remove('open');
        menuBtn.classList.remove('open');
      }
    });
    menuDropdown.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        menuDropdown.classList.remove('open');
        menuBtn.classList.remove('open');
      });
    });
  }

  // --- Nav contact popovers (mobile + desktop) ---
  document.querySelectorAll('.nav__contact-wrap').forEach(function (wrap) {
    var btn = wrap.querySelector('.nav__contact-btn');
    var popover = wrap.querySelector('.nav__contact-popover');
    if (btn && popover) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        popover.classList.toggle('open');
      });
    }
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.nav__contact-wrap')) {
      document.querySelectorAll('.nav__contact-popover').forEach(function (p) {
        p.classList.remove('open');
      });
    }
  });

  // --- Mobile hamburger toggle with iOS scroll lock ---
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
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

    window.addEventListener('orientationchange', function () {
      if (navLinks.classList.contains('open')) {
        closeNav();
      }
    });
  }

  // --- Copy email handler ---
  document.addEventListener('click', function (e) {
    var copyBtn = e.target.closest('.copyable-email__btn');
    if (copyBtn) {
      var email = copyBtn.getAttribute('data-email');
      navigator.clipboard.writeText(email).then(function () {
        var label = copyBtn.querySelector('.copyable-email__label');
        copyBtn.classList.add('copied');
        if (label) label.textContent = 'Copied!';
        setTimeout(function () {
          copyBtn.classList.remove('copied');
          if (label) label.textContent = 'Copy';
        }, 2000);
      });
      return;
    }
    var footerBtn = e.target.closest('.footer__copy-btn');
    if (footerBtn) {
      var email = footerBtn.getAttribute('data-email');
      navigator.clipboard.writeText(email).then(function () {
        footerBtn.classList.add('copied');
        setTimeout(function () { footerBtn.classList.remove('copied'); }, 2000);
      });
    }
  });

  // --- Smooth scroll for anchor links ---
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var href = link.getAttribute('href');
      if (!href || href === '#') return;
      var target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        var navEl = document.getElementById('nav');
        var offset = navEl ? navEl.offsetHeight + 20 : 80;
        var top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
    });
  });

  // --- Scroll-reveal animations (generic IntersectionObserver) ---
  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  }

})();

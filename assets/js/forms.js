/**
 * forms.js — Shared contact form handler for secondary pages
 *
 * Replaces inline <script> form handlers on about, vision, faq,
 * innovation-services, digital-identities, problem-analysis pages.
 * Reads source from data-source attribute on the <form> element.
 * Integrates Antibot.protect() and Antibot.validate().
 */
(function () {
  'use strict';

  var EDGE_FUNCTION_URL = 'https://uemspezaqxmkhenimwuf.supabase.co/functions/v1/contact-form';

  function t(key, fallback) {
    if (window.__i18n && typeof window.__i18n.t === 'function') {
      return window.__i18n.t(key, fallback);
    }
    return fallback;
  }

  function initForm(form) {
    var source = form.getAttribute('data-source') || 'contact_form';

    // Protect with antibot if available
    if (window.Antibot) {
      window.Antibot.protect(form);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var submitBtn = form.querySelector('.regen-form__submit');
      var originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = t('form.sending', 'Sending...');

      var existingError = form.querySelector('.regen-form__error');
      if (existingError) existingError.remove();

      function doSubmit(antibotPayload) {
        var formData = new FormData(form);
        var nlCheckbox = form.querySelector('input[name="newsletter_opt_in"]');
        var payload = {
          name: formData.get('name') || '',
          email: formData.get('email') || '',
          message: formData.get('message') || '',
          source: source,
          page_url: window.location.href,
          newsletter_opt_in: nlCheckbox ? nlCheckbox.checked : false
        };

        // Merge antibot fields
        if (antibotPayload) {
          for (var key in antibotPayload) {
            if (antibotPayload.hasOwnProperty(key)) {
              payload[key] = antibotPayload[key];
            }
          }
        }

        fetch(EDGE_FUNCTION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        .then(function (res) {
          if (!res.ok) {
            return res.json().catch(function () { return {}; }).then(function (data) {
              throw new Error(data.error || t('form.error_generic', 'Something went wrong'));
            });
          }
          // Success — redirect to thank-you page
          var htmlLang = (document.documentElement.lang || 'en').toLowerCase();
          var langPrefix = htmlLang === 'nl' ? '/nl' : htmlLang.startsWith('pt') ? '/pt' : '';
          window.location.href = langPrefix + '/thank-you.html';
          // Fallback if redirect blocked
          form.style.display = 'none';
          var successEl = document.getElementById('contact-success');
          if (successEl) successEl.style.display = 'flex';
        })
        .catch(function (err) {
          var errorEl = document.createElement('p');
          errorEl.className = 'regen-form__error';
          errorEl.textContent = err.message || t('form.error_default', 'Failed to send. Please try again.');
          submitBtn.parentNode.insertBefore(errorEl, submitBtn.nextSibling);
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        });
      }

      // Validate antibot if available
      if (window.Antibot) {
        window.Antibot.validate(form).then(doSubmit).catch(function (errMsg) {
          var errorEl = document.createElement('p');
          errorEl.className = 'regen-form__error';
          errorEl.textContent = errMsg;
          submitBtn.parentNode.insertBefore(errorEl, submitBtn.nextSibling);
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        });
      } else {
        doSubmit(null);
      }
    });
  }

  function init() {
    var form = document.getElementById('contact-form');
    if (form) initForm(form);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

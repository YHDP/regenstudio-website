/**
 * manage-consent.js — self-service consent view + revoke flow
 *
 * Two modes, decided by URL:
 *   - No ?token=... query param  → MODE A (email entry → request magic link)
 *   - ?token=<64hex>             → MODE B (verify token, show consents, allow revoke)
 *
 * Calls the manage-consent Edge Function:
 *   POST /functions/v1/manage-consent
 *     { action: "request_link", email, lang }
 *     { action: "view",   token }
 *     { action: "revoke", token, purposes }
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://uemspezaqxmkhenimwuf.supabase.co/functions/v1/manage-consent';

  var $ = function (id) { return document.getElementById(id); };

  function showStatus(el, kind, html) {
    el.className = 'mc-status mc-status--' + kind;
    el.innerHTML = html;
    el.hidden = false;
  }

  function fetchJson(payload) {
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) {
          throw new Error(data.error || 'Request failed (HTTP ' + r.status + ')');
        }
        return data;
      });
    });
  }

  // -------- MODE A: request magic link ----------------------------------
  function initRequestMode() {
    $('mc-mode-request').hidden = false;
    var form = $('mc-request-form');
    var btn = $('mc-request-btn');
    var status = $('mc-request-status');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('mc-email').value.trim();
      if (!email) return;

      btn.disabled = true;
      btn.innerHTML = '<span class="mc-spinner"></span>Sending';
      status.hidden = true;

      var lang = (document.documentElement.lang || 'en').toLowerCase().slice(0, 2);

      fetchJson({ action: 'request_link', email: email, lang: lang })
        .then(function (data) {
          showStatus(
            status,
            'success',
            '<strong>Check your inbox.</strong> If that email is on file, a one-time link has been sent. The link expires in 60 minutes. If you do not receive it within a few minutes, check your spam folder or contact <a href="mailto:info@regenstudio.world" class="mc-link">info@regenstudio.world</a>.'
          );
          $('mc-email').value = '';
        })
        .catch(function (err) {
          showStatus(status, 'error', err.message || 'Could not send link. Please try again or email info@regenstudio.world.');
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = 'Send link';
        });
    });
  }

  // -------- MODE B: token-based view + revoke ---------------------------
  function initViewMode(token) {
    $('mc-mode-view').hidden = false;
    var loading = $('mc-view-loading');
    var errorEl = $('mc-view-error');
    var content = $('mc-view-content');
    var listEl = $('mc-consents-list');
    var aliasEl = $('mc-alias');
    var revokeStatus = $('mc-revoke-status');

    fetchJson({ action: 'view', token: token })
      .then(function (data) {
        loading.hidden = true;
        content.hidden = false;
        aliasEl.textContent = data.alias || '(unknown)';
        // Prefer granular rows (Phase 2, 2026-05-13). Each per-category row is
        // an independent revocable unit. Falls back to aggregate-only when the
        // function returns the old shape.
        var rows = data.consents_granular || data.consents || [];
        renderConsents(rows, token, listEl, revokeStatus);
        if (rows.length === 0) {
          listEl.innerHTML = '<li class="mc-consent-row"><div class="mc-consent-row__info">No consents on record under this email.</div></li>';
        }
        // Phase 2 — audit panel showing AI processing events per data category.
        // Renders only when at least one event is logged; otherwise the
        // dashboard stays focused on the consent state.
        renderProcessingPanel(
          data.ai_processing_events_summary || {},
          data.ai_processing_events_recent || []
        );
      })
      .catch(function (err) {
        loading.hidden = true;
        showStatus(errorEl, 'error', err.message || 'Could not load your consent state. The link may have expired or been used. <a href="manage-consent.html" class="mc-link">Request a new link</a>.');
      });
  }

  function renderConsents(consents, token, listEl, statusEl) {
    listEl.innerHTML = '';
    // Sort so aggregate rows (data_category=null) appear first per purpose,
    // followed by per-category rows. Stable visual hierarchy.
    var sorted = consents.slice().sort(function (a, b) {
      if (a.purpose !== b.purpose) return a.purpose < b.purpose ? -1 : 1;
      var ac = a.data_category || ''; var bc = b.data_category || '';
      return ac < bc ? -1 : ac > bc ? 1 : 0;
    });
    sorted.forEach(function (c) {
      var row = document.createElement('li');
      row.className = 'mc-consent-row';
      row.dataset.purpose = c.purpose;
      if (c.data_category) row.dataset.dataCategory = c.data_category;

      var labelText = humanLabel(c.purpose);
      if (c.data_category) {
        labelText += ' — ' + categoryLabel(c.data_category);
      }
      if (c.scope_label && c.data_category) {
        labelText += ' <span class="mc-scope-badge mc-scope-badge--' + c.scope_label + '">' + scopeLabelText(c.scope_label) + '</span>';
      }

      var info = document.createElement('div');
      info.className = 'mc-consent-row__info';
      info.innerHTML =
        '<div class="mc-consent-row__purpose">' + labelText + '</div>' +
        '<div class="mc-consent-row__meta">Legal basis: ' + escapeHtml(c.legal_basis || '—') +
        ' · Given at: ' + (c.given_at ? new Date(c.given_at).toLocaleString() : '—') + '</div>';
      row.appendChild(info);

      var stateSpan = document.createElement('span');
      stateSpan.className = 'mc-consent-row__state mc-consent-row__state--' + c.state;
      stateSpan.textContent = c.state;
      row.appendChild(stateSpan);

      if (c.state === 'given') {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mc-revoke-btn';
        btn.textContent = 'Revoke';
        btn.addEventListener('click', function () {
          revokeOne(c.purpose, c.data_category || null, token, btn, statusEl, row, stateSpan);
        });
        row.appendChild(btn);
      }
      listEl.appendChild(row);
    });
  }

  function revokeOne(purpose, dataCategory, token, btn, statusEl, row, stateSpan) {
    var humanLine = humanLabel(purpose);
    if (dataCategory) humanLine += ' — ' + categoryLabel(dataCategory);
    if (!confirm('Revoke "' + humanLine + '" consent? This action will trigger secure deletion of the relevant data within 72 hours.')) {
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="mc-spinner"></span>Revoking';

    // Send via the new granular `categories` shape when data_category is set;
    // fall back to legacy `purposes` shape for aggregate-only revocations.
    var payload = dataCategory
      ? { action: 'revoke', token: token, categories: [{ purpose: purpose, data_category: dataCategory }] }
      : { action: 'revoke', token: token, purposes: [purpose] };
    fetchJson(payload)
      .then(function (data) {
        // Update UI to reflect withdrawn state
        stateSpan.className = 'mc-consent-row__state mc-consent-row__state--withdrawn';
        stateSpan.textContent = 'withdrawn';
        btn.remove();
        showStatus(
          statusEl,
          'success',
          '<strong>Done.</strong> ' + (data.message || 'Consent withdrawn.') +
          ' <br><br>' + (data.crypto_shred_sla || '')
        );
      })
      .catch(function (err) {
        showStatus(statusEl, 'error', err.message || 'Could not revoke consent. Please email info@regenstudio.world.');
        btn.disabled = false;
        btn.textContent = 'Revoke';
      });
  }

  function humanLabel(purpose) {
    var map = {
      'ai_processing':                   'AI-supported information systems',
      'ServiceProvision':                'Service delivery (contract execution)',
      'CustomerRelationshipManagement':  'Follow-up and ongoing relationship',
      'Marketing':                       'Marketing communications',
      'LegalCompliance':                 'Tax / Wwft compliance',
      'CaseStudy':                       'Use in case studies and public references',
      'memory_naming':                   'Use real name in Claude long-term memory',
      'sensitive_consent':               'Special-category data (GDPR Art 9 / LGPD Art 11)',
    };
    return map[purpose] || purpose;
  }

  function renderProcessingPanel(summary, recent) {
    var panel = $('mc-ai-activity');
    if (!panel) return;  // Old DOM (no panel) — silently skip.
    var totalEvents = Object.values(summary).reduce(function (a, b) { return a + b; }, 0);
    if (totalEvents === 0) {
      panel.hidden = true;
      return;
    }
    var summaryHtml = '<ul class="mc-activity-summary">';
    for (var cat in summary) {
      if (Object.prototype.hasOwnProperty.call(summary, cat)) {
        summaryHtml += '<li><strong>' + summary[cat] + '</strong> event' +
          (summary[cat] === 1 ? '' : 's') + ' on ' + escapeHtml(categoryLabel(cat)) + '</li>';
      }
    }
    summaryHtml += '</ul>';
    var recentHtml = '';
    if (recent.length) {
      recentHtml = '<details class="mc-activity-detail"><summary>Most recent ' +
        recent.length + ' events</summary><ul class="mc-activity-recent">';
      recent.forEach(function (e) {
        recentHtml += '<li>' + new Date(e.occurred_at).toLocaleString() + ' — <code>' +
          escapeHtml(e.operation || '') + '</code> via <code>' +
          escapeHtml(e.vendor || '') + '</code> on ' +
          escapeHtml(categoryLabel(e.data_category)) + '</li>';
      });
      recentHtml += '</ul></details>';
    }
    panel.innerHTML = '<h3 class="mc-activity-h">AI activity on your data</h3>' +
      '<p class="mc-activity-lead">Operator-logged events under your DPA. Each row reflects an AI invocation; counts are aggregated by data category. Retention 90 days per event.</p>' +
      summaryHtml + recentHtml;
    panel.hidden = false;
  }

  function categoryLabel(category) {
    var map = {
      'contact_info':             'Contact info (name, email, phone, role)',
      'project_content':          'Project content (documents, notes, deliverables)',
      'production_data':          'Production data (processes, ingredients, recipes, BOM)',
      'transport_data':           'Transport data (logistics, origin routing, customs)',
      'supplier_data':            'Supplier data (suppliers, chain partners, sub-tier sourcing)',
      'certification_audit_data': 'Certification & audit data (certificates, audit reports, conformity)',
      'financial_data':           'Financial data (invoices, budgets)',
      'metadata':                 'Metadata (timestamps, IPs, aggregates)',
    };
    return map[category] || category;
  }

  function scopeLabelText(scope) {
    var map = {
      'ai_may_process': 'AI may process',
      'operator_only':  'Operator only',
      'excluded':       'Excluded',
    };
    return map[scope] || scope;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function init() {
    var params = new URLSearchParams(window.location.search);
    var token = params.get('token');
    if (token && /^[a-f0-9]{64}$/i.test(token)) {
      initViewMode(token);
    } else {
      initRequestMode();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

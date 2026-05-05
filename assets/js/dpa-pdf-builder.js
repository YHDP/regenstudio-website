/**
 * dpa-pdf-builder.js — Thin orchestrator (post-rebuild).
 *
 * Pipeline:
 *
 *   canonical-NL.md (+ engagement annexes)
 *      ↓ fetched + parsed by dpa-contract.html runtime, cached on
 *        window.__dpaCanonicalAst when window.__dpaCanonicalReady resolves
 *      ↓
 *   buildSignedDpaPdf(args)
 *      ↓ awaits __dpaCanonicalReady
 *      ↓ reads __dpaCanonicalAst + __dpaProfile
 *      ↓ assembles opts {cover, signatures, concept}
 *      ↓
 *   RegenPDF.render(ast, opts) → Blob (selectable-text A4 PDF)
 *
 * No html2pdf, no html2canvas, no DOM-to-canvas rasterisation. All text in
 * the output PDF is selectable + searchable + accessible. Source-of-truth
 * discipline: this file contains ZERO Dutch legal text.
 *
 * Public API:
 *   window.buildSignedDpaPdf({
 *     engagement: { key, label, legalName, ... },
 *     controller: { legalName, repName, repRole, repEmail, ... },
 *     toggles: { ... },             // currently ignored — toggle state lives in DOM
 *     aiProcessingConsent: bool,    // currently informational — captured in canonical text
 *     signature: { signedAt, handDrawnPng, processorPng },
 *     concept: bool,                // optional; true = Download Concept watermarked render
 *   }) → Promise<Blob>
 *
 * Backwards-compatible exports:
 *   window.DPA_PROFILE_LIBRARY (writable) — kept for dpa/ops preview-button.
 */

(function (root) {
  'use strict';

  if (!root.DPA_PROFILE_LIBRARY) root.DPA_PROFILE_LIBRARY = {};

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function fmtSignedAt(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    try {
      return d.toLocaleString('nl-NL', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Europe/Amsterdam',
      });
    } catch (_) {
      return iso;
    }
  }

  async function buildSignedDpaPdf(args) {
    if (!root.RegenPDF) {
      throw new Error('RegenPDF not loaded — required for buildSignedDpaPdf');
    }

    args = args || {};
    const signature = args.signature || {};
    const engagement = args.engagement || {};
    const controller = args.controller || {};
    const concept = !!args.concept;

    // Await canonical AST. The runtime in dpa-contract.html exposes
    // window.__dpaCanonicalReady — a Promise that resolves once the markdown
    // sources have been fetched, parsed, and cached on
    // window.__dpaCanonicalAst. Without this await, a fast click can capture
    // an empty AST and produce a blank-content PDF.
    if (root.__dpaCanonicalReady && typeof root.__dpaCanonicalReady.then === 'function') {
      try {
        await root.__dpaCanonicalReady;
      } catch (err) {
        throw new Error('Canonical AST render failed; refusing to generate PDF. Reason: ' + (err && err.message ? err.message : err));
      }
    }

    const ast = root.__dpaCanonicalAst;
    if (!Array.isArray(ast) || ast.length === 0) {
      throw new Error('Canonical AST is empty or missing — cannot generate PDF. Verify dpa-test-content/canonical-NL.md fetched successfully.');
    }

    // Read engagement profile from cache (set by dpa-contract.html runtime).
    // Fall back to args for fields not in the cached profile.
    const cachedProfile = root.__dpaProfile || {};

    // All user-controlled text fields pass through RegenMD.sanitiseUserText
    // (Round-2 audit fix): Unicode invisible/directional chars stripped,
    // homoglyph brackets folded to ASCII, javascript:/data: protocols
    // removed, PDF-stream keywords stripped. Defense-in-depth — even if an
    // upstream boundary (Edge Function, intake form) doesn't sanitise,
    // nothing dangerous reaches jsPDF text rendering or the cover.
    const safe = (root.RegenMD && root.RegenMD.sanitiseUserText) || function (s) { return s == null ? '' : String(s); };

    const cover = {
      legalName: safe(controller.legalName || cachedProfile.legalName || cachedProfile.legal_name || engagement.legalName) || '—',
      label: safe(engagement.label || cachedProfile.label) || '—',
      projectEinddatum: fmtDate(cachedProfile.projectEinddatum || cachedProfile.project_einddatum),
      bewaarplichtEinddatum: fmtDate(cachedProfile.bewaarplichtEinddatum || cachedProfile.bewaarplicht_einddatum),
      regulatoryLabel: safe(cachedProfile.regulatoryLabel || cachedProfile.regulatory_label) || '',
    };

    const signatures = {
      processorPng: signature.processorPng || null,
      controllerPng: signature.handDrawnPng || null,
      processorName: 'Yvo Hunink',
      processorRole: 'Directeur',
      processorLegalName: 'Regen Studio B.V.',
      controllerName: safe(controller.repName) || '—',
      controllerRole: safe(controller.repRole) || '—',
      controllerLegalName: safe(controller.legalName) || '—',
      signedAt: fmtSignedAt(signature.signedAt),
    };

    return await root.RegenPDF.render(ast, {
      cover: cover,
      signatures: signatures,
      concept: concept,
      coverHeroSrc: 'Images/dpa-cover-hero-c11.svg',
    });
  }

  root.buildSignedDpaPdf = buildSignedDpaPdf;
})(typeof window !== 'undefined' ? window : this);

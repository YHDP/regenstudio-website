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
    // Date-only ISO parsed LOCAL, not UTC — negative-offset TZ (e.g. Brazil)
    // otherwise shifts the calendar day back one (corrupts contract dates).
    const _m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    const d = _m ? new Date(+_m[1], +_m[2] - 1, +_m[3]) : new Date(iso);
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

    const legalName = safe(controller.legalName || cachedProfile.legalName || cachedProfile.legal_name || engagement.legalName) || '—';
    const engagementLabel = safe(engagement.label || cachedProfile.label) || '—';
    const repName = safe(controller.repName) || '—';
    const repRole = safe(controller.repRole) || '—';

    // Phase H-bis cover canonicalisation — when dpa-contract.html parsed
    // YAML frontmatter on the canonical .md, it published the (interpolated)
    // cover metadata on window.__dpaCoverMetadata. The PDF renderer reads
    // cover.metadata to drive title / subtitle / parties / signature box,
    // matching the HTML cover. When metadata is null (legacy 4-fragment
    // voucher engagements pre-frontmatter migration), the renderer falls
    // back to the hardcoded Dutch Verwerkersovereenkomst layout below.
    const coverMetadata = root.__dpaCoverMetadata || null;

    const cover = {
      // Per-engagement scalar fields — used for tagline + voucher-cover
      // table values. Always populated (legacy + variant covers both need
      // these).
      legalName: legalName,
      label: engagementLabel,
      taglineLabel: engagementLabel,
      applicableLaw: safe(cachedProfile.applicableLaw || cachedProfile.applicable_law)
        || (coverMetadata && coverMetadata.applicable_law)
        || 'Nederlands recht; AVG (Verordening (EU) 2016/679) — Verwerker-rol onder Artikel 28',
      aardVanVerwerking: safe(cachedProfile.aardVanVerwerking || cachedProfile.aard_van_verwerking || cachedProfile.engagement_nature) || '—',
      projectEinddatum: fmtDate(cachedProfile.projectEinddatum || cachedProfile.project_einddatum),
      bewaarplichtEinddatum: fmtDate(cachedProfile.bewaarplichtEinddatum || cachedProfile.bewaarplicht_einddatum),
      regulatoryLabel: safe(cachedProfile.regulatoryLabel || cachedProfile.regulatory_label) || '',
      controllerSignerName: repName,
      controllerSignerRole: repRole,
      processorSignerName: 'Yvo Hunink',
      processorSignerRole: 'Directeur',
      signedAtDisplay: fmtSignedAt(signature.signedAt),
      // Cover-spec metadata (variant + structural cover content). null = legacy.
      metadata: coverMetadata,
    };

    const signatures = {
      processorPng: signature.processorPng || null,
      controllerPng: signature.handDrawnPng || null,
      processorName: 'Yvo Hunink',
      processorRole: 'Directeur',
      processorLegalName: 'Regen Studio B.V.',
      controllerName: repName,
      controllerRole: repRole,
      controllerLegalName: legalName,
      signedAt: fmtSignedAt(signature.signedAt),
    };

    // Hero asset: cover metadata's hero_asset wins when present (variant
    // covers point at scope-cover-hero-c2 etc.); legacy voucher cover keeps
    // the watercolour-sails Dutch DPA hero.
    const heroSrc = (coverMetadata && coverMetadata.hero_asset)
      ? coverMetadata.hero_asset
      : 'Images/dpa-cover-hero-c11.svg';

    return await root.RegenPDF.render(ast, {
      cover: cover,
      signatures: signatures,
      concept: concept,
      coverHeroSrc: heroSrc,
      coverLogoSrc: 'Images/logo-icon.svg',
    });
  }

  root.buildSignedDpaPdf = buildSignedDpaPdf;
})(typeof window !== 'undefined' ? window : this);

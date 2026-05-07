/**
 * scope-pdf-builder.js — Thin orchestrator for the JPA (Joint Project
 * Agreement) signing flow. JPA-counterparty equivalent of dpa-pdf-builder.js,
 * adapted for the symmetric two-party arg shape used by jpa-counterparty-ui.
 *
 * Pipeline:
 *
 *   canonical_md (string from scope-verify-token Edge Function)
 *      ↓
 *   RegenScopeMD.parse(md) → AST
 *      ↓
 *   buildSignedScopePdf({engagement, canonical_md, parties, signatures, concept})
 *      ↓
 *   RegenScopePDF.render(ast, opts) → Blob (selectable-text A4 PDF)
 *
 * Public API:
 *   window.buildSignedScopePdf({
 *     engagement: { key, label, canonical_text_key, master_agreement_ref?, governing_law? },
 *     canonical_md: string,
 *     parties: {
 *       party_a: { legal_name, rep_name, rep_role, registered_seat?, … },
 *       party_b: { legal_name, rep_name, rep_role, rep_email, … }
 *     },
 *     signatures: {
 *       party_a_png_b64: string|null,   // pre-rendered (env var, no data: prefix)
 *       party_b_png_b64: string,        // hand-drawn (canvas, no data: prefix)
 *       signed_at: string,              // ISO 8601
 *     },
 *     concept: bool,                    // optional; true = DRAFT watermark
 *   }) → Promise<Blob>
 *
 * Source-of-truth discipline: this file contains ZERO agreement text. All
 * binding text comes from the AST (parsed from canonical_md, which is bundled
 * into the scope-verify-token Edge Function and SHA-pinned in jpa-engagements.json).
 */

(function (root) {
  'use strict';

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function fmtSignedAt(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    try {
      return d.toLocaleString('en-GB', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Europe/Amsterdam',
      });
    } catch (_) {
      return iso;
    }
  }

  async function buildSignedScopePdf(args) {
    if (!root.RegenScopePDF) {
      throw new Error('RegenScopePDF not loaded — required for buildSignedScopePdf');
    }
    if (!root.RegenScopeMD) {
      throw new Error('RegenScopeMD not loaded — required for buildSignedScopePdf');
    }

    args = args || {};
    const engagement = args.engagement || {};
    const parties = args.parties || {};
    const partyA = parties.party_a || {};
    const partyB = parties.party_b || {};
    const signatures = args.signatures || {};
    const concept = !!args.concept;
    const canonicalMd = args.canonical_md || '';
    if (!canonicalMd || canonicalMd.length < 100) {
      throw new Error('canonical_md is empty or too short — refusing to render PDF.');
    }

    // Parse the canonical markdown body into the AST shared with browser preview.
    const ast = root.RegenScopeMD.parse(canonicalMd);
    if (!Array.isArray(ast) || ast.length === 0) {
      throw new Error('Canonical AST is empty after parse — markdown source may be malformed.');
    }

    // Defense-in-depth sanitiser (Round-2 audit pattern in DPA — same here).
    const safe = (root.RegenScopeMD && root.RegenScopeMD.sanitiseUserText)
      || function (s) { return s == null ? '' : String(s); };

    const partyALegalName = safe(partyA.legal_name) || 'Regen Studio B.V.';
    const partyBLegalName = safe(partyB.legal_name) || '—';
    const partyARepName = safe(partyA.rep_name) || 'Yvo Thomas Anton Hunink de Paiva';
    const partyARepRole = safe(partyA.rep_role) || 'Bestuurder';
    const partyBRepName = safe(partyB.rep_name) || '—';
    const partyBRepRole = safe(partyB.rep_role) || '—';
    const engagementLabel = safe(engagement.label) || '—';

    // Cover-page metadata rows (defensive defaults; renderer will use these
    // verbatim if present, otherwise its own internal defaults).
    const cover = {
      // Top-of-cover identifiers
      documentTitle: 'Project Scope Agreement',
      subtitle: 'project scope agreement · joint two-party contract · eIDAS Art 25(1) · Reg (EU) 910/2014',
      label: engagementLabel,
      taglineLabel: engagementLabel,
      partyALegalName: partyALegalName,
      partyBLegalName: partyBLegalName,
      // Legacy DPA field — populated for backward-compat in case any code path reads it
      legalName: partyBLegalName,

      // Engagement metadata (table on cover)
      metadataRows: [
        ['Project', engagementLabel],
        ['Governing law', engagement.governing_law || 'German law; Berlin courts (per Master Agreement §15)'],
        ['Master Agreement', engagement.master_agreement_ref || '—'],
        ['Effective date', fmtDate(engagement.effective_date)],
        ['Bilateral signing time', fmtSignedAt(signatures.signed_at)],
      ],

      // Bottom-of-cover bilateral signature box
      partyASignerName: partyARepName,
      partyASignerRole: partyARepRole,
      partyBSignerName: partyBRepName,
      partyBSignerRole: partyBRepRole,
      // DPA-renderer-compat keys (older renderer code reads these names)
      controllerSignerName: partyBRepName,
      controllerSignerRole: partyBRepRole,
      processorSignerName: partyARepName,
      processorSignerRole: partyARepRole,
      signedAtDisplay: fmtSignedAt(signatures.signed_at),
    };

    // Final-page bilateral signature block
    const sig = {
      processorPng: signatures.party_a_png_b64 || null,
      controllerPng: signatures.party_b_png_b64 || null,
      processorName: partyARepName,
      processorRole: partyARepRole,
      processorLegalName: partyALegalName,
      controllerName: partyBRepName,
      controllerRole: partyBRepRole,
      controllerLegalName: partyBLegalName,
      signedAt: fmtSignedAt(signatures.signed_at),
    };

    return await root.RegenScopePDF.render(ast, {
      cover: cover,
      signatures: sig,
      concept: concept,
      // Root-absolute paths — the JPA preview runs inline inside /dpa/ops/index.html
      // (unlike the DPA preview, which opens /dpa-contract.html). Relative
      // 'Images/…' resolves to /dpa/ops/Images/… → 404. Root-absolute works
      // both locally (python -m http.server) and on GitHub Pages production.
      coverHeroSrc: '/Images/scope-cover-hero-c2.svg',
      coverLogoSrc: '/Images/logo-icon.svg',
      // Per-engagement Party-B (counterparty) logo. Driven by
      // jpa-engagements.json `party_b_logo_src` field; renderer falls back
      // to single-anchor cover layout when absent.
      coverPartyBLogoSrc: engagement.party_b_logo_src || null,
    });
  }

  root.buildSignedScopePdf = buildSignedScopePdf;
})(typeof window !== 'undefined' ? window : this);

/**
 * dpa-pdf-builder.js
 *
 * Programmatic vector PDF authoring for signed Verwerkersovereenkomsten.
 * Uses jsPDF directly (assets/js/vendor/jspdf.umd.min.js — pre-loaded by
 * dpa-contract.html). Produces a Regen Studio-branded A4 document with
 * selectable text, sharp typography at any zoom, ~150-400 KB file size.
 *
 * Replaces the previous html2pdf+html2canvas screenshot pipeline that
 * suffered from scroll-offset bugs, 16k canvas-limit truncation, and a
 * literal print-of-the-page aesthetic.
 *
 * Public entry point:
 *   window.buildSignedDpaPdf({ engagement, controller, processor,
 *                              toggles, aiProcessingConsent, signature })
 *     → Promise<Blob>  (PDF bytes)
 *
 * Triangle chique × pragmatic: subtle triangle accent in running header +
 * cover, generous whitespace, structured tables, plain-Dutch summaries
 * per § with the full legal text incorporated by reference (SHA-pinned)
 * via a permanent canonical-body URL stamped on the cover.
 *
 * Per-engagement optimisation: the `engagement.regulatoryRegime` field
 * (`dsr` / `espr` / `espr_textiles` / etc.) selects regime-specific copy
 * for §3 work-package descriptions, §10 transfer cites, Schedule §B.9
 * scope notes. Default text covers the AVG core unchanged across regimes.
 */

(function (root) {
  'use strict';

  // -------------------------------------------------------------------------
  // Brand constants
  // -------------------------------------------------------------------------
  const BRAND = {
    emerald: [0, 109, 56],       // #006d38 — primary
    teal:    [0, 114, 139],      // #00728b
    gold:    [122, 88, 20],      // #7a5814
    ink:     [26, 26, 46],       // #1a1a2e — body text
    muted:   [91, 100, 112],     // #5b6470 — meta text
    border:  [216, 219, 224],    // #d8dbe0 — table rules
    plain:   [255, 250, 235],    // #fffaeb — klare-taal box bg
    plainBd: [240, 193, 75],     // #f0c14b — klare-taal box border
  };

  const FONT = 'helvetica'; // jsPDF built-in (Helvetica), guaranteed available
  const PAGE = {
    width:  595.28, // A4 portrait pt
    height: 841.89,
    marginTop:    50,
    marginBottom: 60,
    marginLeft:   50,
    marginRight:  50,
  };
  PAGE.contentWidth  = PAGE.width  - PAGE.marginLeft - PAGE.marginRight;
  PAGE.contentBottom = PAGE.height - PAGE.marginBottom;

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function setColor(doc, rgb)     { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }
  function setDraw(doc, rgb)      { doc.setDrawColor(rgb[0], rgb[1], rgb[2]); }
  function setFill(doc, rgb)      { doc.setFillColor(rgb[0], rgb[1], rgb[2]); }
  function setFont(doc, style)    { doc.setFont(FONT, style || 'normal'); }

  /** Reserve vertical space; if remaining < requested, addPage() and reset y. */
  function ensureSpace(state, needed) {
    if (state.y + needed > PAGE.contentBottom) {
      addPage(state);
    }
  }

  function addPage(state) {
    state.doc.addPage();
    state.pageNumber += 1;
    drawRunningHeader(state);
    state.y = PAGE.marginTop + 30; // leave room for header
  }

  /** Tiny triangle motif used in running header + cover. */
  function drawTriangle(doc, cx, cy, size, fillRgb, opacity) {
    const half = size / 2;
    const h = size * 0.866; // equilateral height
    setFill(doc, fillRgb);
    if (opacity != null) doc.setGState(new (doc.GState || function(){})({ opacity }));
    doc.triangle(cx - half, cy + h * 0.5, cx + half, cy + h * 0.5, cx, cy - h * 0.5, 'F');
    if (opacity != null && doc.GState) doc.setGState(new doc.GState({ opacity: 1 }));
  }

  /** Page header (skipped on cover). */
  function drawRunningHeader(state) {
    const { doc, engagement } = state;
    if (state.pageNumber === 1) return;
    setColor(doc, BRAND.muted);
    setFont(doc, 'normal');
    doc.setFontSize(8);
    doc.text(
      `Verwerkersovereenkomst — ${engagement.legalName} × Regen Studio B.V.`,
      PAGE.marginLeft, PAGE.marginTop * 0.6
    );
    drawTriangle(doc, PAGE.width - PAGE.marginRight - 4, PAGE.marginTop * 0.6 - 3, 7, BRAND.emerald);
    // bottom rule + page number
    setDraw(doc, BRAND.border);
    doc.setLineWidth(0.4);
    doc.line(PAGE.marginLeft, PAGE.height - PAGE.marginBottom * 0.7,
             PAGE.width - PAGE.marginRight, PAGE.height - PAGE.marginBottom * 0.7);
    doc.setFontSize(8);
    setColor(doc, BRAND.muted);
    doc.text(
      `Pagina ${state.pageNumber}`,
      PAGE.width - PAGE.marginRight,
      PAGE.height - PAGE.marginBottom * 0.45,
      { align: 'right' }
    );
  }

  /** Wrap-and-write a paragraph at current y; advance y. */
  function writeParagraph(state, text, opts) {
    opts = opts || {};
    const { doc } = state;
    const fontSize = opts.fontSize || 10;
    const lineGap  = opts.lineGap  || fontSize * 1.45;
    const color    = opts.color    || BRAND.ink;
    const style    = opts.style    || 'normal';
    const indent   = opts.indent   || 0;
    const width    = (opts.width != null) ? opts.width : (PAGE.contentWidth - indent);
    setFont(doc, style);
    doc.setFontSize(fontSize);
    setColor(doc, color);
    const lines = doc.splitTextToSize(text, width);
    for (let i = 0; i < lines.length; i++) {
      ensureSpace(state, lineGap);
      doc.text(lines[i], PAGE.marginLeft + indent, state.y);
      state.y += lineGap;
    }
    state.y += (opts.spaceAfter != null) ? opts.spaceAfter : 4;
  }

  /** H2-style section heading with emerald rule underneath. */
  function writeSectionHeading(state, label) {
    const { doc } = state;
    ensureSpace(state, 40);
    state.y += 8;
    setFont(doc, 'bold');
    doc.setFontSize(13);
    setColor(doc, BRAND.emerald);
    doc.text(label, PAGE.marginLeft, state.y);
    state.y += 4;
    setDraw(doc, BRAND.border);
    doc.setLineWidth(0.5);
    doc.line(PAGE.marginLeft, state.y, PAGE.marginLeft + PAGE.contentWidth, state.y);
    state.y += 10;
  }

  /** H3-style sub-heading. */
  function writeSubheading(state, label) {
    ensureSpace(state, 20);
    state.y += 4;
    setFont(state.doc, 'bold');
    state.doc.setFontSize(10.5);
    setColor(state.doc, BRAND.ink);
    state.doc.text(label, PAGE.marginLeft, state.y);
    state.y += 13;
  }

  /** Klare-taal callout box (yellow-tinted). Audit R10 — fixed height calc:
   *  total = padY (top) + label (11) + label-gap (4) + N*lineGap + padY (bot). */
  function writePlainBox(state, label, body) {
    const { doc } = state;
    const padX = 10, padY = 8;
    setFont(doc, 'normal');
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(body, PAGE.contentWidth - 2 * padX - 4);
    const lineGap = 13;
    const boxHeight = padY + 11 + 4 + (lines.length * lineGap) + padY;
    ensureSpace(state, boxHeight + 12);
    setFill(doc, BRAND.plain);
    setDraw(doc, BRAND.plainBd);
    doc.setLineWidth(0.6);
    doc.rect(PAGE.marginLeft, state.y, PAGE.contentWidth, boxHeight, 'FD');
    // Left accent bar
    setFill(doc, BRAND.plainBd);
    doc.rect(PAGE.marginLeft, state.y, 3, boxHeight, 'F');
    let cy = state.y + padY + 8;
    setFont(doc, 'bold');
    doc.setFontSize(7.5);
    setColor(doc, BRAND.gold);
    doc.text((label || 'IN KLARE TAAL').toUpperCase(), PAGE.marginLeft + padX + 4, cy);
    cy += 11;
    setFont(doc, 'normal');
    doc.setFontSize(9.5);
    setColor(doc, BRAND.ink);
    for (let i = 0; i < lines.length; i++) {
      doc.text(lines[i], PAGE.marginLeft + padX + 4, cy);
      cy += lineGap;
    }
    state.y += boxHeight + 12;
  }

  /** Two-column key-value table (party identity, summary fields). */
  function writeKVTable(state, rows, opts) {
    opts = opts || {};
    const { doc } = state;
    const labelW = opts.labelWidth || (PAGE.contentWidth * 0.34);
    const valueW = PAGE.contentWidth - labelW;
    const padY = 6;
    const lineGap = 12;
    setFont(doc, 'normal');
    doc.setFontSize(9.5);
    setDraw(doc, BRAND.border);
    doc.setLineWidth(0.4);

    for (let i = 0; i < rows.length; i++) {
      const [label, value] = rows[i];
      const valueLines = doc.splitTextToSize(String(value || ''), valueW - 12);
      const rowH = padY * 2 + Math.max(1, valueLines.length) * lineGap;
      ensureSpace(state, rowH + 2);

      setColor(doc, BRAND.muted);
      setFont(doc, 'normal');
      doc.text(label, PAGE.marginLeft + 6, state.y + padY + 8);

      setColor(doc, BRAND.ink);
      setFont(doc, 'normal');
      for (let j = 0; j < valueLines.length; j++) {
        doc.text(valueLines[j], PAGE.marginLeft + labelW + 6, state.y + padY + 8 + j * lineGap);
      }

      // bottom rule
      doc.line(PAGE.marginLeft, state.y + rowH,
               PAGE.marginLeft + PAGE.contentWidth, state.y + rowH);
      state.y += rowH;
    }
    state.y += 8;
  }

  /** Multi-column data table with header row. */
  function writeDataTable(state, headers, rows, colWidths) {
    const { doc } = state;
    const padX = 6, padY = 5;
    const lineGap = 11;
    if (!colWidths) {
      const n = headers.length;
      colWidths = new Array(n).fill(PAGE.contentWidth / n);
    }

    function drawRow(cells, isHeader) {
      // Compute row height based on tallest wrapped cell
      const wrappedCells = cells.map((c, i) =>
        doc.splitTextToSize(String(c || ''), colWidths[i] - 2 * padX)
      );
      const maxLines = Math.max(1, ...wrappedCells.map(l => l.length));
      const rowH = padY * 2 + maxLines * lineGap;
      ensureSpace(state, rowH + 2);

      if (isHeader) {
        setFill(doc, BRAND.emerald);
        doc.rect(PAGE.marginLeft, state.y, PAGE.contentWidth, rowH, 'F');
        setColor(doc, [255, 255, 255]);
        setFont(doc, 'bold');
      } else {
        setColor(doc, BRAND.ink);
        setFont(doc, 'normal');
      }
      doc.setFontSize(9);

      let x = PAGE.marginLeft;
      for (let i = 0; i < cells.length; i++) {
        const lines = wrappedCells[i];
        for (let j = 0; j < lines.length; j++) {
          doc.text(lines[j], x + padX, state.y + padY + 8 + j * lineGap);
        }
        x += colWidths[i];
      }

      // bottom rule (skip after header — visual separator is the fill)
      if (!isHeader) {
        setDraw(doc, BRAND.border);
        doc.setLineWidth(0.3);
        doc.line(PAGE.marginLeft, state.y + rowH,
                 PAGE.marginLeft + PAGE.contentWidth, state.y + rowH);
      }
      state.y += rowH;
    }

    drawRow(headers, true);
    for (let r = 0; r < rows.length; r++) drawRow(rows[r], false);
    state.y += 6;
  }

  // -------------------------------------------------------------------------
  // Cover page
  // -------------------------------------------------------------------------
  function drawCover(state) {
    const { doc, engagement, controller, processor, signature } = state;

    // Triangle band (decorative, top of page)
    setFill(doc, BRAND.emerald);
    doc.triangle(0, 0, 180, 0, 0, 90, 'F');
    setFill(doc, [101, 221, 53]); // accent green
    doc.triangle(180, 0, 280, 0, 280, 50, 'F');
    setFill(doc, BRAND.teal);
    doc.triangle(0, 90, 90, 90, 0, 140, 'F');

    // Brand mark + wordmark
    setColor(doc, [255, 255, 255]);
    setFont(doc, 'bold');
    doc.setFontSize(11);
    doc.text('REGEN STUDIO', 18, 30);
    setFont(doc, 'normal');
    doc.setFontSize(8);
    doc.text('verwerkersovereenkomst', 18, 44);

    // Title block (mid page)
    const titleY = 220;
    setColor(doc, BRAND.ink);
    setFont(doc, 'bold');
    doc.setFontSize(28);
    doc.text('Verwerkersovereenkomst', PAGE.marginLeft, titleY);

    setFont(doc, 'normal');
    doc.setFontSize(13);
    setColor(doc, BRAND.muted);
    const subtitle = `tussen ${controller.legalName} en Regen Studio B.V.`;
    doc.text(subtitle, PAGE.marginLeft, titleY + 22);

    // Engagement label + key — small caps style
    setFont(doc, 'bold');
    doc.setFontSize(8.5);
    setColor(doc, BRAND.gold);
    doc.text((engagement.label || engagement.key || '').toUpperCase(),
             PAGE.marginLeft, titleY + 42, { maxWidth: PAGE.contentWidth });

    // Mid-page horizontal rule
    setDraw(doc, BRAND.border);
    doc.setLineWidth(0.5);
    doc.line(PAGE.marginLeft, titleY + 60, PAGE.marginLeft + 180, titleY + 60);

    // Engagement metadata block
    const metaY = titleY + 90;
    state.y = metaY;
    setFont(doc, 'bold');
    doc.setFontSize(10);
    setColor(doc, BRAND.emerald);
    doc.text('Engagement', PAGE.marginLeft, state.y);
    state.y += 16;

    const metaRows = [];
    if (engagement.label)               metaRows.push(['Project',          engagement.label]);
    if (engagement.regulatoryLabel)     metaRows.push(['Regulatoir kader', engagement.regulatoryLabel]);
    if (engagement.subsidieBedragEur)   metaRows.push(['Subsidie',         `€${engagement.subsidieBedragEur.toLocaleString('nl-NL')} excl. BTW · ${engagement.expertUren || '?'} expert-uur`]);
    if (engagement.projectEinddatum)    metaRows.push(['Project-einddatum',engagement.projectEinddatum]);
    if (engagement.bewaarplichtEinddatum) metaRows.push(['Bewaarplicht t/m', engagement.bewaarplichtEinddatum]);
    if (engagement.regulatoryDppDeadline) metaRows.push(['Regulatoir van kracht', `${engagement.regulatoryDppDeadline} (voorbereidings-traject; geen actie vereist vóór deze datum)`]);
    writeKVTable(state, metaRows);

    // Bottom block: signature attestation strip
    const footerY = PAGE.height - 120;
    setFill(doc, [241, 250, 244]); // light emerald tint
    doc.rect(PAGE.marginLeft, footerY, PAGE.contentWidth, 70, 'F');
    setDraw(doc, BRAND.emerald);
    doc.setLineWidth(1.2);
    doc.line(PAGE.marginLeft, footerY, PAGE.marginLeft, footerY + 70);

    setColor(doc, BRAND.emerald);
    setFont(doc, 'bold');
    doc.setFontSize(10);
    doc.text('Ondertekend', PAGE.marginLeft + 14, footerY + 18);

    setColor(doc, BRAND.ink);
    setFont(doc, 'normal');
    doc.setFontSize(9);
    doc.text(`door ${controller.repName || '—'} (${controller.repRole || '—'})`,
             PAGE.marginLeft + 14, footerY + 32);
    // Audit Round-3 ux: format ISO timestamp in human Dutch locale on the cover
    let coverSignedAt = signature.signedAt;
    try {
      const d = new Date(signature.signedAt);
      if (!Number.isNaN(d.getTime())) {
        coverSignedAt = d.toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' });
      }
    } catch (e) { /* keep ISO fallback */ }
    doc.text(`namens ${controller.legalName} · ${coverSignedAt}`,
             PAGE.marginLeft + 14, footerY + 45);

    setColor(doc, BRAND.muted);
    setFont(doc, 'normal');
    doc.setFontSize(7.5);
    doc.text('Simple Electronic Signature onder eIDAS Art 25(1) · Verordening (EU) 910/2014',
             PAGE.marginLeft + 14, footerY + 60);

    // Bottom-right page mark
    drawTriangle(doc, PAGE.width - 30, PAGE.height - 35, 12, BRAND.emerald);
    setColor(doc, BRAND.muted);
    setFont(doc, 'normal');
    doc.setFontSize(7);
    doc.text('Pagina 1', PAGE.width - PAGE.marginRight, PAGE.height - 35, { align: 'right' });
  }

  // -------------------------------------------------------------------------
  // Parties page
  // -------------------------------------------------------------------------
  function drawPartiesPage(state) {
    const { doc, controller, processor } = state;
    addPage(state);
    writeSectionHeading(state, '§ 1 · Partijen');

    writeParagraph(state,
      'Deze Verwerkersovereenkomst (hierna: "Overeenkomst") is gesloten tussen de volgende Partijen:',
      { spaceAfter: 8 });

    writeSubheading(state, 'De Verwerker');
    writeKVTable(state, [
      ['Naam rechtspersoon',     processor.legalName],
      ['Vestigingsadres',        processor.address],
      ['KvK-nummer',             processor.kvk],
      ['BTW-nummer',             processor.btw],
      ['Bevoegd vertegenwoordiger', processor.repName],
      ['Contact-e-mail',         processor.repEmail],
    ]);

    writeSubheading(state, 'De Verantwoordelijke');
    writeKVTable(state, [
      ['Naam rechtspersoon',        controller.legalName],
      ['Rechtsvorm',                controller.legalForm],
      ['Adres',                     controller.address],
      ['Land van oprichting',       controller.country],
      ['KvK-nummer',                controller.kvk],
      ['Bevoegd vertegenwoordiger', controller.repName],
      ['Functie',                   controller.repRole],
      ['Contact-e-mail',            controller.repEmail],
      ['Telefoon (optioneel)',      controller.repPhone || '—'],
    ]);

    writeParagraph(state,
      'De vertegenwoordiger van de Verantwoordelijke verklaart dat hij/zij bevoegd is om de Verantwoordelijke aan deze Overeenkomst te binden.',
      { fontSize: 9.5, color: BRAND.muted });
  }

  // -------------------------------------------------------------------------
  // Body sections (per-engagement-aware)
  // -------------------------------------------------------------------------
  /** Normalise regulatory-regime enum to internal key. Accepts: 'dsr',
   *  'espr', 'espr_textiles', 'cpr', 'batteries', 'eudr', plus the longer
   *  forms emitted by the intake form (DSR-2026-405, ESPR-DA-textiles, etc). */
  function normaliseRegime(regime) {
    if (!regime) return 'espr';
    const r = String(regime).toLowerCase();
    if (r.includes('dsr')) return 'dsr';
    if (r.includes('textile') || r.includes('apparel')) return 'espr_textiles';
    if (r.includes('cpr')) return 'cpr';
    if (r.includes('batter')) return 'batteries';
    if (r.includes('eudr')) return 'eudr';
    if (r.includes('espr')) return 'espr';
    return 'espr';
  }

  /** Each work-package = { title, body } for bold/normal segment rendering. */
  function regimeWorkPackages(regime) {
    const REG = {
      dsr: [
        { title: 'WP1 — DPP Roadmap (80 uur)', body: 'juridische kaders DSR Verordening (EU) 2026/405 + ESPR (EU) 2024/1781 · technische eisen · informatiecategorieën · no-regret-voorbereidingen incl. branche-interview.' },
        { title: 'WP2 — Datagovernance (80 uur)', body: 'informatieketens inzichtelijk maken · datagaps · processen + methoden voor databeschikbaarheid · verifieerbaar aantoonbaar maken van informatie + certificering.' },
        { title: 'WP3 — Waarde door vrijwillige informatie in het DPP (40 uur)', body: 'klantwaarde · leveranciersketen-optimalisatie · circulaire business-modellen · stimuleren verdere verduurzaming.' },
      ],
      espr: [
        { title: 'WP1 — DPP Roadmap (80 uur)', body: 'juridische kaders ESPR Verordening (EU) 2024/1781 (Art 7 + Art 8) · sectoraal Delegated-Act-pipeline · technische eisen · informatiecategorieën.' },
        { title: 'WP2 — Datagovernance (80 uur)', body: 'informatieketens · datagaps · processen voor databeschikbaarheid · verifieerbaar aantoonbaar maken.' },
        { title: 'WP3 — Waarde door vrijwillige informatie in het DPP (40 uur)', body: 'klantwaarde · ketenoptimalisatie · circulaire business-modellen.' },
      ],
      espr_textiles: [
        { title: 'WP1 — DPP Roadmap (80 uur)', body: 'ESPR Verordening (EU) 2024/1781 (Art 7 + Art 8) toegepast op textiel + kleding · sectoraal Delegated-Act-pipeline · informatiecategorieën Annex VII.' },
        { title: 'WP2 — Datagovernance (80 uur)', body: 'informatieketens · datagaps · processen voor databeschikbaarheid in textielketen · verifieerbaar aantoonbaar maken via supply-chain audits.' },
        { title: 'WP3 — Waarde door vrijwillige informatie in het DPP (40 uur)', body: 'klantwaarde · ketenoptimalisatie · circulaire-textiel business-modellen.' },
      ],
      cpr: [
        { title: 'WP1 — DPP Roadmap (80 uur)', body: 'juridische kaders CPR Verordening (EU) 2024/3110 (Art 5(8) + Art 75(1) DA) · hEN/EAD-pipeline · informatiecategorieën Annex II.' },
        { title: 'WP2 — Datagovernance (80 uur)', body: 'informatieketens · datagaps · processen voor databeschikbaarheid · verifieerbaar aantoonbaar maken.' },
        { title: 'WP3 — Waarde door vrijwillige informatie in het DPP (40 uur)', body: 'klantwaarde · ketenoptimalisatie · circulaire bouwproducten-modellen.' },
      ],
      batteries: [
        { title: 'WP1 — DPP Roadmap (80 uur)', body: 'Batterijenverordening (EU) 2023/1542 (Art 77 battery passport) · CFP + recycled-content + due-diligence-eisen.' },
        { title: 'WP2 — Datagovernance (80 uur)', body: 'informatieketens cobalt/lithium/nikkel · datagaps · processen voor databeschikbaarheid · verifieerbaar aantoonbaar maken via supply-chain due diligence.' },
        { title: 'WP3 — Waarde door vrijwillige informatie in het DPP (40 uur)', body: 'klantwaarde · ketenoptimalisatie · circulaire batterij business-modellen.' },
      ],
      eudr: [
        { title: 'WP1 — DPP Roadmap (80 uur)', body: 'EUDR Verordening (EU) 2023/1115 — Annex I commodities · Due Diligence Statement (DDS) via TRACES NT · geolocatie-vereisten.' },
        { title: 'WP2 — Datagovernance (80 uur)', body: 'informatieketens · datagaps · processen voor geolocatie + ketenherleiding · verifieerbaar aantoonbaar maken.' },
        { title: 'WP3 — Waarde door vrijwillige informatie in het DPP (40 uur)', body: 'klantwaarde · ketenoptimalisatie · ontbossingsvrije-business-modellen.' },
      ],
    };
    if (!REG[regime]) {
      throw new Error(`regimeWorkPackages: missing WP definitions for regime '${regime}'. Add to REG before signing this engagement.`);
    }
    return REG[regime];
  }

  /** Engagement profile registry. Hardcoded for the 5 voucher clients +
   *  a generic fallback. Phase C (ops tool) will migrate this to clients.json
   *  edited via the admin workspace. */
  const ENGAGEMENT_PROFILES = {
    'voucher/seepje': {
      regulatoryRegime: 'dsr',
      regulatoryLabel: 'DSR Verordening (EU) 2026/405',
      regulatoryDppDeadline: '23 september 2029',
      subsidieBedragEur: 26000,
      expertUren: 200,
      projectEinddatum: '1 december 2026',
      bewaarplichtEinddatum: '31 december 2035',
      hasSideLetter: true,
      hasVoucherAnnexes: true,
    },
    'voucher/houtgoed': {
      regulatoryRegime: 'espr',
      regulatoryLabel: 'ESPR Verordening (EU) 2024/1781 (sectoraal: meubilair + hout)',
      regulatoryDppDeadline: 'verwacht 2027–2030 onder sectoraal ESPR Delegated Act (datum nog niet vastgesteld)',
      subsidieBedragEur: 28400,
      expertUren: 200,
      projectEinddatum: '31 oktober 2026',
      bewaarplichtEinddatum: '31 december 2035',
      hasSideLetter: true,
      hasVoucherAnnexes: true,
    },
    'voucher/engelvaart': {
      regulatoryRegime: 'espr_textiles',
      regulatoryLabel: 'ESPR Verordening (EU) 2024/1781 — Annex VII textiel + kleding',
      regulatoryDppDeadline: 'verwacht 2027–2028 onder sectoraal ESPR Delegated Act textiel (datum nog niet vastgesteld)',
      projectEinddatum: '31 oktober 2026',
      bewaarplichtEinddatum: '31 december 2035',
      hasSideLetter: true,
      hasVoucherAnnexes: true,
    },
    'voucher/evsmart': {
      regulatoryRegime: 'espr',
      regulatoryLabel: 'ESPR Verordening (EU) 2024/1781',
      regulatoryDppDeadline: 'verwacht 2027–2030 onder sectoraal ESPR Delegated Act (datum nog niet vastgesteld)',
      projectEinddatum: '31 oktober 2026',
      bewaarplichtEinddatum: '31 december 2035',
      hasSideLetter: true,
      hasVoucherAnnexes: true,
    },
    'voucher/hollands-wol-collectief': {
      regulatoryRegime: 'espr_textiles',
      regulatoryLabel: 'ESPR Verordening (EU) 2024/1781 — Annex VII textiel + kleding',
      regulatoryDppDeadline: 'verwacht 2027–2028 onder sectoraal ESPR Delegated Act textiel (datum nog niet vastgesteld)',
      projectEinddatum: '31 oktober 2026',
      bewaarplichtEinddatum: '31 december 2035',
      hasSideLetter: true,
      hasVoucherAnnexes: true,
    },
  };

  function resolveEngagement(callerEngagement) {
    const profile = ENGAGEMENT_PROFILES[callerEngagement.key];
    if (!profile) {
      throw new Error(`resolveEngagement: no profile for engagement key '${callerEngagement.key}'. Add to ENGAGEMENT_PROFILES before signing this engagement.`);
    }
    // Audit Round-3 logic-ver fix: nullish-aware merge so caller-side
    // `undefined` doesn't silently overwrite authoritative profile fields.
    const merged = Object.assign({}, profile);
    for (const k of Object.keys(callerEngagement)) {
      if (callerEngagement[k] != null) merged[k] = callerEngagement[k];
    }
    merged.regulatoryRegime = normaliseRegime(merged.regulatoryRegime);
    return merged;
  }

  function drawDefinitions(state) {
    addPage(state);
    writeSectionHeading(state, '§ 2 · Definities');
    writeParagraph(state,
      'De termen persoonsgegevens, verwerking, verantwoordelijke, verwerker, subverwerker, betrokkene, inbreuk in verband met persoonsgegevens, en toezichthoudende autoriteit hebben de betekenis die hieraan is gegeven in Artikel 4 AVG.');
    writeParagraph(state,
      '"AVG" verwijst naar Verordening (EU) 2016/679 (General Data Protection Regulation). Verwijzingen naar AVG-Artikelen zijn naar die Verordening. "Engagement" duidt het in §3 beschreven samenwerkingsverband tussen Partijen aan. "Engagement-Scope" duidt de in §3 + §4 (Categorieën persoonsgegevens) afgebakende verzameling persoonsgegevens en verwerkingsdoelen aan.');
    writePlainBox(state, 'In klare taal',
      'De woorden uit de AVG (zoals "persoonsgegevens" en "verwerking") betekenen hier hetzelfde als wat de wet zegt — geen aparte interpretaties. "Engagement" is dit specifieke project en "Engagement-Scope" is wat dit project precies omvat.');
  }

  function drawSubjectAndScope(state) {
    const { engagement } = state;
    addPage(state);
    writeSectionHeading(state, '§ 3 · Onderwerp van de overeenkomst');

    writeParagraph(state,
      `De Verwerker levert in opdracht van de Verantwoordelijke de Diensten zoals beschreven in de Offerte voor ${engagement.label}. De werkzaamheden bestaan uit drie werkpakketten:`);

    const wps = regimeWorkPackages(engagement.regulatoryRegime);
    state.y += 4;
    for (let i = 0; i < wps.length; i++) {
      // Hanging-indent bullet: bold title + body on same line, wrapping
      // continues at the indent. Audit Round-3 logic-ver fix: instead of
      // slicing the original bodyText by firstLine.length (which doesn't
      // match jsPDF's whitespace-trimming wrap), wrap the FULL body at
      // hanging-indent width and re-wrap only the first line at the
      // narrower title-row width. Reconstruct remainder from index in the
      // already-wrapped lines array, not from raw character offsets.
      ensureSpace(state, 30);
      const { doc } = state;
      doc.setFontSize(9.5);
      setColor(doc, BRAND.ink);
      setFont(doc, 'normal');
      doc.text('•', PAGE.marginLeft + 4, state.y);
      setFont(doc, 'bold');
      doc.text(wps[i].title, PAGE.marginLeft + 14, state.y);
      const titleW = doc.getTextWidth(wps[i].title + ' ');
      setFont(doc, 'normal');
      const lineGap = 13.5;
      const bodyText = wps[i].body;
      const firstLineMaxW = PAGE.contentWidth - 14 - titleW;
      // Edge case: very long titles leave too little room on the title row;
      // fall back to title-on-its-own-line then full-width body wrap.
      if (firstLineMaxW < 60) {
        state.y += lineGap;
        const allLines = doc.splitTextToSize(bodyText, PAGE.contentWidth - 14);
        for (let j = 0; j < allLines.length; j++) {
          ensureSpace(state, lineGap);
          doc.text(allLines[j], PAGE.marginLeft + 14, state.y);
          state.y += lineGap;
        }
      } else {
        // Wrap full body at hanging-indent width once.
        const allLines = doc.splitTextToSize(bodyText, PAGE.contentWidth - 14);
        // Determine how much of the FIRST wrapped line fits on the title row.
        const firstWrapped = allLines[0] || '';
        const firstFit = doc.splitTextToSize(firstWrapped, firstLineMaxW);
        const firstFitLine = firstFit[0] || '';
        // Remainder = whatever didn't fit on the title row + the rest of
        // the original wrapped lines, joined back and re-wrapped at full width.
        const overflow = firstWrapped.slice(firstFitLine.length).replace(/^\s+/, '');
        const tail = allLines.slice(1).join(' ');
        const remainderText = overflow + (overflow && tail ? ' ' : '') + tail;
        const remainderLines = remainderText ? doc.splitTextToSize(remainderText, PAGE.contentWidth - 14) : [];
        doc.text(firstFitLine, PAGE.marginLeft + 14 + titleW, state.y);
        state.y += lineGap;
        for (let j = 0; j < remainderLines.length; j++) {
          ensureSpace(state, lineGap);
          doc.text(remainderLines[j], PAGE.marginLeft + 14, state.y);
          state.y += lineGap;
        }
      }
      state.y += 4;
    }

    writeParagraph(state,
      `Doel: de Verantwoordelijke voorbereiden op het ${engagement.regulatoryLabel || 'DPP'}-regime${engagement.regulatoryDppDeadline ? ' per ' + engagement.regulatoryDppDeadline : ''}, het op niveau brengen van datagovernance, en het identificeren van waarde door het DPP bovenop wettelijke compliance.`,
      { spaceAfter: 8 });

    writePlainBox(state, 'In klare taal',
      'Drie blokken werk: routekaart richting DPP-compliance, datagovernance op orde brengen, en verkennen wat extra waarde een DPP u kan opleveren.');

    writeSectionHeading(state, '§ 4 · Categorieën persoonsgegevens en betrokkenen');
    writeParagraph(state,
      'De Verwerker verwerkt namens de Verantwoordelijke onder deze Overeenkomst de volgende categorieën persoonsgegevens:');
    [
      'direct contactgegevens van de bevoegd vertegenwoordiger en personeelsleden van de Verantwoordelijke;',
      'direct contactgegevens van leveranciers en hun vertegenwoordigers, en supply-chain-individuen voor zover identificeerbaar;',
      'economic-operator-identifiers bestemd voor publieke openbaarmaking onder DPP-regelgeving;',
      'correspondentie-inhoud (e-mails, chat) en vergader-metadata;',
      'audio-opnames en transcripten van bilaterale gesprekken (alleen mits opname-toestemming onder het transcript-toestemmings-protocol);',
      'product-, materiaal- en supply-chain-data voor DPP-advisory-werk (BoM, leveranciers-identifiers, conformiteits­beoordelings-documentatie, milieu-indicatoren) — voor zover gekoppeld aan natuurlijke-persoon-economic-operators of supply-chain-individuen;',
      'operator-authored notities, minutes en samenvattingen.',
    ].forEach(b => writeParagraph(state, '• ' + b, { fontSize: 9.5, indent: 8, spaceAfter: 4 }));

    writeParagraph(state,
      'Geen bijzondere categorieën persoonsgegevens in de zin van Art 9 AVG vallen onder de scope van deze Overeenkomst.',
      { fontSize: 9.5, style: 'italic', color: BRAND.muted });

    writePlainBox(state, 'In klare taal',
      'Vooral namen + e-mails van u, uw personeel en uw leveranciers. E-mails, vergader-notities en (met opname-toestemming) audio-opnames. Géén medische, religieuze of politieke gegevens.');
  }

  function drawDurationAndRetention(state) {
    const { engagement } = state;
    writeSectionHeading(state, '§ 5 · Looptijd en bewaartermijn');
    writeParagraph(state,
      `Deze Overeenkomst treedt in werking op de datum van de laatste handtekening en blijft van kracht voor de duur van de Engagement (project-einddatum ${engagement.projectEinddatum || '—'} + aansluitende vaststellings- en bezwaartermijnen), plus de wettelijke bewaartermijnen.`);
    writeParagraph(state,
      `Bewaarplicht voor de projectadministratie: tot en met ${engagement.bewaarplichtEinddatum || '31 december 2035'}, gebaseerd op het langste van: (i) 5 jaar Vo (EU) 2021/1060 Art 82(1) cohesion-fund-bewaarplicht, (ii) 10 jaar Vo (EU) 2023/2831 de-minimis-bewaarplicht, (iii) 7 jaar Art 52(4) Algemene Wet inzake Rijksbelastingen (factuur-bewaarplicht), en (iv) Handboek EFRO 2021–2027 v2 administratieve marge.`);
    writeSubheading(state, 'Carve-out — publiek DPP-register');
    writeParagraph(state,
      'Waar persoonsgegevens een economic operator identificeren in de zin van DSR Verordening (EU) 2026/405 Art 21–22 + Annex VI (of analoog onder ESPR (EU) 2024/1781 Art 7 + Art 8, CPR 2024/3110, EUDR 2023/1115, Batterijenverordening 2023/1542) en zijn opgenomen in een publiek DPP-register, strekt de verwijderingsplicht onder § 7 zich niet uit tot (a) het gepubliceerde DPP-record zelf en (b) audit-trail-entries die noodzakelijk zijn ter onderbouwing van conformiteits­beoordelings-lineage. Bij verzoeken die persoonsgegevens betreffen die de Verantwoordelijke heeft laten publiceren, verwijst de Verwerker naar het regulatoire kader dat register-rectificatie beheerst.',
      { fontSize: 9.5 });
    writePlainBox(state, 'In klare taal',
      `Project loopt tot ${engagement.projectEinddatum || '—'}. Daarna moet de boekhouding 10 jaar bewaard blijven (EU-subsidieregel) — niet de gewone correspondentie.`);
  }

  function drawProcessorObligations(state) {
    writeSectionHeading(state, '§ 7 · Verplichtingen van de Verwerker (Art 28(3) AVG)');
    writeSubheading(state, 'Vertrouwelijkheid + beveiliging');
    writeParagraph(state,
      'Personen die bevoegd zijn de persoonsgegevens te verwerken zijn tot vertrouwelijkheid verbonden (Art 28(3)(b)). Technische en organisatorische maatregelen overeenkomstig Art 32 AVG; zie § 14.');
    writeSubheading(state, 'Bijstand bij betrokkenenrechten');
    writeParagraph(state,
      'De Verwerker ondersteunt de Verantwoordelijke met passende technische en organisatorische maatregelen bij verzoeken van betrokkenen onder Art 12–22 AVG (Art 28(3)(e)). Bevestigt door de Verantwoordelijke doorgestuurde verzoeken binnen vijf (5) werkdagen en levert binnen vijftien (15) kalenderdagen de informatie nodig voor een inhoudelijk antwoord.');
    writeSubheading(state, 'Datalek-melding');
    writeParagraph(state,
      'Bij een inbreuk in verband met persoonsgegevens binnen de Engagement-scope meldt de Verwerker dit aan de Verantwoordelijke binnen achtenveertig (48) uur na bekend worden, met de informatie vereist onder Art 33(3) voor zover op dat moment beschikbaar (sneller dan de Art-33-72-uurs-norm).');
    writeSubheading(state, 'Teruggave of verwijdering');
    writeParagraph(state,
      'Bij beëindiging van de Engagement: crypto-shred van de per-betrokkene Data Encryption Key (DEK) maakt alle opgeslagen ciphertext mathematisch onherstelbaar. Streefwaarde: 72 uur na DGA-goedkeuring (worst-case 144 uur incl. 72-uurs evaluatie-venster).');
    writePlainBox(state, 'In klare taal',
      'Vertrouwelijkheid, technische beveiliging, hulp bij AVG-rechten van betrokkenen, snelle melding bij datalek (binnen 48 uur), en alles weg binnen 72 uur aan einde Engagement (behalve wat de wet vereist te bewaren).');
  }

  function drawAiSection(state) {
    writeSectionHeading(state, '§ 8 · AI-ondersteunde verwerking');
    writeParagraph(state,
      'De Verwerker zet Anthropic PBC (Claude API) in als subverwerker voor AI-ondersteunde drafting, analyse, structurering en samenvatting binnen de Engagement, onder voorwaarden:');
    [
      'AI-ondersteunde verwerking van persoonsgegevens vindt alleen plaats waar de betreffende betrokkene expliciete `ai_processing`-toestemming heeft verleend, of waar de Verantwoordelijke een alternatieve grondslag onder Art 6 AVG heeft gedocumenteerd;',
      'paste-alias-shield vervangt directe identifiers door interne aliassen vóór elke prompt waar mogelijk;',
      'volledige formulering-recepten van de Verantwoordelijke (commercieel-vertrouwelijke IP) zijn altijd uitgesloten van AI-verwerking;',
      'data wordt door Anthropic gewist conform het op het moment van ondertekening geldende Anthropic Commercial-Terms-retentiebeleid (op deze datum: 7 dagen standaard); niet gebruikt voor het trainen van modellen. Het actuele beleid is opvraagbaar bij Regen Studio en wordt bij wijziging gepubliceerd in de privacy-policy van regenstudio.world.',
    ].forEach(b => writeParagraph(state, '• ' + b, { fontSize: 9.5, indent: 8, spaceAfter: 4 }));

    writeSubheading(state, 'Werknemers van de Verantwoordelijke');
    writeParagraph(state,
      'Door ondertekening geeft de Verantwoordelijke (als werkgever) schriftelijke instructie aan de Verwerker om persoonsgegevens van werknemers te verwerken voor de in deze Overeenkomst beschreven doelen. De Verantwoordelijke verklaart hiervoor een geldige grondslag onder Art 6 AVG te hebben (typisch Art 6(1)(b), (c) of (f) afhankelijk van de aard van de instructie en de organisatie van de Verantwoordelijke), en dat hij de transparantie-informatie onder Art 13 AVG aan zijn werknemers heeft verstrekt.');
    writeParagraph(state,
      'Werknemers behouden hun AVG-rechten — waaronder het Art 21-bezwaarrecht — en oefenen deze rechtstreeks uit bij de Verantwoordelijke. Als operationele ondersteuning biedt de Verwerker opt-out (geen AI) of alias-toepassing (gefingeerde naam in alle Anthropic-prompts) binnen vijf (5) werkdagen na verzoek per e-mail.',
      { fontSize: 9.5 });

    writeSubheading(state, 'Per-categorie toestemming');
    writeParagraph(state,
      'Per documenttype heeft de Verantwoordelijke aangegeven welke categorieën AI-ondersteund mogen worden verwerkt — zie de toestemmings-matrix op de volgende pagina.');
    writePlainBox(state, 'In klare taal',
      'Regen werkt met Claude (Anthropic AI). Werknemers kunnen via e-mail kiezen voor opt-out (geen AI) of alias (Claude ziet een verzonnen naam). Patronen die op BSN, paspoort of medische gegevens lijken worden hard geweigerd. Uw exacte recept-formuleringen komen nooit bij Claude.');
  }

  function drawSubprocessors(state) {
    writeSectionHeading(state, '§ 9 · Subverwerkers');
    writeParagraph(state,
      'De Verantwoordelijke verleent algemene schriftelijke toestemming voor inschakeling van onderstaande subverwerkers (Art 28(2)). De Verwerker informeert de Verantwoordelijke ten minste 30 kalenderdagen vooraf over wijzigingen (45 dagen voor materiële wijzigingen). Bezwaar-procedure binnen 15 kalenderdagen. De Verwerker blijft volledig aansprakelijk voor nakoming door subverwerkers (Art 28(4)).');
    writeParagraph(state,
      'Per-Engagement scope. Onderstaande tabel toont de subverwerkers die voor deze Engagement in scope zijn. Regen Studio\'s volledige Annex A (Regen-Studio-wide) telt tevens Exact Online (Exact Group B.V., NL — boekhoudsoftware) en Mollie B.V. (NL — payment-processor, zelfstandig-verantwoordelijke voor publieke CPR-tracker-koop-flow); deze zijn niet in scope voor deze Engagement.',
      { fontSize: 9, color: BRAND.muted, style: 'italic' });

    state.y += 4;
    writeDataTable(state,
      ['Subverwerker', 'Rol', 'Land · Doorgifte'],
      [
        ['Supabase Inc.',     'Database, opslag, Edge Functions, Auth', 'EU (Frankfurt – AWS) · DPA v250314'],
        ['Anthropic PBC',     'Claude API — alleen op ai_processing-grondslag', 'VS · SCCs Modules 2 + 3 · 7-dagen retentie'],
        ['Lettermint B.V.',   'E-mailbezorging',                        'NL · DPA lettermint.co/dpa'],
        ['Proton AG',         'Proton Mail / Drive / Meet / Calendar', 'CH · EU-CH-adequacy · E2EE'],
        ['GitHub, Inc.',      'Statische hosting + demo-hosting',       'VS · MS Customer Agreement SCCs Module 2'],
      ],
      [PAGE.contentWidth * 0.27, PAGE.contentWidth * 0.40, PAGE.contentWidth * 0.33]
    );
  }

  function drawTransfersAndLiability(state) {
    writeSectionHeading(state, '§ 10 · Internationale doorgiften');
    writeParagraph(state,
      'Voor doorgiften naar derde landen baseert de Verwerker zich primair op de Standard Contractual Clauses uit Uitvoeringsbesluit (EU) 2021/914. Voor de doorgifte naar Anthropic in de VS gelden zowel Module 2 als Module 3, beide geïncorporeerd in Anthropic Commercial Terms. Een Transfer Impact Assessment conform Schrems II + EDPB Recommendations 01/2020 is gedocumenteerd en op verzoek beschikbaar.');

    writeSectionHeading(state, '§ 11 · Aansprakelijkheid');
    writeParagraph(state,
      'Aansprakelijkheid voor AVG-schendingen wordt toegedeeld overeenkomstig Art 82 AVG. De totale aansprakelijkheid van elke Partij is beperkt tot het grootste van (i) de vergoedingen onder de Engagement gedurende de twaalf (12) maanden voorafgaand aan het schadeveroorzakende voorval, en (ii) €25.000, behoudens aansprakelijkheid die niet rechtmatig kan worden beperkt. Niets beperkt de blootstelling aan administratieve boetes onder Art 83 AVG of de rechten van betrokkenen onder Art 82(1).');
  }

  function drawTOMs(state) {
    writeSectionHeading(state, '§ 14 · Technische en organisatorische maatregelen');
    writeParagraph(state, 'De Verwerker handhaaft de volgende maatregelen ter waarborging van Art 32 AVG:');
    [
      ['Versleuteling at-rest', 'Per-betrokkene Data Encryption Key (DEK) — random 256-bit sleutelmateriaal — gewikkeld door een master Key Encryption Key (KEK) gehouden in Supabase Vault (pgsodium-backed). PII-velden versleuteld via pgcrypto.pgp_sym_encrypt_bytea (OpenPGP symmetric, AES-onderlaag) met ingebouwde integriteits-check; veld-tag prefix beschermt tegen cross-field swap (audit A1).'],
      ['Versleuteling in transit', 'TLS 1.2+ op elke endpoint.'],
      ['Pseudonimisering', 'Alias-eerst-identiteits-model; identifiers opgeslagen als ciphertext gekoppeld aan de per-betrokkene-DEK; HMAC-SHA-256 fingerprints voor lookup zonder ontsleuteling.'],
      ['Paste-alias-shield (AI-subverwerker)', 'Identifiers in operator-workflows worden gealiased vóór elke Anthropic-prompt; sensitivity-marker-detectie op patronen die op beschermde data lijken (BSN, paspoort, medisch).'],
      ['Row-Level Security', 'Elke tabel met persoonsgegevens heeft RLS aan; Edge Functions opereren uitsluitend via de service-role-key; anonieme en authenticated-rollen hebben geen toegang.'],
      ['Append-only audit-keten', 'SHA-256 hash-chain in consent_audit_log; UPDATE/DELETE/TRUNCATE ingetrokken op GRANT-niveau.'],
      ['KEK-rotatie + herstel', 'Master KEK wordt per kwartaal geroteerd; herstel-runbook gedocumenteerd; per kwartaal restore-drills.'],
      ['Back-up + PITR-propagatie', 'Supabase point-in-time recovery binnen EU-regio; crypto-shred-verwijdering propageert naar back-ups binnen het rotatie-venster (7d PITR / 30d snapshots).'],
      ['Anti-bot + rate-limiting', 'Honeypot-veld, minimum-tijd-drempel, visuele uitdaging, computationele proof-of-work, en per-IP rate-limit op elk publiek inzendings-endpoint.'],
      ['Inbreuk-detectie + incident-response', 'Log-gebaseerd anomaly-review op Edge-Function-uitvoering; per kwartaal externe surface-attack-review. SLA: melding aan Verantwoordelijke binnen 48 uur (canonical § 5.6); de daaropvolgende Art 33 AVG-melding aan de Autoriteit Persoonsgegevens binnen 72 uur is een verplichting van de Verantwoordelijke waarbij de Verwerker desgevraagd ondersteuning levert.'],
      ['Personeel', 'Eenpersoons-firma; toekomstig personeel ondertekent vertrouwelijkheidsverklaring vóór toegang; least-privilege-principe op alle systemen.'],
    ].forEach(([head, body]) => {
      writeSubheading(state, head);
      writeParagraph(state, body, { fontSize: 9.5 });
    });
  }

  function drawInstructionsAndFlexibility(state) {
    writeSectionHeading(state, '§ 6 · Instructies van de Verantwoordelijke');
    writeParagraph(state,
      'De Verwerker verwerkt persoonsgegevens uitsluitend op grond van schriftelijke instructies van de Verantwoordelijke (Art 28(3)(a) AVG), tenzij Unie- of lidstatelijk recht hem daartoe verplicht — in welk geval de Verwerker de Verantwoordelijke vooraf informeert tenzij dit recht dit verbiedt op gewichtige gronden van algemeen belang.');
    writeParagraph(state,
      'Deze Overeenkomst, in samenhang met latere schriftelijke communicatie tussen Partijen, vormt de schriftelijke instructies van de Verantwoordelijke. De Verantwoordelijke verklaart een geldige grondslag onder Art 6 AVG (en, waar van toepassing, Art 9 AVG) te hebben voor de Verwerking, en de transparantie-informatie onder Art 13–14 AVG aan betrokkenen te hebben verstrekt.');
    writeSubheading(state, 'Flexibiliteits-clausule (DPP novel-field)');
    writeParagraph(state,
      'Gegeven de onzekerheid en snelheid van ontwikkeling in het DPP-veld kan de Verantwoordelijke gedurende de Engagement op ad-hoc basis aanvullende documenten, data of informatie aan de Verwerkings-scope toevoegen door per e-mail aan de Verwerker de betreffende stukken aan te leveren. Een dergelijke e-mail van de bevoegd vertegenwoordiger geldt als schriftelijke verlenging van de instructies onder deze §. De Verwerker bevestigt de ontvangst binnen vijf (5) werkdagen per retour-e-mail en logt de wijziging in een scope-amendment-log in het projectdossier.');
  }

  function drawTermination(state) {
    writeSectionHeading(state, '§ 12 · Beëindiging');
    writeParagraph(state,
      'Elke Partij kan deze Overeenkomst beëindigen op dezelfde gronden en met dezelfde opzeg-termijn als het onderliggende Engagement-contract toelaat. § 7 (verwijdering / crypto-shred) en § 7 (audit), en bepalingen die naar hun aard moeten voortduren, blijven van kracht na beëindiging. Indien enige bepaling ongeldig of niet-uitvoerbaar wordt verklaard, blijft de rest onverminderd van kracht.');
    writeParagraph(state,
      'Bij conflict tussen deze Overeenkomst en het onderliggende Engagement-contract prevaleert deze Overeenkomst voor zover het persoonsgegevens-bescherming betreft.');
  }

  function drawVoucherAdministration(state) {
    if (!state.engagement.hasVoucherAnnexes) return;
    writeSectionHeading(state, '§ 13 · Voucher-projectadministratie (KvW3-context)');
    writeParagraph(state,
      'De Verwerker voert de projectadministratie uit ten behoeve van de EFRO-subsidie. De volgende data-categorieën zijn uitgesloten van AI-ondersteunde verwerking en worden uitsluitend in een afgeschermde subfolder bewaard:');
    [
      'MKB-verklaringen met omzet/balans-cijfers;',
      'De-minimis-verklaringen met historisch steun-overzicht;',
      'Bankafschriften en rekeningafschriften;',
      'Werknemers-PII anders dan reguliere project-contactgegevens (BSN, salaris-details, paspoort-kopieën);',
      'Trade secrets en commercieel-vertrouwelijke leveranciers-overeenkomsten met monetaire bedragen;',
      'Niet-voucher-relevante interne beleids-deliberaties.',
    ].forEach(b => writeParagraph(state, '• ' + b, { fontSize: 9.5, indent: 8, spaceAfter: 4 }));
    writeParagraph(state,
      'Daarnaast verwerkt de Verwerker — expliciet in scope — de productdata die noodzakelijk zijn voor het DPP-advisory-werk: stuklijst (BoM), leveranciers-identiteit en metadata, productieproces-metadata, conformiteits­beoordelings-documentatie, unieke product-identifiers, milieu-indicatoren, supply-chain audit-resultaten, en concept-DPP-records.',
      { fontSize: 9.5 });
  }

  function drawAudit(state) {
    writeSectionHeading(state, '§ 7.bis · Audit en inspectie (Art 28(3)(h) AVG)');
    writeParagraph(state,
      'De Verwerker stelt aan de Verantwoordelijke alle informatie ter beschikking nodig om naleving van § 7 en Art 28 AVG aan te tonen, en faciliteert audits door de Verantwoordelijke of een door haar gemandateerde auditor.');
    writeParagraph(state,
      'Audit-modaliteiten: on-site of remote document-gebaseerd, met redelijke voorafgaande kennisgeving (gebruikelijk 30 dagen voor reguliere audits; 5 werkdagen voor incident-driven, toezichthouder-driven of EFRO-controle-driven audits — zie side-letter §6). Een door de Verantwoordelijke gemandateerde derde-auditor ondertekent vóór de audit een schriftelijke vertrouwelijkheidsverklaring jegens de Verwerker en is geen concurrent van de Verwerker.',
      { fontSize: 9.5 });
    writeParagraph(state,
      'De Verwerker informeert de Verantwoordelijke onmiddellijk indien een instructie naar zijn mening inbreuk maakt op de AVG of andere relevante gegevensbeschermings-bepalingen.',
      { fontSize: 9.5 });
  }

  function drawAuditAccess(state) {
    if (!state.engagement.hasVoucherAnnexes) return;
    writeSectionHeading(state, '§ 15 · Toegang voor controlerende instanties (KvW3)');
    writeParagraph(state,
      'De technische afscherming onder § 13 vormt geen toegangsbarrière voor menselijke auditoren namens de bij Handboek EFRO 2021–2027 aangewezen controlerende instanties: Beheerautoriteit, Auditautoriteit EFRO, Europese Commissie (incl. DG REGIO), Europese Rekenkamer, Algemene Rekenkamer, Programmamanager Kansen voor West III, en overige bij wet of verordening aangewezen instanties.');
    writeParagraph(state,
      'Toegangsmodi: on-site inspectie (read-only Proton Drive of fysiek dossier), remote (versleutelde share-link of door auditor aangewezen kanaal, levering binnen 5 werkdagen), of ad-hoc informatieverzoeken per e-mail. De Verwerker logt elk audit-toegangsverzoek in administratie/00-grant/correspondentie/audit-log.md.',
      { fontSize: 9.5 });
  }

  function drawJurisdiction(state) {
    writeSectionHeading(state, '§ 16 · Toepasselijk recht en bevoegde rechter');
    writeParagraph(state,
      'Op deze Overeenkomst is Nederlands recht van toepassing. Bevoegd is de Rechtbank Den Haag, onverminderd de bevoegdheids-regels onder de AVG en het toepasselijke Unie-recht ten aanzien van betrokkenen­vorderingen.');
  }

  function drawSideLetter(state) {
    if (!state.engagement.hasSideLetter) return;
    addPage(state);
    writeSectionHeading(state, '§ 17a · Side-letter (zakelijke voorwaarden)');
    writeParagraph(state,
      'Deze side-letter wordt mede-ondertekend met de hoofdovereenkomst en legt zes zakelijke kennisnemingen vast.',
      { style: 'italic', color: BRAND.muted });

    [
      ['§1 — Aansprakelijkheids-cap',
        'De totale aansprakelijkheid van elke Partij is beperkt tot het grootste van (i) de fees onder de Engagement gedurende de twaalf (12) maanden voorafgaand aan het schadeveroorzakende voorval, en (ii) €25.000, behoudens aansprakelijkheid die niet rechtmatig kan worden beperkt: Art 82 AVG-schadevergoedingen aan betrokkenen, opzet en grove schuld; het regres-recht onder Art 82(5) AVG blijft onbeperkt; administratieve boetes onder Art 83 AVG blijven onbeperkt.'],
      ['§2 — Datalek-melding-vensters',
        'De Verwerker meldt een datalek aan de Verantwoordelijke binnen 48 uur na bekend worden in de zin van EDPB Guidelines 9/2022 § 14. De Verantwoordelijke beschikt vanaf ontvangst van de melding in het slechtste geval nog over ongeveer 24 uur om de eigen Art 33 AVG-melding aan de Autoriteit Persoonsgegevens binnen de 72-uurs-termijn te voltooien (Art 33 is een controller-verplichting; de Verwerker assisteert). Beide Partijen werken te goeder trouw samen om incident-informatie zo vroeg mogelijk te delen, ook mondeling/per telefoon vooruitlopend op de formele schriftelijke melding.'],
      ['§3 — Beroepsaansprakelijkheids-verzekering',
        'De Verwerker bevestigt expliciet dat hij op de datum van ondertekening geen beroepsaansprakelijkheids-verzekering (PI-polis) draagt en geen toezegging doet tot het afsluiten van een dergelijke polis binnen een vastgelegde termijn. Indien de Verwerker in de toekomst een polis afsluit, informeert hij de Verantwoordelijke daarover. De Verantwoordelijke neemt hier expliciet kennis van.'],
      ['§4 — DSR-register-status',
        'Het DSR-register als bedoeld in Verordening (EU) 2026/405 is op het moment van ondertekening nog niet operationeel. Verplichtingen die afhangen van een operationeel DSR-register treden in werking zodra het register live is.'],
      ['§5 — Scope-amendment-via-e-mail',
        'Per § 6 kan de Verwerkings-scope per e-mail worden uitgebreid of beperkt. De Verwerker bevestigt elke wijziging binnen vijf (5) werkdagen + logt in scope-amendment-log.md in het projectdossier.'],
      ['§6 — Audit-notice voor incident-driven audits',
        'De gewone audit-notice-termijn van 30 dagen wordt verkort tot vijf (5) werkdagen indien de audit voortvloeit uit een gemeld of vermoed datalek, een instructie van de AP of een EFRO-controle-procedure.'],
    ].forEach(([head, body]) => {
      writeSubheading(state, head);
      writeParagraph(state, body, { fontSize: 9.5 });
    });
  }

  // -------------------------------------------------------------------------
  // Toggles + AI consent summary
  // -------------------------------------------------------------------------
  const DOC_TOGGLE_LABELS = {
    doc_bom: 'BoM en productsamenstelling',
    doc_suppliers: 'Leveranciers-overzichten + metadata',
    doc_conformity: 'Conformiteitsbeoordeling-stukken',
    doc_indicators: 'Milieu-indicator-rapporten (LCA / PEFCR)',
    doc_supplychain: 'Supply-chain audit-resultaten',
    doc_ufi: 'UFI-koppeling-data',
    doc_dpprecord: 'Concept-DPP-records',
    doc_formulation_cat: 'Formulering-data op categorie-niveau',
    doc_email: 'E-mail-correspondentie binnen project',
    doc_meetings: 'Vergader-notities en agenda\'s',
    doc_audio: 'Audio-opnames + transcripten',
    doc_progress: 'Voortgangs-rapportages',
    doc_final: 'Eindrapportage en prestatieverklaringen',
    doc_comms: 'Communicatie-uitingen',
    doc_legal: 'Wetgevings-documenten',
    doc_branche: 'Branche-publicaties',
    doc_research: 'Onderzoeksbronnen en literatuur',
    doc_competitors: 'Concurrent- en marktvergelijkingen',
  };

  function drawTogglesAndConsent(state) {
    const { toggles, aiProcessingConsent, controller } = state;
    addPage(state);
    writeSectionHeading(state, '§ 8.2 · Toestemmings-matrix per documentcategorie');
    writeParagraph(state,
      'Per documenttype heeft de Verantwoordelijke aangegeven welke categorieën AI-ondersteund mogen worden verwerkt. "Aan" = paste-alias-shield + Anthropic-prompt toegestaan met aliasing. "Uit" = hard-refuse: geen prompts naar Anthropic met inhoud uit die categorie.');

    const onItems = [];
    const offItems = [];
    // Audit Round-4 logic-ver fix: opt-IN by default (was opt-out). AI consent
    // requires explicit positive choice per AVG Art 6/7 — absent keys default
    // to OFF (hard-refuse), not ON. The intake form must emit `true` only for
    // categories the controller explicitly ticked.
    Object.entries(DOC_TOGGLE_LABELS).forEach(([id, label]) => {
      const checked = !!(toggles && toggles[id] === true);
      (checked ? onItems : offItems).push(label);
    });

    if (onItems.length) {
      writeSubheading(state, 'Aan (AI-ondersteund met alias)');
      writeParagraph(state, onItems.join(' · '), { fontSize: 9, color: BRAND.ink });
    }
    if (offItems.length) {
      writeSubheading(state, 'Uit (hard-refuse)');
      writeParagraph(state, offItems.join(' · '), { fontSize: 9, color: [201, 42, 42] });
    }

    writeSubheading(state, 'AI-toestemming voor de eigen persoonsgegevens van de tekenbevoegde');
    writeParagraph(state, aiProcessingConsent
      ? `Toestemming verleend: ${controller.repName || '—'} stemt in met AI-verwerking van zijn/haar eigen persoonsgegevens. AI-verwerking van Engagement-documenten verloopt zoals aangegeven in de toestemmings-matrix hierboven.`
      : `Toestemming geweigerd: ${controller.repName || '—'} stemt NIET in met AI-verwerking van zijn/haar eigen persoonsgegevens. AI-verwerking van Engagement-documenten verloopt zoals aangegeven in de toestemmings-matrix hierboven; alleen de eigen persoonsgegevens van de tekenende blijven uitgesloten via alias-shield + opt-in voor werknemers.`,
      { fontSize: 9.5 });
  }

  // -------------------------------------------------------------------------
  // Signature evidence (last page)
  // -------------------------------------------------------------------------
  function drawSignatureEvidence(state) {
    const { signature, controller } = state;
    addPage(state);
    writeSectionHeading(state, '§ 17 · Handtekening en bewijs van ondertekening');

    writeParagraph(state,
      'Deze Overeenkomst is ondertekend met een Simple Electronic Signature (SES) in de zin van Artikel 3(10) van Verordening (EU) 910/2014 (eIDAS), via een eenmalige magic-link-click-to-sign-flow geëxploiteerd door de Verwerker.');

    writeParagraph(state,
      'Onder Artikel 25(1) eIDAS kan een elektronische handtekening niet enkel op grond van haar elektronische vorm of niet-QES-status rechtsgevolg en bewijswaarde worden ontzegd. Partijen komen overeen dat een SES uitgevoerd onder deze § voldoende is voor de toepassing van deze Overeenkomst.');

    state.y += 8;

    writeSubheading(state, 'Bewijsbestanddelen');
    // Audit B5 fix: do NOT print snapshotSha into the visible body. The SHA
    // is computed server-side over the SIGNED PDF bytes and stored in
    // dpa_signatures — printing a "stamped server-side" placeholder would
    // mislead, and printing the actual SHA would change the PDF bytes
    // (chicken-and-egg). Reference the database row instead.
    // Audit B6 fix: signedAt is the controller's local clock at draft-render
    // moment; the server stamps the canonical signed_at on the dpa_signatures
    // row. Show the local-clock value as "ondertekend op" with a note that
    // the server-recorded timestamp prevails on disputes.
    writeKVTable(state, [
      ['Tekenende partij',         `${controller.repName || '—'} (${controller.repRole || '—'}) namens ${controller.legalName}`],
      ['Tijdstip ondertekening (browser)', signature.signedAt || '—'],
      ['Token-mechanisme',         'magic-link, eenmalig gebruik, 7-dagen-geldig, hash-opgeslagen'],
      ['Bewijs-anker (server-side)', 'dpa_signatures.signed_pdf_sha + signed_at + ip_hash + ua_hash, opgeslagen in de database van de Verwerker'],
    ]);

    writeParagraph(state,
      'De integriteit van het getekende document wordt geborgd door de SHA-256-hash van de PDF-bytes, opgeslagen in dpa_signatures van de Verwerker bij de bevestiging van ondertekening. De server-vastgelegde signed_at-timestamp prevaleert in geval van geschil over het tijdstip. Een rechercheerbare audit-trail is beschikbaar in consent_audit_log met een append-only hash-chain.',
      { fontSize: 9, color: BRAND.muted });

    state.y += 12;
    writeSubheading(state, 'Contact');
    writeParagraph(state,
      'Voor vragen over deze Overeenkomst, betrokkenenrechten of incident-meldingen: info@regenstudio.world. Voor klachten kunt u zich richten tot de Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl).',
      { fontSize: 9.5 });
  }

  // -------------------------------------------------------------------------
  // Closing note — emotional-trust anchor (audit ux-empath B2 fix)
  // -------------------------------------------------------------------------
  function drawClosingNote(state) {
    state.y += 12;
    writePlainBox(state, 'Wat nu?',
      'U hoeft nu niets te doen. Bewaar dit PDF in uw eigen administratie — wij hebben u hiervan ook een kopie per e-mail gestuurd. Heeft u later vragen over deze Overeenkomst, of wilt u uw toestemming aanpassen of intrekken? Mail dan info@regenstudio.world; Regen Studio antwoordt binnen 2 werkdagen. Voor klachten over gegevensverwerking kunt u zich (zonder voorafgaand overleg met ons) richten tot de Autoriteit Persoonsgegevens — autoriteitpersoonsgegevens.nl.');
  }

  // -------------------------------------------------------------------------
  // Public entry point
  // -------------------------------------------------------------------------
  async function buildSignedDpaPdf(args) {
    if (!root.jspdf || !root.jspdf.jsPDF) {
      throw new Error('jsPDF not loaded — ensure assets/js/vendor/jspdf.umd.min.js is included before this module.');
    }
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
    doc.setFont(FONT, 'normal');

    // Audit Round-2 fix: fail-loud on missing engagement key/label rather
    // than silently shipping a TEST-stamped PDF as a real signed artefact.
    if (!args.engagement || !args.engagement.key || !args.engagement.label) {
      throw new Error('buildSignedDpaPdf: engagement.key and engagement.label are required (no test-defaults in production path).');
    }
    if (!args.controller || !args.controller.legalName || !args.controller.repName) {
      throw new Error('buildSignedDpaPdf: controller.legalName and controller.repName are required.');
    }

    const state = {
      doc,
      pageNumber: 1,
      y: PAGE.marginTop,
      engagement: Object.assign({
        regulatoryRegime: 'espr',
        regulatoryLabel: 'ESPR Verordening (EU) 2024/1781',
      }, args.engagement),
      controller: Object.assign({
        legalName: '—',
        legalForm: '—',
        address: '—',
        country: 'Nederland',
        kvk: '—',
        repName: '—',
        repRole: '—',
        repEmail: '—',
        repPhone: '',
      }, args.controller || {}),
      processor: Object.assign({
        legalName: 'Regen Studio B.V.',
        address: 'Stollenbergweg 43, 6571 AB, Berg en Dal',
        kvk: '90337948',
        btw: 'NL865282377B01',
        repName: 'Bestuurder Regen Studio B.V.',
        repEmail: 'info@regenstudio.world',
      }, args.processor || {}),
      toggles: args.toggles || {},
      aiProcessingConsent: !!args.aiProcessingConsent,
      signature: Object.assign({
        signedAt: new Date().toISOString(),
        snapshotSha: '—',
        requestId: '—',
        ipHash: '—',
        uaHash: '—',
      }, args.signature || {}),
    };

    // Resolve engagement profile (lookup hardcoded registry by key, merge
    // with caller-provided overrides). Audit B1 fix.
    state.engagement = resolveEngagement(state.engagement);

    // Cover page
    drawCover(state);

    // Body — Audit Round-2 fixes:
    //  · drawAudit() unconditional (Art 28(3)(h) applies to ALL engagements,
    //    not only voucher; drawAuditAccess remains as voucher-additive layer)
    //  · drawSignatureEvidence rendered BEFORE drawSideLetter so §17 precedes
    //    §17a (no more 17 → 17a → 17 visual anomaly)
    drawPartiesPage(state);
    drawDefinitions(state);
    drawSubjectAndScope(state);
    drawDurationAndRetention(state);
    drawInstructionsAndFlexibility(state);
    drawProcessorObligations(state);
    drawAudit(state);
    drawAiSection(state);
    drawTogglesAndConsent(state);
    drawSubprocessors(state);
    drawTransfersAndLiability(state);
    drawTermination(state);
    drawVoucherAdministration(state);
    drawTOMs(state);
    drawAuditAccess(state);
    drawJurisdiction(state);
    // Audit Round-4 ux-empath fix: side-letter BEFORE signature evidence so
    // material commercial terms (€25k cap, 48h breach window, no-PI) are
    // surfaced pre-signature, not appended post-hoc.
    drawSideLetter(state);
    drawSignatureEvidence(state);
    drawClosingNote(state);

    return doc.output('blob');
  }

  // Expose
  root.buildSignedDpaPdf = buildSignedDpaPdf;
})(typeof window !== 'undefined' ? window : globalThis);

# Third-Party Notices

This project includes the following third-party components:

## Chart.js

- **Version:** 4.4.7
- **License:** MIT
- **Copyright:** (c) 2024 Chart.js Contributors
- **Source:** https://www.chartjs.org
- **Location:** `assets/js/vendor/chart.min.js`

## html2pdf.js (bundled with html2canvas + jsPDF)

- **Version:** 0.10.3
- **License:** MIT
- **Copyright:** (c) 2017–2024 Erik Koopmans
- **Source:** https://github.com/eKoopmans/html2pdf.js
- **Location:** `assets/js/vendor/html2pdf.bundle.min.js`
- **Bundled deps (all MIT):** html2canvas (© Niklas von Hertzen), jsPDF (© James Hall + parallax.com), core-js + Babel runtime (© Denis Pushkarev)
- **Used by:** `dpa-contract.html` for client-side PDF generation of signed Verwerkersovereenkomst documents

## Inter (typeface)

- **License:** SIL Open Font License 1.1
- **Copyright:** (c) The Inter Project Authors
- **Source:** https://rsms.me/inter/
- **Location:** `assets/fonts/inter*`

## Playfair Display (typeface)

- **License:** SIL Open Font License 1.1
- **Copyright:** (c) Claus Eggers Sorensen
- **Source:** https://fonts.google.com/specimen/Playfair+Display
- **Location:** `assets/fonts/playfair-display*`

## KoHo (typeface)

- **License:** SIL Open Font License 1.1
- **Copyright:** (c) Cadson Demak
- **Source:** https://fonts.google.com/specimen/KoHo
- **Location:** `assets/fonts/koho*`, `assets/fonts/KoHo-{Bold,Regular,Light}.ttf`, `assets/fonts/jspdf/koho-*.js`
- **Wordmark convention:** "REGEN" rendered in KoHo Bold, "STUDIO" in KoHo Light — codified 2026-05-05 (see `~/Claude/.claude/skills/pdf-rendering/references/typography-system.md`).

## Poppins (typeface)

- **License:** SIL Open Font License 1.1
- **Copyright:** (c) Indian Type Foundry, Jonny Pinhorn
- **Source:** https://fonts.google.com/specimen/Poppins
- **Location:** `admin/fonts/poppins-{400,600,700}.woff2`
- **Used by:** `admin/js/report.js` only. Poppins is the Agrotech da Holanda brand face, not a
  Regen Studio one; it is vendored here so a printable Agrotech report renders in that site's own
  typography instead of borrowing Regen's. Latin-1 subset, 217 glyphs, which covers PT-BR.

## Lora (typeface)

- **License:** SIL Open Font License 1.1
- **Copyright:** (c) Cyreal
- **Source:** https://fonts.google.com/specimen/Lora
- **Location:** `assets/fonts/lora/Lora-{Regular,Bold}.ttf`, `assets/fonts/jspdf/lora-*.js`

## JetBrains Mono (typeface)

- **License:** SIL Open Font License 1.1
- **Copyright:** (c) JetBrains s.r.o.
- **Source:** https://www.jetbrains.com/lp/mono/
- **Location:** `assets/fonts/JetBrainsMono-Regular.ttf`, `assets/fonts/jspdf/jetbrains-mono-regular.js`

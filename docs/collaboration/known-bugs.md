# Known Bugs & Open Issues

Track bugs discovered during sessions so they don't get lost across context boundaries.
Format: status, file, description, discovered date.

## Regenstudio Website — Open

(No open bugs)

## Regenstudio Website — Resolved

| # | File(s) | Issue | Fixed | How |
|---|---------|-------|-------|-----|
| R1 | `content.pt.html` line ~1840 | JS regex used English "DPP outlook" instead of PT "Perspetivas do DPP" — caused heading duplication | 2026-02-25 | Replaced regex string |
| R2 | `nl/thank-you.html`, `pt/thank-you.html` | English footer, stale Brazil address, wrong CNPJ, copyright 2025, missing hreflang | 2026-02-25 | Full page update |
| R3 | `blog.js` | ~20 hardcoded English strings in CTA form, toasts, share buttons bypassed t() helper | 2026-02-25 | Wired all to t() with locale keys |
| R4 | `blog.js` loadBlogs() | One failed blog fetch killed entire listing (no per-post error handling) | 2026-02-25 | Added try-catch per post |
| R5 | `404.html` | Relative paths broke at nested URLs; no language detection; dumbed-down footer | 2026-02-25 | Full rewrite with root-relative paths, i18n, full footer |
| R6 | `build.ts` line 106 | Date locale was en-US instead of en-GB | 2026-02-25 | Changed to en-GB |
| R7 | `content.nl.html`, `content.pt.html` | 37 product family card alt texts still in English | 2026-02-25 | Translated all to NL/PT with Annex VII/Bijlage VII/Anexo VII |
| R8 | `content.nl.html`, `content.pt.html` | Heading "28+ EADs under Product Area 20:" still in English | 2026-02-25 | Translated to NL/PT |
| R9 | `script.js` | Homepage blog card links missing locale prefix, date locale en-US | 2026-02-25 | Added locale detection, prefixed links, locale-aware date |
| R10 | `script.js` | Privacy banner text hardcoded in English | 2026-02-25 | Wired to t() helper, added 4 locale keys |
| R11 | PT/NL Q&A pages | Internal links to blog posts pointed to English versions | 2026-02-25 | Prefixed all /blog/ links with /pt/ or /nl/ |
| R12 | `build.ts` | Contact form CTA link not locale-aware | 2026-02-25 | Added root-relative fragment link localization |
| R13 | ESPR `meta.nl.json`, `meta.pt.json` | Double-escaped `&ndash;` in title/excerpt | 2026-02-25 | Replaced with literal en-dash character |
| R14 | 8x `meta.nl.json` | Uppercase "Innovatieontwerp" inconsistency | 2026-02-25 | Standardized to lowercase |

## Regenstudio Demos — Open

(None tracked yet)

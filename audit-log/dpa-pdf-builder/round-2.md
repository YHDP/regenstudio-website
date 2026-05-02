# Round 2 — fixed-point-audit (6 personas, blind, parallel)

Locked SHA: 12b76d40 → fixes applied → new commit pending

## Aggregated counter
- BLOCK: 20 (12 addressed in fix-batch, 8 deferred to Round 3 / deviations)
- REVIEW: 26 (4 addressed, 22 deferred)
- NOTE: 5 (deferred)

## Personas + headline findings

| persona | BLOCKs | REVIEWs |
|---|---|---|
| code-eng | 2 | 4 |
| logic-ver | 3 | 4 |
| compliance | 7 | 3 |
| ux-empath | 4 | 3 |
| adversary | 4 | 6 |
| new-hire | 0 | 6 |

## BLOCKs addressed in this fix-batch

1. Helvetica Unicode glyphs (💡 ✓ ✗ ⛔) — replaced with ASCII text
2. WP first-line overflow — splitTextToSize math fixed
3. Caller fallbacks override registry — sign-handler stripped to key+label only
4. Audit clause unconditional — drawAudit() added before drawAuditAccess()
5. Wrong crypto primitive in §14 — pgcrypto.pgp_sym_encrypt_bytea + Vault wording
6. Werknemers Art 6(1)(f) pre-commit — replaced with neutral grondslag-attestation
7. Side-letter §1 missing carve-outs — Art 82(5) + Art 83 added
8. Side-letter §2 wrong attribution — controller-notifies-AP, processor assists
9. §17/§17a numbering — signature evidence rendered before side-letter
10. TEST defaults leak — fail-loud guard on missing engagement.key/label/legalName
11. Bewaarplicht missing AWR Art 52(4) — added; carve-out §7.1 inserted
12. Missing TOMs (RLS, back-up, anti-bot, personnel) — added to §14
13. §8.2 negative-branch wording — clarified scope of "no AI consent" decision
14. Closing "Wat nu?" reassurance box added (ux-empath B2)

## BLOCKs deferred (track in deviations.md)

- Token TTL canonical-vs-PDF: PDF stays 7-days per Yvo direction; canonical-NL.md needs update separately (doc-pipeline)
- Dual-artifact divergence (PDF vs HTML snapshot) — architectural; needs server-side re-render for full fix
- SHA-pin printed in PDF body — adversary BLOCK; needs canonical-archive URL infrastructure first
- 7-day token + email-only auth — adversary BLOCK; second-factor deferred to Phase D
- PDF-injection sanitization (bidi/RTL/control chars) — adversary REVIEW; needs Edge Function input filter
- Multiple aliasing of role labels — ux-empath BLOCK; copy-pass deferred
- Klare-taal box overflow on >page — code-eng REVIEW; needs chunking helper

## Verdict
**needs-Round-3** — substantial fixes applied; rerun audit on new SHA.

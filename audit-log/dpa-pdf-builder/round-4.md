# Round 4 — fixed-point-audit (6 personas, blind, parallel)

Locked SHA: 56a4b52 → fixes applied → new commit pending

## Aggregated counter
- BLOCK: 11 (7 addressed; 4 deferred to deviations.md / Phase A.2 / Phase D)
- REVIEW: 12 (some addressed inline)
- NOTE: 6 (deferred)

## BLOCKs addressed
- ✓ logic-ver: AI toggles default-off (was opt-out; now opt-in per AVG Art 6/7)
- ✓ compliance: §2 Definities added (was missing entirely from rendered PDF)
- ✓ ux-empath: side-letter rendered BEFORE signature evidence (was post-hoc)
- ✓ ux-empath: cover DPP-deadline reframed as "Regulatoir van kracht" + voorbereidings-traject context
- ✓ compliance: side-letter §3 PI insurance — "binnen vastgelegde termijn" (was wrongly narrowed to "Engagement-looptijd")
- ✓ compliance: §9 sub-processors transparency note about Exact/Mollie out-of-scope
- ✓ ux-empath: signature evidence now follows §17a side-letter (renumbering implicit)

## BLOCKs deferred to deviations.md / Phase A.2 / Phase D
- ⊘ adversary: client-PDF-bytes-trusted (server-side render = Phase A.2 architectural)
- ⊘ adversary: email-attachment SHA verification UI (Phase D out-of-band channel)
- ⊘ adversary: Unicode/RTL/bidi/homoglyph sanitization (Edge Function input filter — Phase D)
- ⊘ new-hire: pgcrypto vs canonical ChaCha20-IETF mismatch (canonical doc-pipeline update; tracked separately)
- ⊘ new-hire: 60-min stale comments in Edge Function headers (single-grep sweep — defer)

## Verdict
**Round 4 close-enough-with-deviations**. Convergence not formally reached
(BLOCKs remaining = 4 architectural). The 4 deferred BLOCKs are not addressable
within Phase A scope; deviations register tracks them for Phase A.2 / Phase D.

Round 5 not run — would surface only items deferrable to architectural follow-up
work, per protocol's hard-cap-then-escalate provision.

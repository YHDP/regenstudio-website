#!/usr/bin/env python3
"""SKILL.md supply-chain scanner (skills.md rule).

Reads a SKILL.md's content on stdin and reports the three "scary agent skills"
vectors, one per line. Exits 1 if any issue is found, 0 if clean. Called by the
pre-push hook for every added/modified **/SKILL.md. Added 2026-06-10 (security
audit) — the mandated scan was previously absent from the hook.
"""
import re
import sys

text = sys.stdin.buffer.read().decode("utf-8", "replace")
issues = []

# (1) Hidden Unicode: zero-width, BOM, bidi controls, RTL/LTR overrides, isolates.
HIDDEN = {
    0x200B: "ZERO WIDTH SPACE",
    0x200C: "ZERO WIDTH NON-JOINER",
    0x200D: "ZERO WIDTH JOINER",
    0xFEFF: "ZERO WIDTH NO-BREAK SPACE / BOM",
    0x200E: "LEFT-TO-RIGHT MARK",
    0x200F: "RIGHT-TO-LEFT MARK",
    0x202A: "LEFT-TO-RIGHT EMBEDDING",
    0x202B: "RIGHT-TO-LEFT EMBEDDING",
    0x202C: "POP DIRECTIONAL FORMATTING",
    0x202D: "LEFT-TO-RIGHT OVERRIDE",
    0x202E: "RIGHT-TO-LEFT OVERRIDE",
    0x2066: "LEFT-TO-RIGHT ISOLATE",
    0x2067: "RIGHT-TO-LEFT ISOLATE",
    0x2068: "FIRST STRONG ISOLATE",
    0x2069: "POP DIRECTIONAL ISOLATE",
}
for cp, name in HIDDEN.items():
    if chr(cp) in text:
        issues.append("hidden Unicode %s (U+%04X)" % (name, cp))

# (2) Inline downloaders / executors in the skill body.
DOWNLOADERS = [
    r"curl\s+-?[sSL]*\s*https?://",
    r"wget\s+https?://",
    r"bash\s+-c",
    r"eval\s*\$\(",
    r"\bsh\s+-c",
    r'python[0-9]?\s+-c\s+["\']?import\s+urllib',
]
for pat in DOWNLOADERS:
    if re.search(pat, text):
        issues.append("inline downloader/executor matching /%s/" % pat)

# (3) Secret-shaped strings.
SECRETS = [
    r"[A-Za-z0-9_]*(?:KEY|SECRET|TOKEN|HASH)\s*[:=]\s*['\"][A-Za-z0-9_+/=.-]{16,}",
    r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.",      # JWT
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    r"sk-ant-[A-Za-z0-9_-]{10,}",
    r"AKIA[0-9A-Z]{16}",
]
for pat in SECRETS:
    if re.search(pat, text):
        issues.append("secret-shaped string matching /%s/" % pat)

for line in issues:
    print(line)
sys.exit(1 if issues else 0)

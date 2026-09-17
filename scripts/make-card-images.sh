#!/bin/bash
# Generate the card-sized variant of every blog post's featured image.
#
# WHY THIS EXISTS
# Blog cards render at about 380px wide. Shipping the post hero's full-size image into a
# card cost 12.48 MB across 38 posts, and Lighthouse scored image-delivery 0.5 with 462 KiB
# wasted on the homepage alone, where only three cards are visible. The variants are 1.43 MB
# in total, 88% smaller, and the originals stay untouched because the post hero needs them.
#
# 800px wide covers a 380px card at 2x DPR. blog.js cardImageSrc() and the homepage preview
# in script.js both resolve <stem>-card.webp and fall back to the original via onerror, so a
# post whose variant is missing degrades to the old behaviour rather than to a broken image.
#
# Run after adding a post, or when a featured image changes. Idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v cwebp >/dev/null || { echo "cwebp not found (brew install webp)"; exit 1; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

made=0; skipped=0
while IFS=$'\t' read -r src out; do
  [ -f "$src" ] || continue
  if [ -f "$out" ] && [ "$out" -nt "$src" ]; then skipped=$((skipped+1)); continue; fi
  dwebp "$src" -o "$tmp/x.png" >/dev/null 2>&1 || sips -s format png "$src" --out "$tmp/x.png" >/dev/null 2>&1
  cwebp -q 82 -resize 800 0 "$tmp/x.png" -o "$out" >/dev/null 2>&1 && made=$((made+1))
done < <(python3 - <<'PY'
import json, os, glob
for meta in sorted(glob.glob('Blogs/*/meta.json')):
    slug = meta.split('/')[1]
    try: d = json.load(open(meta, encoding='utf-8'))
    except Exception: continue
    fi = d.get('featuredImage') or ''
    if not fi or fi.startswith('../../'): continue
    src = f'Blogs/{slug}/{fi}'
    stem, _ = os.path.splitext(fi)
    if os.path.exists(src): print(f"{src}\t Blogs/{slug}/{stem}-card.webp".replace('\t ', '\t'))
PY
)
echo "card images: $made generated, $skipped already current"

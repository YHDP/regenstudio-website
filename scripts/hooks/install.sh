#!/bin/bash
# Install pre-push hook. Run once after a fresh clone (.git/hooks/ isn't tracked by git).
# Usage: ./scripts/hooks/install.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
cp scripts/hooks/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push
echo "Installed .git/hooks/pre-push"

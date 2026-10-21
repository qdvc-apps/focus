#!/bin/sh
# =============================================================================
# build.sh — assemble the source fragments into one self-contained page:
#
#   docs/index.html
#
# Deliberately plain: cat and echo, no bundler, no minifier, no dependencies.
# Files are concatenated in filename order, which is why every fragment starts
# with a two-digit number. LC_ALL=C keeps that order identical on every machine.
#
# Usage:  sh build.sh
# =============================================================================

set -e
LC_ALL=C
export LC_ALL

cd "$(dirname "$0")"

SRC=src
OUT=docs
TARGET="$OUT/index.html"

# -----------------------------------------------------------------------------
# A fragment containing "</script>" or "</style>" would close the wrapping tag
# early and break the page, so refuse to build rather than emit something
# subtly broken.
# -----------------------------------------------------------------------------
bad=0
for file in $(ls "$SRC"/css/*.css "$SRC"/js/*.js | sort); do
  if grep -i -e '</script' -e '</style' "$file" >/dev/null 2>&1; then
    echo "  ERROR: $file contains a closing script or style tag" >&2
    bad=1
  fi
done
if [ "$bad" -eq 1 ]; then
  echo "Build aborted." >&2
  exit 1
fi

echo "Building $TARGET"
mkdir -p "$OUT"

# GitHub Pages runs Jekyll by default; .nojekyll serves the folder verbatim.
touch "$OUT/.nojekyll"

# 1. doctype and head
cat "$SRC/00-head.html" > "$TARGET"

# 2. stylesheets
echo '<style>' >> "$TARGET"
for file in $(ls "$SRC"/css/*.css | sort); do
  echo "/* ---------- $file ---------- */" >> "$TARGET"
  cat "$file" >> "$TARGET"
done
echo '</style>' >> "$TARGET"

# 3. markup (closes the head, opens the body)
cat "$SRC/10-shell.html" >> "$TARGET"

# 4. scripts
echo '<script>' >> "$TARGET"
echo '"use strict";' >> "$TARGET"
for file in $(ls "$SRC"/js/*.js | sort); do
  echo "/* ---------- $file ---------- */" >> "$TARGET"
  cat "$file" >> "$TARGET"
done
echo '</script>' >> "$TARGET"

# 5. closing tags
cat "$SRC/90-foot.html" >> "$TARGET"

echo "Done. $TARGET  $(wc -c < "$TARGET") bytes, $(wc -l < "$TARGET") lines"

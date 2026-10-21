#!/bin/sh
# Runs every harness against the sources, then builds and checks the page
# that actually ships. Any failure exits non-zero.
set -e
cd "$(dirname "$0")/.."
node tools/test-yaml.mjs
node tools/test-core.mjs
node tools/test-timeline.mjs
node tools/test-views.mjs
node tools/test-example.mjs
sh build.sh
node tools/test-bundle.mjs
echo
echo "All harnesses passed."

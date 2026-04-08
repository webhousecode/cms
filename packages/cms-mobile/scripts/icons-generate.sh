#!/bin/bash
# webhouse.app icon generator wrapper.
# Calls the Node script that uses `sharp` to render Concept A
# (eye on #0D0D0D) at all iOS and Android sizes.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/icons-generate.mjs"

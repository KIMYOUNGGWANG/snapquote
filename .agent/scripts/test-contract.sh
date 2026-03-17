#!/bin/bash

# 🏭 Orchestrator 5.1 — Contract Tester
# Usage: bash test-contract.sh <api-spec.md path> <src_directory>

SPEC_FILE="${1:-docs/api-spec.md}"
SRC_DIR="${2:-src}"

if [ ! -f "$SPEC_FILE" ]; then
  echo "❌ Error: Contract file '$SPEC_FILE' not found. Run /plan."
  exit 1
fi

echo "🧪 Verifying Contract ($SPEC_FILE) against implementation ($SRC_DIR)..."
FAILS=0

# Extract ALL endpoints declared in spec.md
# Assuming format like: `GET /api/users` or `POST /api/auth`
ENDPOINTS=$(grep -oE "(GET|POST|PUT|PATCH|DELETE) \/api\/[a-zA-Z0-9_-]+" "$SPEC_FILE" | awk '{print $2}' | sort | uniq)

if [ -z "$ENDPOINTS" ]; then
  echo "⚠️ No endpoints found in $SPEC_FILE. Is the format correct (e.g., 'GET /api/path')?"
  exit 0
fi

echo "Found endpoints in contract:"
echo "$ENDPOINTS" | sed 's/^/  - /'
echo "---"

for EP in $ENDPOINTS; do
  # Convert endpoint path to file path (Next.js App Router format)
  # Example: /api/users -> src/app/api/users/route.ts
  ROUTE_FILE="$SRC_DIR/app$EP/route.ts"
  
  if [ ! -f "$ROUTE_FILE" ]; then
    echo "🔴 [CONTRACT DRIFT] FAILED: Endpoint '$EP' is defined in spec but '$ROUTE_FILE' is missing."
    FAILS=$((FAILS + 1))
  else
    echo "✅ Endpoint '$EP' implemented."
  fi
done

echo "---"
if [ "$FAILS" -gt 0 ]; then
  echo "❌ CONTRACT TEST FAILED ($FAILS missing implementations)"
  exit 1
else
  echo "✅ ALL CONTRACTS MET"
  exit 0
fi

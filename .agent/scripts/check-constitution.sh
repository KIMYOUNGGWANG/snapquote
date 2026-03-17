#!/bin/bash

# 🏭 Orchestrator 5.1 — Constitution Checker
# Usage: bash check-constitution.sh <file_path>

FILE_PATH="$1"

if [ -z "$FILE_PATH" ]; then
  echo "Usage: bash check-constitution.sh <file_path>"
  exit 1
fi

if [ ! -f "$FILE_PATH" ]; then
  echo "❌ Error: File '$FILE_PATH' not found."
  exit 1
fi

echo "🔍 Scanning '$FILE_PATH' against GEMINI.md Constitution..."
FAILS=0

# Rule 1: Error Handling (try...catch)
if grep -q "await " "$FILE_PATH" && ! grep -q -E "(try|catch)" "$FILE_PATH"; then
  echo "🔴 [RULE 3: Defensive Coding] FAILED: Async operation found without try...catch."
  FAILS=$((FAILS + 1))
fi

# Rule 2: Strict Types (No 'any')
if grep -q -w "any" "$FILE_PATH"; then
  echo "🔴 [RULE 4: Strict Types] FAILED: The 'any' keyword is strictly prohibited."
  FAILS=$((FAILS + 1))
fi

# Rule 3: Anti-AI Design (Generic Colors)
if grep -q -E "(bg-blue-500|bg-red-500|text-blue-500|text-red-500)" "$FILE_PATH"; then
  echo "🔴 [RULE 8: Design DNA] FAILED: Generic tailwind colors detected. Use curated HSL palettes."
  FAILS=$((FAILS + 1))
fi

# Rule 4: System Fonts
if grep -q -E "(font-sans|font-serif|font-mono)" "$FILE_PATH" && ! grep -q -i -E "(Inter|Outfit|Lexend)" "$FILE_PATH"; then
  # Only trigger if they are trying to set system fonts without explicit premium fonts in the codebase.
   echo "🟡 [RULE 8: Design DNA] WARNING: Check typography. Premium fonts (Inter, Outfit, Lexend) are preferred."
fi

echo "---"
if [ "$FAILS" -gt 0 ]; then
  echo "❌ CONSTITUTION CHECK FAILED ($FAILS violations)"
  exit 1
else
  echo "✅ CONSTITUTION CHECK PASSED"
  exit 0
fi

#!/bin/bash

# 🏭 Orchestrator 5.1 — Logger Utility
# Usage: bash logger.sh <file_path> <header> <message>

FILE_PATH="$1"
HEADER="$2"
MESSAGE="$3"

if [ -z "$FILE_PATH" ] || [ -z "$MESSAGE" ]; then
  echo "Usage: bash logger.sh <file_path> <header> <message>"
  exit 1
fi

# Ensure directory exists
mkdir -p "$(dirname "$FILE_PATH")"

# Append to file
echo "" >> "$FILE_PATH"
if [ -n "$HEADER" ]; then
  echo "### [$HEADER] $(date '+%H:%M:%S')" >> "$FILE_PATH"
else
  echo "### $(date '+%H:%M:%S')" >> "$FILE_PATH"
fi
echo "$MESSAGE" >> "$FILE_PATH"
echo "---" >> "$FILE_PATH"

echo "✅ Logged to $FILE_PATH"

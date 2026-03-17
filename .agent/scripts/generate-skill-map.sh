#!/bin/bash

# 🏭 Orchestrator 5.1 — Skill Map Generator
# Usage: bash generate-skill-map.sh

# This script generates a lightweight JSON index of all skills.

SKILLS_DIR="$HOME/.agent/skills/skills"
OUTPUT_FILE=".agent/memory/skill_map.json"

if [ ! -d "$SKILLS_DIR" ]; then
  echo "❌ Error: Skills directory '$SKILLS_DIR' not found."
  exit 1
fi

echo "🗺️ Generating Skill Map from $SKILLS_DIR..."

# Initialize JSON array
echo "[" > "$OUTPUT_FILE"

FIRST_ITEM=true

# Find all markdown files (max depth 3 to avoid infinite loops, but deep enough to catch skills)
find "$SKILLS_DIR" -name "*.md" -type f | while read -r skill_file; do
  # Extract basic info
  filename=$(basename "$skill_file")
  skill_id="${filename%.*}" # Remove .md extension
  
  # Try to extract description from frontmatter or first heading
  description=$(grep -i "^description:" "$skill_file" | head -n 1 | sed -E 's/^description:[[:space:]]*"?([^"]+)"?.*$/\1/I' | tr -d '\n\r')
  
  # If no description in frontmatter, try to find a # or ## heading
  if [ -z "$description" ]; then
      description=$(grep -E "^#+ " "$skill_file" | head -n 1 | sed 's/^#* *//' | tr -d '"\n\r')
  fi

  # Escape quotes for JSON
  description=$(echo "$description" | sed 's/"/\\"/g')
  
  # Build JSON object
  if [ "$FIRST_ITEM" = true ]; then
      echo "  {" >> "$OUTPUT_FILE"
      FIRST_ITEM=false
  else
      echo "  ,{" >> "$OUTPUT_FILE"
  fi
  
  echo "    \"id\": \"$skill_id\"," >> "$OUTPUT_FILE"
  echo "    \"path\": \"$skill_file\"," >> "$OUTPUT_FILE"
  echo "    \"description\": \"$description\"" >> "$OUTPUT_FILE"
  echo "  }" >> "$OUTPUT_FILE"
done

# Close JSON array
echo "]" >> "$OUTPUT_FILE"

COUNT=$(grep -c "\"id\":" "$OUTPUT_FILE")
echo "✅ Skill Map generated at '$OUTPUT_FILE' with $COUNT skills."

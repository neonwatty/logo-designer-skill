#!/bin/bash
# Validate skill file structure and frontmatter

set -e

SKILLS_DIR="skills"
ERRORS=0

echo "Validating skill files..."
echo ""

# Find all SKILL.md files
for skill_dir in "$SKILLS_DIR"/*/; do
    skill_file="${skill_dir}SKILL.md"
    skill_name=$(basename "$skill_dir")

    if [[ ! -f "$skill_file" ]]; then
        echo "Missing SKILL.md in: $skill_dir"
        ERRORS=$((ERRORS + 1))
        continue
    fi

    echo "Checking: $skill_name"

    # Check for YAML frontmatter delimiters
    first_line=$(head -1 "$skill_file")
    if [[ "$first_line" != "---" ]]; then
        echo "  Missing YAML frontmatter (should start with ---)"
        ERRORS=$((ERRORS + 1))
    fi

    # Check for required frontmatter fields
    if ! head -20 "$skill_file" | grep -q "^name:"; then
        echo "  Missing 'name' in frontmatter"
        ERRORS=$((ERRORS + 1))
    fi

    if ! head -20 "$skill_file" | grep -q "^description:"; then
        echo "  Missing 'description' in frontmatter"
        ERRORS=$((ERRORS + 1))
    fi

    # Check for closing frontmatter delimiter
    frontmatter_close=$(head -20 "$skill_file" | tail -n +2 | grep -n "^---" | head -1 | cut -d: -f1)
    if [[ -z "$frontmatter_close" ]]; then
        echo "  Missing closing frontmatter delimiter (---)"
        ERRORS=$((ERRORS + 1))
    fi

    # Check for at least one H2 section
    if ! grep -q "^## " "$skill_file"; then
        echo "  Warning: No ## sections found"
    fi

    # Check that name in frontmatter matches directory name
    frontmatter_name=$(head -20 "$skill_file" | grep "^name:" | sed 's/name:[[:space:]]*//')
    if [[ "$frontmatter_name" != "$skill_name" ]]; then
        echo "  Warning: Frontmatter name '$frontmatter_name' doesn't match directory '$skill_name'"
    fi

    echo "  Valid"
done

echo ""
if [[ $ERRORS -gt 0 ]]; then
    echo "Validation failed with $ERRORS error(s)"
    exit 1
else
    echo "All skill files are valid"
fi

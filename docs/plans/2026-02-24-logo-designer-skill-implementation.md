# Logo Designer Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Claude Code plugin that enables iterative logo design using SVG with side-by-side preview and PNG export.

**Architecture:** Single skill plugin — SKILL.md contains the full workflow (interview, explore, refine, export phases), preview.html is a template embedded in the skill instructions, and export.sh is a bundled shell script with fallback tool detection.

**Tech Stack:** Markdown (SKILL.md), HTML/CSS/JS (preview.html template), Bash (export.sh), SVG

---

### Task 1: Plugin Scaffold

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `skills/logo-designer/SKILL.md` (placeholder)
- Create: `LICENSE`

**Step 1: Create plugin.json**

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "logo-designer-skill",
  "version": "1.0.0",
  "description": "Design and iterate on logos using SVG with Claude Code",
  "author": {
    "name": "Jeremy Watt"
  },
  "repository": "https://github.com/neonwatty/logo-designer-skill",
  "license": "MIT",
  "keywords": ["logo", "svg", "design", "icon", "branding"]
}
```

**Step 2: Create placeholder SKILL.md**

Create `skills/logo-designer/SKILL.md`:

```markdown
---
name: logo-designer
description: |
  Design and iterate on logos using SVG. Use this skill when the user asks to
  "create a logo", "design a logo", "make me a logo", "iterate on this logo",
  "logo for my project", or discusses logo design, branding icons, or wordmarks.
version: 1.0.0
license: MIT
---

# Logo Designer

TODO: Full skill content in subsequent tasks.
```

**Step 3: Create LICENSE**

Create `LICENSE` with MIT license text, copyright 2026 Jeremy Watt.

**Step 4: Commit**

```bash
git add .claude-plugin/plugin.json skills/logo-designer/SKILL.md LICENSE
git commit -m "feat: scaffold plugin with manifest, placeholder skill, and license"
```

---

### Task 2: Write SKILL.md — Interview Phase

**Files:**
- Modify: `skills/logo-designer/SKILL.md`

**Step 1: Write the interview section**

Replace the placeholder content in SKILL.md. Start with the frontmatter (keep as-is) and add:

```markdown
# Logo Designer

Design and iterate on logos using SVG. Generates side-by-side previews and exports to PNG at standard sizes.

## Phase 1: Interview

Before generating anything, ask the user these questions **one at a time**:

1. **Brand name** — What name should appear in the logo (if any)?
2. **Purpose/vibe** — What is this logo for? What feeling should it convey? (e.g., "a developer tool that feels fast and minimal", "a kids' learning app that's playful and colorful")
3. **Style** — What style direction? Offer these as starting points:
   - Minimal / geometric
   - Playful / hand-drawn
   - Bold / corporate
   - Retro / vintage
   - Organic / natural
   - Or "surprise me"
4. **Color preferences** — Any specific colors, or "surprise me"?
5. **Format** — Icon only (512x512), wordmark only (1024x512), or combination mark (1024x512)?

Keep the interview conversational. If the user gives a rich initial description, skip questions they've already answered. Move to Phase 2 once you have enough to generate distinct concepts.
```

**Step 2: Commit**

```bash
git add skills/logo-designer/SKILL.md
git commit -m "feat: add interview phase to SKILL.md"
```

---

### Task 3: Write SKILL.md — SVG Conventions

**Files:**
- Modify: `skills/logo-designer/SKILL.md`

**Step 1: Add SVG conventions section**

Append after the Interview section:

```markdown
## SVG Conventions

When generating SVG logos, follow these rules:

- **viewBox sizing** — Always use `viewBox="0 0 W H"` without fixed `width`/`height` attributes. Use 512x512 for icons, 1024x512 for wordmarks/combination marks.
- **Self-contained** — No external fonts, images, or `<use>` references to other files. Everything inline.
- **Text handling** — Use widely available system fonts (Arial, Helvetica, Georgia, etc.) or convert text to `<path>` elements. When using system fonts, always include a generic fallback (e.g., `font-family="Helvetica, Arial, sans-serif"`).
- **Meaningful groups** — Wrap logical sections in `<g>` elements with descriptive IDs: `id="icon"`, `id="wordmark"`, `id="tagline"`. This makes iteration easier when the user says "make the icon bigger" or "change the wordmark color".
- **Flat fills by default** — Use solid `fill` colors. Only use gradients (`<linearGradient>`, `<radialGradient>`) when the user requests them or the style clearly calls for it.
- **Clean markup** — No unnecessary transforms, no empty groups, no default namespace clutter. Keep the SVG readable.
```

**Step 2: Commit**

```bash
git add skills/logo-designer/SKILL.md
git commit -m "feat: add SVG conventions to SKILL.md"
```

---

### Task 4: Write SKILL.md — Explore Phase

**Files:**
- Modify: `skills/logo-designer/SKILL.md`

**Step 1: Add explore phase section**

Append after SVG Conventions:

```markdown
## Phase 2: Explore

Generate 3-5 **distinct** SVG logo concepts. Each concept should take a meaningfully different creative direction — vary the icon metaphor, typography style, layout, or overall aesthetic. Do not generate minor variations of the same idea.

### File output

Create the following directory structure in the user's working directory:

```
logos/
├── concepts/
│   ├── concept-1.svg
│   ├── concept-2.svg
│   ├── concept-3.svg
│   └── ... (up to concept-5.svg)
└── preview.html
```

1. Create the `logos/concepts/` directory
2. Write each concept as a separate SVG file
3. Generate `logos/preview.html` using the preview template below
4. Tell the user to open `logos/preview.html` in their browser
5. Briefly describe each concept (1 sentence each) so the user can match descriptions to visuals
6. Ask: "Which direction do you want to explore? Pick a number, or describe what you like/dislike across them."
```

**Step 2: Commit**

```bash
git add skills/logo-designer/SKILL.md
git commit -m "feat: add explore phase to SKILL.md"
```

---

### Task 5: Write SKILL.md — Preview HTML Template

**Files:**
- Modify: `skills/logo-designer/SKILL.md`

**Step 1: Add preview HTML template**

Append after the Explore phase:

````markdown
### Preview HTML Template

When generating `logos/preview.html`, use this template. Replace `{{CARDS}}` with one card per SVG file. Set `{{PHASE}}` to "Concepts" during explore or "Iterations" during refine.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Logo Preview — {{PHASE}}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 2rem;
    transition: background-color 0.3s, color 0.3s;
  }
  body.light { background: #f5f5f5; color: #333; }
  body.dark { background: #1a1a1a; color: #eee; }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }
  h1 { font-size: 1.5rem; font-weight: 600; }
  .toggle {
    padding: 0.5rem 1rem;
    border: 1px solid currentColor;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 0.875rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.5rem;
  }
  .card {
    border: 1px solid rgba(128, 128, 128, 0.3);
    border-radius: 12px;
    overflow: hidden;
  }
  .card-img {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    min-height: 240px;
  }
  body.light .card-img { background: #fff; }
  body.dark .card-img { background: #2a2a2a; }
  .card-img img {
    max-width: 100%;
    max-height: 200px;
  }
  .card-label {
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    border-top: 1px solid rgba(128, 128, 128, 0.3);
  }
  body.light .card-label { background: #fafafa; }
  body.dark .card-label { background: #222; }
</style>
</head>
<body class="light">
  <div class="header">
    <h1>Logo Preview — {{PHASE}}</h1>
    <button class="toggle" onclick="document.body.classList.toggle('dark'); document.body.classList.toggle('light'); this.textContent = document.body.classList.contains('dark') ? '☀️ Light' : '🌙 Dark';">🌙 Dark</button>
  </div>
  <div class="grid">
    {{CARDS}}
  </div>
</body>
</html>
```

Each `{{CARDS}}` entry is:

```html
<div class="card">
  <div class="card-img">
    <img src="{{PATH}}" alt="{{LABEL}}">
  </div>
  <div class="card-label">{{LABEL}}</div>
</div>
```

Where `{{PATH}}` is the relative path from `logos/` (e.g., `concepts/concept-1.svg` or `iterations/iteration-3.svg`) and `{{LABEL}}` is the filename without extension (e.g., "concept-1" or "iteration-3").

During **explore**, show all concepts. During **refine**, show all iterations (most recent first).
````

**Step 2: Commit**

```bash
git add skills/logo-designer/SKILL.md
git commit -m "feat: add preview HTML template to SKILL.md"
```

---

### Task 6: Write SKILL.md — Refine Phase

**Files:**
- Modify: `skills/logo-designer/SKILL.md`

**Step 1: Add refine phase section**

Append after the preview template:

```markdown
## Phase 3: Refine

Once the user picks a concept direction, iterate on it.

### File output

```
logos/
├── iterations/
│   ├── iteration-1.svg    # First refinement (based on chosen concept)
│   ├── iteration-2.svg
│   └── ...
└── preview.html           # Regenerated to show iterations
```

1. Copy the chosen concept as the starting point — save the first refinement as `logos/iterations/iteration-1.svg`
2. Apply the user's feedback and save each new version with an incrementing number
3. Regenerate `logos/preview.html` after each iteration, showing all iterations (most recent first) so the user can compare
4. Tell the user to refresh their browser after each iteration
5. After each iteration, briefly describe what changed and ask for next feedback

### Iteration tips

- If the user says "go back to iteration N", use that as the new base
- If the user wants to compare specific iterations, mention which filenames to look at in the preview
- Keep SVG structure consistent across iterations (same group IDs) so the user can track what changed
- When the user is satisfied, move to Phase 4
```

**Step 2: Commit**

```bash
git add skills/logo-designer/SKILL.md
git commit -m "feat: add refine phase to SKILL.md"
```

---

### Task 7: Write SKILL.md — Export Phase

**Files:**
- Modify: `skills/logo-designer/SKILL.md`

**Step 1: Add export phase section**

Append after the Refine phase:

```markdown
## Phase 4: Export

When the user says "export", "I'm happy with this", "this is the one", or similar:

1. Identify the final iteration SVG (ask the user to confirm which one if ambiguous)
2. Create the `logos/export/` directory
3. Copy the final SVG to `logos/export/logo.svg`
4. Run the bundled export script to generate PNGs:

```bash
bash <path-to-skill>/scripts/export.sh logos/export/logo.svg logos/export/
```

The script produces:
- `logo-16.png`
- `logo-32.png`
- `logo-48.png`
- `logo-192.png`
- `logo-512.png`
- `logo-1024.png`
- `logo-2048.png`

5. Report the results: list all exported files with their sizes
6. If the export script fails (no conversion tool found), tell the user:
   > "No SVG-to-PNG converter found. Install one of: `npm install -g @aspect-build/resvg`, or install Inkscape, or install librsvg. Then run export again."

### Export script location

The export script is bundled with this skill at `scripts/export.sh` relative to the SKILL.md file. Use the skill's directory path to locate it.
```

**Step 2: Commit**

```bash
git add skills/logo-designer/SKILL.md
git commit -m "feat: add export phase to SKILL.md"
```

---

### Task 8: Write export.sh

**Files:**
- Create: `skills/logo-designer/scripts/export.sh`

**Step 1: Write the export script**

Create `skills/logo-designer/scripts/export.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Usage: export.sh <input.svg> <output-dir>
# Exports SVG to PNG at standard logo sizes using the best available tool.

INPUT_SVG="${1:?Usage: export.sh <input.svg> <output-dir>}"
OUTPUT_DIR="${2:?Usage: export.sh <input.svg> <output-dir>}"
SIZES=(16 32 48 192 512 1024 2048)
BASENAME="logo"

mkdir -p "$OUTPUT_DIR"

# Copy SVG to output
cp "$INPUT_SVG" "$OUTPUT_DIR/$BASENAME.svg"

# Detect available tool
TOOL=""
if command -v resvg &>/dev/null; then
  TOOL="resvg"
elif npx --yes @aspect-build/resvg --help &>/dev/null 2>&1; then
  TOOL="npx-resvg"
elif command -v node &>/dev/null && node -e "require('sharp')" &>/dev/null 2>&1; then
  TOOL="sharp"
elif command -v inkscape &>/dev/null; then
  TOOL="inkscape"
elif command -v rsvg-convert &>/dev/null; then
  TOOL="rsvg-convert"
else
  echo "ERROR: No SVG-to-PNG converter found."
  echo ""
  echo "Install one of the following:"
  echo "  npm install -g @aspect-build/resvg     (recommended)"
  echo "  brew install inkscape"
  echo "  brew install librsvg"
  exit 1
fi

echo "Using: $TOOL"
echo ""

for SIZE in "${SIZES[@]}"; do
  OUTPUT="$OUTPUT_DIR/${BASENAME}-${SIZE}.png"
  case "$TOOL" in
    resvg)
      resvg "$INPUT_SVG" "$OUTPUT" --width "$SIZE"
      ;;
    npx-resvg)
      npx --yes @aspect-build/resvg "$INPUT_SVG" "$OUTPUT" --width "$SIZE"
      ;;
    sharp)
      node -e "
        const sharp = require('sharp');
        sharp('$INPUT_SVG')
          .resize($SIZE, $SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toFile('$OUTPUT')
          .then(() => process.exit(0))
          .catch(e => { console.error(e); process.exit(1); });
      "
      ;;
    inkscape)
      inkscape "$INPUT_SVG" --export-type=png --export-filename="$OUTPUT" --export-width="$SIZE"
      ;;
    rsvg-convert)
      rsvg-convert -w "$SIZE" -o "$OUTPUT" "$INPUT_SVG"
      ;;
  esac
  echo "  Exported: ${BASENAME}-${SIZE}.png (${SIZE}x${SIZE})"
done

echo ""
echo "Done. Files in: $OUTPUT_DIR"
```

**Step 2: Make it executable**

```bash
chmod +x skills/logo-designer/scripts/export.sh
```

**Step 3: Commit**

```bash
git add skills/logo-designer/scripts/export.sh
git commit -m "feat: add PNG export script with fallback tool detection"
```

---

### Task 9: Write README.md

**Files:**
- Create: `README.md`

**Step 1: Write the README**

Create `README.md` with:
- What the plugin does (1-2 sentences)
- Installation instructions (how to add a Claude Code plugin from GitHub)
- Usage: what to say to trigger it ("create a logo for X")
- Workflow overview: interview → explore → refine → export
- PNG export prerequisites (which tools to install)
- Example screenshots section (placeholder — to be filled after first real use)
- License (MIT)

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with installation and usage instructions"
```

---

### Task 10: Manual Smoke Test

**Step 1: Install the plugin locally**

Add the local plugin path to your Claude Code config so the skill is loaded.

**Step 2: Test the trigger**

Start a new Claude Code session and say "create a logo for a project called Moonbeam". Verify:
- Claude asks interview questions one at a time
- After interview, generates 3-5 SVG concepts in `logos/concepts/`
- Generates `logos/preview.html`
- Preview HTML opens in browser and displays all concepts with dark/light toggle

**Step 3: Test refinement**

Pick a concept and give feedback. Verify:
- Iterations save to `logos/iterations/`
- Preview HTML regenerates with iterations
- Browser refresh shows updated preview

**Step 4: Test export**

Say "export". Verify:
- Export script runs and detects a tool
- PNGs generated at all 7 sizes in `logos/export/`
- Final SVG copied to `logos/export/logo.svg`

**Step 5: Commit any fixes**

If anything needed adjustment during smoke test, commit the fixes.

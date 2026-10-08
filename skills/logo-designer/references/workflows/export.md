# Export a Logo

When the user says "export", "I'm happy with this", "this is the one", or similar:

1. Identify the final iteration SVG (ask the user to confirm which one if ambiguous)
2. Create the `logos/export/` directory
3. Copy the final SVG to `logos/export/logo.svg`. For a combination mark, also
   create a standalone square `logos/export/icon.svg` from its meaningful
   `#icon` group. Preserve the icon's appearance and give it a tight square
   `viewBox`; do not include the wordmark.
4. Run the bundled export script to generate PNGs. Passing an SVG that is
   already at its destination is supported:

```bash
bash <path-to-skill>/scripts/export.sh logos/export/logo.svg logos/export/
```

For a combination mark, pass the standalone icon as the optional third
argument:

```bash
bash <path-to-skill>/scripts/export.sh logos/export/logo.svg logos/export/ logos/export/icon.svg
```

The script produces:
- `logo-16.png`
- `logo-32.png`
- `logo-48.png`
- `logo-192.png`
- `logo-512.png`
- `logo-1024.png`
- `logo-2048.png`

When an icon SVG is provided, the script also preserves `icon.svg` and produces
the matching `icon-16.png` through `icon-2048.png` family. Use the `icon-*`
assets for favicons and app icons; use the `logo-*` assets where the complete
combination mark belongs.

5. Report the results: list all exported files with their sizes
6. If the export script fails (no conversion tool found), tell the user:
   > "No SVG-to-PNG converter found. Install one of: `npm install -g @aspect-build/resvg`, or install Inkscape, or install librsvg. Then run export again."

## Export script location

The export script is bundled with this skill at `scripts/export.sh` relative to the SKILL.md file. Use the skill's directory path to locate it.

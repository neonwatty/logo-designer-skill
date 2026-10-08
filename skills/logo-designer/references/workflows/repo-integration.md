# Repo Integration (Optional)

If the user asks to commit the logo to a project repo or create a PR:

1. **Identify target files** — Check the repo for existing icon/logo files: `public/favicon.svg`, `public/favicon.ico`, `public/pwa-*.png`, `public/apple-touch-icon.png`, `assets/logo.svg`, `ios/.../AppIcon.appiconset/`, `public/manifest.json`, etc.
2. **Clone and branch** — Clone the repo (or use the existing checkout), create a branch like `chore/new-logo`
3. **Replace files** — Copy the final SVG as the favicon/logo. Generate platform-specific sizes:
   - `favicon.ico` — 48px (use ImageMagick `convert` or `magick`)
   - `apple-touch-icon.png` — 180px
   - `pwa-192x192.png` — 192px
   - `pwa-512x512.png` — 512px
   - iOS `AppIcon-512@2x.png` — 1024px
   - Only replace files that already exist in the repo — don't add new ones the project doesn't use
4. **Deliver as requested** — Commit, push, or create a PR only to the extent requested by the user. When a PR is requested, summarize the updated assets. Honor branch-only experiments without creating a PR.

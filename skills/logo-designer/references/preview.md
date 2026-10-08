# Preview Assembly

When generating `logos/preview.html`, read and use [the bundled HTML template](../assets/preview.html). Replace `{{CARDS}}` with one card per SVG file. Set `{{PHASE}}` to "Concepts" during explore or "Iterations" during refine.

## Favicon size check strip

During Phase 3 (Refine), add a "Favicon Size Check" section below the iteration grid. This renders each iteration at 64px, 32px, and 16px so the user can spot legibility issues early. Use this HTML pattern:

```html
<h2>Favicon Size Check</h2>
<div style="display:flex;gap:2rem;flex-wrap:wrap;align-items:end;">
  <!-- Repeat for each iteration -->
  <div style="display:flex;flex-direction:column;align-items:center;gap:0.5rem;">
    <div style="font-size:0.8rem;font-weight:500;">{{LABEL}}</div>
    <div style="display:flex;gap:1rem;align-items:end;">
      <div><img src="{{FAVICON_PATH}}" width="64" height="64"><div style="font-size:0.75rem;opacity:0.6;">64px</div></div>
      <div><img src="{{FAVICON_PATH}}" width="32" height="32"><div style="font-size:0.75rem;opacity:0.6;">32px</div></div>
      <div><img src="{{FAVICON_PATH}}" width="16" height="16"><div style="font-size:0.75rem;opacity:0.6;">16px</div></div>
    </div>
  </div>
</div>
```

For icon-only logos, `{{FAVICON_PATH}}` is the iteration path. For combination
marks, create a standalone square SVG from the meaningful `#icon` group and use
its path for `{{FAVICON_PATH}}`. Never squeeze the full horizontal wordmark into
the square favicon cells. If details disappear at 32px, suggest simplifying
(remove fine details, thicken strokes, drop decorative elements).

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

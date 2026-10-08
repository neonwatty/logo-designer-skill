# Refine a Logo

Once the user picks a concept direction, iterate on it. For an existing SVG, use that as the base. Read [SVG conventions](../svg-conventions.md) and [preview assembly](../preview.md).

## Single vs. batch iterations

**Single iteration** — When the user gives specific feedback ("make the icon bigger", "change the blue to green"), apply the change directly and write the next iteration SVG yourself.

**Batch variations** — When exploring multiple directions at once ("try different color palettes", "show me 5 variations of the eye shape", "experiment with bar count"), use the host's available subagent tool to generate variations in parallel when supported and permitted, or generate them sequentially:

1. Dispatch one `Task` agent per variation, all in the same message
2. Each agent receives: the base SVG content (copy the full SVG inline in the prompt), the specific variation to apply, the target file path, and the full SVG conventions
3. After all agents complete, regenerate `logos/preview.html` and present the results

**Example batch dispatch:**

```
Task 1: "Take this base SVG [full SVG content] and create a variation with a warm color palette (reds, oranges, yellows). Write to logos/iterations/iteration-5.svg."

Task 2: "Take this base SVG [full SVG content] and create a variation with a cool color palette (blues, teals, purples). Write to logos/iterations/iteration-6.svg."

Task 3: "Take this base SVG [full SVG content] and create a variation with a monochrome palette (grays + one accent). Write to logos/iterations/iteration-7.svg."
```

Use the host's normal permissions. Assign each agent its own output file and tell it to preserve other agents' work. Always include the full base SVG content in each agent's prompt — agents do not share context.

## File output

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

## Iteration tips

- If the user says "go back to iteration N", use that as the new base
- If the user wants to compare specific iterations, mention which filenames to look at in the preview
- Keep SVG structure consistent across iterations (same group IDs) so the user can track what changed
- Use parallel agents for batch exploration (3+ variations), sequential writes for single tweaks
- **Check small-size legibility** — After generating iterations, include the favicon size check strip in the preview. If thin strokes vanish at 32px, proactively suggest thickening them. If fine details (clocks, sparkles, thin icons) become unreadable, suggest removing or simplifying them. This saves iteration cycles.
- When the user is satisfied, follow [export](export.md)

For explicit Lineage canvas review, follow [canvas review](canvas-review.md). Otherwise keep using standalone SVG files and the normal preview.

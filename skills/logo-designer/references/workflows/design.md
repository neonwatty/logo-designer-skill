# Design a Logo

Read [SVG conventions](../svg-conventions.md) before generating concepts.

## Phase 1: Interview

Before generating anything, gather context and ask the user what they need.

### Step 1: Gather context automatically

If the user points to a repo, URL, or existing project:
- Read the README, package.json, CSS/config files, and any existing branding
- Extract: project name, purpose, tech stack, color palette, design language, fonts
- Summarize what you found before asking questions — this avoids asking things you already know

If the user just says "design a logo" with no project context, skip to Step 2.

### Step 2: Ask structured questions

Use the host's question tool (such as `AskUserQuestion`) when available, or ask in chat. **Batch related questions together** within the tool's supported limit and **skip any question already answered** by the context gathered in Step 1 or by the user's initial message.

**Question 1 — Format:**
```
question: "What format do you need?"
header: "Format"
options:
  - label: "Icon only (512x512)"
    description: "Square icon, works for favicons, app icons, social avatars"
  - label: "Wordmark only"
    description: "Text logo, 1024x512"
  - label: "Combination mark"
    description: "Icon + text together, 1024x512"
```

**Question 2 — Style direction:**
```
question: "What style direction?"
header: "Style"
options:
  - label: "Minimal / geometric"
    description: "Clean lines, simple shapes, modern feel"
  - label: "Playful / hand-drawn"
    description: "Friendly, casual, organic shapes"
  - label: "Bold / corporate"
    description: "Strong, professional, high contrast"
  - label: "Match existing app style"
    description: "I'll extract the design language from your project"
```

**Question 3 — Color preferences:**
```
question: "Any color preferences?"
header: "Colors"
options:
  - label: "Use project colors"
    description: "I'll pull colors from your existing design system"
  - label: "Surprise me"
    description: "I'll pick a palette that fits the vibe"
  - label: "I have specific colors"
    description: "I'll ask you for them"
```

**Question 4 — Output size** (only if the user mentioned a specific platform):
```
question: "Any specific size requirements?"
header: "Size"
options:
  - label: "Standard sizes"
    description: "16, 32, 48, 192, 512, 1024, 2048px — covers most uses"
  - label: "Custom size needed"
    description: "I'll ask for the exact dimensions"
```

### Adapting to context

- **User points to a repo:** Gather context first, then ask only format + style (colors are likely known).
- **User says "design a logo for X":** Ask format, style, and colors together.
- **User gives detailed description:** Skip everything already covered, ask only what's missing.
- **User says "just make something":** Use sensible defaults (icon only, minimal, surprise me) and go straight to Phase 2.

Move to Phase 2 once you have enough to generate distinct concepts.

## Phase 2: Explore

Generate 3-5 **distinct** SVG logo concepts. Each concept should take a meaningfully different creative direction — vary the icon metaphor, typography style, layout, or overall aesthetic. Do not generate minor variations of the same idea.

### Parallel generation

Use the host's available subagent tool (such as `Task`) to generate concepts in parallel when supported and permitted. Otherwise generate them sequentially with the same brief and file assignments.

1. Create the `logos/concepts/` directory first
2. Dispatch one `Task` agent per concept, all in the **same message** so they run concurrently. Each agent should:
   - Receive the full design brief (format, style, colors, viewBox, SVG conventions)
   - Be assigned a specific creative direction (e.g., "geometric letterform", "abstract symbol", "mascot-based")
   - Write its SVG to a specific file path (e.g., `logos/concepts/concept-1.svg`)
   - Use the host's normal permissions; each agent owns only its assigned output file and must preserve other agents' work
3. After all agents complete, generate `logos/preview.html` and present the results

**Example dispatch pattern** (all in one message):

```
Task 1: "Write logos/concepts/concept-1.svg — geometric letterform using [colors]. viewBox 512x512. Self-contained SVG, no external fonts. [full SVG conventions]."

Task 2: "Write logos/concepts/concept-2.svg — abstract symbol using [colors]. viewBox 512x512. Self-contained SVG, no external fonts. [full SVG conventions]."

Task 3: "Write logos/concepts/concept-3.svg — mascot-based icon using [colors]. viewBox 512x512. Self-contained SVG, no external fonts. [full SVG conventions]."
```

Each agent prompt must include: the full [SVG conventions](../svg-conventions.md), the target file path, the specific creative direction, and all relevant context (project name, colors, style preferences). Agents do not share context — give each one everything it needs.

### File output

```
logos/
├── concepts/
│   ├── concept-1.svg
│   ├── concept-2.svg
│   ├── concept-3.svg
│   └── ... (up to concept-5.svg)
└── preview.html
```

After all parallel agents complete:

1. Generate `logos/preview.html` using [preview assembly](../preview.md)
2. Tell the user to open `logos/preview.html` in their browser
3. Briefly describe each concept (1 sentence each) so the user can match descriptions to visuals
4. Ask: "Which direction do you want to explore? Pick a number, or describe what you like/dislike across them."

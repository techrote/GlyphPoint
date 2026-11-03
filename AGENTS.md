# Working on GlyphPoint

## Source of truth

Read [readme.md](readme.md), [RAG.md](RAG.md), and the relevant manual section before changing behavior. The maintained runtime is **GlyphPoint-v1a-layout-fixed.html**. Its HTML, CSS, and JavaScript intentionally ship in one offline file. `GlyphPoint-v1a.html` and `GlyphPoint-v04a.html` are historical snapshots; do not propagate repairs into them or create another competing runtime unless the task explicitly calls for that change.

Inspect the current branch, worktree status, and live PRs before integrating changes. Preserve unrelated work. The November 2026 audit is historical evidence, not a substitute for inspecting current source and checks.

## Implementation expectations

- Keep browser runtime dependencies and outbound network access out of the editor. Node/Playwright are development tools only.
- Preserve the global-colour-per-glyph model and the single-code-point cell contract. A new colour model or grapheme model requires an explicit schema and migration plan.
- Validate file sizes, dimensions, palette cardinality, and cell data before replacing state or allocating the grid. Failed imports must leave the current document and history unchanged.
- Respect the reserved space glyph, selection masks, finite allocation/history budgets, and complete document snapshots.
- Keep untrusted imported HTML inert. Copy only validated data into the application; never append imported nodes or construct unsanitized executable HTML.
- Any document edit that changes saved content must update dirty state; compound gestures should have a meaningful undo step. Pure drawing-choice preferences need not create history steps.
- Update the manual, format reference, and RAG entry when changing their contracts. Describe limitations and untested platforms honestly.
- Do not select a project license or publish a release as a side effect of an unrelated task.

## Verification

For runtime changes run `npm run check`, `npm test`, and the relevant browser scenarios (`npm ci`, `npx playwright install chromium firefox`, `npm run test:browser`). Tests operate on the shipped HTML, not a copied implementation. Add regression coverage for a reproduced defect. Documentation-only work normally needs `npm run check` and source verification; avoid unnecessary browser reruns.

Use the existing two-job GitHub workflow instead of introducing large matrices or repeated equivalent runs. Distinguish local results, PR CI, and post-merge CI. Record source/commit identity when reporting integration results. Do not claim a physical user playtest, Windows/macOS qualification, or accessibility conformance from headless Linux tests.

Keep PRs focused: explain the problem, resulting behavior, validation, and remaining material risks. This file does not add an approval requirement beyond the user's task authorization and repository controls.

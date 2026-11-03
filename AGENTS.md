# Working on GlyphPoint

## Authority and source of truth

Read [readme.md](readme.md), the relevant [RAG](RAG.md) chunks, and the affected [manual](docs/manual.md) section before changing behaviour. Current user instructions and repository controls take precedence over this guidance. Inspect the branch, worktree status, accepted source, and live PRs before integration; preserve unrelated work.

The maintained deliverable is **`GlyphPoint-RC.html`**, a generated, offline, self-contained application. Edit **`src/app.html`**, the modules in **`src/`**, and relevant **`assets/fonts/`** inputs, then run **`npm run build`**. Commit source and generated output together. `npm run check` rejects a stale build. Do not make hand edits only to the generated HTML.

`GlyphPoint-v1a.html` and `GlyphPoint-v04a.html` are historical snapshots. Do not propagate routine repairs into them or introduce another competing entry point unless explicitly requested. The original November 2026 audit describes an earlier revision; use current source, tests, and the [follow-up record](docs/quality-followup-2026-11-03.md) for present behaviour.

## Runtime and document contracts

- Keep the shipped runtime free of external packages, network dependencies, remote fonts, telemetry, and required server setup. Node/Playwright and the assembly/package scripts are development tools only.
- Preserve v3 semantics: one printable extended grapheme per cell, at most 32 code points; foreground/background fields either inherit or contain validated six-digit hex overrides. Palette colours are defaults, not mandatory colours for every occurrence.
- Preserve the documented v1/v2 migration. Valid legacy foregrounds can seed omitted palette entries before ignored legacy cell overrides are cleared. Do not change the appearance of existing projects accidentally. Schema changes need an explicit migration and regression plan.
- Validate bytes, dimensions, exact cell count, glyph/palette capacity, fonts, and colours before replacing state or allocating the candidate field. Keep reserved space, selection masks, complete snapshots, and finite model/history budgets.
- Use `setCell` and renderer invalidation for individual writes. Bulk replacements must resynchronize counts, palette membership, controls, cursor/selection, rendering, and dirty state. Do not restore a DOM element per field cell.
- Keep artwork rendering separate from cursor, preview, grid, and selection overlays. PNG and Print must capture the entire coherent document, independent of viewport position or pending screen frames.
- Plan Expand/Reject/Clip operations before mutation. Failed expansion/rejection leaves document/history intact; explicit clipping reports discarded content. Keep inverse-sampled sequential skew and apply the same dimension budgets to transformed bounds.

## Transactions and browser data

- Any edit to saved document content must mark dirty and schedule recovery. A compound gesture/job should have one meaningful undo step. Pure navigation, layout, and future brush preferences need not add history.
- Worker/cooperative jobs commit only if not cancelled and their captured document revision is still current. Preserve progress/cancellation, input guards, and atomic installation. Protect imports and asynchronous clipboard reads against superseded documents or edits.
- Keep recovery browser-local, explicit to restore, and bounded: latest checkpoint per tab/document, 12 entries, 32 MiB serialized archive payload, 16 MiB per encoded record, large-field lossless RLE, and bounded pending writes. Preserve atomic write/eviction and explicit storage/quota/queue errors. Never describe recovery as cloud sync, permanent backup, or persistent Undo history.
- Direct Save clears dirty only after a successful completed write of the unchanged captured revision. Downloads cannot verify completion and remain dirty. Do not reuse a file handle after New/Open or claim a cancelled/failed write succeeded.
- Keep imported HTML/CSS inert. Never append imported nodes or stylesheets, execute event/script content, or fetch imported resources. Copy only validated data. Preserve parser/selector-work budgets and safe export/data-block escaping.
- Retain bundled-font provenance, hashes, and license notices in the repository and applicable exports. A third-party font license does not license GlyphPoint itself.

## Documentation, verification, and release work

Palette lookup is cached by array identity/length. In-place glyph renames must call `invalidatePaletteLookup()`; colour/label edits retain the same entry objects. Keep bulk palette additions and UI rebuilding outside per-cell loops.

Update the manual, format reference, and RAG when their contracts change. Explain implemented functionality and material limits directly. Distinguish source inspection, automated browser tests, OS smoke tests, physical-device playtests, and assistive-technology qualification. Do not claim Windows/macOS/mobile or accessibility conformance merely because a headless engine test passed.

For runtime changes run `npm run build`, `npm run check`, `npm test`, and the relevant full browser suites after `npm ci` and installation of the matching Playwright browsers. `npm run test:browser` defaults to Chromium/Firefox; `npm run test:browser -- chromium firefox webkit` selects all three. Tests exercise the generated artifact or modules extracted from it, not a duplicate implementation. Add meaningful regressions for reproduced defects and new data contracts. Documentation-only changes normally need `npm run check` and source verification.

Use the existing [Quality workflow](.github/workflows/quality.yml): two definitions expand into source/model/package checks, full Linux three-engine coverage, Windows Chromium smoke, and macOS WebKit smoke. Keep finite timeouts, bounded concurrency, and cancellation of superseded runs. Broaden or repeat checks only to resolve a concrete risk or satisfy a required gate. Distinguish local, PR, and post-merge results and record the exact source commit.

Candidate packaging through `npm run release:package` creates a ZIP, SHA-256 file, and source/file manifest without publishing. Follow the [release process](docs/release-process.md) and [license decision](docs/license-decision.md). Do not infer or select a project license from dependency notices. The manual draft-release workflow requires an owner-selected root `LICENSE` and successful Quality results for the exact main commit; it prepares a draft prerelease, not an automatically published release.

Keep PRs focused on the concrete problem, changed behaviour, validation, and remaining evidence limits. This file does not add an approval requirement beyond the user's authorization and repository controls.

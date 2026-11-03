# Developer guide

GlyphPoint ships as one offline HTML application. Its maintained sources are split into focused modules for development, then assembled deterministically into **`GlyphPoint-RC.html`**. The Node package supplies development checks and candidate packaging; it is private and is not an npm-distributed runtime.

## Start with the current source

Inspect the branch, `git status`, current PRs, and accepted source before changing code. Preserve unrelated work. Read [AGENTS.md](AGENTS.md), the affected [manual](docs/manual.md) section, and the relevant [RAG](RAG.md) chunks. The original [audit](docs/quality-audit-2026-11-03.md) is historical evidence; use live source and the [follow-up](docs/quality-followup-2026-11-03.md) for the current implementation.

Edit `src/`, not just the generated HTML. Run `npm run build` and include the updated maintained HTML in the same change. Do not propagate routine edits into `GlyphPoint-v1a.html` or `GlyphPoint-v04a.html`, or create another competing application filename.

| Source | Responsibility |
| --- | --- |
| [src/app.html](src/app.html) | Interface, styles, accessible controls/dialogs, and assembly placeholders. |
| [src/app.js](src/app.js) | Document state, palette/history, tools, selections, file schema, import/export, and event wiring. |
| [src/workflows.js](src/workflows.js) | Job transactions, edge planning, keyboard grid, cell colours, recovery UI, file-saving integration, readable text, PNG, and Print. |
| [src/interchange.js](src/interchange.js) | Grapheme segmentation/validation, colour normalization, and bounded inert foreign-HTML import. |
| [src/recovery.js](src/recovery.js) | IndexedDB archive, write queue/retention, lifecycle handling, and explicit direct/download saves. |
| [src/renderer.js](src/renderer.js) | Canvas viewport layout, painting budgets, hit testing, overlays, fitted glyphs, and complete PNG rendering. |
| [src/jobs.js](src/jobs.js) | Fill and Resize/Skew kernels, progress, worker execution, cancellation, and cooperative fallback. |
| [assets/fonts/](assets/fonts/) | Embedded font CSS, provenance manifest, and the font's independent license notice. |
| [scripts/build.cjs](scripts/build.cjs) | Exact module/font assembly into the standalone deliverable. |

The build has no runtime imports, CDN requests, package manager, or server dependency. Preserve that property. The font data and notice are embedded into the application; HTML artwork export also carries the needed font notice. Follow [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the asset manifest when replacing fonts.

## Setup and checks

Use Node.js **22 or newer**; CI selects **Node 24**. The build/check/unit/package commands use the standard library. Browser checks need the exact Playwright development dependency and its matching browser builds.

```sh
npm run build
npm run check
npm test
npm ci
npx playwright install chromium firefox webkit
npm run test:browser -- chromium firefox webkit
```

| Command | Purpose |
| --- | --- |
| `npm run build` | Regenerates the maintained HTML from source modules and embedded font assets. |
| `npm run check` | Requires byte-for-byte source/build agreement, then checks inline JavaScript, IDs, self-containment, and local Markdown links/headings. |
| `npm test` | Runs Node model, schema, renderer, interchange, recovery, save, and workflow regressions. |
| `npm run test:browser` | Runs the full configured browser suites in Chromium and Firefox by default. |
| `npm run test:browser -- chromium` | Runs all full suites in one selected engine; `firefox`, `webkit`, or multiple engine names are also accepted. |
| `npm run release:package` | Creates a source/application candidate ZIP, SHA-256 checksum, and release manifest without publishing. |

On Linux, `npx playwright install --with-deps chromium firefox webkit` installs missing browser libraries as well. This is a development setup action, not an end-user requirement. Keep Playwright pinned and upgrade the package/lockfile/browser binaries deliberately; do not call the pinned version the newest available release.

For manual work, open the built HTML locally. An optional server is `python3 -m http.server 8000 --bind 127.0.0.1`, or `py -m http.server 8000 --bind 127.0.0.1` on Windows. Open [the localhost editor](http://127.0.0.1:8000/GlyphPoint-RC.html). Use a consistent origin when checking recovery; changing the port, browser/profile, or file URL can change the storage context.

## What each test layer establishes

[tests/helper.cjs](tests/helper.cjs) executes JavaScript extracted from the shipped HTML in a Node VM, with startup omitted and browser interfaces stubbed. Model tests exercise actual data operations quickly; they do not establish real layout, focus, pointer capture, clipboard permissions, browser storage, or OS file-dialog behaviour. Interchange/renderer component tests similarly extract the shipped implementation rather than maintaining a second copy.

[tests/browser.cjs](tests/browser.cjs) runs the complete application, including real pointer and keyboard editing, cell colours, v3 round trips, downloads, recovery integration, responsive controls, and touch-emulation paths. Full mode also runs [renderer component scenarios](tests/renderer.browser.cjs). The unified [browser runner](scripts/browser-suite.cjs) adds [recovery/storage scenarios](tests/recovery.browser.cjs) and [HTML-interchange scenarios](tests/interchange.browser.cjs). Unexpected page errors and external HTTP(S) requests fail relevant scenarios, and downloaded bytes are inspected or reopened.

Use `GLYPHPOINT_APP` with an absolute path to test another built HTML artifact while reproducing a regression. Historical builds may lack modules required by new tests; choose the applicable regression rather than treating every historical failure as a new defect.

`GP_RUN_SMOKE=1` selects the bounded cross-platform smoke set and omits the full component/storage/interchange suites. The CI workflow configures this for Windows/macOS. Use the full mode for Linux engine qualification and security/format changes.

Add a regression for a reproduced defect or a material new contract. Avoid tests that merely repeat the implementation, and do not broaden or rerun a successful suite without a changed source, concrete remaining risk, or required gate. Documentation-only changes normally need `npm run check` and source verification.

## Document and rendering contracts

The current format is **`glyphpoint-v3`**. Each cell has one printable extended grapheme of at most 32 code points, a supported font/style, and optional six-digit foreground/background overrides. Empty colour fields mean palette/field inheritance. Preserve migration of v1/v2 projects: valid legacy foregrounds may seed missing palette entries, then legacy ignored cell overrides are cleared so their displayed appearance remains consistent. See [project-format.md](docs/project-format.md) for authoritative field rules.

`state` remains the complete document/editor model. `captureDocument`, `snapshot`, `restore`, `undo`, and `redo` own independent history snapshots. Validate a candidate before snapshotting and mutating, take one snapshot for a meaningful compound operation, and mark a successful content edit dirty so it schedules recovery. Pure focus/zoom/layout choices and next-brush settings need not add history entries.

`setCell` updates glyph counts, palette membership, dirty state, and renderer invalidation for individual writes. Bulk installation and transformations may replace cell arrays and resynchronize derived state through `rebuildGrid`; the historical function name no longer implies creating DOM spans. The renderer paints visible Canvas cells in scheduled batches and keeps artwork separate from selection, cursor, and preview overlays. Whole-field PNG/Print must render the complete document, independent of scroll position or pending viewport painting.

Respect the 4,096-cell axis limit, 1,048,576-cell area budget, 4,096-entry palette including reserved space, and combined history budgets. Free-form masks define selected cells; their bounding rectangle does not authorize modifying holes. Explicit foreground/background and font/styles must travel with cells through copy, move, transforms, resize, recovery, and native exports.

Plan edge behaviour before mutation. Expand and Reject must leave the original document/history intact if prospective dimensions fail. Clip is an explicit user choice and reports discarded overflow. Resize/Skew uses sequential horizontal/vertical shears with inverse sampling; do not reintroduce forward-write holes, collisions, or singular combined-shear calculations.

## Asynchronous work and persistence

Worker/cooperative jobs prepare a candidate document. Completion may commit only if the captured document revision is still current and the job was not cancelled. Keep progress/cancel controls available and guard conflicting edits; a stale result must not overwrite newer work. Imports and external clipboard reads need equivalent generation/revision protection.

Recovery is an independent browser-local archive, not a substitute for confirmed file saves. Keep the debounce/maximum-wait policy, unique tab/document identities, bounded queue and archive, atomic storage/eviction, and explicit error reporting. Validate stored payloads on restore and keep the canonical v3 format marker in serialized checkpoints. Deleting an entry must not resurrect it through a stale pending flush.

Direct Save requests a destination explicitly, serializes one revision, and clears dirty state only after the write stream closes successfully for that unchanged document revision. Download requests cannot verify completion and therefore remain dirty. New/Open resets the remembered file handle. Cancellation, permission errors, storage failure, or another document opening must not silently claim a saved state.

## Import/export trust boundary

File reads enforce size limits before parsing; parsing and normalization must finish before replacing live state. Stream grapheme iteration for text row validation so oversized text is rejected without building an unnecessary array of every character.

Untrusted HTML stays in detached template contents. Embedded CSS is parsed in unattached stylesheets, and only bounded safe declarations/selectors become cell data. Do not append imported nodes/stylesheets, execute scripts/events, fetch style/resource URLs, or let fonts/CSS introduce arbitrary runtime resources. Preserve node, depth, style-text, rule, selector, declaration, and selector-work budgets.

Native HTML export contains escaped v3 JSON, validated cell styles, and the bundled fonts under a restrictive resource policy. Preserve data-block escaping and the application's escaped closing-script delimiter. Test exported files by opening the download and reimporting it; do not rely only on string snapshots. Use PNG for fixed pixel appearance, while documenting font fallback and supported HTML limitations honestly.

## CI and qualification evidence

[Quality](.github/workflows/quality.yml) runs on PRs, pushes to `main`, and manual dispatch. Its two job definitions expand into four bounded jobs:

| Job | Configured scope |
| --- | --- |
| Source/docs/model/package | Ubuntu; exact build, documentation, Node regressions, and candidate package artifact. |
| Linux browser qualification | Chromium, Firefox, and WebKit full suites. |
| Windows smoke | Chromium smoke workflows on Windows. |
| macOS smoke | WebKit smoke workflows on macOS. |

The browser matrix has finite timeouts and limited parallelism; superseded Quality runs are cancelled per PR/ref. The configured matrix is a qualification plan until that source revision passes it. Record the exact commit and distinguish local, PR, and post-merge results in [platform qualification](docs/platform-qualification.md). Headless Windows/macOS runs do not constitute physical user playtests, WebKit automation is not a complete Safari/device certification, and emulated touch or accessibility assertions do not establish screen-reader/WCAG conformance.

## Candidate packages and releases

`npm run release:package` first verifies the generated HTML. It writes `dist/GlyphPoint-2.0.0-rc.1.zip`, its `.sha256` file, and `dist/release-manifest.json` for the current package version. The manifest records the source commit, working-tree state, license status, byte sizes, and file hashes. Packaging uses fixed ZIP metadata so identical inputs produce identical bytes.

Local packaging includes tracked and non-ignored untracked repository files. Inspect the manifest and working tree before distributing a locally prepared artifact. CI packages a checked-out revision and uploads a commit-labelled candidate artifact; creation of that artifact is not publication.

The manually dispatched [draft-release workflow](.github/workflows/release.yml) runs only on `main`. It requires a non-empty owner-selected root `LICENSE` and a successful Quality push run for that exact commit, reruns source/model/package checks, and creates a **draft prerelease** with its ZIP, checksum, manifest, and versioned notes. It does not infer a license from bundled fonts or publish automatically. Follow [release-process.md](docs/release-process.md), [license-decision.md](docs/license-decision.md), and [the candidate notes](releases/v2.0.0-rc.1.md).

## Documentation and review

Update the manual, format reference, RAG, and relevant release/change notes with behaviour changes. Use function names and paths as source anchors instead of line numbers. Explain the problem, resulting behaviour, meaningful validation, and remaining evidence limits in PR descriptions. Keep historical audit/changelog statements scoped to their original revision.

A useful bug report includes the maintained filename/version, commit, browser/OS/device, input method, layout, field dimensions, and minimal steps. Attach a small project only when its contents are safe to share. Use [SECURITY.md](SECURITY.md) for security-sensitive reporting.

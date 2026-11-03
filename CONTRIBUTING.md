# Developer guide

GlyphPoint ships as one HTML document. The repository's Node package is a test harness; it is not an application build or an npm release.

## Setup and working copy

Clone the repository, inspect `git status`, and start a focused branch from the current accepted source. Read [AGENTS.md](AGENTS.md) and use [RAG.md](RAG.md) to locate the relevant functions. Edit `GlyphPoint-v1a-layout-fixed.html` directly. Do not edit the two historical HTML snapshots as routine maintenance.

Open the maintained HTML locally for interactive work. An optional server is:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8000/GlyphPoint-v1a-layout-fixed.html`. Use `py` instead of `python` when appropriate on Windows. Serving the root does not upload project files; binding to loopback avoids exposing this development server to the LAN.

## Checks

Use Node.js 22 or newer; CI selects Node 24.

| Command | Checks |
| --- | --- |
| `npm run check` | Parses the shipped inline script, detects duplicate static HTML IDs, checks runtime self-containment and local Markdown links/headings. |
| `npm test` | Runs deterministic editor/model regressions through Node's built-in test runner. |
| `npm ci` | Installs the exact development dependency versions from `package-lock.json`. |
| `npx playwright install chromium firefox` | Downloads the two browser builds matching the pinned Playwright version. |
| `npm run test:browser` | Runs real-browser workflows, downloads/reimports, malformed-input checks, and hostile HTML probes in both engines. |
| `node tests/browser.cjs firefox` | Runs just the Firefox browser suite while investigating a browser-specific defect. |

Linux hosts missing browser libraries can use `npx playwright install --with-deps chromium firefox`. This changes the host's development dependencies; it is unnecessary for ordinary users opening the application.

Playwright is pinned for reproducibility, not described as the newest available release. Upgrade it deliberately, regenerate the lockfile, install its matching browser builds, and qualify both suites. Keep development dependencies out of exported artwork and the standalone app.

## What the tests establish

[tests/helper.cjs](tests/helper.cjs) extracts and executes the application's actual inline JavaScript in a Node VM, omitting startup and stubbing browser rendering. It exercises data operations quickly but does not model browser layout, focus, permissions, or pointer capture. [tests/editor.test.cjs](tests/editor.test.cjs) contains the editing regressions; [tests/files.test.cjs](tests/files.test.cjs) covers schema normalization, byte budgets, text parsing, file transactions, and export escaping.

[tests/browser.cjs](tests/browser.cjs) launches the real standalone HTML with Playwright. Each scenario starts a fresh browser context. HTTP(S) attempts are recorded and blocked; an unexpected request fails the scenario. Downloads are read back as files. Browser JavaScript errors fail scenarios. The browser suite supplements model tests instead of duplicating their implementation.

A test can be run against an absolute alternate app path through `GLYPHPOINT_APP`. For example, extract a historical commit's maintained file to a scratch directory, then set that environment variable when reproducing a regression. Do not make a historical copy the default runtime.

## State and edits

`state` is an in-memory document/editor model. `captureDocument`, `snapshot`, `restore`, `undo`, and `redo` own history. Use one snapshot before a compound mutation, validate prospective state before that snapshot, and mark a successful edit dirty. Palette entries affect all uses of a glyph and are document content. Clipboard contents, open dialogs, zoom, and interface choices are session/preferences concerns.

`rebuildGrid` reconstructs one DOM span per cell, recounts glyph usage, and resynchronizes rendering and zoom. Localized edits use `setCell`. Do not bypass `setCell` for individual edits without also updating counts, palette membership, rendering, and dirty state. Bulk document installation and transformations may replace cell arrays and then rebuild.

Free-form selection masks are authoritative. Their bounding rectangles provide dimensions, not permission to edit the cells outside the mask. Clip selection state after operations that cross the field boundary. Snapshot contents must be independent copies rather than references to mutable live cells or palette entries.

## Import/export contracts

The detailed schema is in [docs/project-format.md](docs/project-format.md). Imports prepare and validate a candidate before installation. Preserve that transaction boundary. Browser file reads and clipboard permissions are asynchronous; guard against a newer import, New, or another document edit arriving while a read is pending.

Imported HTML remains inside template contents. Never add imported nodes, scripts, event handlers, stylesheets, or resource URLs to the live DOM. The supported external HTML path copies text and a small style allowlist. Native HTML export embeds inert, escaped project JSON for full editable round trips. A change to exported HTML must be tested by opening the download and importing it back.

## Documentation and review

Update affected user instructions and RAG entries in the same change. Use stable function names as source anchors rather than fragile line numbers. Distinguish actual functionality from limitations: there is no canvas autosave, layer model, image import, ANSI escape-sequence export, or guaranteed grapheme/emoji shaping.

The [Quality workflow](.github/workflows/quality.yml) runs on pull requests and pushes to `main`. Its two jobs have finite timeouts and per-ref concurrency cancellation. Inspect the exact commit's result before integration. Avoid rerunning successful checks unless a concrete remaining risk or changed source warrants it.

For bug reports include the maintained filename, commit, browser/version, operating system, interface mode, field dimensions, and minimal steps. A small saved project is useful when it contains no private material. Security-related reporting guidance is in [SECURITY.md](SECURITY.md).

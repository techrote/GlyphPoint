# GlyphPoint

**An offline Unicode drawing editor with local recovery, individual cell colours, and a Canvas 2D workspace.** Draw with characters, compose text, arrange selections, and share editable projects or fixed images. One downloaded HTML file includes the editor and its default font; no account, server, or runtime package installation is required.

The current development version is **2.0.0-rc.1**, using the **v3 project format**. The maintained filename remains **[GlyphPoint-RC.html](GlyphPoint-RC.html)** so existing links keep working. Release preparation and platform qualification are documented separately; this version label does not mean a release has been published or every CI combination has passed.

## Start here

1. Choose **Code → Download ZIP** in GitHub and extract it, or download the maintained HTML file using **Download raw file**.
2. Open `GlyphPoint-RC.html` in a current browser. GitHub's source viewer does not run the editor.
3. Choose a palette glyph, select Pencil, and draw. Use the secondary mouse button or **Use secondary glyph** for the other glyph slot. **Focus field** enables keyboard editing, and **Pan field** lets a touch/pointer drag scroll without painting.
4. Watch the recovery status after an edit. **Recovery saved** confirms a local checkpoint; **Recovery** lets you explicitly restore one after reloading.
5. Choose **File → Save project** for a portable editing copy. Supported browsers offer a native file destination; other browsers request a download. **Download project JSON…** always requests a downloadable copy. Keep and verify the file.

For an optional consistent localhost origin, run `python3 -m http.server 8000 --bind 127.0.0.1` in the repository and open [the editor on localhost](http://127.0.0.1:8000/GlyphPoint-RC.html). On Windows, use `py -m http.server 8000 --bind 127.0.0.1`. The server serves the editor; it does not receive your artwork.

Follow the [new-user guide](docs/new-user-guide.md) for a worked first drawing, saving, and recovery exercise. The [manual](docs/manual.md) describes all controls and their interactions.

## What you can do

| Area | Capabilities |
| --- | --- |
| Draw | Pencil, flood fill, eraser, text, glyph picker, magnifier, circular/square/ratio brushes, and twelve line/shape choices. |
| Colour | Palette defaults plus independent foreground/background overrides per cell. Identical glyphs can use different colours; even a space can carry a painted background. |
| Unicode | One extended grapheme per cell, including combining sequences and joined emoji, up to 32 Unicode code points. |
| Arrange | Rectangular/free-form selection, move, copy, cut, paste, clear, crop, rotate, and mirror while retaining cell styling. |
| Control edges | Expand to fit, reject overflow, or explicitly clip selected placement/transform operations. Resize/Skew has its own edge choice and samples backward into the source. |
| Keep work | Automatic browser-local checkpoints; native direct Save/Save As where available; explicit JSON downloads everywhere. |
| Share | v3 JSON projects, reusable palette files, text, standalone HTML with embedded project data/font, whole-field PNG, and full-field printing. |
| Navigate | Ribbon/classic layouts, zoom, rulers, grid guides, square cells, keyboard grid editing, readable text/copy-all, and touch pan/secondary controls. |
| Handle larger fields | Viewport-based Canvas rendering with bounded frame work. Fill and Resize/Skew use cancellable worker jobs, with a cooperative fallback. |

New artwork uses embedded **DejaVu Sans Mono** regular, bold, oblique, and bold-oblique faces. Other chosen fonts and glyphs outside its coverage can use platform fallback. **PNG** preserves the rendered pixels when the receiving device's fonts must not affect the image. The [font notices](THIRD_PARTY_NOTICES.md) and [font provenance manifest](assets/fonts/manifest.json) accompany the bundled assets.

## Saving and recovery

Recovery keeps the latest checkpoint for each tab/document session in this browser's storage: up to **12 entries**, **32 MiB of stored payloads in total**, and **16 MiB per entry**. Large repetitive canvases use lossless run-length encoding in the recovery archive; highly detailed projects can still exceed that archive budget and require a separate saved JSON file. It normally schedules after 750 ms without another edit, or within five seconds during continuous editing. Old entries can be evicted; clearing site data, changing browser/profile/address, private browsing, or storage errors can affect availability. Restore a checkpoint explicitly through **Recovery** and retain JSON files for portable copies.

A direct Save clears the unsaved marker only after a successful file write of the current revision. A download request leaves the marker in place because the editor cannot verify that the file was kept. The first direct Save chooses a destination; opening a project does not silently authorize overwriting its source file. Recovery is separate from file saving and does not retain session Undo history.

## Documentation

| Document | Purpose |
| --- | --- |
| [New-user guide](docs/new-user-guide.md) | First launch, drawing, cell colours, keyboard/touch use, saving, and recovery. |
| [Instruction manual](docs/manual.md) | Every control, workflow, interchange format, shortcut, and material limit. |
| [Project format reference](docs/project-format.md) | v3 schema, legacy migration, grapheme/colour contracts, and HTML interchange. |
| [Agent/RAG reference](RAG.md) | Searchable source map, invariants, state transitions, and task routing. |
| [Agent instructions](AGENTS.md) | Working and verification rules for this repository. |
| [Contributor guide](CONTRIBUTING.md) | Source modules, deterministic build, tests, CI, and package preparation. |
| [Original quality audit](docs/quality-audit-2026-11-03.md) | Historical audit evidence and the first maintenance repairs. |
| [Implementation follow-up](docs/quality-followup-2026-11-03.md) | Follow-up solutions, validation evidence, and remaining limitations. |
| [Platform qualification](docs/platform-qualification.md) | Automated coverage, planned combinations, and physical-device/accessibility evidence boundaries. |
| [Security and data handling](SECURITY.md) | Storage, import/export trust boundaries, resource budgets, and reporting. |
| [Release process](docs/release-process.md) | Candidate packaging, checksums, qualification gate, and draft-release workflow. |
| [License decision](docs/license-decision.md) | The owner's outstanding project-license choice and release implications. |
| [Change log](CHANGELOG.md) | Current candidate changes and historical maintenance entries. |

## Files, limits, and compatibility

| Path | Role |
| --- | --- |
| `GlyphPoint-RC.html` | **Canonical**, generated, self-contained application. End users open this file. |
| `GlyphPoint-v1a-layout-fixed.html` | Lightweight compatibility launcher redirecting to `GlyphPoint-RC.html`; it is **not** a second maintained editor. |
| `src/` | Editable HTML template and runtime modules assembled into the maintained application. |
| `assets/fonts/` | Embedded font CSS, provenance/hashes, and independent font license notice. |
| `GlyphPoint-v1a.html`, `GlyphPoint-v04a.html` | Historical snapshots; current fixes and v3 features do not apply to them. |

Fields allow **1–4,096 cells per axis** and **1,048,576 cells overall** (for example 1024×1024 or 4096×256, not 4096×4096). The earlier 65,536-cell limit belonged to the original dense/DOM implementation. Palettes allow **4,096 entries including reserved space**. Project JSON imports are limited to **256 MiB**; palette, text, and HTML imports remain limited to **16 MiB**; foreign HTML has additional node/style complexity budgets. These limits bound work and allocation; they do not promise identical performance on every device.

The writer produces `glyphpoint-v3`. Legacy v1/v2 projects are migrated to retain their original palette-based appearance. New grapheme and individual-colour features require the maintained editor. Glyph storage support does not guarantee font coverage or identical emoji rendering. Foreign HTML imports a bounded safe CSS subset rather than arbitrary page layout or active content.

## Development

End users need no build step. Developers edit the files in `src/`, then rebuild the committed standalone HTML. Use Node.js 22 or newer; CI is configured for Node 24.

```sh
npm run build
npm run check
npm test
npm ci
npx playwright install chromium firefox webkit
npm run test:browser -- chromium firefox webkit
npm run release:package
```

Build, source checks, model tests, and packaging use Node's standard library. Browser tests use the pinned Playwright development dependency. `npm run test:browser` defaults to Chromium and Firefox; pass one or more explicit engine names to select a subset. Linux systems missing browser libraries can install them with `npx playwright install --with-deps chromium firefox webkit`.

The [Quality workflow](.github/workflows/quality.yml) defines two job blocks that expand into **four jobs**: source/docs/model/package checks, the full Linux three-engine suites, Windows Chromium smoke tests, and macOS WebKit smoke tests. The browser runner includes editor, renderer, recovery, and HTML-interchange coverage in full mode. These are configured qualification gates; check the exact commit's results and the [qualification record](docs/platform-qualification.md) for completed evidence. Automated OS/browser runs and emulated touch do not establish physical-device or screen-reader conformance.

`npm run release:package` creates a ZIP, SHA-256 checksum, and per-file/source manifest in `dist/`. It packages the current tree without publishing. The separate [draft-release workflow](.github/workflows/release.yml) is manually dispatched on `main` and requires an owner-selected root `LICENSE` plus successful Quality results for that exact main commit. See the [release process](docs/release-process.md).

## License status

The project-license choice remains **pending the repository owner's decision**; no project license is inferred or selected from third-party dependencies. The embedded DejaVu font has its own Bitstream Vera/DejaVu notice, which does not license GlyphPoint's application code. See [License decision](docs/license-decision.md), [third-party notices](THIRD_PARTY_NOTICES.md), and the [font license](assets/fonts/LICENSE-DejaVu.txt). Candidate packaging is available, while the draft-release workflow keeps the explicit license gate.

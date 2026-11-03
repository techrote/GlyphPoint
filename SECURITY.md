# Security and data handling

This document describes the maintained **`GlyphPoint-RC.html`** editor generated from `src/`. Earlier HTML snapshots are historical and do not include the current boundaries or fixes. Use the maintained build for artwork from other sources.

## Data location and external access

The maintained editor has no runtime package downloads, telemetry, account, upload endpoint, cloud synchronization, remote font dependency, or required service. The default DejaVu Sans Mono fonts are embedded. Source checks and browser scenarios inspect resource behaviour; relevant browser scenarios record and reject unexpected HTTP(S) requests. Hosting the file on a web server still involves that server's normal page requests and policies.

| Data or operation | Location and boundary |
| --- | --- |
| Live artwork and Undo/clipboard state | The running page's memory. Undo history and the internal clipboard are not stored in project files or checkpoints. |
| Automatic recovery | IndexedDB under the browser/profile/origin. Checkpoints contain serialized project content and metadata such as document name, dimensions, and timestamp. |
| Palette and interface preferences | Browser localStorage where available; these preferences are separate from artwork recovery. |
| Direct project Save | A file explicitly selected through the browser's writable-file picker. Its handle is remembered only for the current document session. |
| Download/export | Browser-managed JSON, palette, text, HTML, or PNG download. The application cannot confirm that the user retained it. |
| System clipboard | Optional browser clipboard API access, subject to browser permissions/context. Readable text offers manual selection/copy when that API is unavailable. |
| Printing | A locally rendered complete-field image passed to the browser print workflow. The chosen printer/PDF destination is controlled by the browser/user. |

Recovery is local, not encrypted by a separate GlyphPoint encryption layer, and not a cloud backup. Browser/site-data clearing, private browsing, origin changes, extensions, and access to the browser profile affect the surrounding trust boundary. Use portable project files when moving between devices or clearing storage. The editor does not send recovery records to a server.

## Bounded and transactional recovery

Edits schedule an automatic checkpoint after a 750 ms pause, with a five-second maximum scheduling interval during continuous editing. The archive retains the latest record for each unique tab/document session, bounded to **12 entries**, **32 MiB of serialized project payloads**, and **16 MiB per entry**. Large mostly repetitive fields use lossless run-length encoding in the local recovery archive; high-entropy fields can still exceed its budget. Outstanding serialized writes are also bounded rather than allowed to grow without limit while storage is stalled.

Archive replacement and any needed oldest-entry eviction share an IndexedDB transaction. Failed/quota-aborted writes do not delete previously stored checkpoints. Independent session/document identities and sequence checks prevent a stale write from silently replacing a newer checkpoint for that identity. Restored data is validated before installation. Recovery is selected explicitly; the application does not silently install an archived document at startup.

**Delete checkpoint** acts only on that archive entry and waits for this session's queued writes so that stale work does not immediately recreate it. A later edit can create a new checkpoint. Deleting another live tab's entry does not disable that tab's future edits. Recovery status reports unavailable, blocked, full, failed, or busy storage; there is no silent canvas fallback into localStorage. Lifecycle flushes are best effort, so an abrupt shutdown can stop an unfinished write.

## File writes and asynchronous edits

Opening a project does not grant silent permission to overwrite the source file. The first direct Save selects a destination; later Saves reuse that handle only for the current document session. New/Open resets it. Save serializes a coherent revision, writes it, closes the stream, and clears dirty state only if that same document/revision is still current. Cancellation and write/permission errors remain errors; a download request is not described as a verified save.

Fill and Resize/Skew calculate a candidate in a worker, or in yielding batches when workers are unavailable. Cancellation discards the candidate. A captured document revision prevents completed stale work from replacing a newer edit or another document. File import generations and external clipboard revision checks protect their equivalent asynchronous boundaries. PNG export takes a coherent document snapshot and excludes editor overlays.

## Imported data is untrusted

Project file readers enforce **256 MiB**; text/palette/HTML readers enforce **16 MiB** before parsing. Project normalization validates dimensions, exact cell counts, printable grapheme limits, fonts, six-digit colours, palette uniqueness/capacity, and relevant schema types. Field dimensions are at most 4,096 per axis with 1,048,576 cells overall. A failed candidate leaves the live document/history intact. Text validation uses streamed grapheme iteration so an oversized row can be rejected without allocating every segmented character first.

Legacy v1/v2 migration retains original palette-based appearance rather than activating old ignored cell overrides. v3 individual foreground/background values must pass the current colour validator. Reserved space remains available even when the palette reaches capacity.

### HTML and CSS

Imported HTML is parsed into **detached template contents that never enter the live document**. Native embedded project JSON is treated as data and passes the same project validator. Generic artwork import copies validated text, graphemes, and a safe style subset from `#art` or `pre`.

Embedded stylesheets are parsed in unattached CSSStyleSheet objects. Supported tag/class/ID/compound/descendant/direct-child selectors are matched within the inert tree; only supported colour/font/style/display values become cell data. Scripts, event handlers, image/iframe/object/media/SVG/MathML content, resource URLs, external stylesheets, and downloaded fonts are never installed or executed. CSS `@import`, conditional at-rules, unsupported selectors, variables, and unsupported visual effects are ignored with applicable warnings. An isolated one-pixel canvas normalizes safe browser colour syntax; imported nodes are not used as rendering elements.

The foreign-HTML parser also bounds source nodes, nesting depth, cumulative style text, rule/selector/declaration counts, and selector-matching work. Current defaults are **200,000 nodes**, **100 levels**, **131,072 style characters**, **512 CSS rules**, **2,048 selectors**, **8,192 declarations**, and **1,000,000 selector checks**, in addition to file/document budgets. These caps prevent silent unlimited traversal but do not guarantee identical latency on every device. HTML parsing and some serialization still run on the main thread.

### Exports

HTML export escapes visible glyph text, restricts font choices and CSS values, and escapes characters that could terminate its embedded JSON data block. Its Content Security Policy permits the generated inline styling and embedded `data:` font assets while denying external resources and executable scripts. The font notice travels with the exported font data. Editing the visible artwork alone does not override authoritative native embedded project JSON on reimport.

PNG contains raster pixels and no editable project metadata. JSON and native HTML retain full project content; inspect them before sharing if the artwork, palette labels, or text are private. Source/documentation checks and browser tests cover adversarial resource/script/font metadata, per-cell styles, full-field output, and round trips; a test suite is evidence for the exercised cases, not a general security certification.

## Candidate artifacts and release gates

The candidate packager uses Node standard libraries and emits a ZIP, SHA-256 checksum, and a manifest identifying the source commit, working-tree state, file sizes, and hashes. Local packaging includes tracked and non-ignored untracked repository files, so review the manifest before distributing a working-tree artifact. The [release process](docs/release-process.md) separates packaging from publication.

The manually dispatched draft-release workflow runs on `main` and checks for an owner-selected root `LICENSE` and successful Quality results for that exact commit before preparing a draft prerelease. A font/dependency notice does not select a license for the application. These checks establish a review gate; they do not claim artifact provenance beyond the recorded source and workflow, or automatically publish a release.

## Evidence limits

This is a targeted code/behaviour review, not a formal security certification. Browser/OS vulnerabilities, malicious extensions, altered editor copies, arbitrary future changes, every native permission dialog, and all denial-of-service cases are outside its evidence. The [platform qualification record](docs/platform-qualification.md) distinguishes configured CI scope from completed runs and physical-device/accessibility evidence.

The editor is intended for local/offline artwork workflows. Adding network services, collaboration, arbitrary CSS/fonts, plugins, stored scripts, or multi-tenant hosting changes its trust boundary and needs an explicit implementation/qualification plan. Do not apply this document to the historical snapshots.

## Reporting

For ordinary defects, use the repository's issue tracker with the maintained filename/version, commit, browser/OS/device, input method, and minimal reproduction. Avoid including private artwork, checkpoint data, clipboard contents, credentials, or sensitive files in a public issue.

For a security-sensitive report, use a private reporting option if the owner makes one available, or arrange a private channel with the owner before sharing exploit details. This repository does not invent a security contact or promise an unverified response deadline.

See the [original audit](docs/quality-audit-2026-11-03.md), [implementation follow-up](docs/quality-followup-2026-11-03.md), [format reference](docs/project-format.md), and [recovery/interchange source](src/) for the implementation and evidence boundaries.

# Security and data handling

This document describes the maintained **GlyphPoint-v1a-layout-fixed.html** application. The two earlier HTML snapshots are historical and do not include the current import/export repairs. Use the maintained file when opening artwork from others.

## Data stays in the browser

The maintained editor has no runtime packages, telemetry, cloud service, remote font, account, or upload path. Source inspection and the browser regression suite cover network behavior; the test suite records and rejects unexpected HTTP(S) requests. The application itself can be opened as a local file. Hosting it on an external server still involves that server's ordinary page-request logging and policies.

Artwork lives in memory. Palette choices and interface mode can be stored in browser `localStorage`. This is not a recovery copy of the canvas. Project/palette/text/HTML saves are browser downloads. Copy/paste uses a session clipboard and optionally the browser's system clipboard API; the browser controls permissions.

## Imported data is untrusted

File readers reject inputs larger than 16 MiB before parsing. Dimensions, cell counts, code points, fonts, colours, palette uniqueness/capacity, and relevant schema types are normalized before a document is installed. A failed file should leave the current document unchanged. Allocation limits reduce accidental exhaustion; they do not guarantee responsiveness for adversarial data or large inputs on every device.

HTML is parsed into **template contents that are never attached to the live DOM**. The importer copies only text and supported data/style values. Native exported HTML's embedded JSON is validated through the project reader. Imported scripts, event handlers, stylesheets, image URLs, frames, and object nodes are not installed or executed. The inert-template design follows the [HTML template specification](https://html.spec.whatwg.org/multipage/scripting.html#the-template-element).

HTML export escapes text, restricts fonts to fixed choices and CSS to validated values, and escapes characters that could end its embedded JSON data block. A generated Content Security Policy denies external resource loading and executable scripts while allowing its own inline CSS. The browser suite exercises malicious font metadata, script/event markup, and resource URLs. It also verifies that every glyph and supported style survives export/reimport.

## Limits of this review

This is a targeted code and behavior audit, not a formal security certification. Browser/OS vulnerabilities, malicious extensions, altered copies of the application, arbitrary future changes, all clipboard permission interactions, and all denial-of-service cases are outside its evidence. The historical snapshots retain their original weaknesses; a current security description must not be applied to them.

The editor is designed for local file workflows, not a hardened multi-tenant hosting environment. If adding network access, collaborative services, plugins, arbitrary fonts/CSS, richer HTML, or stored scripts, revisit the trust boundary and qualification plan before implementation.

## Reporting

For ordinary defects, use the repository's issue tracker with the maintained filename, commit, browser/OS, and minimal reproduction. Avoid including personal artwork, system clipboard contents, credentials, or sensitive files in a public issue. For a security-sensitive report, use a private reporting option if the repository owner makes one available, or arrange a private channel with the owner before sharing exploit details. This repository does not advertise an unverified contact address or promise a response deadline.

See [the quality audit](docs/quality-audit-2026-11-03.md) and [format reference](docs/project-format.md) for implementation-specific evidence and boundaries.

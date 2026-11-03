# Platform qualification and acceptance records

This document separates implemented workflows, automated evidence, and physical-device acceptance. It provides repeatable tests for the current v3 editor; a listed procedure is not a claim that somebody has executed it.

Use the [manual](manual.md) for control details, [format reference](project-format.md) for data contracts, and [Quality workflow](../.github/workflows/quality.yml) for the actual automated profiles. Test the maintained **GlyphPoint-v1a-layout-fixed.html** from the candidate being assessed.

## Evidence status

The initial record below was written during development of **2.0.0-rc.1 on 3 November 2026**. New source changes require new evidence. Hosted CI is **pending until the exact candidate commit has a successful linked run**; the presence of a workflow file does not prove it passed.

| Environment | Scope | Initial evidence status |
| --- | --- | --- |
| Local Linux / Chromium | Complete assembled editor plus renderer, recovery and interchange; offline files, touch emulation, pixels and download round trips | 40 scenarios passed after continuation review (17 editor, four renderer, five recovery, fourteen interchange); 93 Node regressions also passed. This is automated evidence, not physical acceptance. |
| Local Linux / WebKit | Browser launch | Blocked by missing host libraries in the development container; no pass claimed. |
| Hosted Linux / Chromium, Firefox, WebKit | Full configured editor/recovery/interchange browser suites | Configured; exact-candidate CI evidence must be recorded below. |
| Hosted Windows 2022 / Chromium | Automated editor smoke profile | Configured; exact-candidate CI evidence must be recorded below. |
| Hosted macOS 14 / WebKit | Automated editor smoke profile | Configured; exact-candidate CI evidence must be recorded below. |
| Physical Windows / keyboard, mouse, NVDA | Native file dialogs, actual browser/device behavior, assistive interaction | Not executed in this development environment. |
| Physical macOS / keyboard, trackpad, VoiceOver | Safari/native dialogs, actual focus/navigation, assistive interaction | Not executed in this development environment. |
| Physical iPhone/iPad / Safari, touch, VoiceOver | Portrait/landscape controls, software keyboard, file handling, assistive touch | Not executed in this development environment. |
| Physical Android / browser, touch, TalkBack | Touch controls, software keyboard, file handling, assistive touch | Not executed in this development environment. |

The CI browser profile has bounded concurrency and timeouts. Full and smoke results must retain their labels. Playwright WebKit is useful engine coverage; it does not itself certify Safari on a physical Apple device. Chromium touch-drag tests use protocol-injected touch events; Firefox/WebKit pan-handler tests use synthetic DOM PointerEvents because their Playwright interfaces lack equivalent touch-drag injection. Synthetic handler coverage must not be labelled a physical gesture or native pointer-capture pass. PNG tests enforce lossless encoding/decoding in every engine and exact viewport/export channel matching in Chromium/Firefox; the WebKit path compares independent Canvas2D glyph coverage using a one-pixel neighbourhood with a documented small antialiasing-edge allowance (at most 5% unmatched ink, minimum two pixels, and at most 15% total ink-area divergence) because text hinting may vary between contexts. Full flat backgrounds, individual colours, clipping, and grapheme payloads retain separate checks. Touch emulation does not establish finger/stylus behavior on hardware. Node/DOM assertions do not certify screen-reader output or WCAG conformance.

When updating this table, attach the exact source SHA, run URL, browser versions, and scope. Keep blocked, failed, not exercised, and unavailable capability outcomes separate from passes.

## Prepare a reproducible session

1. Extract the candidate to a new folder. Record its ZIP SHA-256, `RELEASE-MANIFEST.json` source commit and dirty-state flag, and application version. Prefer a clean committed candidate for acceptance; an uncommitted working build needs its complete file hashes.
2. Use a disposable test project and a clearly identified browser profile. Record OS/browser versions, device model, display scale, orientation, input hardware, and assistive software versions. Do not use irreplaceable artwork for interruption/deletion tests.
3. Open the actual running HTML, not GitHub's source viewer. Record whether the launch uses `file:`, localhost, or HTTPS. These can have different storage and permissions.
4. Test `file:` where the platform can run local HTML. If a mobile file manager opens a static preview instead of a running browser page, record that launch path as unsupported and test the unchanged HTML from a controlled HTTPS test origin separately. Do not treat a preview as a completed browser test.
5. Note whether Save As is enabled, whether recovery can write, and whether clipboard access prompts or fails. An absent optional browser API requires its documented fallback; do not mark the absent capability itself as passed.

For an existing desktop development checkout, the manual includes optional loopback serving instructions. A localhost address on one computer is not the same origin or machine as a phone. Do not expect checkpoints to transfer between browsers, profiles, URLs, or devices.

### Create the shared test artwork

Use **File → Properties** to start with a small field, such as 12 × 6. Paint `A` in several cells. Use **Cell colours → Apply to cells** to give one `A` a red foreground and a blue background while another inherits its palette/field colours. Add `é`, `👩🏽‍💻`, and `🇬🇧` through text entry. Each should occupy one cell in supported Unicode browsers; the emoji's actual shape may use platform fallback.

Add bold/italic/underline text, choose **Use embedded font for selection / field**, and include a free selection with at least one unselected hole. Keep a screenshot, a project JSON, and a plain-text export as comparison fixtures. A PNG checks rendered appearance; project JSON checks editable content.

## Core acceptance checklist

Run these steps on every physical platform being qualified. Record individual failures rather than averaging them into one pass.

| ID | Action | Expected result |
| --- | --- | --- |
| CORE-01 | Switch Ribbon/Classic; resize the window or rotate the device. Scroll the controls and artwork independently. | Actions remain reachable, dialog buttons remain visible, and artwork hit testing stays aligned. |
| CORE-02 | Draw slowly and quickly, then leave the field while dragging and release. | Connected strokes, no wrapped rows, and no stuck drawing after release/cancel. Undo reverses the gesture. |
| CORE-03 | Apply different local colours to identical glyphs, then change their palette colour and the field background. | Inheriting cells update; explicit foreground/background cells retain their overrides. |
| CORE-04 | Add the shared Unicode examples and compare JSON/text/HTML round trips. | Clusters remain intact and cell counts/styles match. Unsupported Unicode capability produces an explicit error. |
| CORE-05 | Paste/move/rotate a selected region beyond an edge using **Expand to fit**, **Reject overflow**, and **Clip overflow**. | Expand retains outlying placement within limits; Reject leaves content/history unchanged; Clip explicitly discards overflow and reports it. Undo restores the prior document. |
| CORE-06 | Resize/skew with an expanding shear, then an invalid or over-budget result. | Valid work completes coherently; invalid work leaves the original untouched. The UI reports progress or completion. |
| CORE-07 | Export PNG and native HTML; open them outside the editor and reimport the HTML. | PNG covers the complete field without editor overlays. HTML shows colours/styles and reimports editable v3 data. No external assets are required. |
| CORE-08 | Use Print and inspect preview; print a test page if physical printing is in scope. | Artwork is present and legible at the selected page scale. Record preview-only and physical-paper results separately. |
| CORE-09 | After loading the editor, disconnect networking and edit/export. | Editing and locally generated outputs continue without requests to external services. A network-hosted page may still need connectivity for a fresh load. |

If a long operation completes before Cancel can be activated, record ordinary completion as tested and cancellation as **not exercised physically**. Automated cancellation/race regressions remain separate evidence. Do not slow or disable browser security controls to obtain a passing result.

## Persistence, files, and failure handling

1. Make a visible edit and wait for **Recovery saved**. Reload, accept the browser's unsaved-content prompt if shown, and choose the matching checkpoint through **Recovery → Recover**. Compare dimensions, graphemes, palette, independent colours, and styles. Startup should offer available entries without silently replacing the new field.
2. Open two tabs at the same URL/path and profile. Give their documents distinct names/content, edit both, and wait for both checkpoints. Verify both entries remain independently recoverable. Different origins/profiles are a separate isolation test, not a failed same-archive test.
3. Delete a checkpoint deliberately. Verify the listed entry disappears. For the current document, it should stay deleted until another edit; then a new checkpoint can appear. Another active tab can write again after its own next edit.
4. When direct saving is available, choose a disposable destination through **Save project**, edit, and save again. Reopen the resulting file and compare content. Cancel Save As once and verify no success message or clean-state change is claimed.
5. Save As to a second filename, undo an earlier content edit, and save. The editor must not silently retain a conflicting destination after its displayed filename is restored. Also open a second project with the same basename from another directory, undo across that document boundary, and verify a new destination choice is required.
6. Use **Download project** regardless of direct-save availability. Confirm the JSON exists through the platform's download/file interface and reopen it. The editor should say download requested and retain the unsaved marker; it cannot certify that a user kept the file.
7. Test clipboard permission refusal where available. Internal copy/paste must remain usable; copying from **Readable text / copy all** should offer selected text for a native Copy operation when programmatic access fails. For external-paste testing, start a fresh page so a retained internal clipboard does not take priority.
8. In an isolated test profile/context, observe storage-unavailable, denied file permission, or private-session behavior where the platform allows such a test. Errors must remain visible; an unsuccessful checkpoint/file write must not be described as saved. Do not assume every private window disables IndexedDB. Record the capability actually observed.

A committed checkpoint is local protection, not an external backup. Abrupt termination before a timer/transaction finishes may lose the last edits. Do not claim crash-proof saving from one successful reload. Recovery/archive quota failure paths also have dedicated automated tests; physical quota exhaustion should only be tested against disposable data.

## Windows keyboard, mouse, and NVDA

Use the installed desktop browser and record its exact version. Run the core and persistence checks with a mouse, then disconnect or avoid the mouse for the keyboard pass below. Check both ordinary and increased display scaling, and inspect native Save/Open dialogs and download naming.

Start NVDA in the normal configured environment and record browser/NVDA versions plus the navigation mode used. Test the grid in the mode that sends editing keys to the application; separately test document/browse navigation. Verify the announced control names, grid/cell information, selection changes, recovery status, and modal dialog boundaries. Reaching an HTML element in an accessibility tree is insufficient if the actual announcement or operation is unusable.

If testing multiple Windows browsers, record each separately. A direct-file API available in one does not imply that another should expose the same native picker; its download fallback still needs a complete reopen check.

## macOS keyboard, trackpad, and VoiceOver

Run the core and persistence checks in Safari, recording the browser/macOS versions and the system/browser keyboard-navigation settings. Use Command for application modifier shortcuts. Verify that trackpad scrolling/panning does not unexpectedly paint and that zoom/scroll changes preserve hit testing.

Repeat the keyboard pass with VoiceOver enabled. Record whether the grid's active cell, coordinates, glyph/label, colours, and selection state are announced while operating it. Verify that **Tab** can leave the field, a modal can be closed, and focus is understandable after returning. Check **Readable text / copy all** as the full-document reading route. Native dialog acceptance, file permission denial/cancellation, and printed output remain separate cases from Playwright WebKit coverage.

## iPhone/iPad touch, keyboard, and VoiceOver

Run in both portrait and landscape, using the actual browser launch path recorded above. Tap small and large controls, scroll any overflow, and open/close dialogs with the software keyboard visible. The final action buttons must remain reachable when the viewport shrinks.

Use **Pan field** to move around artwork without drawing. Turn it off and draw continuous strokes. Use **Use secondary glyph** to access the secondary slot without a right mouse button. Change **Cell colours**, choose **Use for next strokes**, draw, then use **Apply to cells** on a selection. Verify the toggle states and resulting content are understandable without hover.

Enter the shared combining/emoji examples with the software keyboard and a paste operation; verify each round trip. Inspect the platform's download/share/file-picker flow and reopen the actual JSON. If a hardware keyboard or stylus is tested, record it as additional hardware evidence rather than assuming finger results cover it.

With VoiceOver enabled, verify control discovery and activation, dialog navigation, recovery status, and readable text. Record whether direct grid navigation is usable with assistive gestures and/or a hardware keyboard. A successful readable-text route does not automatically establish full gesture-based canvas editing.

## Android touch, keyboard, and TalkBack

Record the device, Android version, browser version, and keyboard application. Repeat portrait/landscape, software-keyboard resizing, Pan/Secondary toggles, cell-colour entry, stroke continuity, and JSON download/reopen checks. Test browser Back while a dialog is open and after returning from a native file picker; record whether the browser navigates away, closes a native surface, or leaves the editor usable.

With TalkBack enabled, test discoverable control names, state announcements, modal navigation, and the readable-text route. If an external keyboard or stylus is used, add separate results. Observe pointer cancellation when the browser/OS interrupts a gesture; the editor must not continue painting after the interruption ends.

## Keyboard-only and assistive acceptance pass

| ID | Operation | Acceptance condition |
| --- | --- | --- |
| KEY-01 | Tab through controls, activate **Focus field**, then Tab away. | Visible focus and no keyboard trap. A user can reach both field and controls. |
| KEY-02 | Arrows, Home/End, modifier+Home/End, Page Up/Down. | Correct cell movement, visible cursor, scrolling to keep it in view, understandable coordinates. |
| KEY-03 | Shift+arrows; release Shift; move again; begin another selection. | Selection anchor/state is correct, including after Escape, New/Open, and Undo. |
| KEY-04 | Space / Shift+Space, Use secondary glyph, Delete/Backspace. | Selected tool uses the expected slot; deletion affects the selection or focused cell; Undo restores content. |
| KEY-05 | Enter text, type a multi-code-point grapheme, apply, then edit a normal input. | Grid text entry works; input editing and IME composition keep native behavior. |
| KEY-06 | Modifier+A/C/X/V/Z/Shift+Z/Y/S inside the grid and inside text inputs. | Grid shortcuts work in the field; ordinary input shortcuts are not hijacked. |
| KEY-07 | Open Cell colours, Recovery, Properties, and Readable text using the keyboard. | Names/labels, required controls, error/status text, closing, and return focus are usable. |
| KEY-08 | Focus a palette glyph, move Left/Right, choose primary with Enter and secondary with Shift+Enter, then Tab out. | Focus remains visible; adjacent glyphs are reachable without a trap. Record macOS Safari Full Keyboard Access/Tab-to-button settings separately. |
| AT-01 | Read the focused grid cell and move to a selected or styled cell. | Role, row/column, glyph or label, foreground/background, and selection information are meaningful. |
| AT-02 | Read/copy/export the complete document through Readable text. | Every row is available in a native text control without thousands of DOM cells. |
| AT-03 | Trigger recovery pending/saved/error and long-operation completion/cancellation. | Status changes are available without relying solely on colour, transient animation, or a tooltip. |
| VIS-01 | Increase browser zoom/text size and test available high-contrast settings. | Controls, focus indicators, dialogs, status, and artwork remain usable; document specific failures. |

An acceptance record should identify the tested assistive application and configuration. Do not replace those results with a generic “accessible” or “WCAG compliant” label.

## Result record template

Copy this template for one source/platform/browser combination. Link supporting evidence rather than overwriting another environment's results.

```text
Record ID / date / tester:
Candidate version:
Source commit / workingTreeDirty:
ZIP SHA-256 / application-file SHA-256:
Exact CI run URL and tested scope, if applicable:
Device model / CPU / RAM:
OS version / browser version:
Display scale / browser zoom / orientation:
Input: keyboard / mouse / touch / stylus / trackpad:
Assistive software version and navigation settings:
Launch: file / localhost / HTTPS (avoid private path details):
Browser profile: normal / private / managed; relevant permissions:
Observed capabilities: IndexedDB / direct save / clipboard / fullscreen:

Case ID | Pass / Fail / Blocked / Not exercised / Unavailable | Notes
CORE-01 |
...
KEY-01 |
...
AT-01 |
...

Native save/download/reopen result:
Recovery reload / two-tab / deletion result:
Print: preview only / physical paper / not tested:
Expected versus actual failure behavior:
Screenshots / short recording / sanitized sample project:
Browser console error text, if any:
Open issue links and exact reproduction steps:
Scope accepted / scope still unqualified:
```

## Report and triage a failure

Start from the smallest disposable project that reproduces the problem. Record the case ID, source SHA, launch scheme, device/browser, input/assistive settings, numbered actions, expected result, and actual result. Attach a sanitized JSON project and screenshot or short recording where they clarify the mismatch. Include console errors as text when available; avoid private file paths or unrelated browser/account information.

Distinguish data loss or writing to the wrong destination, a blocked essential workflow, a rendering/interaction defect, and a cosmetic issue. A missing optional browser capability should be reported with its fallback result. Link the failing record to its repair and rerun the affected case on the same environment before changing its status to Pass. Retain the original failed evidence and the passing source identity.

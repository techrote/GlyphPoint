Security Review Report: GlyphPoint-v04a.html
Executive Summary

A review was performed on GlyphPoint-v04a.html with a primary focus on determining whether user data, artwork, imported files, or application state could be transmitted to external internet services.

Conclusion: No evidence was found of any intentional outbound network communication, telemetry, analytics, cloud integration, or data exfiltration functionality. The application appears to operate entirely within the browser and uses local browser storage only for user preferences.

Overall Risk of Information Leakage to the Internet: Low / Very Low.

Scope of Review

The following areas were examined:

JavaScript network communication functions
File import/export functionality
Browser storage mechanisms
Clipboard access
HTML parsing and rendering
Third-party dependencies and external resources
Potential data leakage paths

All code reviewed was contained within a single self-contained HTML file.

Key Findings
1. No Outbound Network Communications Identified

No use was identified of:

fetch()
XMLHttpRequest
WebSocket
EventSource
navigator.sendBeacon
External scripts
External stylesheets
Remote image resources
Analytics or telemetry libraries

The application contains no obvious mechanism for transmitting user data to external systems.

2. Local Storage Usage Only

The application stores user preferences in browser localStorage, including:

Glyph palette configuration
Primary and secondary glyph selection
UI mode preferences

Application artwork and project contents are not automatically stored in local storage.

3. File Handling is Local

The application supports:

Opening local JSON files
Opening local text files
Opening local HTML files
Exporting JSON, text, and HTML

All file operations are performed locally within the browser using browser file APIs. No upload functionality was identified.

4. Clipboard Access Present

The application uses:

navigator.clipboard.readText()
navigator.clipboard.writeText()

to support copy and paste operations. Clipboard contents can therefore be accessed by the application when the user performs a paste operation. No subsequent network transmission path was identified.

5. HTML Import Appears Safe

Imported HTML files are parsed using:

new DOMParser().parseFromString(...)


The imported content is processed as data and is not inserted directly into the active document. This significantly reduces the likelihood of script execution from imported files.

6. Exported HTML is Escaped

Exported artwork is sanitised through an HTML escaping function before being written to generated HTML files. This prevents artwork content from becoming executable HTML or JavaScript when exported.

Residual Risks
Low Risk

Clipboard Exposure

Clipboard contents may be read when the user pastes data into the application.
No transmission mechanism was identified.

Local Storage Persistence

User preferences remain within the browser profile.
Another user of the same browser profile could potentially view those settings.
Low-Medium Risk

HTML Import Behaviour

While the imported HTML is parsed safely, it would be prudent to test whether target browsers attempt to fetch external resources referenced within imported HTML documents.
No evidence of such behaviour was found in the code review itself.

Large File Handling

Limited validation exists on imported file size and complexity.
Maliciously large files could potentially affect browser performance.
Recommendations
Add a restrictive Content Security Policy (CSP).
Impose maximum import file sizes.
Optionally validate imported HTML for external resource references.
Document explicitly that the application is intended to operate offline and performs no network communications.
Final Assessment

Based on the supplied source code, GlyphPoint-v04a.html appears to be a standalone browser-based application with no identifiable capability to transmit user data, artwork, imported files, or application state to the internet. The remaining risks are limited to standard local-browser concerns such as clipboard access, local storage persistence, and robustness against malformed input files.

Assessment: Suitable for use in environments where prevention of internet data leakage is a primary security requirement, subject to normal browser and hosting-environment controls.

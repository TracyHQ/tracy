/**
 * Locating a real structural boundary in an HTML document, by source offset.
 *
 * Both preview transports splice text into an artifact's own bytes: the daemon
 * injects URL-preview bridges into the file it serves, and `buildSrcdoc`
 * injects the srcDoc bridges. Neither re-serializes the document — the author's
 * bytes have to survive — so each needs the *offset* of a boundary rather than
 * a parsed tree.
 *
 * Finding that offset with a plain text match is what broke
 * nexu-io/open-design#7410. The tags these injectors look for are also
 * perfectly ordinary content: a prototype that builds an HTML document (a print
 * window, an email template, a `srcdoc` payload) writes `<body>` into a script
 * string or onto a `data-` attribute. Splicing there puts the injected
 * `</script>` inside the author's script, which ends it early and renders the
 * remainder as page text — or closes their attribute early, since injected
 * bridges carry quotes. Either way the page breaks with no console error.
 *
 * This module is the single source of truth for that lookup. It lives in
 * contracts because the bug's root cause was two copies of the same logic
 * drifting apart: the srcDoc path anchored on the real `</body>` while the
 * daemon copy still matched the first one in the text.
 *
 * Pure string scanning — no DOM, no parser dependency — so it behaves
 * identically in the daemon, in the browser, and under test.
 */
/**
 * Elements whose content the HTML parser reads as character data, not markup.
 * A tag written inside one of these is text the author chose to store, not a
 * structural boundary of this document.
 *
 * `noscript` is included because every preview surface runs with scripting
 * enabled, which is what puts it in the raw-text set. `plaintext` runs to end
 * of input; having no close tag, it correctly reports "no boundary left".
 */
export declare const HTML_RAW_TEXT_ELEMENTS: readonly ["script", "style", "textarea", "title", "iframe", "noembed", "noframes", "noscript", "plaintext", "xmp"];
/** Offset of the `>` that closes the tag whose name ends at `from`, or -1. */
export declare function endOfTag(html: string, from: number): number;
export declare function findRawTextClose(lowerHtml: string, tagName: string, from: number): number;
export declare function findRealTagOffset(html: string, pattern: RegExp): number;
export declare function prependAfterDoctype(html: string, payload: string): string;
/**
 * Offset just past the `>` of the first real `pattern` match — the insertion
 * point for content that belongs immediately inside that tag. -1 when the
 * document has no such tag.
 */
export declare function findRealTagEnd(html: string, pattern: RegExp): number;
/**
 * Source range of the first real `<tag …>…</tag>` pair, or null.
 *
 * Both ends are located structurally: the open tag ends at `endOfTag`, so a `>`
 * inside a quoted attribute cannot cut it short, and the close is only accepted
 * when the name is followed by whitespace, `/`, or `>` — `</title-page>` inside
 * a title, or `</title>` sitting in an attribute value, is content.
 */
export declare function findRealElementRange(html: string, pattern: RegExp, tagName: string): {
    start: number;
    contentStart: number;
    contentEnd: number;
    end: number;
} | null;
/** Tag-name-bounded patterns for the boundaries preview injection cares about. */
export declare const HTML_TAG_PATTERNS: {
    readonly htmlOpen: RegExp;
    readonly headOpen: RegExp;
    readonly headClose: RegExp;
    readonly bodyOpen: RegExp;
    readonly bodyClose: RegExp;
    readonly baseOpen: RegExp;
    readonly titleOpen: RegExp;
};

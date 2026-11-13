<?php
/**
 * Empty places of HTML values, for the blank site production step (ticket #584, `blank-site-empty-fields.mjs`).
 *
 * Reads JSON `[{"html": "...", "xpaths": ["/html/body/div/h2", "/html/body/div/a[1]/@href", ...]}, ...]` on stdin and
 * writes JSON `[{"html": "..."} | {"error": "..."}, ...]`. The HTML is loaded the way the Claude Cowork plugin's
 * content slots load it (`unit-markup.php`: a synthetic `/html/body/div` root), so the xpaths of the content map and
 * of the mapping file resolve to the same node. Each xpath must name exactly one node:
 *   an attribute         its value becomes empty (`href=""`);
 *   a text node          its words go, its own white space stays (one space when it had none), see blankText();
 *   the root div         the whole value becomes empty;
 *   any other element    it keeps its tag and attributes and loses its children (`<h2 class="x"></h2>`).
 * Every node is found before anything changes, so one xpath never shifts another. The result is the root div's
 * children serialized again; a value no xpath names is not passed here.
 *
 * A JA ACM block stores its HTML in the marker notation the content map also uses (`((div class="x"))...((/div))`,
 * no angle bracket): such a value is read as the HTML its markers stand for and written back in markers.
 *
 * Required by another script (a test that writes through the plugin), it only defines its functions.
 */

/** Whether a stored value is in the marker notation. */
function isMarked(string $html): bool
{
    return strpos($html, '<') === false && strpos($html, '((') !== false;
}

/** The HTML the markers of a value stand for. */
function fromMarkers(string $html): string
{
    return preg_replace('/\(\((\/?[a-zA-Z][^()]*?)\)\)/', '<$1>', $html);
}

/** HTML written back in markers. */
function toMarkers(string $html): string
{
    return preg_replace('/<(\/?[a-zA-Z][^<>]*?)>/', '(($1))', $html);
}

function emptied(string $html, array $xpaths): array
{
    $marked = isMarked($html);
    $result = emptiedHtml($marked ? fromMarkers($html) : $html, $xpaths);
    if ($marked && isset($result['html'])) {
        $result['html'] = toMarkers($result['html']);
    }
    return $result;
}

/**
 * What an emptied text node holds: its own leading and trailing white space, or one space when it had none. An empty
 * text node is not written out, so `p/text()`, or `text()[2]` after a `<span>`, would name no node once the value is
 * saved, and the writer (the Claude Cowork plugin's `ContentSlots::htmlPatch`, which sets the text node an xpath
 * names) would have nothing to write into. White space draws nothing, keeps the node, and keeps every sibling index.
 */
function blankText(string $text): string
{
    if (trim($text) === '') {
        return $text === '' ? ' ' : $text;
    }
    preg_match('/^\s*/u', $text, $lead);
    preg_match('/\s*$/u', $text, $trail);
    $blank = $lead[0] . $trail[0];
    return $blank === '' ? ' ' : $blank;
}

function emptiedHtml(string $html, array $xpaths): array
{
    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="utf-8"?><html><body><div>' . $html . '</div></body></html>');
    libxml_clear_errors();
    $finder = new DOMXPath($dom);
    $root = $finder->query('/html/body/div')->item(0);
    $nodes = [];
    foreach ($xpaths as $xpath) {
        $found = @$finder->query($xpath);
        if ($found === false || $found->length !== 1) {
            return ['error' => "{$xpath} names " . ($found === false ? 'no valid path' : "{$found->length} nodes")];
        }
        $nodes[] = $found->item(0);
    }
    foreach ($nodes as $node) {
        if ($node === $root) {
            return ['html' => ''];
        }
        if ($node instanceof DOMAttr) {
            $node->nodeValue = '';
        } elseif ($node instanceof DOMText) {
            $node->nodeValue = blankText($node->data);
        } elseif ($node instanceof DOMElement) {
            while ($node->firstChild) {
                $node->removeChild($node->firstChild);
            }
        } else {
            return ['error' => 'an xpath names a node that is neither an element, a text nor an attribute'];
        }
    }
    $out = '';
    foreach ($root->childNodes as $child) {
        $out .= $dom->saveHTML($child);
    }
    return ['html' => $out];
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') !== __FILE__) {
    return;
}
$entries = json_decode(stream_get_contents(STDIN), true);
if (!is_array($entries)) {
    fwrite(STDERR, "empty-html-places.php: stdin is not a JSON list\n");
    exit(2);
}
$out = [];
foreach ($entries as $entry) {
    $out[] = is_array($entry) && is_string($entry['html'] ?? null) && is_array($entry['xpaths'] ?? null)
        ? emptied($entry['html'], $entry['xpaths'])
        : ['error' => 'an entry is {html, xpaths}'];
}
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

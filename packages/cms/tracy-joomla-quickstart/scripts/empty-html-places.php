<?php
/**
 * Empty places of HTML values, for the blank site production step (ticket #584, `blank-site-empty-fields.mjs`).
 *
 * Reads JSON `[{"html": "...", "xpaths": ["/html/body/div/h2", "/html/body/div/a[1]/@href", ...]}, ...]` on stdin and
 * writes JSON `[{"html": "..."} | {"error": "..."}, ...]`. The HTML is loaded the way the Claude Cowork plugin's
 * content slots load it (`unit-markup.php`: a synthetic `/html/body/div` root), so the xpaths of the content map and
 * of the mapping file resolve to the same node. Each xpath must name exactly one node:
 *   an attribute         its value becomes empty (`href=""`);
 *   a text node          its text becomes empty;
 *   the root div         the whole value becomes empty;
 *   any other element    it keeps its tag and attributes and loses its children (`<h2 class="x"></h2>`).
 * Every node is found before anything changes, so one xpath never shifts another. The result is the root div's
 * children serialized again; a value no xpath names is not passed here.
 *
 * A JA ACM block stores its HTML in the marker notation the content map also uses (`((div class="x"))...((/div))`,
 * no angle bracket): such a value is read as the HTML its markers stand for and written back in markers.
 */

function emptied(string $html, array $xpaths): array
{
    $marked = strpos($html, '<') === false && strpos($html, '((') !== false;
    if ($marked) {
        $html = preg_replace('/\(\((\/?[a-zA-Z][^()]*?)\)\)/', '<$1>', $html);
    }
    $result = emptiedHtml($html, $xpaths);
    if ($marked && isset($result['html'])) {
        $result['html'] = preg_replace('/<(\/?[a-zA-Z][^<>]*?)>/', '(($1))', $result['html']);
    }
    return $result;
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
        if ($node instanceof DOMAttr || $node instanceof DOMText) {
            $node->nodeValue = '';
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

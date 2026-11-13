<?php
/**
 * Write values into stored rows with the Claude Cowork plugin's own functions, and read them back (test support, #584).
 *
 * Reads JSON `{"lib": "<plugin lib folder>", "markers": "<empty-html-places.php>", "writes": [...]}` on stdin. Each
 * write is `{"row": {<column>: <value>}, "slot": <content map slot>, "value": "...", "piece"?: "<xpath>"}`:
 *   - a slot location is written the way the plugin's `content.contract` apply writes it: `checkValue` (the plugin's
 *     rules for a value) then `changeRow` (`ContentSlots::htmlPatch` and `jsonPatch`), both of `QuickstartContract`;
 *   - a piece (`piece`: an xpath inside the slot's stored value) is set inside that value with
 *     `ContentSlots::htmlPatch`, the value read and written in the marker notation when it is in it, and the whole value
 *     is then written under the slot like any other.
 * Writes JSON `[{"row": {...}, "read": "<the value read back at the place>"} | {"error": "..."}, ...]`, the value read back
 * with the plugin's `currentValue` (a piece: the node the xpath names, read with `ContentSlots::slotText`).
 */

$in = json_decode(stream_get_contents(STDIN), true);
require $in['lib'] . '/QuickstartContract.php';
require $in['markers'];

$contract = (new ReflectionClass('QuickstartContract'))->newInstanceWithoutConstructor();
$call = static function (string $method, array $args) use ($contract) {
    return (new ReflectionMethod('QuickstartContract', $method))->invokeArgs($contract, $args);
};

$out = [];
foreach ($in['writes'] as $write) {
    try {
        $slot = $write['slot'];
        $row = $write['row'];
        $value = $write['value'];
        if (isset($write['piece'])) {
            $stored = $call('currentValue', [$row, $slot]);
            $marked = isMarked($stored);
            $html = ContentSlots::htmlPatch($marked ? fromMarkers($stored) : $stored, [['xpath' => $write['piece'], 'value' => $value]]);
            $value = $marked ? toMarkers($html) : $html;
        }
        $call('checkValue', [$slot, $value, ['evidence' => [$slot['key'] => 'invented: the business said so']]]);
        $row = $call('changeRow', [$row, [$slot], [$slot['key'] => $value]]);
        $read = $call('currentValue', [$row, $slot]);
        if (isset($write['piece'])) {
            $nodes = (new DOMXPath(ContentSlots::html(isMarked($read) ? fromMarkers($read) : $read)))->query($write['piece']);
            if (!$nodes || $nodes->length !== 1) throw new RuntimeException('the piece names ' . ($nodes ? $nodes->length : 0) . ' nodes after the write');
            $read = ContentSlots::slotText($nodes->item(0));
        }
        $out[] = ['row' => $row, 'read' => $read];
    } catch (Throwable $e) {
        $out[] = ['error' => get_class($e) . ': ' . $e->getMessage()];
    }
}
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

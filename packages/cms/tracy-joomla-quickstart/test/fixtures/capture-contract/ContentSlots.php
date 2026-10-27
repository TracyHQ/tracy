<?php
/**
 * Test stand-in for the Claude Cowork plugin's `lib/ContentSlots.php`, NOT the real helper:
 * `capture-contract.test.mjs` only checks what the capture tool decides, so every HTML body
 * answers no slots.
 */
final class ContentSlots
{
    public static function htmlSlots(string $html): array
    {
        return [];
    }
}

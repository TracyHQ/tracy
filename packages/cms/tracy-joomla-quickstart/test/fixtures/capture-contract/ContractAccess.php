<?php
/**
 * Test stand-in for the Claude Cowork plugin's `lib/ContractAccess.php`, NOT the real helper:
 * `capture-contract.test.mjs` asserts nothing about access, so the snapshot is a fixed marker.
 */
final class ContractAccess
{
    public static function snapshot(array $inventory): array
    {
        return ['stub' => true];
    }
}

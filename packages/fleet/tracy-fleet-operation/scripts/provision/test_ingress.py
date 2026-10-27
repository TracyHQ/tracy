#!/usr/bin/env python3
"""Tests for ingress.py — run with `python3 provision/test_ingress.py`."""

import unittest

from ingress import strip_rule, upsert

CONFIG = """tunnel: 91b557ed
credentials-file: /root/.cloudflared/91b557ed.json

ingress:
  - hostname: one.tracy.ai
    service: http://127.0.0.1:8081
  # Anything not named above is not a site we serve. Refuse rather than fall through to a
  # default backend, which would answer for hostnames nobody provisioned.
  - service: http_status:404
"""


def rule_order(config: str) -> list[str]:
    """The ingress entries in the order cloudflared will match them."""
    out = []
    for line in config.splitlines():
        stripped = line.strip()
        if stripped.startswith("- hostname:"):
            out.append(stripped.split(":", 1)[1].strip())
        elif stripped.startswith("- service: http_status:404"):
            out.append("<catch-all>")
    return out


class UpsertTests(unittest.TestCase):
    def test_new_rule_goes_before_the_catch_all(self):
        # A rule after `http_status:404` is dead: the catch-all matches everything, so the site
        # answers 404 from the internet while looking healthy on the host.
        out = upsert(CONFIG, "two.tracy.ai", 8082)
        self.assertEqual(rule_order(out), ["one.tracy.ai", "two.tracy.ai", "<catch-all>"])

    def test_the_comment_stays_attached_to_the_catch_all(self):
        out = upsert(CONFIG, "two.tracy.ai", 8082)
        lines = out.splitlines()
        comment = next(i for i, l in enumerate(lines) if "Anything not named above" in l)
        catch_all = next(i for i, l in enumerate(lines) if "http_status:404" in l)
        self.assertLess(comment, catch_all)
        self.assertIn("  - hostname: two.tracy.ai", lines[:comment])

    def test_re_running_replaces_rather_than_duplicates(self):
        # Provisioning is re-runnable. A second rule for one hostname is honoured by the first
        # match, so a re-provision onto a new port would keep serving the old one.
        once = upsert(CONFIG, "one.tracy.ai", 9091)
        twice = upsert(once, "one.tracy.ai", 9091)
        self.assertEqual(once, twice)
        self.assertEqual(rule_order(once), ["one.tracy.ai", "<catch-all>"])
        self.assertIn("http://127.0.0.1:9091", once)
        self.assertNotIn("http://127.0.0.1:8081", once)

    def test_other_sites_are_untouched(self):
        out = upsert(upsert(CONFIG, "two.tracy.ai", 8082), "three.tracy.ai", 8083)
        self.assertEqual(rule_order(out), ["one.tracy.ai", "two.tracy.ai", "three.tracy.ai", "<catch-all>"])

    def test_removing_leaves_the_rest_alone(self):
        out = strip_rule(upsert(CONFIG, "two.tracy.ai", 8082), "one.tracy.ai")
        self.assertEqual(rule_order(out), ["two.tracy.ai", "<catch-all>"])

    def test_removing_a_hostname_that_is_not_there_changes_nothing(self):
        self.assertEqual(strip_rule(CONFIG, "nope.tracy.ai"), CONFIG)

    def test_a_config_without_a_catch_all_is_refused(self):
        # Guessing where a rule goes in a file whose shape is unknown is how a site ends up
        # unreachable with nothing to show for it.
        with self.assertRaises(SystemExit):
            upsert("ingress:\n  - hostname: one.tracy.ai\n    service: http://127.0.0.1:1\n", "two.tracy.ai", 2)

    def test_a_hostname_that_is_a_prefix_of_another_is_not_confused(self):
        both = upsert(CONFIG, "one.tracy.ai.evil.test", 8099)
        out = strip_rule(both, "one.tracy.ai")
        self.assertEqual(rule_order(out), ["one.tracy.ai.evil.test", "<catch-all>"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

#!/usr/bin/env bash
#
# Whether a Joomla site's configuration.php loads in the site's own PHP, before provision.sh calls the
# site up. Sourced by `provision/platform/joomla.sh` (`platform_post_up`), never executed; kept apart
# so a test can run it against a docker stand-in.
#
# The file is the one `render_configuration.py` rewrote. A rewrite that leaves it unloadable is
# Tracy's fault, not the source site's (the source site ran on it): a setting declared twice once
# made every page of an imported copy answer 500 "Cannot redeclare JConfig::$host" while the wizard
# said the site was ready (#218). Loaded, not linted: `php -l` passes a class that declares a
# property twice on some PHP versions; instantiating it never does.

# tracy_joomla_config_refusal <site_dir>
# Prints why the copy's configuration does not load and returns 1; silent and 0 when it loads.
tracy_joomla_config_refusal() {
  local said
  if said="$( (cd "$1" && docker compose exec -T web php -d display_errors=stderr -r \
      'define("_JEXEC", 1); require "/var/www/html/configuration.php"; new JConfig; echo "loaded";') 2>&1)" \
     && [[ "$said" == *loaded* ]]; then
    return 0
  fi
  said="$(printf '%s\n' "$said" | grep -m1 -E 'error|Error' || printf '%s\n' "$said" | head -1)"
  echo "the copy's configuration.php does not load in its PHP: ${said:0:300}"
  return 1
}

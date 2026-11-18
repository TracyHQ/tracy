# WordPress provision reads large plugin answers from a file

- **What:** the WordPress provision (`packages/fleet/tracy-fleet-operation/scripts/provision/platform/wordpress.sh`) handed each Claude Cowork plugin answer to `python3` as a command-line argument. Linux caps one argument at 128 KiB, and an inspect answer carries the whole content contract: JA Diner wp7 1.0.3 answers about 143 KB (570 slots). `python3` never started, and the provision failed with `inspect after bind:` and no reason, on a site that was bound and serving. Every answer (bind, inspect, showcase navigation, content identity, derive) is now written to a temp file and read from there. A check that dies without printing is now named by its exit code, so a failure always says why.
- **Who:** Akemi, with Claude.
- **PR:** see the pull request that adds this file.
- **Touches:** WordPress demo rows and customer sites whose quickstart contract is large (JA Diner WP 1.0.3 first). Such a row that ended "Failed at provision" needs one "Retry install" after the deploy.

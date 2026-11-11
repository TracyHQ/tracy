# WO implementation measurements

The first implementation pass adds process-wide media admission, bounded streaming storage, bounded foreground crash recovery and truthful chain QA. The source is still subject to runtime acceptance. No video evidence is committed.

## Real image memory probe

Thirty remaining SEVEN image URLs were downloaded to a private local folder (25,984,280 bytes total). Source metadata included JPEG images up to 8640 x 5760 pixels. With the already-committed serial native measurement and real pictureFeatures, a fresh Node process measured peak RSS 1072.6 MiB while reading these files sequentially. This explains why the earlier small synthetic fixture was insufficient, but does not isolate the full web OOM cause.

The same thirty private files were read in disposable, network-disabled containers using the active committed native-measure image, a 768 MiB container limit and 256 MiB V8 heap. Both exited zero. The default allocator measured maxRSS 781.8 MiB and elapsed 7702 ms; a separate MALLOC_ARENA_MAX=2 sample measured maxRSS 711.1 MiB and elapsed 5091 ms. These are single samples and peak RSS is an OS-reported process metric, not cgroup peak accounting. The allocator setting is an owned-stand experiment; no global product setting is changed. Full research and site acceptance must still run.

## Disk cleanup

Only exact cache IDs traced to this session's cancelled native build were pruned: 16.4 MB dsh source, 0.687 MB catalog, 29.52 MB systems, 11.72 MB thumbnails, 16.64 MB overlays, 32.01 MB slot data, 4.536 MB sidebar and 3.774 MB passwords, plus zero-byte leaf records. Docker reported roughly 115 MB reclaimed. Three obsolete owned web tags were removed; their shared layers are not counted as three image sizes. The clean audit worktree was removed after confirming no tracked/untracked changes, reclaiming approximately 4.9 GB on the host. No global prune, borrowed service mutation or source-data deletion was performed. Private image probes are disposable and their downloaded fixtures will be removed after comparison; retained videos stay outside Git.

## Source checks

Selected lint/typecheck/format, language, WO public-tree and test-quality gates passed after all four changes. The ignored local tool links initially pointed into an independently removed temporary checkout; existing root packages were relinked without changing manifests or installing dependencies. Detailed mechanism evidence is in media-admission-tests.log, object-storage-deadlines-tests.log, research-crash-recovery.log and truthful-chain-qa-final.log. Suite counts overlap and are not additive.

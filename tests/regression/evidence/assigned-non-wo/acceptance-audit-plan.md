# Acceptance audit and bounded verification plan

Observed on 2026-11-10, starting at `a3a90d13d1`. This is a plan and mechanism audit, not an acceptance result. No video evidence is added to Git.

## Overlap and acceptance truth

`origin/develop` was `949fc1ef23`. Open PR #522 retains the broader Opportunities UI and chain-progress changes; its relevant runner implementation was already reused in #541. No second UI implementation is proposed here.

The reused runner treated every terminal or missing chain as passed QA. Existing client progress and Outreach classification read that passed state. The scoped correction now requires an applied brief, a terminal chain measurement, no measured steps still running, and a final write outcome of `done`. That outcome comes from step 9's final write report, which stops when Site check or repair verification fails. Earlier model failures may still produce a verified fallback. The original chain findings stay on the brief; QA receives only known status values and human acceptance remains false.

This correction covers actions the runner reconciles after deployment. Historical actions already marked complete are not repaired by this change. The five-business acceptance report must read their current chain findings and retain failed or interrupted attempts instead of treating their old action state as acceptance.

## Available resources and cleanup provenance

The Docker filesystem reported 58.4 GB total, 53.1 GB used and 2.3 GB available (96% used). Host storage separately had 32 GiB available. Docker reported 9.666 GB build cache, of which 1.162 GB was reclaimable; reclaimable image data was about 530 MB. The idle owned web used 168 MiB under its 2 GiB limit. These readings do not establish sufficient headroom for another full image build or large research job.

The owned obsolete web image tags `pr541-local-media`, `pr541-local-recovery` and `pr541-local-next` had no container references. Their layer sizes overlap; removing their tags cannot be counted as reclaiming three complete images. Retain the active native-measure image, the host image and the site images.

The canceled owned native build's unshared, reclaimable cache leaves included `ikdvi6hljnnefdeqy03nf6b7y` (16.4 MB, dsh source copy) and `awh5xwp4lsei09pyyzoz5qqj0` (3.774 MB, passwords source copy). Confirm current references before removing an exact record. The large web contract cache entry is a non-leaf ancestor, so this audit does not identify it as safe cleanup. No global pruning or deletion was performed.

The retained clean audit worktree used 4.9 GB and belongs to this task. Removing it after preserving evidence would free host storage, not space inside Docker's filesystem. The stand's 17 MB verified kit cache is small and useful for acceptance retries.

## Verification order

1. Recover measured Docker disk headroom through exact owned cleanup; verify PostgreSQL can create and migrate an isolated test database. Do not infer recovery from a healthy container alone.
2. Run committed regression cases for media admission, object deadlines and truthful chain QA. Keep native image work and broad test tracing separate from acceptance research.
3. Restart only the owned web on the verified new source. Run one supported research request while recording RSS, disk, storage outcomes and cancellation settlement. Confirm readiness from the published research snapshot before Build.
4. Retry one owned failed build through its supported door, preserving opportunity and site identity. Verify final chain/write/check findings and inspect every kept page at desktop and mobile widths, including absence of demo content and broken internal links.
5. Exercise full backup fault recovery on an owned test site, including read-back after restore. A mechanism test does not substitute for runtime fault injection.
6. Complete all five business/opportunity/site receipts with source revision, run IDs, timings, token usage, recorded cost, unknown interrupted charges and final visual findings. Missing independent model capabilities remain explicit blockers for affected checks.
7. With the stand idle and disk healthy, finish full tests and clean-checkout Turbo tracing. The current global browser preflight and default file concurrency must be accounted for; a structure-only result is not a full test result.
8. Deploy the verified source to dev and repeat the five-site WO flow and targeted assigned-issue checks. Record local and dev results separately. Do not label the PR ready or report five accepted handovers before these results exist.

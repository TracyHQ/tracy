# Initial regression run: Docker disconnect

The first REG-PR-311 run on commit 298863ee5 failed after 104 seconds. Its low-ID Joomla case failed in `schema()` while executing `docker exec ... mariadb ... repeat_ours`:

```
Cannot connect to the Docker daemon ... Is the docker daemon running?
```

The other nine selected cases passed. The rerun passed all ten. The runner reused the log path for this commit and replaced the first transcript with the passing rerun; this note retains the observed failure and explains that limitation. Both result lines are retained. The separate broad integration log also records a Docker disconnect in the HPOS case, whose isolated rerun passed.

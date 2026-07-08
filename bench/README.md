# Benchmark Golden Files

`scripts/bench.mjs` clones the repos in `bench/repos.json`, scans them with `buildCatalog`, and compares the top candidates with `bench/golden/*.json`.

To update a golden file:

1. Run `node scripts/bench.mjs --repo taxonomy` and inspect the top candidates if it fails.
2. Keep `expectedTop` to high-signal class subsets that should stay in the top-N.
3. Keep `notExpected` for known noise signatures that should not appear in the top-N.
4. Re-run `node scripts/bench.mjs --repo taxonomy` and commit the golden change with the implementation change that justified it.

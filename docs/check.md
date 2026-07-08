# dsg check

`dsg check` detects new JSX class usage that drifts from approved design-system assets.

```bash
dsg check <repo-path> --design-system <artifacts-dir> [--files <glob,glob>] [--strict] [--report <out.md>]
```

- `--design-system`: directory containing `assets.json` and `decisions.json`.
- `--files`: optional comma-separated file paths or simple globs such as `src/**/*.tsx`.
- `--strict`: exits `1` when drift is found. Without it, drift is reported as warnings and exits `0`.
- `--report`: writes a markdown report that can be pasted into a GitHub PR comment.

The check reports:

- `near-miss`: a class set is highly similar to an approved asset but not an exact match.
- `deprecated`: an asset defines `deprecatedClasses` and a usage is highly similar to that deprecated class set.

## CI example

```yaml
name: dsg-check

on:
  pull_request:

jobs:
  dsg-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx dsg check . --design-system design-system --strict --report dsg-check.md
```

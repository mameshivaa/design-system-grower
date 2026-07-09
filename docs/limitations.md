# Known Limitations (v1.0)

Honest inventory of what this tool does not do (yet). Most of these are deliberate
trade-offs of the dependency-free, heuristic-first design.

## Extraction (scanner/extractor)

- **Heuristic parsing, no AST.** `className="..."`, `className={'...'}`, `cn(...)`,
  `cva(...)`, template literals with ternaries, and comparison operands are handled;
  the following are **not**: `clsx`/`cn` object syntax (`{ 'a': cond }`), spread
  attributes (`{...rest}` carrying className), classes built via variables or
  helper functions, CSS-in-JS (styled-components/emotion styles are detected as
  signals, not parsed), CSS Modules class contents.
- Dynamic class construction is only partially interpreted: static string literals
  inside expressions are extracted; everything else is ignored.

## Similarity & scoring

- Class-set similarity is **Jaccard on tokens** — a one-token color change and a
  one-token radius change weigh the same, though their visual impact differs.
- Thresholds (near-miss 0.6, new-variant 0.65–0.95, drift structural 0.7, grade
  curve) were tuned on a small corpus (taxonomy, dub, one production app).
  Expect to adjust as more repos are benchmarked (`scripts/bench.mjs`).
- Drift detection pairs only **synonym color-family swaps** (green/emerald,
  gray/slate/zinc/neutral/stone, red/rose, yellow/amber, blue/sky, violet/purple,
  teal/cyan). Multi-tone ternary signatures vs single-tone static usages are not
  paired yet; shade-only drift (`slate-500` vs `slate-600`) is ignored by design.

## Roles

- Role classification is heuristic; misclassifications occur (e.g. a pill badge
  written as a `span` with text-sizing classes may land in Text). Catch-all roles
  (Other/Layout/Text) are excluded from new-variant findings and the diagnosis grade.

## Evidence base

- The agent-adherence A/B (46% → 64%) is **n=1 per condition**, same-model agents,
  one task. The live hook demo is two runs. Directionally strong, statistically thin —
  treat the numbers as first evidence, not proof.

## extract / registry

- `extract` lifts one representative occurrence per asset; it does not merge
  multiple occurrences into one abstraction (by design: lift, don't synthesize).
- Output is `.jsx` (no TypeScript type generation yet); props-safety covers
  single-root elements with expression attributes and plain-text children — nested
  structures are lifted verbatim with a TODO listing unresolved identifiers.
- Variant inference produces a simple string-union variant map when occurrence
  diffs are clean; otherwise it lists differing classes in a comment instead of
  inventing an abstraction.
- `registry` emits shadcn-compatible items with embedded content; it does not
  detect npm dependencies of lifted code, and the shadcn CLI strips the leading
  provenance comment on install (provenance remains in `registry.json` meta and
  `design-system/provenance.json`).
- No tokens/CSS-variable layer yet (planned; see docs/roadmap-v0.6.md §3).

## Scope

- React/JSX + Tailwind-style class usage only. Vue/Svelte templates, HTML files,
  and non-utility CSS methodologies are out of scope for now.
- `dsg check --base` requires git; without it, checks run repo-wide.

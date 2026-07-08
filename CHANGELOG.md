# Changelog

## v0.2.0 (2026-07-08)

Theme: declare the canonical, then enforce it.

### Drift detection (`canonicalize`)

- The scan now detects **competing pattern families**: same structure, same element, but swapped synonym color families (green/emerald, gray/slate/zinc/neutral/stone, red/rose, yellow/amber, blue/sky, violet/purple, teal/cyan). Cross-group color differences (slate vs red) are treated as intentional tone variants and never flagged.
- New decision action: `dsg decide <dir> <id> canonicalize --name X --side N` records the winner and marks the losing family as deprecated in `assets.json` (`deprecatedClasses`) and `agent-rules.md`.
- The review board shows drift candidates as comparison cards with per-side usage counts and a recommended winner.
- Measured on a 903-file production app: 4 drift candidates, 4/4 genuine (rose/red alerts, amber/yellow badges).

### `dsg check` — CI drift gate

- `dsg check <repo> --design-system <dir> [--files ...] [--strict] [--report out.md]`
- Reports **near-misses** (class set ≥0.6 similar to an approved signature but not equal, with missing/extra class diff) and **deprecated-family usage** (from canonicalize decisions), each with file:line.
- `--strict` exits 1 for CI; `--report` emits PR-comment markdown. See docs/check.md.

### Precision bench harness

- `node scripts/bench.mjs` clones a pinned `shadcn-ui/taxonomy`, scans it, and compares top candidates against golden expectations (`bench/golden/`); fails on precision regression. Scheduled + manual GitHub Actions workflow (`bench.yml`).

## v0.1.0 (2026-07-08)

First public-ready cut of `design-system-grower`: a repo-first CLI that finds repeated UI patterns in React/TypeScript codebases and turns them into an agent-ready design-system catalog.

### Candidate quality (validated on real repos)

- Tailwind class categorization (`src/class-analysis.js`) with repo-IDF weighting so ubiquitous utilities (`flex`, `items-center`, `h-4 w-4`, …) no longer dominate scoring.
- Distinctiveness gate: candidates must span multiple class categories and include at least one color/typography/border/state class; empty-class candidates are dropped.
- `components/ui/*` and `cva()` definition files are treated as the existing design system (inventory), not re-discovered as candidates.
- Icon-only clusters filtered; near-duplicate clusters merged (Jaccard similarity).
- Template-literal parsing fixed: no `${`, stray quotes, or ternary tokens leak into extracted classes.
- Measured result: `shadcn-ui/taxonomy` precision@10 went from 0/10 to 8/10 (87 → 13 candidates); `dubinc/dub` from 0/10 to ~7/10 (2,648 → 1,190 candidates, zero non-class tokens).

### Review board

- `dsg review` board shows the top 20 candidates by default with "Show all", grouped by action type with count badges.
- Source snippets served via `GET /api/snippet` (paths restricted to the scanned repo).
- Decisions can be approved directly in the browser via `POST /api/decide` (regenerates assets and agent rules); approval commands have copy buttons.
- Server binds to localhost only.

### Agent-ready output

- Approved rules in `agent-rules.md` now include element tags, common/variant class signatures, reference locations, and a representative JSX snippet — enough for a coding agent to match existing patterns without re-scanning.
- Pending decisions collapse to a one-line summary instead of a candidate-ID list.
- Header points to `assets.json` / `catalog.json` for machine-readable lookup; `dsg install-instructions` propagates the same content to `AGENTS.md` / `CLAUDE.md`.

### Packaging

- MIT license, CONTRIBUTING.md, GitHub Actions CI (Node 20/22).
- npm publish metadata and `files` whitelist (`npm pack`: ~27 kB, dependency-free).

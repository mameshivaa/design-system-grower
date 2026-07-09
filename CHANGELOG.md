# Changelog

## v1.0.0 (2026-07-09)

First complete release. The full loop is implemented and verified end-to-end on
real repositories:

**discover → decide → package → distribute → enforce**

- discover: scan with distinctiveness-gated candidates (precision@10 ≈ 8/10 on
  real repos), role taxonomy, drift (competing color families), diagnosis grade
- decide: local promotion board, `decide` (incl. `canonicalize --side`)
- package: `extract` — lift, don't synthesize; provenance; class-equivalence
  self-check; props-safe output
- distribute: `registry` — shadcn-compatible; installed into a separate project
  via `npx shadcn add` in verification
- enforce: `check` (near-miss / deprecated / new-variant, `--base`, `--blame`),
  agent rules, MCP server, Claude Code PostToolUse hooks (verified against a
  live agent)

Also in 1.0: `docs/limitations.md` — an honest inventory of what the heuristics
do not cover, and the evidence base behind the numbers.

## v0.6.0 (2026-07-09)

Theme: package your work, then distribute it (lift, don't synthesize).

### `dsg extract`

- Lifts an approved asset's **actual source** into a component file: your classes and string-literal attributes intact, dynamic bindings replaced by `{...props}`, plain-text children promoted to `children`. Nested structures are lifted verbatim with unresolved identifiers listed in a TODO comment — no invented abstractions.
- Self-verifies class equivalence with the original usage and fails rather than emit a mismatch.
- Records provenance (source file/line, extraction time, git commit) in `design-system/provenance.json`; multi-line JSX openings resolve correctly and sources are read from `catalog.target`.

### `dsg registry`

- Packages provenanced components into a shadcn-compatible registry (`registry.json` + `r/<name>.json` with embedded content and provenance meta). Components without provenance are never published.
- Verified end-to-end on a real production app: scan → approve → extract → registry → `npx shadcn@latest add` installed the component into a separate project.

## v0.5.0 (2026-07-08)

### `--blame` attribution

- `dsg check --blame` annotates every finding with who introduced the line, via git blame: `introduced by: claude (just now)` — classifies claude / cursor / codex / bot / human. Off by default; adds an "Introduced By" column to `--report` markdown.

### Shareable diagnosis

- `scan` / `init` end with a Design System Diagnosis: **UI Chaos Grade (A–F)**, per-role variant counts, and the worst competing family with per-side usage counts. Catch-all roles are excluded from both the display and the grade.
- Written to `design-system/diagnosis.md`; regenerate anytime with `dsg diagnose`.

### Verified live

- The PostToolUse hook loop was exercised against a real headless Claude Code agent: an explicitly-requested deprecated style was blocked with the decision escalated to the human, and a "match the app's style" task converged to the canonical signature 9/9 classes. See docs/reports/2026-07-08-hook-live-agent-demo.md.

## v0.4.0 (2026-07-08)

Theme: "your AI invented its 4th button today" — now literally measurable.

### Role taxonomy

- Every candidate is classified into a UI role (Button, FormField, Card, Badge, Alert, Heading, Link, Text, Layout).
- `scan` / `init` print per-role variant counts: `Alert: 19 variants (2 competing families)` — verified on a 903-file production app with 0 misclassified samples.
- `catalog.summary.roles` carries the counts for tooling.

### New-variant detection in `dsg check`

- Works from day one, before any approvals: changed code whose class set is 0.65–0.95 similar to an existing (even unapproved) catalog pattern is flagged as `new-variant` with the message "it would be Button variant #5".
- `--base <git-ref>` limits the check to files changed since a ref (plus uncommitted changes) — PR mode.
- Catch-all roles (Other/Layout/Text) are never flagged; near-miss/deprecated take precedence over new-variant for the same usage.
- All check messages unified to English.

### `dsg install-hooks` — catch the agent in the act

- `dsg hook-check`: Claude Code PostToolUse-compatible hook. Reads the edited file path from stdin, runs the drift check on that one file, and exits 2 with fix instructions (canonical classes + diff) as blocking feedback the agent must address. Fail-open on anything unexpected.
- `dsg install-hooks`: writes the hook into `.claude/settings.json` with a non-destructive JSON merge (existing settings and hooks preserved, idempotent on re-run).

## v0.3.0 (2026-07-08)

Theme: five-minute onboarding and live agent access.

### `dsg init` — one-command onboarding

- `dsg init [target]` scans, prints a human summary (files, candidates, drift count, top-3 candidates with suggested names), opens the review board, and prints copy-paste next steps (`decide` / `install-instructions` / `check`) on exit.
- Re-running `init` preserves previously approved decisions.

### `dsg mcp` — MCP server for coding agents

- `dsg mcp --design-system <dir>`: dependency-free MCP server (stdio, newline-delimited JSON-RPC 2.0).
- Tools: `list_assets`, `lookup_pattern` (rank approved assets by class/keyword match), `check_classes` (canonical / near-miss / deprecated verdict with class diff, reusing the `dsg check` engine).
- Artifacts are re-read per call, so decisions made while the server runs are picked up immediately. Setup examples in docs/mcp.md.
- Complements static `AGENTS.md` rules: compact summary always in context, details on demand.

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

# design-system-grower

[![CI](https://github.com/mameshivaa/design-system-grower/actions/workflows/ci.yml/badge.svg)](https://github.com/mameshivaa/design-system-grower/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

自分のコードから自分の design system を育てるツール。

**Grow your own design system from the UI you already shipped — and make AI coding agents follow it.**

## The problem

Every React/Tailwind codebase quietly accumulates *competing versions of the same UI*: two status boxes (`bg-green-50` here, `bg-emerald-50` there), three primary buttons, four text inputs that are almost — but not quite — identical. Humans drift. AI coding agents drift faster: give an agent a UI task and it will happily invent a fifth input style, or copy whichever legacy pattern it happens to open first.

The fix isn't another component library. Your repo already *has* a design system — it's just implicit, scattered, and undocumented. `design-system-grower` makes it explicit and teaches your agents to respect it.

## What it does

```bash
npx design-system-grower scan . --out design-system/catalog.json
npx design-system-grower review design-system
```

1. **Scan** (read-only, no network, zero runtime dependencies): extracts `className`, `cn(...)`, and `cva(...)` patterns from `.js/.jsx/.ts/.tsx`, weights classes by repo-level distinctiveness, and clusters real repeated patterns — generic utility co-occurrence (`flex items-center gap-2`) is filtered out, and your existing `components/ui/*` are treated as inventory, not re-discovered.
2. **Review**: a local promotion board (top candidates, source snippets, one-click approval) shows what your UI has actually converged into.
3. **Decide**: promote candidates into named assets — `FormInput`, `StatusNotice`, `PrimaryButton` — with `dsg decide` or directly in the browser.
4. **Instruct**: approved assets become `agent-rules.md` / `AGENTS.md` / `CLAUDE.md` entries carrying the element, class signature, reference locations, and a representative JSX snippet — everything an agent needs to match your canonical pattern instead of inventing one.

```bash
dsg decide design-system candidate-001 reuse --name FormInput
dsg install-instructions design-system --agents-out AGENTS.md --claude-out CLAUDE.md
```

## Declare the canonical, then enforce it

When your repo has *competing* versions of the same pattern (a `rose-*` alert here, a `red-*` alert there), the scan surfaces them as drift candidates — same structure, synonym color families — and you pick the winner:

```bash
dsg decide design-system candidate-220 canonicalize --name AlertNotice --side 1
# agent-rules.md now says: use AlertNotice (rose-*); the red-* family is
# deprecated — do not use it in new code.
```

Then gate it in CI. `dsg check` scans new code against your approved assets and reports **near-misses** (one class off an approved signature) and **deprecated-family usage**, with exact file:line and class diffs:

```bash
dsg check . --design-system design-system --strict   # exit 1 on drift
dsg check . --design-system design-system --report drift.md
```

See [docs/check.md](docs/check.md) for CI integration examples.

## Measured, not promised

Validated on real repositories (2026-07):

- **Candidate quality**: on `shadcn-ui/taxonomy`, the top-10 candidates went from 0/10 useful (naive frequency scoring) to 8/10 after distinctiveness gating; on a 903-file production Next.js app, ~8/10.
- **Agent adherence A/B**: two identical agents, identical task (build a settings card), one repo copy with generated rules, one without. With rules: **64% approved-signature adherence vs 46%**, a **17/17 exact match** on the textarea pattern, and — the part that matters — the no-rules agent drifted to a competing legacy status style (`green-*`) while the rules agent used the canonical one (`emerald-*`). Details: [docs/reports/2026-07-08-m4-agent-rules-experiment.md](docs/reports/2026-07-08-m4-agent-rules-experiment.md).

The honest takeaway: agents reading neighboring files get ~46% of the way there on their own. The value of the catalog is telling them **which of your competing patterns is canonical**.

## Generated artifacts

```txt
design-system/
  catalog.json      # full scan result (machine-readable)
  inventory.json    # import/className/cn/cva signals + existing design system
  situations.json   # repo diagnosis
  candidates.json   # patterns awaiting your decision
  decisions.json    # your approvals
  assets.json       # approved assets (element, classes, usage example, locations)
  assets.md         # human-readable asset catalog
  decisions.md      # review checklist
  agent-rules.md    # rules for AI coding agents
  review.html       # local promotion board (served by `dsg review`)
```

## Scope

Works on React / Next / Vite repositories with Tailwind-style `className` usage. shadcn/ui, Radix, MUI, Chakra, Mantine, and Ant Design are detected as signals but never required. URL/screenshot/Figma import is intentionally out of scope: your shipped code is the source of truth.

Current limitations: heuristic extraction (no full AST parser yet), no props/type extraction, no codemods, no Storybook/registry generation. These are deliberate — see [docs/direction.md](docs/direction.md) for what gets built next and why.

## Safety model

Observe before mutate:

- the scanner never rewrites your source code;
- no codemods, no LLM-driven file rewriting;
- `AGENTS.md` / `CLAUDE.md` are only written on explicit command, and existing files are never overwritten without `--force`;
- the review server binds to localhost only.

## Docs

- [Product direction & north-star metric](docs/direction.md)
- [MVP spec](docs/mvp-spec.md) · [Vision](docs/vision.md) · [Product brief](docs/product-brief.md)
- [Research basis](docs/research/deep-research-report-design-system.md)
- [Contributing](CONTRIBUTING.md) — dependency-free policy, test setup

## License

[MIT](LICENSE)

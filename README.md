# design-system-grower

[![npm](https://img.shields.io/npm/v/design-system-grower)](https://www.npmjs.com/package/design-system-grower)
[![CI](https://github.com/mameshivaa/design-system-grower/actions/workflows/ci.yml/badge.svg)](https://github.com/mameshivaa/design-system-grower/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

自分のコードから自分の design system を育てるツール。

**Grow your own design system from the UI you already shipped — package your hand-crafted components for distribution, and make AI coding agents follow them.**

## The problem

Every React/Tailwind codebase quietly accumulates *competing versions of the same UI*: two status boxes (`bg-green-50` here, `bg-emerald-50` there), three primary buttons, four text inputs that are almost — but not quite — identical. Humans drift. AI coding agents drift faster: give an agent a UI task and it will happily invent a fifth input style, or copy whichever legacy pattern it happens to open first.

The fix isn't another component library. Your repo already *has* a design system — it's just implicit, scattered, and undocumented. `design-system-grower` makes it explicit and teaches your agents to respect it.

## What it does

```bash
npx design-system-grower init .
```

One command: scans your repo, prints what your UI has converged into — per role —, opens the local promotion board, and tells you the exact next commands. (Prefer separate steps? `dsg scan` / `dsg review` still work.)

```txt
Button: 19 variants (0 competing families)
Alert: 19 variants (2 competing families)
FormField: 4 variants
```

That's a real production app. Your AI probably invented one of those button variants yesterday. The rest of the tool exists to stop variant #20:

- `dsg check --base main` flags it in the PR: *"This invents a new variant of an existing pattern — it would be Button variant #20."* Works from day one, before you've approved anything.
- `dsg install-hooks` catches it in the act: a Claude Code PostToolUse hook runs on every file the agent writes, and drift comes back as blocking feedback the agent must fix before moving on.

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

## Package your work, then distribute it

Your hand-written UI is the asset — the tool wraps it, it never regenerates it (*lift, don't synthesize*):

```bash
dsg extract design-system asset-001 --out components/ui
dsg registry design-system --components components/ui --out public/registry --name my-ui
```

`extract` lifts the approved pattern's **actual source** into a compilable component (your classes and literal attributes intact, dynamic bindings passed through as `{...props}`), records provenance (source file, line, commit), and refuses to emit anything whose classes don't match the original exactly. `registry` packages provenanced components into a **shadcn-compatible registry**, so anyone can install your work:

```bash
npx shadcn@latest add https://your-host/registry/r/app-textarea.json
```

Verified end-to-end on a real production app: scan → approve → extract → registry → `shadcn add` into a separate project. See [docs/registry.md](docs/registry.md).

## Two layers of agent guidance

- **Static rules** (`AGENTS.md` / `CLAUDE.md`): a compact, always-in-context summary of your approved assets.
- **MCP server** (`dsg mcp --design-system design-system`): on-demand detail. Agents can call `lookup_pattern` ("is there an alert style here?"), `check_classes` (canonical / near-miss / deprecated verdict for a class list), and `list_assets` while they code. Zero dependencies, stdio transport. Setup: [docs/mcp.md](docs/mcp.md).

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

## Command reference

| Command | What it does |
|---|---|
| `dsg init [dir]` | Scan + diagnosis + review board + next steps, in one command |
| `dsg scan [dir] --out <catalog.json>` | Scan and write all artifacts (read-only on your code) |
| `dsg review [ds-dir]` | Serve the promotion board locally (approve from the browser) |
| `dsg decide [ds-dir] <candidate> <action> [--name N] [--side N]` | Approve reuse / promote-variant / wrap / canonicalize … |
| `dsg extract [ds-dir] <asset> --out <dir>` | Lift the approved pattern's real source into a component (with provenance) |
| `dsg registry [ds-dir] --components <dir> --out <dir>` | Package provenanced components as a shadcn-compatible registry |
| `dsg check <repo> --design-system <dir> [--base ref] [--blame] [--strict]` | Report near-miss / deprecated / new-variant drift |
| `dsg install-instructions [ds-dir]` | Write agent rules into AGENTS.md / CLAUDE.md |
| `dsg mcp --design-system <dir>` | MCP server: lookup_pattern / check_classes / list_assets |
| `dsg install-hooks` | Claude Code PostToolUse hook — drift comes back as blocking agent feedback |
| `dsg diagnose [ds-dir]` | Regenerate the shareable diagnosis (UI Chaos Grade) |
| `dsg instruct [ds-dir]` | Regenerate agent rules after editing decisions.json |

Honest scope notes: [docs/limitations.md](docs/limitations.md).

## Docs

- [Product direction & north-star metric](docs/direction.md)
- [MVP spec](docs/mvp-spec.md) · [Vision](docs/vision.md) · [Product brief](docs/product-brief.md)
- [Research basis](docs/research/deep-research-report-design-system.md)
- [Contributing](CONTRIBUTING.md) — dependency-free policy, test setup

## License

[MIT](LICENSE)

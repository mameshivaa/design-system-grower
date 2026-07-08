# Product Brief

## One-Line Promise

自分のコードから自分の design system を育てるツール。

Longer version: every team should be able to grow its own reusable UI system from the product UI it already owns.

MVP version: 散らかった React / Tailwind UI の使われ方を可視化して、reuse / variant / wrapper / block 候補を出す。

## Why This Exists

The imported research concludes that URL, screenshot, and Figma-to-code products are already crowded, while repo-first UI asset extraction remains thin. Developers do not only need another generator. They need a way to turn already-shipped UI into reusable components, catalogs, and agent instructions.

## Target User

Frontend teams using React, TypeScript, and Tailwind-style `className` patterns who have accumulated repeated JSX/UI patterns and want to understand where their local UI usage is drifting.

This is also for teams that already use a library and have customized it through `className`, variants, wrappers, themes, or local blocks. The goal is not to replace that library immediately. The goal is to make the team's actual usage patterns explicit and reusable.

## Initial Job To Be Done

When I run the CLI on my repo, I want to see the top duplicated UI patterns so I can decide which ones should become reusable components.

The first aha moment should be: "our UI has already converged into a few patterns."

In the MVP, this is more important than registry generation.

## Product Direction

Start repo-first and code-structure-first:

- scan existing UI code;
- detect repeated `className`, `cn()`, `cva()`, component usage, and UI library signals;
- analyze `className`, `cn()`, and `cva` usage;
- recommend existing variant reuse, new variant promotion, or wrapper/block extraction;
- generate inventory, situations, candidates, decisions, named assets, agent rules, and a local browser review board;
- later emit registry items, Storybook, codemods, and full agent instructions.

The CLI is the engine, but the intended product experience is a local browser review UI, similar in immediacy to shadcn/ui create. `dsg review` serves the generated promotion board locally and opens the browser. The MVP review UI should show candidate ids, source locations, common/variant classes, risk, suggested asset names, and the exact `dsg decide ...` command to approve a decision.

## Non-Goals

- Pixel-perfect cloning from third-party websites
- Scraping private or login-gated sites
- LLM-driven direct code rewriting
- Framework-wide support before the React/TypeScript path is useful
- Requiring shadcn/ui as an input assumption
- Treating shadcn/ui, MUI, Chakra, Mantine, or Ant Design as first-class MVP targets
- Automatic registry generation in the MVP

## Near-Term Output

- duplicated UI clusters
- extraction score
- source locations
- shared and variant class names
- `inventory.json`, `situations.json`, `candidates.json`, and `decisions.md`
- `decisions.json`, `assets.json`, `assets.md`, `agent-rules.md`, and a locally served `review.html`
- JSON catalog usable by later Storybook, registry, or agent-instruction generators

## Longer-Term Output

- optional shadcn-compatible registry
- promoted components and blocks
- Storybook stories and manifests
- `AGENTS.md`, `CLAUDE.md`, and Cursor rules
- provenance, decisions, and migration notes
- dry-run codemod patches after human approval

# design-system-grower

自分のコードから自分の design system を育てるツール。

`design-system-grower` is an OSS-first, repo-first CLI for finding repeated UI patterns in React/TypeScript codebases and turning them into an agent-ready component catalog.

The reviewable MVP spec is [docs/mvp-spec.md](docs/mvp-spec.md). The longer product vision is documented in [docs/vision.md](docs/vision.md).

## Product Position

This project is based on the research imported at [docs/research/deep-research-report-design-system.md](docs/research/deep-research-report-design-system.md). The core bet is:

- screenshot and URL-to-code tools are crowded;
- existing-code-to-design-system workflows are still fragmented;
- the strongest wedge is not "generate more UI", but "reuse the UI you already own";
- AI agents need catalogs and instructions, not only components.

The workflow is:

1. **Extract** repeated JSX/className patterns from a repository.
2. **Normalize** similar UI snippets into component candidates.
3. **Catalog** the candidates as machine-readable design-system inventory.
4. **Instruct** humans and AI agents to reuse existing patterns instead of creating one-off UI.

The final artifact is not only a component library. It is a project-specific design system layer: components, registry items, usage contracts, Storybook/catalog metadata, migration notes, and agent instructions.

For the MVP, the product is intentionally narrower: detect scattered React/Tailwind UI usage and show a UI inventory / promotion board. shadcn/ui is useful when present, but not required. Registry generation, Storybook, codemods, and real agent-rule installation are later phases.

## MVP Scope

The initial CLI intentionally stays narrow:

- React / Next / Vite style repositories
- React / TypeScript / Tailwind-style `className` first
- JavaScript, TypeScript, JSX, and TSX files as scan inputs
- static `className="..."` extraction
- static classes inside `cn(...)`
- `cva(...)` classes and variant keys
- Tailwind-friendly class similarity
- JSON catalog output
- no network calls
- no external runtime dependencies

URL, screenshot, and Figma ingestion are intentionally out of scope for the first cut. The research argues that those should remain a later "draft import" path, while repository code remains the source of truth.

## Usage

```bash
npm test
dsg scan ./path/to/repo --out design-system/catalog.json
dsg review design-system
dsg decide design-system candidate-001 promote-variant --name PrimaryAction
dsg instruct design-system
dsg install-instructions design-system --agents-out AGENTS.md --claude-out CLAUDE.md
node src/cli.mjs scan ./path/to/repo --out design-system/catalog.json
```

The scan writes a catalog plus MVP design-system artifacts:

```txt
design-system/
  catalog.json
  inventory.json
  situations.json
  candidates.json
  decisions.json
  assets.json
  assets.md
  decisions.md
  agent-rules.md
  review.html
```

The catalog contains the UI inventory, matched situations, decision candidates, and clusters of similar UI patterns with source locations, shared classes, variant classes, and an extraction score. Approved decisions are also exported as named UI assets for humans and coding agents.

Open the local promotion board:

```bash
dsg review design-system
```

Approve a candidate from the generated review board:

```bash
dsg decide design-system candidate-001 promote-variant --name PrimaryAction
```

After editing `decisions.json` manually, regenerate agent-facing rules:

```bash
dsg instruct design-system
```

Install approved UI rules into agent-readable files when you are ready:

```bash
dsg install-instructions design-system --agents-out AGENTS.md --claude-out CLAUDE.md
```

Existing files are not overwritten unless `--force` is passed.

## Safety Model

The CLI currently reports candidates only. Future codemod support should follow the same product principle:

- AI may explain naming, responsibility, and props candidates.
- AST-based tooling should apply changes deterministically.
- Build and test gates should run before any patch is considered ready.
- Agent instruction output should tell coding agents to reuse cataloged UI before inventing new components.

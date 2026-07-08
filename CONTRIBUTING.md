# Contributing

Thanks for helping improve design-system-grower. The project is intentionally small, dependency-free at runtime, and conservative about changing user code.

## Development Setup

Requirements:

- Node.js 20 or newer
- npm

Clone the repository, install dependencies, and run the test suite:

```bash
npm install
npm test
```

There are currently no external runtime dependencies. Development tooling should stay minimal, and new dependencies should be justified by a clear maintenance or correctness benefit.

## Running the CLI Locally

Use the local entrypoint while developing:

```bash
node src/cli.mjs scan . --out design-system/catalog.json
node src/cli.mjs review design-system --no-open
```

The published package exposes both commands:

```bash
npx design-system-grower scan .
dsg scan .
```

## Testing

Run all tests before opening a pull request:

```bash
npm test
```

The test suite uses the built-in Node.js test runner. Avoid introducing a test framework unless the project needs capabilities that `node --test` cannot provide.

## Dependency-Free Runtime Policy

The CLI should keep external runtime dependencies at zero. This makes `npx design-system-grower` fast, auditable, and safe to run inside arbitrary repositories.

Before adding any dependency, consider whether Node.js built-ins are sufficient. If a dependency is unavoidable, document the reason and keep it out of the runtime path when possible.

## Safety Model

design-system-grower must not rewrite existing application source code by default.

Current commands scan, catalog, review, and generate design-system artifacts. Any future code modification feature must be explicit, deterministic, reviewable, and gated by tests. Generated agent instructions should encourage reuse of existing UI patterns instead of inventing new components.

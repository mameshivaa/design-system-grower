# DSG Registry

`dsg registry` packages extracted components as a shadcn-compatible static registry.
It reads approved asset metadata from `design-system/assets.json`, provenance from
`design-system/provenance.json`, and component source files generated under
`components/ui/`.

```bash
dsg registry design-system \
  --components components/ui \
  --out public \
  --name acme-ui \
  --homepage https://example.com
```

The command writes:

- `public/registry.json`: registry catalog without embedded file content.
- `public/r/<name>.json`: installable registry item with `files[].content`.

Only components listed in `provenance.json` are included. The provenance record is
copied into each item's `meta.provenance` field so consumers can inspect where the
distributed component came from.

## Static Hosting

### GitHub Pages

1. Commit the generated `registry.json` and `r/*.json` files to the branch or
   directory served by GitHub Pages.
2. Enable Pages for that source in the repository settings.
3. Confirm these URLs return JSON:

```text
https://<owner>.github.io/<repo>/registry.json
https://<owner>.github.io/<repo>/r/<name>.json
```

Consumers can install a component with:

```bash
npx shadcn@latest add https://<owner>.github.io/<repo>/r/<name>.json
```

### raw.githubusercontent.com

For a public repository, consumers can also install directly from raw files:

```bash
npx shadcn@latest add https://raw.githubusercontent.com/<owner>/<repo>/<ref>/public/r/<name>.json
```

Use a tag or commit SHA for `<ref>` when you need reproducible installs.

## Consumer Requirements

- The generated items are React component files. Consumer projects should already
  have React installed and configured as a peer/runtime dependency.
- The target project should have shadcn initialized (`components.json`) so the
  CLI can resolve component paths consistently.
- If extracted components import local helpers such as `@/lib/utils`, those
  helpers must already exist in the consumer project or be distributed as
  additional registry items later.
- The registry is static JSON. It does not require a server runtime, but the JSON
  URLs must be publicly reachable by the `shadcn` CLI.

# dsg MCP server

`dsg mcp` exposes approved design-system artifacts to coding agents over MCP stdio.
Use it alongside generated `agent-rules.md`: keep the rules file small and resident,
then query this server on demand for exact assets, examples, and class checks.

## Start command

```bash
dsg mcp --design-system ./design-system
```

The server reads `assets.json`, `decisions.json`, and `catalog.json` from the
design-system directory on every tool call, so long-running agent sessions see
newly approved assets without a restart.

## Claude Code

Register the local command with Claude Code:

```bash
claude mcp add dsg -- dsg mcp --design-system /absolute/path/to/design-system
```

Project-local `.mcp.json` example:

```json
{
  "mcpServers": {
    "dsg": {
      "command": "dsg",
      "args": ["mcp", "--design-system", "/absolute/path/to/design-system"]
    }
  }
}
```

## Codex

Codex MCP configuration example:

```json
{
  "mcpServers": {
    "dsg": {
      "command": "dsg",
      "args": ["mcp", "--design-system", "/absolute/path/to/design-system"]
    }
  }
}
```

Use an absolute `--design-system` path when the agent may run from a worktree or
temporary directory.

## Tools

### `list_assets`

Returns approved assets with:

- `name`
- `action`
- `elementTags`
- `commonClasses`
- `deprecatedClasses`

### `lookup_pattern`

Input:

```json
{ "query": "input block w-full rounded-md" }
```

Ranks approved assets by class overlap plus asset-name and element matches.
Returns up to three matches with the asset name, canonical classes, usage
example, first reference location, score, and matched classes.

### `check_classes`

Input:

```json
{ "classes": "block w-full rounded border px-3 py-2 text-sm" }
```

Checks a space-separated class string against approved assets using the same
class-set comparison as `dsg check`. The result includes:

- `verdict`: `ok`, `near-miss`, or `deprecated`
- `assetName`
- `assetId`
- `missingClasses`
- `extraClasses`
- `similarity`

All tool results are returned as MCP text content whose `text` value is a JSON
string.

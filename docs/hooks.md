# Claude Code hooks

`dsg install-hooks` installs a Claude Code `PostToolUse` hook that checks edited UI files immediately after an agent writes them.

## How it works

1. Claude Code runs the configured `PostToolUse` hook after `Write` or `Edit`.
2. The hook command runs `dsg hook-check --design-system <dir>`.
3. `hook-check` reads the hook JSON from stdin and checks only `tool_input.file_path`.
4. If the file has a near-miss or deprecated design-system usage, `hook-check` writes feedback to stderr and exits `2`.
5. Claude Code treats exit `2` as blocking feedback, so the coding agent receives the violation and can fix its own edit before continuing.

Non-JS files, missing design-system artifacts, files with no violations, and invalid hook JSON pass quietly with exit `0`.

## Install

From the target repo:

```bash
dsg install-hooks --design-system design-system
```

By default this writes `.claude/settings.json`. To write a different settings file:

```bash
dsg install-hooks --design-system design-system --settings .claude/settings.json
```

The command preserves existing settings and appends this `PostToolUse` entry if it is not already present:

```json
{
  "matcher": "Write|Edit",
  "hooks": [
    {
      "type": "command",
      "command": "npx -y design-system-grower hook-check --design-system <dir>"
    }
  ]
}
```

If the existing settings file is invalid JSON, the command stops. Use `--force` only when replacing the invalid file is intended.

## Uninstall

Open `.claude/settings.json` and remove the `hooks.PostToolUse` entry whose command starts with:

```bash
npx -y design-system-grower hook-check --design-system
```

Leave any other `PostToolUse` entries and unrelated settings in place.

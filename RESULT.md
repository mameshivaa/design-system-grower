# dsg-init result

## Summary

- Added `dsg init [target-dir] [--design-system <dir>] [--no-open] [--port N]`.
- Implemented the init flow in `src/init.js`: scan target, generate `design-system/` artifacts, print a human summary, start the review server, optionally open the browser, and print next-step commands on shutdown.
- Reused existing `buildCatalog`, `writeCatalog`, `writeDesignSystemArtifacts`, `startReviewServer`, and `openReviewUrl` functions.
- Extended artifact writing with an opt-in `preserveDecisions` mode so existing `decisions.json` approvals survive init regeneration.
- Kept `src/cli.js` changes limited to command registration, dispatch, argument parsing, and help text.

## Verification

- `npm test`
- Result: 31 tests passed.

## Notes

- Did not modify `README.md`.
- Did not create or modify `src/mcp-server.js` or `docs/mcp.md`.
- Did not push.

# role-taxonomy result

## Implemented
- Added `src/roles.js` with `classifyRole`, role summary aggregation, and CLI summary line formatting.
- Added `role` to all generated candidates, including canonicalize/drift and observe-only candidates.
- Added `catalog.summary.roles` as `{ variants, competingFamilies, topExample }` per role.
- Added role summary lines to `dsg scan` and `dsg init`, excluding `Other` and `Layout`.
- Added role badges and role-first grouping to the review board, including the client-side Show all renderer.
- Exported role helpers from `src/index.js`.

## Tests
- Added fixtures for Button/FormField/Alert/Badge classification.
- Added catalog summary role aggregation coverage.
- Added scan/init stdout assertions for role summary lines.
- Ran `npm test`: 34/34 passing.

## Notes
- Did not modify `README.md`, `src/check.js`, or `src/hooks.js`.
- No external runtime dependencies were added.

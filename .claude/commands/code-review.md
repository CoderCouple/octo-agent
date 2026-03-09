Review the codebase for code smells, quality issues, and improvement opportunities.

## Scope

If $ARGUMENTS is provided, treat it as a path or glob pattern and review only matching files. Otherwise, review files changed on the current branch vs main (`git diff --name-only main...HEAD`). If on main with no changes, review the most recently modified source files.

## What to look for

Scan the code for these categories of issues:

### Duplication
- Duplicated or near-duplicated code blocks across files
- Similar logic in multiple places that should share a common function
- Copy-pasted patterns with minor variations

### Naming and clarity
- Poorly named variables, functions, or files that don't communicate intent
- Misleading names (e.g., a function named `get*` that has side effects)
- Inconsistent naming conventions (mixing camelCase and snake_case, etc.)

### File organization
- Files that are too large (300+ lines) and should be split
- Related code scattered across distant files
- Code in the wrong layer (e.g., business logic in a component, UI concerns in a store)

### Generality
- Special-case code that should be general-purpose
- Hardcoded values that should be constants or configuration
- Switch/if chains that could be replaced with a data-driven approach

### Patterns and conventions
- Deviations from patterns documented in `docs/style-guide.md`
- Missing E2E mock data in IPC handlers (every handler needs an `isE2ETest` check)
- Missing unit test mock in `src/test/setup.ts` for new APIs
- `any` types that should have proper typing
- Unused imports or exports

### Architecture
- IPC handler logic that belongs in a separate module
- Store actions that are doing too much (should be composed from smaller actions)
- Components that mix concerns (data fetching + rendering + business logic)

## Output

For each issue found, report:
1. **File and line range** — where the issue is
2. **Category** — which of the above categories it falls into
3. **Description** — what's wrong and why it matters
4. **Suggested fix** — concrete recommendation (not just "improve this")

Group findings by severity:
- **Must fix** — bugs, missing mocks, broken patterns, security issues
- **Should fix** — duplication, poor naming, wrong layer, missing types
- **Consider** — style nits, minor organizational improvements

Cross-reference against `docs/code-improvements.md` to avoid flagging items that are already tracked.

## Rules

- Read the actual code before flagging issues — don't guess from file names.
- Reference the project's own conventions (from `docs/style-guide.md`, `docs/architecture.md`, and `CLAUDE.md`) rather than generic best practices.
- Don't flag issues that are already tracked in `docs/code-improvements.md`.
- Be specific — "this function is too long" is not useful; "lines 45-120 of foo.ts handle three separate concerns (parsing, validation, persistence) and should be split" is useful.

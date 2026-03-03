Commit current work, pull latest from main, merge, and validate.

## Steps

1. **Check for uncommitted changes.** Run `git status`. If there are staged or unstaged changes (including untracked files that look like project code), commit them with a descriptive message summarizing the work so far. If there's nothing to commit, skip to step 2.

2. **Fetch and merge main.** Run:
   ```
   git fetch origin main
   git merge origin/main
   ```

3. **Handle merge conflicts.** If the merge produces conflicts:
   - Read each conflicting file and understand both sides.
   - Resolve conflicts by keeping the intent of both changes where possible.
   - Stage resolved files and complete the merge commit.
   - If a conflict is ambiguous (e.g., both sides changed the same logic in incompatible ways), describe the conflict to the user and ask which direction to take before resolving.

4. **Run `/validate`.** After the merge is complete, run the full verification checklist: lint, typecheck, check:all, unit tests, coverage, and E2E tests. Fix any failures introduced by the merge.

## Rules

- Never force-push or rewrite history on shared branches.
- If merge conflicts are too complex to resolve confidently, stop and ask the user for guidance rather than guessing.
- The commit message for the initial save (step 1) should reflect what was actually changed, not just "WIP" — read the diff to write a good message.

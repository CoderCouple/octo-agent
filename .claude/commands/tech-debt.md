Review and update the tech debt backlog in docs/code-improvements.md.

## Steps

1. **Read the current backlog.** Read `docs/code-improvements.md` thoroughly. Understand each tracked item — its problem statement, proposed solution, and priority.

2. **Check which items have been addressed.** For each item in the backlog:
   - Read the relevant source files mentioned in the item
   - Determine if the proposed change has been implemented (fully or partially)
   - If fully addressed, mark it with a ~~strikethrough~~ header and add a note saying when/how it was resolved
   - If partially addressed, update the description to reflect remaining work

3. **Scan for new tech debt.** Look through the codebase for new improvement opportunities not yet tracked:
   - Large files that have grown beyond their original scope
   - New patterns that diverge from documented conventions
   - TODO/FIXME/HACK comments in the source code (`grep -r "TODO\|FIXME\|HACK" src/`)
   - Duplicated code introduced by recent changes
   - Deprecated dependencies or patterns

4. **Cross-reference with code-review findings.** If there are recent code review notes or PR comments, incorporate relevant items.

5. **Update `docs/code-improvements.md`:**
   - Keep the same format and priority structure (High / Medium / Low)
   - Add new items with: Problem, Current state (with file paths and line numbers), Proposed solution (with code examples where helpful), Expected benefit
   - Re-prioritize if the landscape has changed (e.g., a medium item is now blocking other work → promote to high)
   - Remove or archive items that are no longer relevant

6. **Summarize changes.** Report what was updated: items resolved, items added, items reprioritized.

## Rules

- Every item must reference specific files and line numbers — no vague "improve the code" entries.
- Proposed solutions should be concrete enough that someone could implement them without further research.
- Don't add items for things that are working fine just because they could theoretically be "better" — focus on issues that cause real friction (bugs, confusion, slow development, maintenance burden).
- Keep the document scannable — use consistent formatting and don't let individual items get too long.

#!/bin/bash
# Fake Claude simulator that reproduces the compaction + screen-clear + redraw
# pattern that triggers scroll jumping in long sessions.
#
# What happens in real Claude Code:
#   1. Agent outputs content over a long session (building up scrollback)
#   2. Context compaction fires
#   3. Claude clears the screen: \x1b[2J (erase display) + \x1b[3J (erase scrollback) + \x1b[H (cursor home)
#   4. Claude redraws its entire UI in a large burst — header, conversation
#      history, current task, checklists — all with rich ANSI formatting
#   5. The burst is split into ~1024-byte PTY chunks
#   6. Each partial chunk leaves xterm's cursor mid-redraw, causing viewport jumps
#
# This script simulates that exact sequence.

echo "FAKE_CLAUDE_READY"
sleep 0.5

# ── ANSI codes matching real Claude Code output ──
BOLD=$'\033[1m'
RESET=$'\033[0m'
DIM=$'\033[2m'
# RGB colors matching the real diagnostic logs
GRAY=$'\033[38;2;153;153;153m'
GREEN=$'\033[38;2;78;186;101m'
WHITE=$'\033[38;2;248;248;242m'
PURPLE=$'\033[38;2;190;132;255m'
PINK=$'\033[38;2;249;38;114m'
LIME=$'\033[38;2;166;226;46m'
BLUE=$'\033[38;2;74;192;252m'
BG_GREEN=$'\033[48;2;2;40;0m'
BG_DARKGREEN=$'\033[48;2;4;71;0m'
DIFF_PLUS=$'\033[38;2;80;200;80m'
SYNCED_START=$'\033[?2026h'
SYNCED_END=$'\033[?2026l'

# ── Phase 1: Build up scrollback (simulate a long session) ──
# Output enough content to create significant scrollback

echo ""
echo "  ${BOLD}Claude Code${RESET} ${GRAY}v2.1.44${RESET}"
echo ""

# Simulate reading files
for i in $(seq 1 5); do
    echo "${GREEN}⏺${RESET} ${BOLD}Read${RESET}(src/components/Widget${i}.tsx)"
    echo "  ⎿  ${GRAY}Read ${BOLD}src/components/Widget${i}.tsx${RESET}${GRAY} (150 lines)${RESET}"
    sleep 0.01
done

echo ""
echo "${GREEN}⏺${RESET} I'll implement the requested changes across multiple files."
echo ""

# Simulate writing files with diffs (builds scrollback)
for f in "AuthProvider" "UserProfile" "Dashboard" "Settings" "Navigation"; do
    echo "${GREEN}⏺${RESET} ${BOLD}Update${RESET}(src/components/${f}.tsx)"
    echo "  ⎿  Updated ${BOLD}src/components/${f}.tsx${RESET} with 45 additions, 12 removals"
    # Show a fake diff block with ANSI colors
    for line in $(seq 1 15); do
        printf "  %s   ${BG_GREEN}${DIFF_PLUS} %3d +${WHITE}   const %s = useCallback(() => {${RESET}\n" "   " "$line" "handler${line}"
    done
    echo ""
    sleep 0.01
done

# More conversation to build scrollback
echo "${GREEN}⏺${RESET} ${BOLD}Running tests...${RESET}"
echo ""
echo "${GREEN}⏺${RESET} Bash(pnpm test:unit 2>&1)"
for i in $(seq 1 30); do
    echo "  ${GRAY}✓${RESET} should handle ${WHITE}test case ${i}${RESET} (${GRAY}${i}ms${RESET})"
done
echo "  ⎿  ${GREEN}30 passed${RESET} ${GRAY}(2.1s)${RESET}"
echo ""

echo "${GREEN}⏺${RESET} All tests pass. Let me also run the linter."
echo ""
echo "${GREEN}⏺${RESET} Bash(pnpm lint 2>&1)"
echo "  ⎿  ${GRAY}No errors found${RESET}"
echo ""

# Add a task checklist (like real Claude Code)
echo "✢ ${BOLD}Implementation progress${RESET} ${GRAY}(5m 23s · ↑ 12.4k tokens)${RESET}"
echo "  ⎿  ${GREEN}✔${RESET} Read source files"
echo "  ⎿  ${GREEN}✔${RESET} Update AuthProvider component"
echo "  ⎿  ${GREEN}✔${RESET} Update UserProfile component"
echo "  ⎿  ${GREEN}✔${RESET} Update Dashboard component"
echo "  ⎿  ${GREEN}✔${RESET} Update Settings component"
echo "  ⎿  ${GREEN}✔${RESET} Run tests"
echo "  ⎿  ◼ Run linter"
echo ""

SCROLLBACK_MARKER="SCROLLBACK_BUILT"
echo "$SCROLLBACK_MARKER"

# Brief pause — scrollback is established
sleep 1

# ── Phase 2: Simulate compaction — clear screen + scrollback ──
# This is the exact sequence Claude Code sends after context compaction.
# The \x1b[2J\x1b[3J\x1b[H sequence wipes everything and homes the cursor.

COMPACTION_MARKER="COMPACTION_START"
echo "$COMPACTION_MARKER"
sleep 0.3

# Clear screen + scrollback + cursor home (wrapped in synchronized output)
printf "${SYNCED_START}\033[2J\033[3J\033[H"

# ── Phase 3: Large burst redraw ──
# Build the ENTIRE redraw into a single string and output it in ONE write.
# This forces the PTY to split it into ~1024-byte chunks, which is what
# triggers the scroll jumping bug.

REDRAW=""

# Claude Code header
REDRAW+="\r\r\n"
REDRAW+="\033[11C${BOLD}Claude\033[1CCode\033[1C\033[22m${GRAY}v2.1.44\033[39m\r\r\n"
REDRAW+="\r\r\n"

# Conversation history (re-rendered after compaction)
REDRAW+="${GREEN}⏺\033[1C\033[39m${BOLD}Read\033[22m\033[1C5 files\r\r\n"
REDRAW+="\033[2C⎿\033[1C ${GRAY}Read\033[1C${BOLD}src/components/AuthProvider.tsx\033[22m\033[39m\r\r\n"
REDRAW+="\033[2C⎿\033[1C ${GRAY}Read\033[1C${BOLD}src/components/UserProfile.tsx\033[22m\033[39m\r\r\n"
REDRAW+="\033[2C⎿\033[1C ${GRAY}Read\033[1C${BOLD}src/components/Dashboard.tsx\033[22m\033[39m\r\r\n"
REDRAW+="\033[2C⎿\033[1C ${GRAY}Read\033[1C${BOLD}src/components/Settings.tsx\033[22m\033[39m\r\r\n"
REDRAW+="\033[2C⎿\033[1C ${GRAY}Read\033[1C${BOLD}src/components/Navigation.tsx\033[22m\033[39m\r\r\n"
REDRAW+="\r\r\n"

# Updated files with diff blocks (this is where it gets large)
for f in "AuthProvider" "UserProfile" "Dashboard" "Settings" "Navigation"; do
    REDRAW+="${GREEN}⏺\033[1C\033[39m${BOLD}Update\033[22m(src/components/${f}.tsx)\r\r\n"
    REDRAW+="\033[2C⎿\033[1C Updated ${BOLD}src/components/${f}.tsx\033[22m\r\r\n"

    # Diff lines with rich ANSI formatting (lots of RGB color codes = big chunks)
    for line in $(seq 1 20); do
        REDRAW+="\033[5C${BG_GREEN}${DIFF_PLUS}$(printf ' %3d' $line) +${WHITE}   const ${LIME}handler${line}${PINK} = ${BLUE}useCallback${WHITE}(() => {\033[39m\033[49m\r\r\n"
    done

    REDRAW+="\033[5C${GRAY}... +25 more lines (ctrl+o to expand)\033[39m\r\r\n"
    REDRAW+="\r\r\n"
done

# Test results
REDRAW+="${GREEN}⏺\033[1C\033[39mBash(pnpm test:unit 2>&1)\r\r\n"
REDRAW+="\033[2C⎿\033[1C ${GREEN}30 passed\033[39m ${GRAY}(2.1s)\033[39m\r\r\n"
REDRAW+="\r\r\n"

# Lint results
REDRAW+="${GREEN}⏺\033[1C\033[39mBash(pnpm lint 2>&1)\r\r\n"
REDRAW+="\033[2C⎿\033[1C ${GRAY}No errors found\033[39m\r\r\n"
REDRAW+="\r\r\n"

# Current task with checklist
REDRAW+="✢ ${BOLD}Implementation progress\033[22m ${GRAY}(8m 12s · ↑ 29.8k tokens)\033[39m\r\r\n"
REDRAW+="\033[2C⎿\033[1C ${GREEN}✔\033[39m Read source files\r\r\n"
REDRAW+="\033[2C⎿\033[1C ${GREEN}✔\033[39m Update AuthProvider component\r\r\n"
REDRAW+="\033[2C⎿\033[1C ${GREEN}✔\033[39m Update UserProfile component\r\r\n"
REDRAW+="\033[2C⎿\033[1C ${GREEN}✔\033[39m Update Dashboard component\r\r\n"
REDRAW+="\033[2C⎿\033[1C ${GREEN}✔\033[39m Update Settings component\r\r\n"
REDRAW+="\033[2C⎿\033[1C ${GREEN}✔\033[39m Run tests\r\r\n"
REDRAW+="\033[2C⎿\033[1C ${GREEN}✔\033[39m Run linter\r\r\n"
REDRAW+="\r\r\n"

# Prompt line
REDRAW+="─────────────────────────────────────────────────────────────────────\r\r\n"
REDRAW+="❯ \r\r\n"

# End synchronized output
REDRAW+="${SYNCED_END}"
REDRAW+="\r\r\n"

REDRAW+="REDRAW_COMPLETE\r\r\n"

# Output the ENTIRE redraw in a single printf — forces PTY chunking
printf "%b" "$REDRAW"

sleep 0.5

# After redraw, simulate continued work (more output arriving)
echo ""
echo "${GREEN}⏺${RESET} ${BOLD}Now continuing with additional changes...${RESET}"
echo ""

for f in "ApiClient" "DataStore" "EventBus" "Logger" "Config"; do
    echo "${GREEN}⏺${RESET} ${BOLD}Update${RESET}(src/lib/${f}.ts)"
    for line in $(seq 1 10); do
        printf "  %s   ${BG_GREEN}${DIFF_PLUS} %3d +${WHITE}   export function ${LIME}process${f}${line}${WHITE}(): void {${RESET}\n" "   " "$line"
    done
    echo ""
    sleep 0.01
done

echo "POST_COMPACTION_END"
echo ""
echo "FAKE_CLAUDE_IDLE"

# Keep running
sleep 999999

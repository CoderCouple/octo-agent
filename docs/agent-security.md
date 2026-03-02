# Agent Security Comparison

How mainstream AI coding agents handle isolation, filesystem access, and auto-approval.

## Agent Comparison

| Agent | Sandbox Default | FS Access | Credential Protection | Auto-approve Risk |
|-------|----------------|-----------|----------------------|-------------------|
| Claude Code | OFF (opt-in Seatbelt/bwrap) | Full machine read/write | Manual deny rules only | `--dangerously-skip-permissions` — no restrictions |
| Codex CLI | **ON** (Seatbelt/Landlock) | Workspace + /tmp | Auto-filters KEY/SECRET/TOKEN | `full-auto` — sandbox still enforced |
| Gemini CLI | OFF (opt-in) | Full machine | None | Not documented |
| Copilot CLI | None | Full machine | None | `--yolo` — no restrictions, known bypasses |
| Cursor | **ON** (Seatbelt/Landlock) | Writes: workspace. Reads: full machine | `.cursorignore` (bypassable on macOS) | YOLO — sandbox active but bypass bugs |
| Aider | None | Full machine | None | `--yes` — auto-approve file changes |

## What Broomy Isolation Protects Against

When you enable Docker isolation for an agent in Broomy:

- **Filesystem containment**: The agent can only read/write the mounted repo directory and the shared config folder (`~/.broomy/isolation/`). Your home directory, other repos, SSH keys, cloud credentials, and browser data are inaccessible.
- **Process isolation**: The agent runs in a separate Linux container. It cannot access host processes, signals, or IPC.
- **Combined with skip-permissions**: You get the speed of auto-approval with the safety of a container. The agent can't damage files outside the repo even if it tries.

## What It Does NOT Protect Against

- **Network access**: The container has full network access by default. An agent can still make API calls, exfiltrate code via HTTP, or access external services.
- **API key usage**: If you place API keys in the shared config folder, the agent has access to them and can use them however it wants.
- **Repo damage**: The agent has full read/write to the mounted repo. It can delete files, rewrite history, or make destructive git operations within that repo.
- **Resource consumption**: No CPU/memory limits are enforced by default. A runaway agent can consume host resources.

## Best Practices

1. **Enable isolation + skip-permissions together** for maximum productivity with safety.
2. **Only put necessary credentials** in `~/.broomy/isolation/`. Don't dump your entire `.ssh` directory — copy only the keys needed for git operations.
3. **Use a custom Docker image** with only the tools your agent needs. The default image includes common development tools, but a minimal image reduces attack surface.
4. **Review agent output** even with isolation — container boundaries protect your machine, not your repo.

## Per-Agent Security Documentation

- [Claude Code Security](https://docs.anthropic.com/en/docs/claude-code/security)
- [Codex CLI](https://github.com/openai/codex)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli)
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-in-the-command-line)
- [Cursor](https://docs.cursor.com/)
- [Aider](https://aider.chat/docs/config/options.html)

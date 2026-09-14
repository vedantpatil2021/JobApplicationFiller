# Claude Code

@AGENTS.md

## Claude Code specifics

- `.superpowers/` is scratch space for subagent-driven runs. It is gitignored
  and invisible to Cursor and Codex, so **it is never the handoff record** —
  `docs/STATE.md` is. Mirror anything durable there before you finish.
- When executing a plan with `superpowers:subagent-driven-development`, update
  `docs/STATE.md` at each task completion, not only at the end. A run that is
  interrupted mid-plan must still hand off cleanly.

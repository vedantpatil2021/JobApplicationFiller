# Agent instructions

Canonical instructions for every AI tool working on this repository — Claude
Code, Cursor, Codex, and anything else. `CLAUDE.md` and `.cursor/rules/` both
point here. **Edit this file, never the pointers**, or the three tools drift
apart.

## What this project is

Job Application Filler: a local-only tool that fills job applications from one
profile you keep on your own machine. A Node server owns the data, a React web
page edits it, a Chrome extension fills the forms. AI runs through the user's
local `claude` CLI on their existing subscription — no API key, no cost.

## Start every session here

1. Read **`docs/STATE.md`**. It says what is done, what is in progress, and
   what is next. It is the handoff between tools and sessions.
2. Read **`PLAN.md`** for the milestone map and the binding global constraints.
3. Read the plan file for the current milestone — `docs/superpowers/plans/`.
   The plan for the task you are about to do contains the real code and the
   real tests. Follow it; do not improvise a different design.
4. Run `git log --oneline -10`. If it disagrees with `docs/STATE.md`, trust
   git and fix `STATE.md`.

Do not re-do a task `docs/STATE.md` marks complete. Verify with `git log`
before assuming anything is missing.

## Finish every session here

Before you stop — including when you are running out of context or the user
interrupts you:

1. Commit your work. Never leave a dirty tree for the next tool.
2. Update **`docs/STATE.md`**: move the task's status, set "Next up", and add
   anything the next agent would be surprised by.
3. Say in your final message which commit you ended on.

An unrecorded session is a session the next tool will repeat.

## Hard rules

These come from `PLAN.md` → Global Constraints, which is the full list. The
ones that cause real damage if broken:

- **Never auto-submit a job application.** Fill and highlight only. Enforced
  centrally in `packages/extension/src/content/fill/guard.ts`.
- **Never commit `profile/`.** It holds the user's real personal data.
- **Never introduce a paid API key path.** AI goes through the local `claude`
  CLI. Never use `claude --bare` — it forces `ANTHROPIC_API_KEY`.
- **Never spawn a shell string.** Child processes take an argv array, never
  `shell: true`.
- The server binds `127.0.0.1` only, never `0.0.0.0`, and every request needs
  the pairing token.
- **Everything the user needs is in the web page.** Never require them to edit
  a file, read source, or run a query to configure or repair anything.

## Working agreement

- **TDD.** Write the failing test, watch it fail, implement, watch it pass.
  The plans are written this way and contain the tests to use.
- **Small commits, conventional messages** (`feat(server): …`, `fix(extension): …`,
  `docs: …`). One task per commit series.
- **Never mark work done without running the tests.** Paste the real output.
- **Do not add dependencies** that `PLAN.md` does not name. No pnpm, no turbo,
  no nx, no Jest, no gluestack, no react-native-web, no state-management or
  router library.
- If the plan is wrong, say so and fix the plan file in the same commit as the
  code. A silently-diverging plan is worse than no plan.

## Layout

```
PLAN.md                    milestone map + binding constraints
ABOUT.md                   original requirements (historical; PLAN.md wins)
docs/STATE.md              ← handoff state, read first, write last
docs/superpowers/specs/    the design the plans argue from
docs/superpowers/plans/    per-milestone task plans with real code
packages/shared/           profile schema + field types, used by everything
packages/server/           Express server, owns the data on disk
packages/controller/       the React web page
packages/extension/        the Chrome MV3 extension
profile/                   the user's real data — gitignored, never commit
```

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install all workspaces |
| `npm run dev` | Start server (4321) and web page (5173) |
| `npm test` | Every test in the project |
| `npm test -w @jaf/server` | One workspace |
| `npm run build -w @jaf/extension` | Rebuild the extension for Chrome |

Node 22+ required — see `.nvmrc`.

## Code style

`.editorconfig` and `.prettierrc` are the arbiters, so all three tools format
identically. Do not reformat files you did not otherwise change; a diff full of
whitespace churn hides the real change from the next reviewer.

- TypeScript `strict: true`. No `any` without a `// why:` comment.
- ESM everywhere. Relative imports carry the `.js` extension.
- Comments explain *why*, not *what*. Delete a comment rather than let it go
  stale.

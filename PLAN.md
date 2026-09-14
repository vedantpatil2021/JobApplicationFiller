# Job Application Filler — Master Plan

**Spec:** `docs/superpowers/specs/2026-09-13-job-application-filler-design.md`

A local-only job application autofill system. Node server owns the profile,
React controller edits it, Chrome extension detects career pages and fills
them. AI runs through the local `claude` CLI on an existing subscription — no
API key, no cost.

---

## Global Constraints

Every task in every plan inherits these. Copied verbatim from the spec.

**Toolchain**
- Node `>= 22` (verified local: v22.23.1), npm `>= 10` (verified: 10.9.8)
- TypeScript `strict: true` everywhere. No `any` without a `// why:` comment.
- npm workspaces monorepo. No pnpm, no turbo, no nx.
- Vitest for all tests. Supertest for HTTP. No Jest.

**Stack — do not substitute**
- React 18 + TypeScript + Vite + Tailwind + Radix primitives.
- **No gluestack, no react-native-web, no NativeWind.** Superseded by an
  explicit decision in the spec (§1); `ABOUT.md` is out of date on this point.
- Extension: Chrome MV3 via `@crxjs/vite-plugin`.

**Hard rules**
- The server binds `127.0.0.1` only. Never `0.0.0.0`.
- Every request to the server requires the pairing token. CORS is locked to
  the extension and controller origins.
- The CLI is spawned with an **argv array**. Never a shell string, never
  `shell: true`.
- **Never use `claude --bare`** — it forces `ANTHROPIC_API_KEY` and breaks the
  zero-cost requirement. See spec §1.1.
- **Never auto-submit.** Enforced in the fill layer (`fill/guard.ts`), not left
  to individual adapters.
- User data lives in `./profile/` and is gitignored. Never commit a profile.

**Self-service — the user never reads code**
- Every add, edit and delete a user needs is available in the controller web
  page. Never require editing a file, running a query or reading source to
  configure, inspect or repair anything.
- Failures surface in the UI in plain language with the fix stated, not as a
  console error or a silent no-op.
- `README.md` carries a Quick setup (clone to working, no explanation) and a
  Detailed setup (prerequisites, each step, data location, troubleshooting).

**Conventions**
- Port `4321` server, `5173` controller.
- Package names: `@jaf/shared`, `@jaf/server`, `@jaf/controller`,
  `@jaf/extension`.
- Commits: conventional (`feat:`, `fix:`, `test:`, `chore:`).
- Every task ends green and committed.

---

## Milestone map

| # | Milestone | Plan | Demoable outcome |
|---|---|---|---|
| M1 | Foundation — shared schema, server, controller editor | `plans/2026-09-13-m1-foundation.md` | Edit a profile and it persists to `profile.yaml` |
| M2 | Extension skeleton — detection, sticky FAB, sync | `plans/2026-09-13-m2-m3-extension-autofill.md` | Widget appears on career pages |
| M3 | Fill engine — harvest, resolve, fill on Greenhouse + Lever | same file | **First real autofill** |
| M4 | Claude CLI bridge — AI fallback, answer cache | written after M3 | Handles custom questions |
| M5 | Adapters — Ashby, Gem, SmartRecruiters, Workday, iCIMS, Taleo, Oracle Fusion | written after M4 | Full ATS coverage |
| M6 | AI features — resume parsing, JD extraction, answer drafting, app log | written after M5 | Feature complete |
| M7 | Hardening — shadow DOM, wizard re-detection, edge cases | written after M6 | Ship |

### Why M4–M7 are written later, not now

Plans for the remaining adapters cannot be written honestly today. Workday,
iCIMS, SmartRecruiters and Taleo generate per-tenant IDs and hide fields in
shadow DOM and iframes; the research confirmed no published selector maps
exist for any of them. Writing those tasks now would mean inventing selectors,
which is exactly the placeholder failure that makes a plan useless to its
implementer.

M3 produces the harvest tooling that dumps a live form's real structure, and
its final task records what failed to fill in `docs/ats/findings.md`. Each later
plan gets written from that output — against actual DOM, not guesses.

---

## Execution order

Run the plans in order. Each ends with working, committed software.

```
M1 foundation ──> M2/M3 extension + autofill ──> M4 AI ──> M5 adapters ──> M6 features ──> M7 hardening
```

Do not start a plan before its predecessor is green.

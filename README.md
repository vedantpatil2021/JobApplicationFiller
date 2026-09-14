# Job Application Filler

Fills job applications from one profile you keep on your own machine. A local
web page holds your details and resumes; a Chrome extension fills the forms.

- **Nothing leaves your machine.** The server listens on `127.0.0.1` only.
- **No API key, no AI bill.** AI runs through your existing Claude subscription
  via the local `claude` CLI.
- **It never submits anything.** It fills and highlights; you review and click
  Submit yourself.

## Quick setup

You need [Node 22+](https://nodejs.org) and Chrome.

```bash
git clone <your-repo-url> job-application-filler
cd job-application-filler
npm install
npm run dev
```

Then:

1. Open <http://localhost:5173>.
2. Fill in the **Profile** tab and click **Save**.
3. Add your CV in the **Resumes** tab.

That is enough to persist a profile. The Chrome extension (load it, paste the
pairing token) is the next milestone — skip those Setup-tab steps until
`packages/extension` exists.

Everything after this point is detail you only need if something goes wrong.

## Detailed setup

### 1. Prerequisites

| Requirement | Check | Notes |
|---|---|---|
| Node 22 or newer | `node -v` | Older versions will not run the server |
| npm 10 or newer | `npm -v` | Ships with Node 22 |
| Google Chrome | — | The extension is Chrome MV3 |
| Claude CLI (optional) | `claude --version` | Only needed for AI-assisted answers |

The Claude CLI is optional. Without it, every field that heuristics can match
still fills; only AI-drafted answers for unusual questions are unavailable.
If you have it, authenticate once:

```bash
claude login
```

### 2. Install and start

```bash
npm install          # installs the workspaces
npm run dev          # starts the server and the web page together
```

`npm run dev` runs two processes:

| Process | URL | Purpose |
|---|---|---|
| `@jaf/server` | http://127.0.0.1:4321 | Owns `profile.yaml` and your resumes |
| `@jaf/controller` | http://localhost:5173 | The web page you use |

Leave both running while you apply for jobs. The extension keeps a cached copy
of your profile, so autofill still works if you stop them — it just will not
see edits you make after that.

### 3. Build and load the extension

This step needs `packages/extension`, which arrives in milestone 2. Skip it
until that package exists; the Profile and Resumes tabs work without it.

```bash
npm run build -w @jaf/extension
```

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the `packages/extension/dist` folder in this project.

### 4. Pair the extension

The server generates a random pairing token on first start. It stops other
websites from reading your profile out of the local server.

1. In the web page, open the **Setup** tab.
2. Click **Copy token**.
3. On `chrome://extensions`, click **Details** on Job Application Filler, then
   **Extension options**.
4. Paste the token and click **Save and test**. It should say `Paired.`

### 5. Use it

Open a job application. The **Fill application** button appears bottom-right.
Click it. The panel lists every field with a badge:

| Badge | Meaning |
|---|---|
| `filled` | Written from your profile |
| `needs-user` | Found, but you have to answer it |
| `skipped` | Deliberately left alone — a submit button, or a field you edited |
| `failed` | No option on the form matched your value |

Read the form, fix anything marked for attention, then submit it yourself.

## Where your data lives

Everything is in the `profile/` folder of this project:

```
profile/
├── profile.yaml     your details
├── resumes/         the files you uploaded
└── .token           the extension pairing token
```

`profile/` is in `.gitignore`. It is never committed. To move to a new machine,
copy that folder across. To delete everything, delete the folder.

You can edit `profile.yaml` by hand if you like, but you never have to — the
web page can add, change and delete everything in it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Web page says "Can't reach the server" | Run `npm run dev`, then reload the page |
| Extension options says `Server said 401` | Token is wrong — copy it again from the Setup tab |
| Extension options can't reach the server | The server is not running, or a firewall is blocking `127.0.0.1:4321` |
| No **Fill application** button on a job page | That page was not recognised as an application. Open the extension's Options page to confirm pairing, then reload the job page |
| Setup tab says the Claude CLI is missing | Install the CLI and run `claude login`. Heuristic filling works without it |
| Nothing fills, but the button appears | Check the Profile tab is saved — the Setup tab shows `Profile saved: yes` |
| Demographics fields stay empty | By design. Turn on the opt-in at the top of that profile section |

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the server and web page |
| `npm test` | Run every test in the project |
| `npm run build` | Typecheck shared and build the web page |
| `npm run build -w @jaf/extension` | Rebuild the extension (milestone 2) |

## Layout

```
packages/
├── shared/      profile schema and field types, used by everything
├── server/      Express server, owns your data on disk
├── controller/  the React web page
└── extension/   the Chrome extension (milestone 2)
```

## What it will not do

It never submits an application, never clicks Next in a multi-step form, never
fills a password, payment or Social Security field, and never fills the
voluntary EEO questions unless you explicitly opt in.

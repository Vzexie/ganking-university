# Ganking University

A fan-made, dark-fantasy-Ivy-League admissions portal for a Deepwoken guild.
Node/Express + PostgreSQL backend, cookie-session auth, and a vanilla JS frontend.

## What's in here

```
gu/
├── package.json
├── .env.example          copy to .env for local dev (don't commit .env)
├── .gitignore
├── README.md
├── server/
│   ├── index.js          app entry point (sessions, static files, route mounting)
│   ├── db.js              Postgres connection pool
│   ├── schema.sql         all tables (CREATE TABLE IF NOT EXISTS — safe to re-run)
│   ├── seed.js             runs schema.sql + seeds default roles/admin/board/yearbook on boot
│   ├── middleware/
│   │   └── auth.js         loads current user + merged permissions, route guards
│   └── routes/
│       ├── auth.js         login/logout/session, public admission-request flow
│       ├── admin.js        admission-request queue, unit-request queue, settings
│       ├── roles.js        create/edit custom roles
│       ├── users.js        list users, assign/remove roles, create staff accounts
│       ├── applications.js application drafts/submissions, ratings, comments
│       ├── board.js        admissions reveal board, add slots
│       ├── classes.js      class CRUD, enroll/drop, grading, units
│       ├── chat.js         common hall chat
│       ├── feed.js         Gank Log + Bank (shared handler)
│       ├── yearbook.js     yearbook voting (incl. the fixed "Broshi" category)
│       ├── blog.js         The Chronicle — write/review/publish
│       ├── detention.js    Campus Security detention
│       └── units.js        student unit-increase requests
└── public/                served as static files by Express
    ├── index.html
    ├── styles.css
    ├── app.js               all frontend logic, talks to /api/* via fetch()
    └── assets/
        ├── logo.png
        ├── building.webp
        └── building2.webp
```

## How the pieces fit together

- **One web service, one process.** Express serves the API under `/api/*` and the
  static frontend from `public/` for everything else. No CORS to worry about.
- **Sessions live in Postgres too** (`connect-pg-simple` creates a `user_sessions`
  table automatically), so logins survive a restart.
- **Roles are data, not code.** The `roles` table has a `tier` (student / staff /
  admission_counselor / admin — used for hierarchy: highest tier held wins) and a
  `permissions` JSONB blob (specific powers like `can_grade`, `can_write_blog`,
  etc.). Built-in roles (Professor, Dean, Campus Security, ...) are seeded on
  first boot; admins can create additional custom roles with any mix of powers.
- **The admission flow is two-step on purpose:** a visitor submits a request
  (username/password/roblox link) → staff confirm the in-game moonseye payment
  and approve it → the account is created and they can log in and fill out (or
  resume) their application.

## Local development

```bash
npm install
cp .env.example .env   # then edit .env with your Neon connection string
npm start
```

You'll need a Neon Postgres database for `DATABASE_URL` to point at — see the
"Setting up Neon" section below. The app creates all tables and seed data
automatically on first boot — no separate migration step.

Default bootstrap admin login (only created if no `admin` user exists yet):
`admin` / `admin123` — **change this password immediately** once you're live,
via a new staff account or by updating it directly in the database.

## Setting up Neon (the database)

Neon is a serverless Postgres host with a free tier that doesn't expire and
scales to zero when idle (so a quiet week doesn't cost anything — it just
wakes back up in well under a second on the next request).

1. Go to **neon.tech** and sign up (GitHub or Google login both work, no
   credit card required for the free tier).
2. Click **New Project**. Give it a name (e.g. `ganking-university`), pick a
   region close to where most players are, and create it. A default database
   and a default branch (`main`) are created automatically.
3. On the project dashboard, find the **Connection String** panel. Make sure
   the toggle/dropdown is set to **Pooled connection** (this matters — the
   pooled string handles many short-lived connections well, which is exactly
   what a typical web app does; the "direct connection" string is meant for
   migrations/long-running jobs).
4. Copy that connection string. It looks like:
   `postgresql://user:password@ep-xxxx-pooler.region.aws.neon.tech/dbname?sslmode=require`
5. That whole string is your `DATABASE_URL`. Nothing else needed — `server/db.js`
   auto-detects the `neon.tech` hostname and turns SSL on for you.

That's it — Neon doesn't require any API keys or secrets in the code itself,
just this one connection string as an environment variable.

## Deploying on Render.com

1. **Push this folder to a GitHub repo** (see chat for exact git commands).
2. **Set up your Neon database** — see the section above — and copy its pooled
   connection string.
3. **Create a Web Service** on Render: New → Web Service → connect your GitHub
   repo.
   - Runtime: Node
   - Build command: `npm install`
   - Start command: `npm start`
4. **Set environment variables** on the web service (Settings → Environment):
   - `DATABASE_URL` = your Neon pooled connection string from step 2
   - `SESSION_SECRET` = any long random string
   - `NODE_ENV` = `production`
   - `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` = your choice
   - Leave `PORT` unset — Render sets it for you.
   - You do **not** need to set `PGSSL` — it's auto-detected for Neon.
5. Deploy. On first boot the server creates all tables and seed data
   automatically (check the logs for "Database schema ensured and seed data
   applied.").
6. Log in as your bootstrap admin, then immediately use **Roles & Users** to
   create real staff accounts and consider changing/rotating the bootstrap
   admin's password (there's no in-app "change my own password" flow yet —
   the quickest path is creating a fresh admin account and just not using the
   bootstrap one, or updating `users.password_hash` directly via Neon's SQL
   editor with a bcrypt hash).

### Honest limitations worth knowing about

- No real email verification — the "account system" is username/password only.
  Good enough for a guild joke site, not for anything sensitive.
- No password-reset flow yet.
- Images (profile pics, Gank Log/Bank screenshots) are stored as base64 text
  directly in Postgres, capped at ~1.5–2MB each. Fine at small scale, but this
  eats into Neon's free storage quota faster than plain text — see below.
- The application fee (moonseyes) and all approvals are just bookkeeping on
  this site — actual in-game payment confirmation is a manual, honor-system
  step staff perform before clicking Approve.
- **Neon free tier limits** (subject to change — check neon.tech/pricing for
  current numbers): 0.5GB storage per project, 100 compute-hours per month,
  scale-to-zero after 5 minutes idle. The cold-start wake-up is fast (roughly
  half a second), so occasional visitors won't notice, but if this genuinely
  takes off and gets constant traffic you may need Neon's paid tier.

# Board Meeting Management System

A single-tenant, internally-hosted web application for the full board-meeting lifecycle of **one company**, built to the practical workflow of a Company Secretary and the compliance obligations of Indian company law (**Companies Act 2013 + SS-1**, unlisted assumption).

Built with **Next.js 14 (App Router) + TypeScript + Tailwind + Prisma**, targeting **Microsoft SQL Server**.

> ⚖️ **Compliance disclaimer:** the built-in rules (s.173/174/118, SS-1 references) reflect the law as commonly understood. Have your Company Secretary / legal counsel validate them against the current Act and SS-1 text before relying on them — provisions are periodically amended.

---

## What's included

All modules from the build spec are implemented (functionally, across all phases):

| Area | Modules |
|---|---|
| **Core loop** | Users & roles · Meetings (calendar/list) · Agenda builder (lock + supplementary items) · Board pack (upload → version → compile to single PDF → publish) · Minutes (draft → circulate → comment → approve/sign → publish, immutable + addenda) |
| **Operational** | Document repository (governance folders, classification, full-text search) · Action-item tracker (escalation) · Attendance + quorum · In-app/email notifications |
| **Governance** | Resolutions (board + circular) · Electronic voting with quorum-aware tally · Committees · Declarations-of-interest register |
| **Hardening** | Server-side RBAC from day one · Audit log on every write · Soft-delete of legal records · Azure AD SSO · Retention-policy engine · Compliance calendar |
| **Polish** | Meeting links (Teams/Zoom/Webex) · PDF reading + annotations · Reports/dashboards · Assistant (search over the minute book, optional Claude synthesis) |

### Cross-cutting principles (spec §3)
- **Every write is audit-logged** (actor, action, entity, before/after) — `src/lib/audit.ts`.
- **Role checks are server-side** in every action — `src/lib/rbac.ts` (the §4 matrix).
- **Legal records are soft-deleted, never hard-deleted**; minutes/resolutions are permanent.
- **Documents live outside the DB** (file storage adapter), access-checked per document.

---

## Prerequisites

- **Node.js 18.18+** (developed on Node 24).
- A reachable **Microsoft SQL Server** (SQL Server 2019/2022 Express or Developer, or **Azure SQL**) with:
  - **TCP/IP enabled** and **SQL Server Authentication** turned on.
  - A database created, e.g. `board_meetings`, and a login with rights to it.

> Prisma's SQL Server connector talks **TCP**, so SQL Express named-pipe-only / LocalDB setups need TCP enabled (SQL Server Configuration Manager → Protocols → TCP/IP → Enabled, port 1433).

---

## Setup

```powershell
# 1. Install dependencies (also runs `prisma generate`)
npm install

# 2. Configure environment
copy .env.example .env
#   then edit .env — at minimum set DATABASE_URL and AUTH_SECRET
#   generate a secret:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Create the schema in SQL Server (no shadow DB needed)
npm run db:push

# 4. Seed demo data (users, a past + an upcoming board meeting, a committee, etc.)
npm run db:seed

# 5. Run
npm run dev
#   → http://localhost:3000
```

### `DATABASE_URL` examples

```
# SQL Server Express / Developer (SQL auth, TCP)
sqlserver://localhost:1433;database=board_meetings;user=sa;password=Your_Strong_Pass1;trustServerCertificate=true;encrypt=true

# Azure SQL
sqlserver://YOUR-SERVER.database.windows.net:1433;database=board_meetings;user=admin@YOUR-SERVER;password=...;encrypt=true
```

### Seeded logins (password for **all**: `Passw0rd!`)

| Email | Role |
|---|---|
| `admin@company.in` | Administrator |
| `chairman@company.in` | Chairman (director) |
| `secretary@company.in` | Company Secretary |
| `ananya@company.in`, `rahul@company.in`, `priya@company.in`, `vikram@company.in` | Board Members (directors) |
| `presenter@company.in` | Management / Presenter |

> Change these immediately in any real deployment (Users → Edit → Reset password).

---

## Production build

```powershell
npm run build   # prisma generate + next build
npm run start   # serves the optimised build
```

For versioned migrations instead of `db:push`:
```powershell
npx prisma migrate dev --name init   # needs rights to create a shadow database
```

---

## Optional integrations

All are off by default and configured via `.env`. The app runs fully without them.

| Feature | Env vars | Behaviour when unset |
|---|---|---|
| **Azure AD SSO** (§Phase 4) | `AZURE_AD_CLIENT_ID/SECRET/TENANT_ID` | Email/password only. When set, a "Sign in with Microsoft" button appears. Redirect URI: `https://YOUR-HOST/api/auth/azure/callback`. The user's Microsoft email must match an existing active account. *(Production: verify the id_token via JWKS — see `src/app/api/auth/azure/callback/route.ts`.)* |
| **Email** (§Phase 2) | `NOTIFY_DRIVER=smtp`, `SMTP_*` | `log` driver: notifications appear in-app and are logged to console. Wire SMTP in `src/lib/notifications.ts`. |
| **Object storage** | `STORAGE_DRIVER=s3`, `S3_*` | `local` driver writes encrypted-at-rest-capable files under `./storage` (git-ignored). Implement the S3 branch in `src/lib/storage.ts`. |
| **Assistant (Claude)** (§Phase 5) | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Falls back to full-text search over minutes/resolutions. When set, answers are synthesised by `claude-opus-4-8` strictly from retrieved excerpts. |
| **Company profile** | `COMPANY_NAME`, `COMPANY_IS_LISTED` | If `true`, the Compliance page flags that SEBI LODR applies (out of scope of these checks). |

---

## Tech & architecture notes

- **SQL Server specifics:** integer identity PKs (avoids NVARCHAR key-length limits); enums modelled as validated string constants (`src/lib/enums.ts`) since SQL Server has no DB enums; all relations use `NoAction` referential actions to avoid SQL Server's "multiple cascade paths" error (we soft-delete anyway). The schema ports cleanly to PostgreSQL if you ever switch (`provider`, then re-introduce native enums if desired).
- **Auth:** opaque session tokens in a `Session` table + httpOnly cookie; bcrypt password hashing (`src/lib/auth.ts`).
- **Board-pack PDF:** `pdf-lib` merges source PDFs, embeds images, adds a cover + table of contents + page-number footers (`src/lib/pdf.ts`).
- **Compliance engine:** pure functions for quorum, notice, gap, minutes deadline, and resolution tally (`src/lib/compliance.ts`).

### Project layout
```
prisma/schema.prisma      data model (all entities)
prisma/seed.ts            demo data
src/lib/                  db, auth, rbac, audit, compliance, storage, pdf, notifications, enums, form
src/components/           shared UI (ActionForm, ui primitives, Nav, Topbar, icons)
src/app/login             auth
src/app/(app)/…           authenticated app (one folder per module)
src/app/api/…             file downloads + Azure AD OIDC
```

---

## Security checklist before going live

- [ ] Host on a **private network / VPN / IP-restricted** endpoint — board content should never sit on a public URL.
- [ ] Set a strong unique `AUTH_SECRET`; rotate seeded passwords; enable Azure AD + MFA.
- [ ] Encrypt the SQL Server DB and the `storage/` volume at rest; use `encrypt=true` on the connection.
- [ ] Review the §4 permission matrix in `src/lib/rbac.ts` with your Company Secretary.
- [ ] Have the Company Secretary validate the compliance rules and any generated notices/minutes against current SS-1.
- [ ] Take regular backups — minutes and resolutions are permanent statutory records.

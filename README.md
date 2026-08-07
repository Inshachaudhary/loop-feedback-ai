# LOOP

LOOP is an AI customer-feedback intelligence platform built for the Zidio project brief. It uses Next.js App Router, PostgreSQL, Prisma, Auth.js/NextAuth, Claude, Recharts, and Zod.

## Local setup

1. Copy `.env.example` to `.env` and provide a PostgreSQL `DATABASE_URL` plus a random `NEXTAUTH_SECRET`.
2. Install dependencies with `yarn`.
3. Create the schema with `yarn prisma migrate dev --name init`.
4. Seed demo data with `yarn prisma db seed`.
5. Start with `yarn dev`.

Demo accounts after seeding use password `loop-demo-2025`:
- `admin@loop.demo` — ADMIN
- `analyst@loop.demo` — ANALYST
- `viewer@loop.demo` — VIEWER

`ANTHROPIC_API_KEY` is optional during initial setup. Classification, Ask LOOP, and report narratives should only be enabled after the server-side key is configured; no fake third-party response is used.

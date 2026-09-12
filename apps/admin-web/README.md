# company-admin

100k-RYCOS **company self-service admin panel** (Next.js App Router + TypeScript +
Tailwind). Vendors sign up, manage their company, users, terminals and billing.

- Auth: Supabase via `@supabase/ssr` (session in cookies, refreshed in middleware).
- Data + signup: calls **100k-api** (the control-plane service). The Supabase
  service-role key lives only in api, never here.
- Design: brand orange `#FF8800`.

## Routes

- `/login` — email/password sign in
- `/signup` — onboarding: creates company + first user (super_admin) via admin-api
- `/dashboard` — protected; Overview (company), Users, Terminals, Billing (stubs)

## Local dev

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Deploy

Runs in Coolify / Docker on OVH VPS. Main domain: `https://100k-admin.rycos.eu`.

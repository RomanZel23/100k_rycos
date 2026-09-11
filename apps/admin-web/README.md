# company-admin

YallaOrder **company self-service admin panel** (Next.js App Router + TypeScript +
Tailwind). Vendors sign up, manage their company, users, terminals and billing.

- Auth: Supabase via `@supabase/ssr` (session in cookies, refreshed in middleware).
- Data + signup: calls **admin-api** (the control-plane service). The Supabase
  service-role key lives only in admin-api, never here.
- Design: brand orange `#FF8800`, consistent with yalla-website.

## Routes

- `/login` — email/password sign in
- `/signup` — onboarding: creates company + first user (super_admin) via admin-api
- `/dashboard` — protected; Overview (company), Users, Terminals, Billing (stubs)

## Local dev

```bash
cp .env.example .env.local   # fill NEXT_PUBLIC_SUPABASE_ANON_KEY; ADMIN_API_URL=https://admin-api.yallaorder.ai
npm install
npm run dev                  # http://localhost:3000
```

## Deploy

Runs on the same server as admin-api/restaurants-api: PM2 process `company-admin`
on port **9505**, nginx vhost `admin.yallaorder.ai` → `127.0.0.1:9505`. Push to
`main` → GitLab CI → server `post-receive` (npm install → next build → pm2 reload).
Server env at `/root/company-admin.env` (ADMIN_API_URL=http://127.0.0.1:9504).

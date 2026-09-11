FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG ADMIN_API_URL=https://100k-api.rycos.eu/v1/admin
ARG NEXT_PUBLIC_ORDER_BASE_URL=https://100k.rycos.eu

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV ADMIN_API_URL=$ADMIN_API_URL
ENV NEXT_PUBLIC_ORDER_BASE_URL=$NEXT_PUBLIC_ORDER_BASE_URL

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY apps/admin-web/ ./apps/admin-web/

RUN pnpm --filter @rycos/admin-web install --prod=false
RUN pnpm --filter @rycos/admin-web build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/apps/admin-web/public ./apps/admin-web/public
COPY --from=builder /app/apps/admin-web/.next/standalone ./
COPY --from=builder /app/apps/admin-web/.next/static ./apps/admin-web/.next/static

EXPOSE 3000

CMD ["node", "apps/admin-web/server.js"]

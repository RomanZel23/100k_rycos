FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

ARG NEXT_PUBLIC_API_URL=https://100k-api.rycos.eu
ARG NEXT_PUBLIC_WS_URL=wss://100k-api.rycos.eu/v1/ws
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NODE_ENV=development

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/customer-web/ ./apps/customer-web/

RUN pnpm --filter @rycos/shared --filter @rycos/customer-web install --prod=false
RUN pnpm --filter @rycos/shared build
RUN pnpm --filter @rycos/customer-web build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/apps/customer-web/public ./apps/customer-web/public
COPY --from=builder /app/apps/customer-web/.next/standalone ./
COPY --from=builder /app/apps/customer-web/.next/static ./apps/customer-web/.next/static

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "apps/customer-web/server.js"]

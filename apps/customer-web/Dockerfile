FROM node:22-alpine AS builder

WORKDIR /app
ENV NODE_ENV=development

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

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

COPY --from=builder /app/apps/customer-web/public ./apps/customer-web/public
COPY --from=builder /app/apps/customer-web/.next/standalone ./
COPY --from=builder /app/apps/customer-web/.next/static ./apps/customer-web/.next/static

EXPOSE 3000

CMD ["node", "apps/customer-web/server.js"]

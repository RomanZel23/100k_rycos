FROM node:22-alpine AS builder

WORKDIR /app
ENV NODE_ENV=development

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/

RUN pnpm --filter @rycos/shared --filter @rycos/database --filter @rycos/worker install --prod=false
RUN pnpm --filter @rycos/shared build
RUN pnpm --filter @rycos/database build
RUN pnpm --filter @rycos/worker build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app ./

CMD ["node", "apps/worker/dist/index.js"]

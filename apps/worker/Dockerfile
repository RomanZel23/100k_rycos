FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/

RUN pnpm --filter @rycos/shared --filter @rycos/database --filter @rycos/worker install --frozen-lockfile || pnpm --filter @rycos/shared --filter @rycos/database --filter @rycos/worker install
RUN pnpm --filter @rycos/shared build
RUN pnpm --filter @rycos/database build
RUN pnpm --filter @rycos/worker build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/shared/dist ./packages/shared/dist
COPY packages/database/package.json ./packages/database/package.json
COPY packages/database/dist ./packages/database/dist
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/worker/dist ./apps/worker/dist

RUN pnpm --filter @rycos/worker install --prod

CMD ["node", "apps/worker/dist/index.js"]

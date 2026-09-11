FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN pnpm --filter @rycos/shared --filter @rycos/database --filter @rycos/api install --frozen-lockfile || pnpm --filter @rycos/shared --filter @rycos/database --filter @rycos/api install
RUN pnpm --filter @rycos/shared build
RUN pnpm --filter @rycos/database build
RUN pnpm --filter @rycos/api build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8000
ENV HOST=0.0.0.0

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/shared/dist ./packages/shared/dist
COPY packages/database/package.json ./packages/database/package.json
COPY packages/database/dist ./packages/database/dist
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/dist ./apps/api/dist

RUN pnpm --filter @rycos/api install --prod

EXPOSE 8000

CMD ["node", "apps/api/dist/server.js"]

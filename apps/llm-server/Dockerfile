FROM node:20-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./
COPY tsconfig.json ./

COPY packages/shared-core/package.json ./packages/shared-core/
COPY packages/shared-clients/package.json ./packages/shared-clients/
COPY packages/shared-services/package.json ./packages/shared-services/
COPY packages/shared-data/package.json ./packages/shared-data/
COPY apps/api/package.json ./apps/api/
COPY apps/llm-server/package.json ./apps/llm-server/
COPY apps/mcp-server/package.json ./apps/mcp-server/
COPY apps/scheduler-server/package.json ./apps/scheduler-server/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

RUN npm ci

COPY prisma ./prisma

RUN npx prisma generate

COPY packages/shared-core ./packages/shared-core
COPY packages/shared-clients ./packages/shared-clients
COPY packages/shared-services ./packages/shared-services
COPY packages/shared-data ./packages/shared-data
COPY apps/llm-server ./apps/llm-server

RUN npm run build --workspace=@naiber/shared-core && \
    npm run build --workspace=@naiber/shared-clients && \
    npm run build --workspace=@naiber/shared-data && \
    npm run build --workspace=@naiber/shared-services && \
    npm run build --workspace=@naiber/llm-server

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=90s \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "apps/llm-server/dist/index.js"]

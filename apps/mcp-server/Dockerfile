FROM node:20-alpine

RUN apk add --no-cache python3 make g++ curl

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./
COPY tsconfig.json ./

COPY packages/shared-core/package.json ./packages/shared-core/
COPY packages/shared-clients/package.json ./packages/shared-clients/
COPY packages/shared-services/package.json ./packages/shared-services/
COPY packages/shared-data/package.json ./packages/shared-data/
COPY apps/mcp-server/package.json ./apps/mcp-server/

RUN npm ci
COPY prisma ./prisma

RUN npx prisma generate

COPY packages/shared-core ./packages/shared-core
COPY packages/shared-clients ./packages/shared-clients
COPY packages/shared-services ./packages/shared-services
COPY packages/shared-data ./packages/shared-data
COPY apps/mcp-server ./apps/mcp-server

RUN npm run build --workspace=@naiber/shared-core && \
    npm run build --workspace=@naiber/shared-clients && \
    npm run build --workspace=@naiber/shared-data && \
    npm run build --workspace=@naiber/shared-services

EXPOSE 3002

CMD ["npx", "tsx", "watch", "apps/mcp-server/src/index.ts"]

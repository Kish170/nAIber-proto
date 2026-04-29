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
COPY apps/server/package.json ./apps/server/

RUN npm ci
COPY prisma ./prisma

RUN npx prisma generate

COPY packages/shared-core ./packages/shared-core
COPY packages/shared-clients ./packages/shared-clients
COPY packages/shared-services ./packages/shared-services
COPY packages/shared-data ./packages/shared-data
COPY apps/server ./apps/server

RUN npm run build --workspace=@naiber/shared-core && \
    npm run build --workspace=@naiber/shared-clients && \
    npm run build --workspace=@naiber/shared-data && \
    npm run build --workspace=@naiber/shared-services && \
    npm run build --workspace=@naiber/server

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=60s \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "apps/server/dist/index.js"]

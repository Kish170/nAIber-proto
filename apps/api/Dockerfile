FROM node:20-alpine

RUN apk add --no-cache python3 make g++ curl

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./
COPY tsconfig.json ./

COPY packages/shared-core/package.json ./packages/shared-core/
COPY packages/shared-clients/package.json ./packages/shared-clients/
COPY packages/shared-data/package.json ./packages/shared-data/
COPY apps/api/package.json ./apps/api/

RUN npm ci
COPY prisma ./prisma

RUN npx prisma generate

COPY packages/shared-core ./packages/shared-core
COPY packages/shared-clients ./packages/shared-clients
COPY packages/shared-data ./packages/shared-data
COPY apps/api ./apps/api

RUN npm run build --workspace=@naiber/shared-core && \
    npm run build --workspace=@naiber/shared-clients && \
    npm run build --workspace=@naiber/shared-data && \
    npm run build --workspace=@naiber/api

EXPOSE 3002

CMD ["node", "apps/api/dist/index.js"]

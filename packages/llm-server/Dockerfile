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
COPY packages/llm-server/package.json ./packages/llm-server/

RUN npm ci

COPY prisma ./prisma

RUN npx prisma generate

COPY packages/shared-core ./packages/shared-core
COPY packages/shared-clients ./packages/shared-clients
COPY packages/shared-services ./packages/shared-services
COPY packages/shared-data ./packages/shared-data
COPY packages/llm-server ./packages/llm-server

RUN npm run build --workspace=@naiber/shared-core && \
    npm run build --workspace=@naiber/shared-clients && \
    npm run build --workspace=@naiber/shared-data && \
    npm run build --workspace=@naiber/shared-services

EXPOSE 3001

CMD ["npx", "tsx", "watch", "packages/llm-server/src/index.ts"]

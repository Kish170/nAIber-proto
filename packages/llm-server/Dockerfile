FROM node:20-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./
COPY tsconfig.json ./

COPY packages/shared/package.json ./packages/shared/
COPY packages/llm-server/package.json ./packages/llm-server/

RUN npm ci

COPY prisma ./prisma

RUN npx prisma generate

COPY packages/shared ./packages/shared
COPY packages/llm-server ./packages/llm-server

RUN npm run build --workspace=@naiber/shared

EXPOSE 3001

CMD ["npx", "tsx", "watch", "packages/llm-server/src/index.ts"]

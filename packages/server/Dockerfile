FROM node:20-alpine

RUN apk add --no-cache python3 make g++ curl

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./
COPY tsconfig.json ./

COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/

RUN npm ci
COPY prisma ./prisma

RUN npx prisma generate

COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

RUN npm run build --workspace=@naiber/shared

EXPOSE 3000

CMD ["npx", "tsx", "watch", "packages/server/src/index.ts"]
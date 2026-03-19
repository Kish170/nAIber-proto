# Prisma Client

## Purpose
Singleton Prisma client providing PostgreSQL access to all packages via `@naiber/shared-clients`.

## Key Behaviors
- Singleton pattern — one connection per process
- Imports generated types from `generated/prisma/index.js` (repo root)
- Used exclusively by `shared-data` repositories for data access — no direct Prisma calls in application code

## Note
The web app (`apps/web`) uses its own local PrismaClient for the NextAuth adapter (Edge Runtime constraint). This is separate from the shared singleton.

## Consumers
- `shared-data` repositories (all data access)

## Current Status
Fully implemented in `packages/shared-clients/src/PrismaDBClient.ts`.

## Related Docs
- [Repositories](../data/repositories.md) — data access layer that uses this client
- [Database Schema](../../infrastructure/database-schema.md) — Prisma schema definition

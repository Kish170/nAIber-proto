# ADR-003: Split Shared Code into Four Layered Packages

**Status:** Accepted
**Date:** Prototype phase, 2025

## Context

Both `server` and `llm-server` depend on common utilities: database access, external service clients, type definitions, and business logic helpers. The question was how to structure this shared code.

A single `@naiber/shared` package is the simplest option, but it creates problems as the codebase grows:

- A consumer that only needs types (e.g. queue contracts) would pull in all external SDKs (OpenAI, Prisma, Qdrant, Redis, Twilio) as transitive dependencies.
- There is no enforced boundary between layers — a repository can accidentally import a service, or a type definition can import a client, creating circular or unexpected dependencies.
- When an AI assistant (or engineer) is making changes, a flat shared package gives no structural signal about where a new piece of code belongs. Everything is equally valid, which leads to gradual cohesion degradation.

## Considered Options

| Option | Notes |
|---|---|
| **Single @naiber/shared** | All shared code in one package — simplest to start, harder to reason about as it grows |
| **Two packages: @naiber/shared-types and @naiber/shared** | Types separated from runtime code; still mixes clients, data access, and services |
| **Four layered packages (chosen)** | Strict dependency direction: core → clients → data → services |

## Decision

**Chosen: Four layered packages**

The split follows a strict dependency direction:

```
shared-core (types only)
  → shared-clients (external SDK wrappers)
    → shared-data (repositories + Redis stores)
      → shared-services (business logic utilities)
```

Each layer can only depend on layers below it. This enforces:

- **Import boundaries** — `server` can import `shared-clients` but will never accidentally pull in LangGraph-specific types or `llm-server`-only utilities, because those don't exist in shared packages.
- **Avoiding SDK bleed** — A package that only needs types (e.g. queue contracts) imports only `shared-core`, which has zero runtime dependencies. It does not transitively pull in Prisma, Redis, or OpenAI SDKs.
- **Cohesion and coupling clarity** — Each package has a single well-defined responsibility. When deciding where a new piece of code belongs, the layer structure provides a clear answer: is it a type? → `shared-core`. Is it a client wrapper? → `shared-clients`. Is it data access? → `shared-data`. Is it a utility that composes clients and data? → `shared-services`.
- **AI-assisted development** — The layered structure gives Claude Code structural signals when making changes. A change to `shared-clients` shouldn't touch `shared-core`. A new repository belongs in `shared-data`, not `shared-services`. The package boundaries make correct placement unambiguous.

## Consequences

**Positive:**
- Circular dependencies are structurally prevented — the build order enforces the dependency direction.
- Consumers pull in only what they need: `server` doesn't need `shared-services`; `llm-server` needs all four.
- New shared code has a clear home — reduces ambiguity when adding utilities.
- Easier to reason about the impact of changes: a change to `shared-core` affects everything; a change to `shared-services` only affects `llm-server`.

**Negative / Trade-offs:**
- More packages to manage — `tsconfig.json` project references must be updated when adding dependencies across packages.
- Build order is strict — `npm run build` at the root handles this, but partial builds (building a single package in isolation) require all upstream packages to be built first.
- Some interface types (e.g. `HealthCheckLogData` in `HealthRepository`) live locally in the package that uses them rather than in `shared-core`, because they are not shared across consumers. This is intentional but can look inconsistent at first glance.

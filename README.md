# namazvakti-api

Backend for [namazvakti.app](https://namazvakti.app): place lookup and daily prayer times for Turkey (Diyanet İşleri Başkanlığı times) served from its own database, so clients never call the upstream source directly. The iPhone, Apple Watch and Mac apps use this API.

> **Status:** the upstream Diyanet account is pending, so the server currently runs in **mock mode**. Prayer times are computed locally (Turkey method) and every response carries `source: "mock"`.

## Layout

- `apps/web` — Next.js (App Router) app exposing `/api/v1` and the nightly cron route.
- `packages/api-contract` — OpenAPI 3.1 contract (`openapi.yaml`) and response validation.
- `packages/core` — shared prayer-time logic.
- `packages/db` — Drizzle schema, migrations and repository (PGlite locally, Postgres in production).
- `packages/diyanet-client` — the source interface and the mock source. Place data provenance: `packages/diyanet-client/data/SOURCE.md`.

## Requirements

- Node ≥ 22 (see `.nvmrc`) and pnpm
- Optional: Docker for a local Postgres (`docker-compose.yml`)

## Environment

Copy `.env.example` to `.env` at the repository root.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | `pglite:./.data/pglite` (default, no Docker needed) or a `postgres://…` URL |
| `DIYANET_SOURCE` | `mock` (computed test times) or `ezanvakti` (Diyanet times via the [Ezan Vakti API](https://ezanvakti.emushaf.net), rate-limited, so each district is fetched at most every 12 h) |
| `EZANVAKTI_BASE_URL` | Optional override of the Ezan Vakti API address |
| `CRON_SECRET` | Bearer secret for `/api/cron/refresh`; when unset or empty the route always returns 401 |

## Local development

```sh
pnpm install
pnpm --filter web db:migrate
pnpm --filter web sync:places
pnpm --filter web dev
```

`pnpm test` runs all test suites.

## Deploying (Vercel)

- Project root directory: `apps/web` (framework: Next.js); install runs at the workspace root with pnpm.
- Set `DATABASE_URL` (e.g. a Neon Postgres connected to the project), `DIYANET_SOURCE` (`mock` or `ezanvakti`) and a random `CRON_SECRET`. After changing `DIYANET_SOURCE`, run `sync:places` with the same value so each district gets its Diyanet id.
- Apply migrations and load places against the production database before the first deploy; the Next bundle never runs migrations:

```sh
DATABASE_URL=postgres://… pnpm --filter web db:migrate
DATABASE_URL=postgres://… pnpm --filter web sync:places
```

`apps/web/vercel.json` schedules the nightly refresh cron.

## Announcements

The apps show the newest active announcement as a dismissible card and list them all under Settings → Announcements (`GET /api/v1/announcements?platform=ios|macos&build=N`). There is no admin panel; write them with the CLI:

```sh
DATABASE_URL=postgres://… pnpm --filter web announce add --slug bayram-2027 \
  --title-tr "Bayramınız mübarek olsun" --body-tr "…" [--title-en … --body-en …] [--title-de … --body-de …] \
  [--link https://… --link-title-tr …] [--platforms ios,macos] [--starts ISO] [--ends ISO] [--min-build N] [--max-build N]
DATABASE_URL=postgres://… pnpm --filter web announce list
DATABASE_URL=postgres://… pnpm --filter web announce end bayram-2027
```

Links must be https. Responses are cached for 10 minutes at the CDN, so changes take up to that long to reach the apps.

## License

Apache License 2.0 — see `LICENSE`.

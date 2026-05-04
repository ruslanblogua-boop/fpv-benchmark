# Moonlet FPV Website

This repository contains the website layer for Moonlet's FPV test viewer.

## Scope

- upload a prepared structured test JSON file
- save test metadata through the Cloudflare Worker API
- display uploaded test data in the frontend viewer
- use Supabase for authentication

Track parsing and preprocessing happen outside this repository.

## Structure

- `frontend/` — static frontend for Cloudflare Pages
- `workers/` — Cloudflare Worker API
- `db/` — D1 migrations

## Input Format

The upload flow expects a single structured JSON file shaped like the provided
demo test file, with a top-level `track` array containing timestamped points
and derived metrics.

## Development

```bash
npm install
npm run dev:frontend
npm run dev:worker
```

## Deployment

- Frontend: Cloudflare Pages
- API: Cloudflare Workers
- Auth: Supabase
- Repo: GitHub

Production site:
[moonlet-9sg.pages.dev](https://moonlet-9sg.pages.dev/)

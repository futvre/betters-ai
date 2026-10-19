# BetMind AI

**Data-Driven Match Insights, Powered by AI.**

A dark, responsive football fixture dashboard built with Next.js, TypeScript and API-Football. The product roadmap adds evidence-backed AI match insights, an auditable prediction history and performance analytics.

## Current status

Phase 1 foundation is in the repository: fixture dashboard, competition filters, date navigation, live/finished status display, and a server-side API-Football route. AI insights, Supabase persistence and automatic result settlement are planned, not yet implemented.

## Requirements

- Node.js 20.9+
- npm
- API-Football API key

## Local setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local`
3. Set `API_FOOTBALL_KEY` in `.env.local`
4. Run `npm run dev`
5. Open `http://localhost:3000`

Never expose API keys using `NEXT_PUBLIC_*` variables or commit `.env.local`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `API_FOOTBALL_KEY` | Yes | Server-side API-Football authentication |
| `API_FOOTBALL_BASE_URL` | No | Defaults to `https://v3.football.api-sports.io` |
| `NEXT_PUBLIC_APP_TIMEZONE` | No | Fixture timezone; defaults to `Europe/Athens` |

## Deploy to Vercel

1. Import `futvre/betters-ai` from GitHub into Vercel.
2. Keep the Next.js framework preset and default build command.
3. In Project Settings → Environment Variables, add `API_FOOTBALL_KEY`, `API_FOOTBALL_BASE_URL` and `NEXT_PUBLIC_APP_TIMEZONE`.
4. Use `Europe/Athens` for the timezone and the default API base URL above.
5. Add the API key to the environments you plan to use, then deploy. Redeploy whenever environment variables change.

If the key is not configured yet, the site should still build, but the fixtures endpoint will return a clear configuration error until the key is added.

## Scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript check

## Roadmap

- [x] Phase 1: responsive fixtures dashboard and server-side provider integration
- [ ] Phase 2: structured AI summaries with evidence, uncertainty and risk labels
- [ ] Phase 3: Supabase prediction persistence and automated result settlement
- [ ] Phase 4: historical accuracy, confidence/league breakdowns and transparent ROI calculations

## Responsible use

Football outcomes are uncertain. Any future predictions are probabilistic estimates, not guarantees or financial advice. Track all predictions consistently, including losses and voids, and avoid presenting small samples as proof of accuracy.

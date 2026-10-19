# BetMind AI

**Data-Driven Match Insights, Powered by AI.**

BetMind AI is a football match-insights dashboard built with Next.js, TypeScript, Tailwind CSS, API-Football and Supabase. It is designed for transparent, trackable statistical analysis — not guaranteed outcomes.

## Current status

Phase 1 foundation: fixture dashboard and server-side API-Football integration. AI analysis, persistent predictions, settlement and performance analytics are planned next.

## Requirements

- Node.js 20.9+
- npm
- API-Football API key
- (Later phases) Supabase project and AI provider API key

## Local setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local`
3. Add your API-Football key to `.env.local`
4. Start the app: `npm run dev`
5. Open `http://localhost:3000`

Never expose API keys through `NEXT_PUBLIC_*` variables or commit `.env.local`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `API_FOOTBALL_KEY` | Yes | Server-side API-Football authentication |
| `API_FOOTBALL_BASE_URL` | No | Defaults to `https://v3.football.api-sports.io` |
| `NEXT_PUBLIC_APP_TIMEZONE` | No | Display timezone; defaults to `Europe/Athens` |

## Deployment on Vercel

Import `futvre/betters-ai` into Vercel, select the Next.js framework preset, and add the environment variables above in Project Settings → Environment Variables. Add `API_FOOTBALL_KEY` to Production, Preview and Development as needed, then deploy. Redeploy after changing environment variables.

## Product roadmap

- [x] Phase 1 foundation: fixtures dashboard, league filters and server-side API route
- [ ] Phase 2: structured AI match insights with explicit uncertainty and risk labels
- [ ] Phase 3: Supabase prediction history and automated result settlement
- [ ] Phase 4: audited performance metrics, ROI assumptions and confidence breakdowns

## Responsible use

Football is uncertain. Predictions are probabilistic estimates, not guarantees or financial advice. Track every prediction consistently, including losses and voids; avoid presenting small samples as proof of accuracy.

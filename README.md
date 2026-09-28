# APEX AutoCare

Premium mobile car detailing for Lekki, Lagos — a booking experience that turns an inbound “Can you detail my car?” into a quoted, scheduled, deposit-secured job with no owner intervention.

**Stack:** React 19 · TypeScript · Vite · Tailwind CSS v4 · Framer Motion · React Router · Zustand · Supabase (optional).

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
```

With no environment variables the app runs fully offline: bookings persist to `localStorage`, and a booking made in one tab appears live in `/operations` in another.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |
| `npm test` | Scheduling engine tests + SQL parity tests (runs `supabase/*.sql` in PGlite) |
| `npm run db:seed-sql` | Regenerate `supabase/seed.sql` from `src/data/apex.ts` |

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Arrival hero, anatomy, process, coverage, entry to booking |
| `/services` | Services, modules, per-vehicle rate card |
| `/book` | Inquiry → vehicle → service → location → time → deposit → pass |
| `/manage/:code` | Appointment pass, drag-to-reschedule, cancel, reminder preferences |
| `/operations` | Owner command surface: live day track, stages, automation stream, exceptions, demo reset |
| `/process` | How travel, setup, detail, inspection and follow-through are handled |

## Supabase setup (persistent, multi-user demo)

1. Create a Supabase project.
2. SQL editor → run `supabase/schema.sql`, then `supabase/seed.sql`.
3. Copy `.env.example` to `.env.local` and fill in:
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon / publishable key>
   ```
4. Restart `npm run dev`. The footer shows `Data: Supabase · live`.

Only the public anon key is used in the browser — never the service-role key. Anon can read the catalogue and `booking_events` (no personal data, needed for Realtime); every write goes through `SECURITY DEFINER` functions that recompute price and duration server-side. A Postgres exclusion constraint makes double-booking a unit impossible even under concurrent requests.

### Seed and reset

- `seed.sql` loads the catalogue, three mobile units, service zones and a canonical demo week (busier Friday–Sunday), dated relative to today in Lagos.
- **Reset:** `/operations` → *Reset demo data…* → type `RESET`. This calls `apex_reset_demo()`, which deletes only rows with `is_demo = true` and rebuilds the week. Non-demo records are never touched.
- Changing prices, zones or the demo week: edit `src/data/apex.ts`, run `npm run db:seed-sql`, re-run `seed.sql`.

## Lovable

Import the GitHub repository into Lovable. In **Project settings → Environment**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (or leave them empty for the offline demo). Build command `npm run build`, output `dist`. The app uses client-side routing, so the host must fall back to `index.html` for unknown paths (Lovable does this by default).

## What is real vs simulated

**Real:** quote calculation, vehicle/service/add-on durations, zone travel times with rush-hour multipliers, unit overlap checking, booking persistence and codes, rescheduling through the same feasibility engine, the owner view, automation event records, live cross-tab / Realtime updates.

**Simulated (clearly labelled in the UI):** deposit payment (no card is charged), WhatsApp/SMS/email delivery (events are recorded, not sent), live road traffic (seeded per-zone values).

## Demo script

1. `/` — watch the ignition preloader; hover the car hotspots in *Detail*.
2. *Start booking* → *Paste a message* → “Can you detail my Range Rover tomorrow? I'm in Ikoyi.” → *Turn into booking* → *Open pre-filled booking*.
3. Pick a window on the orbit (note *Best fit*), review the operation window, hold to pay.
4. *Manage booking* → drag the job to another window → *Confirm move*.
5. `/operations` — the booking and its reschedule are on the day track and in the automation stream. *Replay day* to watch jobs move through stages.

## Project layout

```
src/
  components/apex/   UI component library (pages compose these)
  motion/            ApexPass, GarageEntry, EngineStartConfirmation, MagneticStep, IgnitionIntro
  pages/             Home, Services, Book, ManageBooking, Operations, Process
  lib/               scheduling engine, quote, automation events, inquiry parser, repositories
  store/             booking draft, live board, telemetry toasts
  data/apex.ts       every price, duration, zone and operating rule
supabase/            schema.sql, seed.sql
scripts/             seed.sql generator
```

Image credits: see [ASSETS.md](ASSETS.md).

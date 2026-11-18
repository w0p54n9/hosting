# GOING OUT

Plan the night, not the logistics. Going Out helps a group (coworkers, friends) get an outing going:

- **Everyone picks the days they're free** on a calendar. The day most people can make is used automatically, and the host can lock it in.

- **Start from home or the office.** The host can add an office address; each person picks whether they're setting off from home or from the office, and everything (meeting spot, rides, directions) is worked out from there.
- **Everyone adds their address.** It's private by default. Each person can switch on *Show my address to the group*, and then others see it and their home appears on everyone's map.
- **A fair midpoint.** Either the spot with the *shortest longest trip* (fairest) or the *least total travel*.
- **Ranked places** from Google Maps near that midpoint, scored by how many people are into each category and how far each person has to travel (real travel times by each person's own mode).
- **Carpools.** Drivers offer seats, riders get matched to the driver with the smallest detour. A rider's address goes only to their driver.
- **Personal directions** with a "leave by" time, pickups for drivers, and a one-tap handoff to Google Maps.

## How it works

```
Browser (Next.js)                 Server (Next.js API routes)            Google / Supabase
------------------                ---------------------------            -----------------
type address  ──────────────────► /api/places/autocomplete ────────────► Places Autocomplete
pick suggestion, join ──────────► /api/events/:slug/participants ──────► Place Details (lat/lng)
                                     stores address in a private table ─► Supabase (RLS, no policies)
poll /api/events/:slug  ◄──────── midpoint + ranked places + carpools ─► Text Search + Route Matrix (cached)
                                     (names, likes, minutes, no addresses)
"Your directions" ──────────────► /api/events/:slug/trip ──────────────► Routes API (your route only)
```

**Privacy model.** The browser never receives anyone else's address or coordinates, unless that person switched on *Show my address to the group*. Each person's address is resolved and stored server-side in `participant_locations`. Supabase row-level security is on with no policies, so only the server (service role key) can read it. Public responses contain names, roles, likes and travel minutes. The only exception is a driver's own directions, which include their riders' pickup addresses. The map shows only *your* home and *your* route.

Two things are worth knowing:
- Travel minutes plus the midpoint could, in principle, let a determined person roughly guess where someone lives. If that matters for your group, round the minutes shown in `PeopleList` (EventApp) or hide other people's minutes.
- There are no accounts. Each device gets a secret token per outing (stored in `localStorage`). The host gets a separate host token. Anyone with the invite link can join, so share it only with the group.

## Setup

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), then [`0002_availability_and_show_address.sql`](supabase/migrations/0002_availability_and_show_address.sql) [`0003_office_start.sql`](supabase/migrations/0003_office_start.sql) and [`0004_place_vote.sql`](supabase/migrations/0004_place_vote.sql).
3. From **Project Settings → API** copy the project URL and the **service_role** key.

### 2. Google Maps Platform
1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable billing (there's a monthly free credit).
2. Enable **Maps JavaScript API**, **Places API (New)** and **Routes API**.
3. Create two API keys:
   - **Server key**: restrict to *Places API (New)* and *Routes API*. Used only on the server.
   - **Browser key**: restrict to *Maps JavaScript API*, with **HTTP referrer** restrictions for `localhost:3000/*` and your production domain.
4. Under **Map Management**, create a Map ID (type JavaScript). `DEMO_MAP_ID` works for local testing.

### 3. Run it
```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```
Create an outing, copy the invite link, open it in another browser (or private window) to join as a second person.

### 4. Deploy on cPanel (WHC)
Every push to `main` triggers the **Build for WHC** GitHub Action, which builds the app and publishes a
ready-to-run copy to the `deploy` branch. The server never builds anything.

One-time setup in cPanel:
1. **Domains** → create the subdomain (e.g. `hosting.wai-yuan.com`).
2. **Git Version Control** → Create → Clone URL `https://github.com/w0p54n9/hosting.git`,
   repository path `hosting-app`. Then **Manage** → switch *Checked-Out Branch* to `deploy`.
3. **Setup Node.js App** → Create Application:
   - Node.js version: 20 (or newer)
   - Application mode: Production
   - Application root: `hosting-app`
   - Application URL: the subdomain
   - Application startup file: `app.js`
   - Environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_MAPS_SERVER_KEY`,
     `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAP_ID`
   - Don't click "Run NPM Install". Nothing needs installing.
4. **SSL/TLS Status** → make sure the subdomain has a certificate (AutoSSL).

To ship an update: **Git Version Control → Manage → Pull or Deploy → Update from Remote**, then
**Setup Node.js App → Restart**.

Prefer Vercel? Import the repo there and add the same environment variables. No `deploy` branch needed.

## Costs (rough)
Each time the group's inputs change (someone joins, moves, changes role or likes, or the host changes the type or mode), the server recomputes:
up to 6 Places Text Search calls, plus one Route Matrix pass (people × up to 20 venues, per travel mode).
Results are cached in `plan_cache` for 6 hours. Opening "Your directions" makes 1–2 Routes calls.
Address typing uses Places Autocomplete with session tokens. For a group of 10 planning one outing, this is typically a few cents. Set a budget alert in Google Cloud anyway.

## Project layout
```
supabase/migrations/0001_init.sql      tables + RLS
src/lib/types.ts                       shared shapes
src/lib/categories.ts                  food/activity categories and the Google queries behind them
src/lib/server/geo.ts                  distance, midpoint search, timing
src/lib/server/google.ts               Places + Routes wrappers, Google Maps links
src/lib/server/plan.ts                 venue search, travel-time matrix, ranking, carpool matching
src/lib/server/trip.ts                 one person's directions (with pickups)
src/lib/server/data.ts                 loading + the public/private views of people
src/app/api/...                        REST endpoints
src/app/page.tsx                       create an outing
src/components/EventApp.tsx            the event page: people | map | places & directions
```

## Scoring
Places are ordered by how many people are into them first. When several top places tie, everyone gets one vote among (up to 5 of) them, and votes order the tie. Within the same level of interest, this score orders them:

For each candidate place:
`score = 45 × (share of people into its category) − travel − 0.25 × (longest − average) + 4 × (rating − 4)`,
where `travel` is the longest trip in *fairest* mode and the average trip in *least total* mode. In plain terms, a place everyone loves is worth about 45 extra minutes of travel. Tweak it in `derivePlan`.

## Ideas for next
- Sign-in (Supabase Auth magic links) so people can use Hosting across devices.
- Notifications when the pick changes or your pickup time moves.
- Dietary needs as hard filters (e.g. vegetarian options required).

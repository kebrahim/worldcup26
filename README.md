Here's everything Claude Code needs to know to build this app from scratch:

---

## World Cup Contest App — Full Spec

### Overview
A full-stack fantasy contest web app for 5 friends to track the 2026 FIFA World Cup. Two drafts, five contests, one overall winner.

---

### Tech Stack
- **Frontend/Backend**: Next.js 14 (App Router, TypeScript)
- **Database + Auth**: Supabase (Postgres, Supabase Auth email/password, Supabase Realtime)
- **Styling**: Tailwind CSS
- **Email**: Resend (async draft turn notifications)
- **Scores API**: WC2026 API (wc2026api.com) — free tier, Bearer token auth
- **Hosting**: Vercel (with cron job for score sync)

---

### The Two Drafts

**Draft 1 — Group Stage**
- All 48 teams are available
- Snake draft runs for exactly 45 picks (9 rounds × 5 players)
- Each player gets 9 teams; the 3 teams nobody picks just don't participate
- Draft order is randomly assigned by the app at start time
- Async: players get an email when it's their turn, pick at their own pace
- Draft board shows all 48 teams; picked teams become greyed out
- Teams can be filtered by group (A–L)

**Draft 2 — Knockout Stage**
- Happens after group play ends, before Round of 32 begins
- All 32 teams that advance are drafted — no teams skipped
- 32 picks total: 3 players get 6 teams, 2 players get 7 teams (snake naturally handles this)
- New random draft order generated for this draft
- Same async email system as Draft 1

**Snake draft logic**: Pick 1→5 forward, pick 6→10 reverse, pick 11→15 forward, etc. Formula: for pick number N with P players, round = ceil(N/P), position in round = (N-1) % P, player index = position if round is odd, (P-1-position) if round is even.

---

### The Five Contests

All use raw totals (not per-team averages).

| Contest | Stage | Metric | Direction |
|---|---|---|---|
| Group Goals Scored | Group | Total goals scored by your 9 teams across all group matches | Higher is better |
| Group Defense | Group | Total goals conceded by your 9 teams across all group matches | Lower is better |
| Group Advancements | Group | Number of your 9 teams that advance to the Round of 32 | Higher is better |
| Knockout Bracket | Knockout | Points per round your teams win: R32=1, R16=2, QF=3, SF=4, Final=5, plus +3 bonus for the champion | Higher is better |
| Knockout Goals | Knockout | Total goals scored by your 6–7 knockout teams through the entire knockout stage | Higher is better |

**Overall leaderboard**: Each contest awards 5/4/3/2/1 points for 1st through 5th place. The player with the most total points across all 5 contests wins.

---

### Database Schema (Supabase/Postgres)

**profiles** — extends auth.users
- id (uuid, FK to auth.users)
- display_name (text)
- email (text)
- is_commissioner (boolean, default false)
- created_at

**teams** — all 48 World Cup teams, seeded at setup
- id (serial)
- name, code (e.g. 'USA'), group_name ('A'–'L'), fifa_ranking, flag_emoji

**draft_sessions**
- id (uuid)
- stage (enum: 'group_stage' | 'knockout')
- status (enum: 'pending' | 'active' | 'completed')
- total_rounds (int) — 9 for group, 7 for knockout
- current_round (int)
- current_pick_index (int) — 0-indexed overall pick counter
- snake_order (uuid[]) — player IDs in round-1 order
- created_at, completed_at

**draft_picks**
- id (uuid)
- session_id (FK draft_sessions)
- user_id (FK profiles)
- team_id (FK teams)
- round (int)
- pick_number (int) — 1-indexed overall pick number
- picked_at
- unique(session_id, team_id), unique(session_id, pick_number)

**matches** — populated by score sync
- id (int, from WC2026 API)
- stage (enum: 'group' | 'round_of_32' | 'round_of_16' | 'quarterfinal' | 'semifinal' | 'final')
- group_name (nullable)
- home_team_id, away_team_id (FK teams)
- home_score, away_score (nullable until played)
- home_score_pen, away_score_pen (nullable, for shootouts)
- winner_team_id (FK teams, nullable)
- kickoff_utc, status ('scheduled' | 'live' | 'completed'), venue

**contest_scores** — pre-computed, recalculated after every score sync
- user_id (FK profiles)
- contest (text: one of the 5 contest keys)
- score (numeric)
- rank (int, 1–5)
- contest_points (int, 5/4/3/2/1)
- unique(user_id, contest)

**Key views:**
- `group_stage_rosters` — joins picks + matches to show each user's teams with live GF/GA
- `overall_leaderboard` — sums contest_points per user, ordered by total

---

### App Pages

**/** — Home: hero section, contest explanations, how-it-works steps, links to draft and leaderboard

**/leaderboard** — Overall standings table + collapsible per-contest breakdowns. Revalidates every 60s.

**/draft** — Live draft board. Shows who's on the clock, snake order, recent picks, all 48 (or 32) teams as clickable cards with group filter. Uses Supabase Realtime to update live when anyone makes a pick. Button to pick a team calls POST /api/draft/pick.

**/teams** — My Teams page. Shows user's 9 group stage teams with live GF/GA from the DB, plus their knockout teams. Summary stat cards for all 5 contest scores with rank and points earned.

**/schedule** — All matches grouped by date. Highlights matches involving the current user's teams. Shows live scores, final scores, or kickoff time depending on status.

**/login** — Email/password sign in and sign up. Supabase Auth.

**/admin** — Commissioner only. Buttons to: start group stage draft, start knockout draft, manually trigger score sync. Shows current draft status and pick log.

---

### API Routes

**POST /api/draft/pick** — authenticated, validates it's the user's turn, records pick, advances session state, emails next player

**POST /api/draft/start** — commissioner only, creates draft session with random snake order, emails first player

**POST /api/scores/sync** — protected by x-sync-secret header, calls WC2026 API, upserts match results, recalculates all contest scores and ranks

---

### Score Sync Logic
1. Fetch all matches from WC2026 API
2. Map team codes to internal team IDs
3. Upsert match results (score, status, winner)
4. For each user, recalculate all 5 contest scores from scratch based on their draft picks + completed matches
5. Re-rank all users per contest (ascending for defense, descending for others)
6. Assign 5/4/3/2/1 contest points based on rank
7. Run every 5 minutes via Vercel cron during the tournament

---

### All 48 Teams (seeded in DB)

Group A: USA, Panama, Honduras, Jamaica
Group B: Argentina, Chile, Peru, Australia
Group C: Spain, Croatia, Morocco, Belgium
Group D: Brazil, Mexico, Ecuador, Venezuela
Group E: France, England, Serbia, South Africa
Group F: Germany, Portugal, Turkey, Czech Republic
Group G: Netherlands, Colombia, Uruguay, Ivory Coast
Group H: Japan, South Korea, Saudi Arabia, Iran
Group I: Italy, Switzerland, Greece, Nigeria
Group J: Poland, Austria, Romania, Senegal
Group K: Canada, Algeria, Egypt, New Zealand
Group L: Qatar, Cameroon, Ghana, Tunisia

---

### Design
Dark theme. Deep green-blacks (#030a04 bg, #06120a surfaces, #143d1f borders). Gold/amber accent (#e8b820 primary, #f5c842 highlight). Warm chalk white text (#f5f0e8). Monospace font for numbers and labels. Condensed display font for headings. Subtle pitch-texture overlay on the background. Gold left-border accent on cards.

---

### Environment Variables Needed
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
WC2026_API_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
NEXT_PUBLIC_APP_URL
SYNC_SECRET
```

---

### Build Order (recommended)
1. Supabase project setup — run schema SQL, seed 48 teams
2. Auth — sign up / sign in pages, profile creation trigger
3. Draft system — session creation, snake logic, pick API, real-time board, email notifications
4. Score sync — WC2026 API integration, match upserting, contest score calculation
5. Leaderboard — overall + per-contest views
6. My Teams page — roster + live stats
7. Schedule page — match list with user team highlights
8. Admin panel — commissioner controls
9. Vercel deploy + cron job for score sync

# כמה אתם מכירים את אביה? - Birthday Quiz App

A real-time birthday quiz app for Aviya's birthday party built with Next.js, Supabase, and Tailwind CSS.

## Features

- Real-time multiplayer quiz using Supabase Realtime
- QR code for easy mobile joining
- Timer per question with speed bonus scoring
- Live leaderboard
- Host/admin control panel

## Routes

- `/` - Home page with links to all screens
- `/game/AVIYA28` - Main game screen (TV/big display with QR code)
- `/play/AVIYA28` - Player screen (mobile phones)
- `/admin/AVIYA28` - Host/admin control panel (password protected)

## Local Development Setup

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works)

### 1. Clone and install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy the example env file and fill in your values:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
ADMIN_PASSWORD=choose_a_secure_password
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Set up Supabase database

1. Go to your Supabase project dashboard
2. Open the SQL Editor
3. Run the migration: copy and paste the contents of `supabase/migrations/001_schema.sql`
4. Run the seed data: copy and paste the contents of `supabase/seed.sql`

### 4. Enable Supabase Realtime

In your Supabase dashboard:
1. Go to Database > Replication
2. Make sure `supabase_realtime` publication includes the tables: `games`, `questions`, `players`, `answers`

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Supabase Setup Details

### Required Tables

- `games` - Game sessions
- `questions` - Quiz questions with multiple choice options (stored as JSONB)
- `players` - Players who joined a game
- `answers` - Player answers with scoring

### Row Level Security

The schema uses RLS with public read access. All writes go through server-side API routes using the service role key, so the anon key is safe to expose publicly.

### Realtime

The app uses Supabase Realtime to push updates to all clients when game state changes. Make sure the tables are added to the `supabase_realtime` publication (the migration SQL handles this).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anonymous key (safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key (keep secret!) |
| `ADMIN_PASSWORD` | Password for the admin/host control panel |
| `NEXT_PUBLIC_APP_URL` | Your app's public URL (used for QR code generation) |

## Deployment to Vercel

1. Push this repo to GitHub
2. Import the project in Vercel
3. Add all environment variables in Vercel project settings
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel domain (e.g. `https://your-app.vercel.app`)
5. Deploy!

## Scoring System

- Correct answer: **1000 base points**
- Speed bonus: up to **500 additional points** based on how fast you answered
- Formula: `speedBonus = 500 * (timeRemaining / timeLimit)`

## Game Flow (Admin Controls)

1. Share the QR code from `/game/AVIYA28` - players scan and join at `/play/AVIYA28`
2. Admin at `/admin/AVIYA28` clicks "הצג שאלה" (Show Question)
3. Players answer on their phones within the time limit
4. Admin clicks "חשוף תשובה" (Reveal Answer)
5. Admin clicks "הצג דירוג" (Show Leaderboard)
6. Admin clicks "לשאלה הבאה" (Next Question) or "סיים משחק" (Finish Game) on last question

# Supabase setup

## 1. Create the database tables

Open the Supabase SQL editor for your project and run `supabase/schema.sql`.

The schema creates:

- `conversations` — one row per WhatsApp user, storing the bot state and collected consultation answers.
- `inbound_messages` — every inbound WhatsApp message ID, used for durable webhook deduplication.
- `vet_cases` — one row per payment-confirmed consultation sent to the vet.

## 2. Configure environment variables

Add these variables to your server/Vercel project:

- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

If you also use Supabase from browser code, keep using:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

`api/webhook.js` must use the service role key because the SQL enables RLS and blocks anonymous/client writes. Keep the service role key server-side only and never commit a real key.

## 3. Local development

Copy `.env.example` to `.env`, then fill in the real values. `.env` is ignored by git.

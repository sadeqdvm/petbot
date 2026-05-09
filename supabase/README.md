# Supabase setup

## 1. Create the database tables

Open the Supabase SQL editor for your project and run `supabase/schema.sql`, or apply the migration in `supabase/migrations/20260509100000_initial_supabase_postgres.sql` with the Supabase CLI.

The schema creates:

- `app_profiles` — Supabase Auth profile metadata for customers, vets, and admins.
- `bot_conversations` — one row per WhatsApp user, storing bot state and collected consultation answers.
- `messages` — inbound and outbound WhatsApp message history for dashboard views.
- `inbound_messages` — every inbound WhatsApp message ID plus processing status, used for durable webhook deduplication without suppressing retries after failures.
- `uploaded_images` — payment screenshots stored in the private `payment-screenshots` bucket.
- `vet_cases` — one row per payment-confirmed consultation sent to the vet.

## 2. Configure environment variables

Add these variables to your server/Vercel project:

- `ACCESS_TOKEN`
- `PHONE_NUMBER_ID`
- `VERIFY_TOKEN`
- `VET_NUMBER`
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYMENT_SCREENSHOT_BUCKET`

`api/webhook.js` must use the service role key because the SQL enables RLS and blocks anonymous/client writes. Keep the service role key server-side only and never commit a real key.

Optional: set `INBOUND_PROCESSING_STALE_SECONDS` to control when an abandoned `processing` message claim can be retried. It defaults to 300 seconds.

## 3. Local development

Copy `.env.example` to `.env`, then fill in the real values. `.env` is ignored by git.

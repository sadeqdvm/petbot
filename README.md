# PetBot WhatsApp Telemedicine Dashboard

Production-ready Next.js 14 dashboard for veterinary WhatsApp Cloud API consultations.

## Features

- Secure admin login with HTTP-only JWT session cookies.
- Live WhatsApp-style chat dashboard with unread counts, timestamps, search, and status filters.
- Manual doctor replies, public-image URL replies, and quick reply templates.
- Per-chat bot takeover: **Bot Active / Doctor Active**.
- Persistent MongoDB schemas for users, chats, messages, and consultations.
- Meta WhatsApp Cloud API webhook integration with durable duplicate prevention through unique WhatsApp message IDs.
- Ignores status webhooks automatically.
- Payment screenshot/image viewing through an authenticated media proxy.
- Analytics for daily consultations, completed cases, revenue, and active chats.
- Browser/audio notifications, online/offline vet status, PDF chat export, and dark mode.
- Vercel-ready serverless API routes.

## Folder structure

```text
app/
  api/
    auth/login/route.js
    auth/logout/route.js
    auth/me/route.js
    chats/route.js
    chats/[chatId]/messages/route.js
    chats/[chatId]/reply/route.js
    chats/[chatId]/export/route.js
    media/[mediaId]/route.js
    stats/route.js
    webhook/route.js
  dashboard/page.js
  login/page.js
  globals.css
components/DashboardClient.jsx
lib/auth.js
lib/bot.js
lib/db.js
lib/realtime.js
lib/serializers.js
lib/whatsapp.js
models/User.js
models/Chat.js
models/Message.js
models/Consultation.js
scripts/create-admin.js
vercel.json
.env.example
```

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Fill in MongoDB, session, Meta WhatsApp Cloud API, and optional Pusher variables.

4. Create an admin user:

   ```bash
   npm run create-admin
   ```

5. Start development server:

   ```bash
   npm run dev
   ```

6. Open `http://localhost:3000/login`.

## Meta WhatsApp Cloud API webhook

Set your Meta app webhook callback URL to:

```text
https://YOUR_DOMAIN/api/webhook
```

Use the same verify token as `WHATSAPP_VERIFY_TOKEN`. Subscribe to WhatsApp message webhooks. The route accepts verification GET requests and stores POST message events.

The webhook stores inbound messages, ignores delivery/read status webhooks, prevents duplicate inserts with a unique `whatsappMessageId`, and stops automated bot replies whenever a doctor disables the bot for that chat.

## Manual image replies

The WhatsApp Cloud API requires image messages to use an accessible URL or uploaded media ID. This dashboard sends doctor images by public URL. Use a clinic-approved object storage/CDN URL such as S3, Cloudinary, or Vercel Blob.

## Realtime

Set Pusher variables to enable immediate realtime updates over an authenticated private channel. Without Pusher, the dashboard still refreshes chats/stats every 10 seconds.

Required Pusher variables:

```text
PUSHER_APP_ID=
NEXT_PUBLIC_PUSHER_KEY=
PUSHER_SECRET=
NEXT_PUBLIC_PUSHER_CLUSTER=
```

## Vercel deployment

1. Push this repository to GitHub.
2. Create a Vercel project and select the repository.
3. Add every variable from `.env.example` in Vercel Project Settings > Environment Variables.
4. Deploy.
5. Configure Meta WhatsApp webhook callback to `https://YOUR_VERCEL_DOMAIN/api/webhook`.
6. Run `npm run create-admin` locally against the production MongoDB URI, or sign in once with `ADMIN_EMAIL`/`ADMIN_PASSWORD` to auto-create the first admin.

## Security notes

- Use a long random `SESSION_SECRET`.
- Keep `WHATSAPP_ACCESS_TOKEN` server-side only.
- The media proxy requires an authenticated dashboard session before retrieving WhatsApp-hosted images.
- Rotate admin passwords and Meta tokens regularly.

# Corhaus Pilates Studio App

A modern, mobile-first web application for managing Pilates class bookings, attendance tracking with QR codes, and member management. Built with Next.js, Tailwind CSS, and Supabase.

## Features

*   **Member Dashboard:** Browse available classes, book sessions, and generate QR codes for attendance.
*   **Admin Dashboard:** Create and manage classes, view enrolled members, and track attendance.
*   **WhatsApp Cloud API Integration:** Automated class reminders, booking confirmations, payment receipts, and staff inbox for member chat.
*   **QR Code Scanner:** Built-in scanner for admins to mark attendance quickly at the studio.
*   **Authentication:** Secure Google OAuth integration via Supabase.
*   **Role-Based Access:** Protected routes ensuring members and admins see only what they should.
*   **Approval System:** Admins must approve new members before they can access the platform.

## Tech Stack

*   **Frontend:** Next.js (App Router), React, Tailwind CSS
*   **Backend & DB:** Supabase (PostgreSQL, Auth, RLS)
*   **WhatsApp API:** Meta WhatsApp Cloud API (Graph API direct)
*   **QR Scanner:** `html5-qrcode` & `jsqr`

## Local Development Setup

### Prerequisites
*   Node.js 18+
*   npm or yarn
*   A Supabase account and project

### 1. Clone the repository

```bash
git clone https://github.com/srikarkandukuri07-10/Corhaus.git
cd Corhaus
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment Variables Setup

Create a `.env.local` file based on `.env.example`:

```bash
cp .env.example .env.local
```

### 4. Database Setup

Run the migrations in `supabase/migrations/` (including `059_whatsapp_cloud_api.sql`).

### 5. Run the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

---

## WhatsApp Setup (Meta Cloud API)

Corhaus connects directly to Meta's official WhatsApp Business Cloud API with no third-party intermediate service or phone app requirement.

### 1. Required Environment Variables

Add these to `.env.local` (and to Vercel Project Settings > Environment Variables):

| Variable | Description |
| --- | --- |
| `WHATSAPP_ENABLED` | `"true"` to call Meta Graph API; anything else = dry-run (logs outbound payloads, stores status as `"dry_run"`, does not contact Meta). Webhook receiving and verification always work regardless of this flag. |
| `WHATSAPP_ACCESS_TOKEN` | Meta System User permanent access token (or temporary sandbox token for testing). |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID from the Meta WhatsApp App dashboard. |
| `WHATSAPP_VERIFY_TOKEN` | Secret token chosen by you to verify webhook handshakes in Meta App settings. |
| `WHATSAPP_APP_SECRET` | App Secret from Meta App Basic Settings, used to verify `X-Hub-Signature-256` HMAC signatures. |
| `WHATSAPP_GRAPH_VERSION` | Default `"v25.0"`. |
| `CRON_SECRET` | Secret token protecting the class reminder endpoint (`/api/whatsapp/cron/reminders`). |
| `WHATSAPP_AUTO_REPLY_TEXT` | *(Optional)* If set, automatically replies to a member message if no staff reply went out in the last 12 hours. |

### 2. Registering the Webhook in Meta App Dashboard

1. Navigate to your app in the [Meta for Developers](https://developers.facebook.com/) portal.
2. In the left sidebar, expand **WhatsApp** > **Configuration**.
3. Under **Webhook**, click **Edit**:
   * **Callback URL**: `https://your-domain.com/api/whatsapp/webhook`
   * **Verify Token**: Must match `WHATSAPP_VERIFY_TOKEN` in your environment.
4. Click **Verify and Save**.
5. Under **Webhook fields**, click **Manage** and subscribe to:
   * `messages` (inbound messages from members)
   * `message_template_status_update` (template approvals/rejections)

### 3. Testing in Dry-Run & Sandbox Mode

1. **Dry-Run Mode (Default):**
   * Keep `WHATSAPP_ENABLED=false`.
   * Outbound messages (booking confirmations, payment receipts, reminders) are logged to console and saved in `whatsapp_messages` with status `"dry_run"`.
   * Webhook verification (`GET /api/whatsapp/webhook`) and inbound message handling (`POST /api/whatsapp/webhook`) function normally.
2. **Sandbox Testing:**
   * Set `WHATSAPP_ENABLED=true`.
   * Use Meta's provided Test Phone Number ID and temporary Access Token.
   * Add test recipient numbers under **WhatsApp** > **API Setup** in Meta portal.
   * Send messages and test the `/admin/inbox` staff chat view.
3. **Verify Pure Logic Suite:**
   ```bash
   npm run verify:whatsapp
   ```
   Runs 75+ automated assertions verifying phone normalization, HMAC signature verification, status-never-downgrades rule, 24-hour reply window logic, and webhook idempotency.

### 4. Going Live (Zero Code Changes)

When the studio's production SIM arrives and is registered in WhatsApp Business Manager:
1. Approve templates in Meta WhatsApp Manager (`booking_reminder`, `booking_confirmed`, `payment_receipt`).
2. Update environment variables in Vercel:
   * `WHATSAPP_PHONE_NUMBER_ID`: Production registered phone number ID.
   * `WHATSAPP_ACCESS_TOKEN`: Permanent System User token with `whatsapp_business_messaging` permissions.
   * `WHATSAPP_ENABLED`: Set to `"true"`.
3. Provide the public privacy policy URL to Meta App Review: `https://your-domain.com/privacy`.
4. Switch Meta App from Development mode to **Live**.

### 5. Automated Class Reminders & Scheduler

Reminders are triggered via the protected endpoint:
```
GET /api/whatsapp/cron/reminders
Header: Authorization: Bearer <CRON_SECRET>
Optional query: ?hours=2 (default 2 hours ahead)
```
* Finds confirmed/booked members with class start times within the upcoming window in `Asia/Kolkata` time.
* Sets `reminder_sent_at` on `bookings` to prevent double-sending.
* **Note on Schedulers:** Vercel Hobby accounts limit cron jobs to once per day. If you need hourly or continuous reminder checks (e.g. every 15–30 minutes), trigger this endpoint via an external scheduler such as [cron-job.org](https://cron-job.org), GitHub Actions, or AWS EventBridge using the `CRON_SECRET` Bearer header.

---

## Deployment

This application is ready to be deployed to Vercel:

1. Push this repository to GitHub.
2. Import the project in your Vercel Dashboard.
3. Configure the Environment Variables in Vercel exactly as listed above.
4. Deploy!

## License

MIT License

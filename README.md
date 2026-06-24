# Corhaus Pilates Studio App

A modern, mobile-first web application for managing Pilates class bookings, attendance tracking with QR codes, and member management. Built with Next.js 14, Tailwind CSS, and Supabase.

## Features

*   **Member Dashboard:** Browse available classes, book sessions, and generate QR codes for attendance.
*   **Admin Dashboard:** Create and manage classes, view enrolled members, and track attendance.
*   **QR Code Scanner:** Built-in scanner for admins to mark attendance quickly at the studio.
*   **Authentication:** Secure Google OAuth integration via Supabase.
*   **Role-Based Access:** Protected routes ensuring members and admins see only what they should.
*   **Approval System:** Admins must approve new members before they can access the platform.

## Tech Stack

*   **Frontend:** Next.js (App Router), React, Tailwind CSS
*   **Backend & DB:** Supabase (PostgreSQL, Auth, RLS)
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

Populate the variables with your Supabase project credentials:
*   `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase Project URL
*   `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anon/public key
*   `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service_role key (used for bypassing RLS during admin actions)

### 4. Database Setup

Ensure your Supabase database has the following tables with correct Row Level Security (RLS) policies:
*   `profiles`
*   `classes`
*   `bookings`
*   `attendance`
*   `approved_members`

You also need an authentication trigger to automatically create profiles upon user signup.

### 5. Run the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

## Deployment

This application is ready to be deployed to Vercel, which provides zero-configuration support for Next.js.

1.  Push this repository to GitHub.
2.  Import the project in your Vercel Dashboard.
3.  Configure the Environment Variables in Vercel exactly as they are in your `.env.local`.
4.  Deploy! Vercel will automatically build and deploy the Next.js App.

## License

MIT License

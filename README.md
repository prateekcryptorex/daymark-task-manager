# Daymark Task Manager

A responsive React task manager with optional accounts. Guests keep tasks in browser storage. Signed-in users can sync their own task list across devices using Supabase Auth and Postgres.

## Run locally

Requirements: Node.js 18 or newer.

```sh
npm install
npm run dev
```

Open the Vite URL shown in the terminal. Build for production with `npm run build` or preview with `npm run preview`.

## Features

- Add, edit, complete, and delete tasks; filter by status, date view, or category; search task titles.
- Set Work, Personal, Urgent, Home, or Study categories and optional due dates and times.
- Enable browser notifications for timed tasks: one reminder 15 minutes before and another at the scheduled time.
- See overdue indicators and live active/completed counts; drag tasks to reorder.
- Optionally attach images and videos to completed tasks. Guests store media in IndexedDB; signed-in users store private media in Supabase Storage. Files are limited to 50 MB each.
- Use the responsive Bento dashboard, Discord-inspired dark/light themes, small entrance animations, and theme toggle.
- Continue as a guest with localStorage, or sign in with Google, Microsoft, or email/password.
- Supabase sessions persist across refreshes. Signed-in task lists are private to the account through row-level security; the guest list is restored after signing out.

Timed reminders require notification permission and Daymark to remain open in a browser tab. Browser timers may be delayed when the device sleeps, and reminders cannot fire after the browser is fully closed; guaranteed closed-app delivery requires a push-notification service worker and server-side scheduling.

## Enable Sign-In And Sync

Authentication is optional. Without Supabase configuration, guest mode works normally and the sign-in dialog explains why provider options are unavailable.

1. Create a Supabase project.
2. In the Supabase SQL editor, run [`supabase/schema.sql`](supabase/schema.sql) to create the task table, private evidence bucket, and row-level security policies.
3. Copy `.env.example` to `.env.local` and fill in the project URL and publishable/anon key from Supabase project settings:

	```env
	VITE_SUPABASE_URL=https://your-project.supabase.co
	VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
	```

4. In Supabase Auth, set the site URL and redirect allowlist to include `http://localhost:5173` (and your deployed app URL).
5. Enable Google and Azure (Microsoft) providers in Supabase Auth and enter each provider's OAuth client ID and secret. Register the callback URL shown by Supabase with Google Cloud and Microsoft Entra ID. Microsoft sign-in requests the `email` scope.
6. Enable email/password under Supabase Auth providers. Configure email confirmation and templates there if desired.
7. Restart Vite after changing `.env.local`.

Never put a Supabase `service_role` key in this client app. Use only the publishable/anon key; the included row-level security policies restrict access to each authenticated user's row.

## Security Notes

- `npm audit` should be run regularly; it checks known advisories for the currently installed dependency tree.
- Vite's dev server sends anti-framing, MIME-sniffing, referrer, and permissions headers. Vite preview additionally sends a Content Security Policy. A production static host does not inherit these Vite settings: configure equivalent response headers there, serve only over HTTPS, and narrow the CSP `connect-src` to this app and its configured Supabase project.
- Browser storage is available to JavaScript running on the same origin, so it is not a security boundary. Keep third-party scripts to a minimum and never store secrets in localStorage or client environment variables.
- No client-side app can be guaranteed free of every current or future vulnerability; secure Supabase provider settings, redirect allowlists, RLS, and deployment headers remain part of the deployment.

## Project map

- `frontend/index.html` and `frontend/vite.config.js` own the browser app entry point and Vite setup.
- `frontend/src/App.jsx` contains task interactions, account/session state, and task synchronization.
- `frontend/src/components/` contains the authentication and attachment UI.
- `frontend/src/lib/` contains Supabase access and local attachment storage.
- `frontend/src/styles.css` contains responsive Bento layouts, animation, and light/dark palettes.
- `backend/supabase/schema.sql` defines per-user task storage, private evidence storage, and row-level security.
- `package.json`, `.env.example`, and `README.md` remain at the repository root for shared project commands and documentation.

React state drives tasks and filters; effects persist guest data locally and debounce cloud updates for signed-in users. Supabase Auth stores the browser session and handles OAuth redirects.

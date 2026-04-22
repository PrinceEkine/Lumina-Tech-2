# Local Setup Guide for Lumina Tech

To run this application on your local machine, follow these steps:

## 1. Prerequisites
- [Node.js](https://nodejs.org/) (Version 18 or higher recommended)
- [npm](https://www.npmjs.com/) (installed with Node.js)
- A [Supabase](https://supabase.com/) account and project

## 2. Setup Database
1. Create a new project on Supabase.
2. Go to **Project Settings > API** and note your `URL` and `anon public` key.
3. Use the SQL Editor in Supabase to create your tables (Staff, Bookings, blogs, etc.).

## 3. Local Installation
1. Download the project files (via the Zip export in AI Studio).
2. Open your terminal or command prompt in the project folder.
3. Install dependencies:
   ```bash
   npm install
   ```

## 4. Environment Variables
1. Create a file named `.env` in the root directory.
2. Copy the contents from `.env.example` into your new `.env` file.
3. Replace the placeholder values with your real Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-actual-anon-key
   ```

## 5. Run the Application
1. Start the development server:
   ```bash
   npm run dev
   ```
2. Open your browser and go to `http://localhost:3000` (or the port shown in your terminal).

## Note on Login Errors
If you see "Failed to fetch" or "Connection error" in AI Studio, it's because the environment variables aren't set in the AI Studio settings yet. 

**To fix in AI Studio:**
1. Click the **Settings (gear icon)** in the top right menu of AI Studio.
2. Find the **Secrets/Environment Variables** section.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. The preview will refresh and the login will work.

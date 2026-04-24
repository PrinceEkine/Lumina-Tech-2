import express from "express";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const app = express();

let smtpTransporter: nodemailer.Transporter | null = null;

function getSmtpTransporter() {
  if (!smtpTransporter) {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
      console.warn("SMTP_USER or SMTP_PASS not set. Email simulation mode.");
      return null;
    }

    smtpTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: user,
        pass: pass // This MUST be a Gmail "App Password"
      }
    });
  }
  return smtpTransporter;
}

// Basic Security Headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

app.use(express.json());

// 0. Simple In-Memory Rate Limiter
const emailRateLimit = new Map<string, number[]>();
const staffRateLimit = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_EMAILS_PER_WINDOW = 5;
const MAX_STAFF_CREATIONS_PER_WINDOW = 10;

function isRateLimited(ip: string, map: Map<string, number[]>, limit: number): boolean {
  const now = Date.now();
  const timestamps = map.get(ip) || [];
  const recentTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
  
  if (recentTimestamps.length >= limit) {
    return true;
  }
  
  recentTimestamps.push(now);
  map.set(ip, recentTimestamps);
  return false;
}

// API Route: Send Email
app.post("/api/send-email", async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
  
  if (isRateLimited(ip, emailRateLimit, MAX_EMAILS_PER_WINDOW)) {
    return res.status(429).json({ error: "Too many email requests. Please try again in an hour." });
  }
  // ...
});

import { createClient } from '@supabase/supabase-js';

// API Route: Create Staff Account (Admin only)
app.post("/api/create-staff", async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
  
  if (isRateLimited(ip, staffRateLimit, MAX_STAFF_CREATIONS_PER_WINDOW)) {
    return res.status(429).json({ error: "Too many staff creations. Try again later." });
  }

  const { email, password, name, role, phone } = req.body;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.VITE_SUPABASE_URL;

  if (!serviceKey || !url) {
    return res.status(500).json({ error: "Supabase Service Role Key is not configured on the server." });
  }

  const adminSupabase = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // 1. Create User in Auth
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, role: role, phone: phone }
    });

    if (authError) throw authError;

    // 2. Create entry in staff table
    const { error: dbError } = await adminSupabase
      .from('staff')
      .insert([{
        id: authData.user?.id,
        name,
        email,
        username: email.split('@')[0],
        role,
        phone_number: phone,
        status: 'Active'
      }]);

    if (dbError) throw dbError;

    res.json({ success: true, userId: authData.user?.id });
  } catch (err: any) {
    console.error("Staff Creation Error:", err);
    res.status(400).json({ error: err.message });
  }
});

  const { to, subject, message } = req.body;

  // 1. Basic Security: Input Validation
  if (!to || !subject || !message) {
    return res.status(400).json({ error: "Missing required fields: to, subject, and message are all required." });
  }

  // 2. Email Format Validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  // 3. Message Length Validation
  if (message.length > 5000) {
    return res.status(400).json({ error: "Message too long (max 5000 characters)." });
  }

  const transporter = getSmtpTransporter();

  if (!transporter) {
    console.log("Simulating email send to:", to);
    return res.json({ success: true, simulated: true });
  }

  try {
    const mailOptions = {
      from: `"Lumina Tech" <${process.env.SMTP_USER}>`,
      to: to,
      subject: subject,
      html: `<div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
              <h2 style="color: #00cfd5; border-bottom: 2px solid #00cfd5; padding-bottom: 10px;">Lumina Tech Notification</h2>
              <p style="font-size: 16px;">${message}</p>
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999;">
                <p>&copy; 2026 Lumina Tech. All rights reserved.</p>
                <p>This is an automated message, please do not reply.</p>
              </div>
            </div>`,
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (err) {
    console.error("SMTP Error:", err);
    res.status(500).json({ error: "Failed to send email. Please check server logs." });
  }
});

// 4. Security: Health Check (Minimal Info)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;

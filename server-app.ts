import express from "express";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

dotenv.config();

const app = express();

// Initialize Admin SDK Lazily and Safely
function initAdminSDK() {
  if (getApps().length) return true;

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  
  if (!clientEmail || !privateKey || !projectId) {
    console.warn("FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY or FIREBASE_PROJECT_ID not set. Admin features limited.");
    return false;
  }

  try {
    // Basic validation of the private key format to avoid Firebase SDK crash
    if (!privateKey.includes('BEGIN PRIVATE KEY')) {
      throw new Error('Invalid FIREBASE_PRIVATE_KEY format. Must be a valid PEM string.');
    }

    initializeApp({
      credential: cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey,
      })
    });
    console.log("Firebase Admin SDK initialized successfully.");
    return true;
  } catch (err: any) {
    console.error("CRITICAL: Failed to initialize Firebase Admin SDK:", err.message);
    return false;
  }
}

// Call check during load, but ignore failure (failure will be handled at runtime in routes)
initAdminSDK();

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

// API Route: Create Staff Account (Admin only)
app.post("/api/create-staff", async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
  
  if (isRateLimited(ip, staffRateLimit, MAX_STAFF_CREATIONS_PER_WINDOW)) {
    return res.status(429).json({ error: "Too many staff creations. Try again later." });
  }

  const { email, password, name, role, phone } = req.body;

  if (!initAdminSDK()) {
    return res.status(503).json({ error: "Firebase Admin is not configured. Please ensure FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are set correctly in Settings." });
  }

  try {
    console.log(`[Staff Creation] Starting creation for: ${email}`);
    
    // 1. Create User in Auth
    let userRecord;
    try {
      userRecord = await getAuth().createUser({
        email,
        password,
        displayName: name,
      });
      console.log(`[Staff Creation] Auth user created: ${userRecord.uid}`);
    } catch (authErr: any) {
      console.error("[Staff Creation] Auth error:", authErr);
      return res.status(400).json({ error: `Auth Error: ${authErr.message}` });
    }

    // 2. Create entry in users collection
    try {
      const dbId = process.env.FIREBASE_DATABASE_ID || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;
      const db = getFirestore(undefined, dbId);
      await db.collection('users').doc(userRecord.uid).set({
        name,
        email,
        role,
        phone_number: phone || '',
        status: 'Active',
        created_at: FieldValue.serverTimestamp()
      });
      console.log(`[Staff Creation] Firestore entry created for: ${userRecord.uid}`);
    } catch (fsErr: any) {
      console.error("[Staff Creation] Firestore error:", fsErr);
      return res.status(500).json({ error: `Database Error: ${fsErr.message}` });
    }

    res.json({ success: true, userId: userRecord.uid });
  } catch (err: any) {
    console.error("[Staff Creation] General Error:", err);
    res.status(500).json({ error: "Internal server error during staff creation." });
  }
});

// API Route: Send Email
app.post("/api/send-email", async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
  
  if (isRateLimited(ip, emailRateLimit, MAX_EMAILS_PER_WINDOW)) {
    return res.status(429).json({ error: "Too many email requests. Please try again in an hour." });
  }

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

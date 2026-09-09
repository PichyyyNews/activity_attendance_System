import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import { google } from 'googleapis';
import db from './db';

// Load environment variables from root workspace .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

const app = express();
const PORT = process.env.BACKEND_PORT || process.env.PORT || 5000;

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : [];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or same-origin requests)
    if (!origin) return callback(null, true);
    // Allow local development origins and configured domains
    if (
      origin.startsWith('http://localhost:') || 
      origin.startsWith('http://127.0.0.1:') || 
      allowedOrigins.includes(origin)
    ) {
      return callback(null, true);
    }
    callback(null, false);
  }
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// In-memory tracker for rate limiting admin PIN verification attempts
interface FailedAttemptEntry {
  count: number;
  resetTime: number;
}
const failedAttempts = new Map<string, FailedAttemptEntry>();

function isRateLimited(ip: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const entry = failedAttempts.get(ip);
  if (entry && now < entry.resetTime && entry.count >= max) {
    return true;
  }
  return false;
}

function recordFailedAttempt(ip: string, windowMs: number) {
  const now = Date.now();
  let entry = failedAttempts.get(ip);
  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + windowMs };
  }
  entry.count++;
  failedAttempts.set(ip, entry);
}

function clearFailedAttempts(ip: string) {
  failedAttempts.delete(ip);
}

// Timing-safe string comparison helper to prevent timing attacks
function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Perform a dummy timingSafeEqual to avoid leaking length info via response time
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// Admin API Authentication Middleware
app.use((req, res, next) => {
  const path = req.path;
  const method = req.method;
  const ADMIN_PIN = process.env.ADMIN_PIN || '250669';

  // Get client IP address
  let ip = '';
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const list = typeof xForwardedFor === 'string' ? xForwardedFor.split(',') : xForwardedFor[0].split(',');
    ip = list[0].trim();
  } else {
    ip = req.socket.remoteAddress || '';
  }

  const isAdminPath = 
    path.startsWith('/api/admin/') ||
    path.startsWith('/api/settings') ||
    path.startsWith('/api/systemlogs') ||
    path.startsWith('/api/academic-years') ||
    path.startsWith('/api/backup/') ||
    path === '/api/attendance-heatmap' ||
    path === '/api/attendances/update-status-remark' ||
    (path.startsWith('/api/attendances/session/') && !path.includes('/device/')) ||
    (path.startsWith('/api/attendances/') && (method === 'PUT' || method === 'DELETE')) ||
    path === '/api/attendances/recent' ||
    (path.startsWith('/api/sessions') && method !== 'GET') ||
    (path === '/api/students' || (path.startsWith('/api/students/') && method !== 'GET')) ||
    (path.startsWith('/api/majors') && method !== 'GET') ||
    path.startsWith('/api/device-registrations') ||
    (path.startsWith('/api/attendance-rejections') && !path.endsWith('/log-attempt')) ||
    path.startsWith('/api/assembly/settings') ||
    path.startsWith('/api/assembly/override') ||
    (path.startsWith('/api/assembly/holidays') && method !== 'GET') ||
    path.startsWith('/api/assembly/dashboard-summary') ||
    path.startsWith('/api/assembly/attendance-daily') ||
    path.startsWith('/api/assembly/attendance-matrix') ||
    path.startsWith('/api/assembly/update-status') ||
    path.startsWith('/api/assembly/systemlogs') ||
    path.startsWith('/api/assembly/rejections') ||
    path.startsWith('/api/assembly/report-export');

  if (isAdminPath) {
    const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
    const MAX_ATTEMPTS = 5;

    if (isRateLimited(ip, WINDOW_MS, MAX_ATTEMPTS)) {
      return res.status(429).json({ error: 'มีการพยายามเข้าสู่ระบบผิดพลาดมากเกินไป กรุณาลองใหม่อีกครั้งใน 15 นาที' });
    }

    const pin = req.header('X-Admin-Pin');
    if (!pin || !safeCompare(pin, ADMIN_PIN)) {
      recordFailedAttempt(ip, WINDOW_MS);
      return res.status(401).json({ error: 'ไม่พบสิทธิ์การใช้งานของแอดมินหรือรหัส PIN ไม่ถูกต้อง' });
    }

    // Success: reset attempts
    clearFailedAttempts(ip);
  }

  next();
});

function getBangkokISOString(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(date);
  const partMap: { [key: string]: string } = {};
  parts.forEach(p => {
    partMap[p.type] = p.value;
  });
  
  return `${partMap.year}-${partMap.month}-${partMap.day}T${partMap.hour}:${partMap.minute}:${partMap.second}+07:00`;
}

function getBangkokHourAndMinute(date: Date): { hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const partMap: { [key: string]: string } = {};
  parts.forEach(p => {
    partMap[p.type] = p.value;
  });
  return {
    hour: parseInt(partMap.hour, 10) || 0,
    minute: parseInt(partMap.minute, 10) || 0
  };
}

function getGenderFromPrefix(prefix: string = ''): 'male' | 'female' {
  const p = prefix.trim();
  if (p === 'นาย' || p === 'เด็กชาย' || p === 'ด.ช.' || p === 'ด.ช') {
    return 'male';
  }
  return 'female';
}

function getActiveSettings(): { academic_year: string; term: string } {
  try {
    const settings = db.prepare('SELECT academic_year, term FROM settings WHERE id = 1').get() as { academic_year: string, term: string } | undefined;
    return settings || { academic_year: '2569', term: '1' };
  } catch (e) {
    return { academic_year: '2569', term: '1' };
  }
}

// Helper to get Thai time from API with local offset fallback
async function getThaiTimeISO(): Promise<string> {
  // 1. Try timeapi.io
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=Asia/Bangkok', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json() as any;
      if (data && data.dateTime) {
        const iso = data.dateTime.split('.')[0];
        return `${iso}+07:00`;
      }
    }
  } catch (err: any) {
    console.warn('timeapi.io failed:', err.message || err);
  }

  // 2. Try worldtimeapi.org
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('https://worldtimeapi.org/api/timezone/Asia/Bangkok', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json() as any;
      if (data && data.datetime) {
        return data.datetime;
      }
    }
  } catch (err: any) {
    console.warn('worldtimeapi.org failed:', err.message || err);
  }

  // 3. Try fetching Google Date Header (extremely reliable fallback for synchronized atomic clock)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('https://www.google.com', { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeoutId);
    const dateHeader = res.headers.get('date');
    if (dateHeader) {
      const gmtTime = new Date(dateHeader);
      if (!isNaN(gmtTime.getTime())) {
        return getBangkokISOString(gmtTime);
      }
    }
  } catch (err: any) {
    console.warn('Google Date header sync failed:', err.message || err);
  }

  // 4. Final fallback to local system time (adjusted to UTC+7 using Bangkok timezone helper)
  return getBangkokISOString(new Date());
}

let cachedSheetsClient: any = null;
let cachedCredentialsJson = '';

function getSheetsClient(credentialsJson: string): any {
  if (cachedSheetsClient && cachedCredentialsJson === credentialsJson) {
    return cachedSheetsClient;
  }
  try {
    const credentials = JSON.parse(credentialsJson);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
    const auth = google.auth.fromJSON(credentials) as any;
    auth.scopes = ['https://www.googleapis.com/auth/spreadsheets'];
    cachedSheetsClient = google.sheets({ version: 'v4', auth: auth as any });
    cachedCredentialsJson = credentialsJson;
    return cachedSheetsClient;
  } catch (err) {
    console.error('Failed to initialize Google Sheets client:', err);
    throw err;
  }
}

// Helper function to sync attendance row to Google Sheets
async function syncToGoogleSheets(
  session: { week_number: number; title: string; academic_year?: string; term?: string }, 
  attendance: { student_id: string; prefix?: string; first_name: string; last_name: string; class_year: string; major_code: string; room: string; attended_at?: string; level?: string; year?: string; major_name?: string }
) {
  try {
    const stmt = db.prepare('SELECT * FROM settings WHERE id = 1');
    const settings = stmt.get() as { sheet_id: string; credentials_json: string } | undefined;

    if (!settings || !settings.sheet_id || !settings.credentials_json) {
      console.log('Google Sheets sync skipped: settings not fully configured.');
      return;
    }

    const rawSheetId = settings.sheet_id;
    const sheetIdMatch = rawSheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const sheetId = sheetIdMatch ? sheetIdMatch[1] : rawSheetId.trim();

    const sheets = getSheetsClient(settings.credentials_json);
    
    // Check if sheet already has header row (row 1)
    let hasHeaders = false;
    try {
      const checkRes = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'A1:N1'
      });
      if (checkRes.data.values && checkRes.data.values.length > 0) {
        hasHeaders = true;
      }
    } catch (err: any) {
      console.log('Determined sheet is empty or check failed, writing headers. Error:', err.message || err);
    }

    const values = [];
    if (!hasHeaders) {
      values.push([
        'ปีการศึกษา',
        'เทอม',
        'ระดับชั้น',
        'ชั้นปี',
        'ชื่อย่อสาขา',
        'ชื่อเต็มสาขา',
        'กลุ่ม',
        'สัปดาห์ที่',
        'หัวข้อกิจกรรม',
        'รหัสนักศึกษา',
        'คำนำหน้า',
        'ชื่อจริง',
        'นามสกุล',
        'เวลาเช็กชื่อ'
      ]);
    }

    values.push([
      session.academic_year || '2569',
      session.term || '1',
      attendance.level || 'ปวช',
      attendance.year || attendance.class_year || '1',
      attendance.major_code,
      attendance.major_name || 'เทคนิคคอมพิวเตอร์',
      attendance.room,
      session.week_number,
      session.title,
      attendance.student_id,
      attendance.prefix || '',
      attendance.first_name,
      attendance.last_name,
      new Date(attendance.attended_at || new Date()).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'A:N',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });

    console.log(`Successfully synced check-in for student ${attendance.student_id} to Google Sheet.`);
  } catch (error) {
    console.error('Failed to sync to Google Sheets:', error);
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'API is running' });
});

app.post('/api/auth/verify', (req, res) => {
  const { pin } = req.body;
  const ADMIN_PIN = process.env.ADMIN_PIN || '250669';

  // Get client IP address
  let ip = '';
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const list = typeof xForwardedFor === 'string' ? xForwardedFor.split(',') : xForwardedFor[0].split(',');
    ip = list[0].trim();
  } else {
    ip = req.socket.remoteAddress || '';
  }

  const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  const MAX_ATTEMPTS = 5;

  if (isRateLimited(ip, WINDOW_MS, MAX_ATTEMPTS)) {
    return res.status(429).json({ error: 'มีการพยายามเข้าสู่ระบบผิดพลาดมากเกินไป กรุณาลองใหม่อีกครั้งใน 15 นาที' });
  }

  if (!pin) {
    return res.status(400).json({ error: 'กรุณากรอกรหัส PIN' });
  }

  if (safeCompare(pin, ADMIN_PIN)) {
    clearFailedAttempts(ip);
    res.json({ success: true });
  } else {
    recordFailedAttempt(ip, WINDOW_MS);
    res.status(401).json({ error: 'รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' });
  }
});

// Settings CRUD
app.get('/api/settings', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM settings WHERE id = 1');
    const settings = stmt.get() as any;
    res.json(settings || { sheet_id: '', credentials_json: '', academic_year: '2569', term: '1' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.get('/api/academic-years', (req, res) => {
  try {
    // Return full objects from academic_years table, merged with any years not yet in the table
    const rows = db.prepare('SELECT id, year, term, is_active FROM academic_years ORDER BY year DESC, term ASC').all() as { id: number; year: string; term: string; is_active: number }[];
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch academic years' });
  }
});

// Get active year as simple strings (used by sidebar dropdowns)
app.get('/api/academic-years/list', (req, res) => {
  try {
    const rows = db.prepare('SELECT DISTINCT year FROM academic_years ORDER BY year DESC').all() as { year: string }[];
    res.json(rows.map(r => r.year));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch academic years list' });
  }
});

// Create new academic year
app.post('/api/academic-years', (req, res) => {
  try {
    const { year, term } = req.body;
    if (!year || !/^\d{4}$/.test(year.trim())) {
      return res.status(400).json({ error: 'ปีการศึกษาต้องเป็นตัวเลข 4 หลัก' });
    }
    const termVal = term || '1';
    const result = db.prepare('INSERT OR IGNORE INTO academic_years (year, term, is_active) VALUES (?, ?, 0)').run(year.trim(), termVal);
    if (result.changes === 0) {
      return res.status(409).json({ error: `ปีการศึกษา ${year} เทอม ${termVal} มีอยู่ในระบบแล้ว` });
    }
    const inserted = db.prepare('SELECT id, year, term, is_active FROM academic_years WHERE year = ? AND term = ?').get(year.trim(), termVal);
    res.json(inserted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create academic year' });
  }
});

// Update (rename) an academic year
app.put('/api/academic-years/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { year, term } = req.body;
    if (!year || !/^\d{4}$/.test(year.trim())) {
      return res.status(400).json({ error: 'ปีการศึกษาต้องเป็นตัวเลข 4 หลัก' });
    }
    const termVal = term || '1';
    // Check if the new year+term combo already exists (and it's not the same row)
    const existing = db.prepare('SELECT id FROM academic_years WHERE year = ? AND term = ? AND id != ?').get(year.trim(), termVal, id);
    if (existing) {
      return res.status(409).json({ error: `ปีการศึกษา ${year} เทอม ${termVal} มีอยู่ในระบบแล้ว` });
    }

    // Get current row to detect if active (need to sync settings)
    const current = db.prepare('SELECT year, term, is_active FROM academic_years WHERE id = ?').get(id) as { year: string; term: string; is_active: number } | undefined;
    if (!current) return res.status(404).json({ error: 'ไม่พบข้อมูลปีการศึกษา' });

    db.prepare('UPDATE academic_years SET year = ?, term = ? WHERE id = ?').run(year.trim(), termVal, id);

    // If this was the active year, update settings too
    if (current.is_active) {
      db.prepare('UPDATE settings SET academic_year = ?, term = ? WHERE id = 1').run(year.trim(), termVal);
    }

    const updated = db.prepare('SELECT id, year, term, is_active FROM academic_years WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update academic year' });
  }
});

// Delete an academic year
app.delete('/api/academic-years/:id', (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare('SELECT year, term, is_active FROM academic_years WHERE id = ?').get(id) as { year: string; term: string; is_active: number } | undefined;
    if (!row) return res.status(404).json({ error: 'ไม่พบข้อมูลปีการศึกษา' });
    if (row.is_active) {
      return res.status(400).json({ error: 'ไม่สามารถลบปีการศึกษาที่กำลังใช้งานอยู่ได้ กรุณาเปลี่ยนปีการศึกษาที่ใช้งานก่อน' });
    }
    db.prepare('DELETE FROM academic_years WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete academic year' });
  }
});

// Activate an academic year (set as current)
app.post('/api/academic-years/:id/activate', (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare('SELECT year, term FROM academic_years WHERE id = ?').get(id) as { year: string; term: string } | undefined;
    if (!row) return res.status(404).json({ error: 'ไม่พบข้อมูลปีการศึกษา' });

    // Deactivate all, then activate selected
    db.prepare('UPDATE academic_years SET is_active = 0').run();
    db.prepare('UPDATE academic_years SET is_active = 1 WHERE id = ?').run(id);

    // Sync to settings table
    db.prepare('UPDATE settings SET academic_year = ?, term = ? WHERE id = 1').run(row.year, row.term);

    res.json({ success: true, year: row.year, term: row.term });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to activate academic year' });
  }
});

app.get('/api/terms', (req, res) => {
  try {
    const termsRows = db.prepare(`
      SELECT DISTINCT term FROM students 
      UNION 
      SELECT DISTINCT term FROM majors 
      UNION 
      SELECT DISTINCT term FROM settings
    `).all() as { term: string }[];
    
    const terms = termsRows
      .map(r => r.term)
      .filter(t => t && t.trim() !== '')
      .sort((a, b) => a.localeCompare(b));
      
    res.json(terms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch terms' });
  }
});

app.post('/api/settings', (req, res) => {
  const { sheet_id, credentials_json, academic_year, term } = req.body;
  const sheetIdMatch = (sheet_id || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const cleanSheetId = sheetIdMatch ? sheetIdMatch[1] : (sheet_id || '').trim();
  try {
    const stmt = db.prepare(`
      INSERT INTO settings (id, sheet_id, credentials_json, academic_year, term) 
      VALUES (1, ?, ?, ?, ?) 
      ON CONFLICT(id) DO UPDATE SET 
      sheet_id = excluded.sheet_id, 
      credentials_json = excluded.credentials_json,
      academic_year = excluded.academic_year,
      term = excluded.term
    `);
    stmt.run(cleanSheetId, credentials_json || '', academic_year || '2569', term || '1');

    const finalYear = (academic_year || '2569').trim();
    const finalTerm = (term || '1').trim();
    db.prepare('INSERT OR IGNORE INTO academic_years (year, term, is_active) VALUES (?, ?, 0)').run(finalYear, finalTerm);
    db.prepare('UPDATE academic_years SET is_active = 0').run();
    db.prepare('UPDATE academic_years SET is_active = 1 WHERE year = ? AND term = ?').run(finalYear, finalTerm);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

app.post('/api/settings/sync-all', async (req, res) => {
  try {
    const stmtSettings = db.prepare('SELECT * FROM settings WHERE id = 1');
    const settings = stmtSettings.get() as { sheet_id: string; credentials_json: string } | undefined;

    if (!settings || !settings.sheet_id || !settings.credentials_json) {
      return res.status(400).json({ error: 'กรุณาตั้งค่า Google Sheets API และ Spreadsheet ID ในระบบก่อน' });
    }

    const rawSheetId = settings.sheet_id;
    const sheetIdMatch = rawSheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const sheetId = sheetIdMatch ? sheetIdMatch[1] : rawSheetId.trim();

    const sheets = getSheetsClient(settings.credentials_json);

    // Fetch all attendance records joined with session info
    const attendances = db.prepare(`
      SELECT a.*, s.week_number, s.title as session_title
      FROM attendances a 
      JOIN sessions s ON a.session_id = s.id 
      ORDER BY s.week_number ASC, a.attended_at ASC
    `).all() as any[];

    // Clear existing data in A:N
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: 'A:N',
      });
    } catch (clearErr: any) {
      console.error('Error clearing sheet:', clearErr);
      return res.status(500).json({ error: 'ไม่สามารถล้างข้อมูลใน Google Sheets ได้: ' + (clearErr.message || clearErr) });
    }

    // Build values array
    const values = [
      [
        'ปีการศึกษา',
        'เทอม',
        'ระดับชั้น',
        'ชั้นปี',
        'ชื่อย่อสาขา',
        'ชื่อเต็มสาขา',
        'กลุ่ม',
        'สัปดาห์ที่',
        'หัวข้อกิจกรรม',
        'รหัสนักศึกษา',
        'คำนำหน้า',
        'ชื่อจริง',
        'นามสกุล',
        'เวลาเช็กชื่อ'
      ]
    ];

    attendances.forEach(att => {
      values.push([
        att.academic_year || '2569',
        att.term || '1',
        att.level || 'ปวช',
        att.year || att.class_year || '1',
        att.major_code,
        att.major_name || 'เทคนิคคอมพิวเตอร์',
        att.room,
        att.week_number,
        att.session_title,
        att.student_id,
        att.prefix || '',
        att.first_name,
        att.last_name,
        new Date(att.attended_at || new Date()).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
      ]);
    });

    // Write all values
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });

    res.json({ success: true, count: attendances.length });
  } catch (error: any) {
    console.error('Failed to sync all to Google Sheets:', error);
    res.status(500).json({ error: 'การเขียนข้อมูลลง Google Sheets ล้มเหลว: ' + (error.message || error) });
  }
});

// Majors CRUD
app.get('/api/majors', (req, res) => {
  try {
    const { academic_year, term } = getActiveSettings();
    const stmt = db.prepare('SELECT * FROM majors WHERE academic_year = ? AND term = ? ORDER BY level ASC, year ASC, major_code ASC, room ASC');
    const list = stmt.all(academic_year, term);
    res.json(list);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch majors' });
  }
});

app.post('/api/majors', (req, res) => {
  const { level, year, major_name, major_code, room } = req.body;
  const { academic_year, term } = getActiveSettings();
  if (!level || !year || !major_name || !major_code || !room) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  try {
    const stmt = db.prepare('INSERT INTO majors (academic_year, term, level, year, major_name, major_code, room) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const result = stmt.run(academic_year, term, level.trim(), year.trim(), major_name.trim(), major_code.trim().toUpperCase(), room.trim());
    res.json({ 
      id: result.lastInsertRowid, 
      academic_year, 
      term, 
      level: level.trim(), 
      year: year.trim(), 
      major_name: major_name.trim(), 
      major_code: major_code.trim().toUpperCase(), 
      room: room.trim() 
    });
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'สาขาวิชา/กลุ่มนี้มีอยู่ในระบบแล้ว' });
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to add major' });
  }
});

app.delete('/api/majors/:id', (req, res) => {
  const { id } = req.params;
  try {
    const stmt = db.prepare('DELETE FROM majors WHERE id = ?');
    stmt.run(id);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete major' });
  }
});

// Sessions CRUD
app.get('/api/sessions', (req, res) => {
  try {
    const { academic_year, term } = getActiveSettings();
    const stmt = db.prepare('SELECT * FROM sessions WHERE academic_year = ? AND term = ? ORDER BY week_number ASC');
    const list = stmt.all(academic_year, term);
    res.json(list);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Lookup session by secure token (must be before /:id to avoid conflict)
app.get('/api/sessions/by-token/:token', (req, res) => {
  const { token } = req.params;
  try {
    const stmt = db.prepare('SELECT * FROM sessions WHERE token = ?');
    const session = stmt.get(token);
    if (!session) {
      return res.status(404).json({ error: 'ไม่พบคาบกิจกรรมที่ระบุ' });
    }
    res.json(session);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch session by token' });
  }
});

app.get('/api/sessions/:id', (req, res) => {
  const { id } = req.params;
  try {
    const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
    const session = stmt.get(id);
    if (!session) {
      return res.status(404).json({ error: 'ไม่พบคาบกิจกรรมที่ระบุ' });
    }
    res.json(session);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

app.post('/api/sessions', (req, res) => {
  const { week_number, title, date, close_at, latitude, longitude, radius, require_device_fingerprint } = req.body;
  const { academic_year, term } = getActiveSettings();
  if (!week_number || !title || !date) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  try {
    const token = crypto.randomBytes(16).toString('hex');
    const rad = radius !== undefined && radius !== null && radius !== '' ? parseInt(radius) : 500;
    const lat = latitude !== undefined && latitude !== null && latitude !== '' ? parseFloat(latitude) : null;
    const lng = longitude !== undefined && longitude !== null && longitude !== '' ? parseFloat(longitude) : null;
    const reqFp = require_device_fingerprint === 1 ? 1 : 0;
    
    const stmt = db.prepare('INSERT INTO sessions (week_number, title, date, close_at, academic_year, term, token, latitude, longitude, radius, require_device_fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = stmt.run(...[week_number, title, date, close_at || null, academic_year, term, token, lat, lng, rad, reqFp] as any[]);
    res.json({ id: result.lastInsertRowid, week_number, title, date, close_at: close_at || null, academic_year, term, token, latitude: lat, longitude: lng, radius: rad, require_device_fingerprint: reqFp });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.post('/api/sessions/:id/toggle', (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  try {
    const stmt = db.prepare('UPDATE sessions SET is_active = ? WHERE id = ?');
    stmt.run(is_active ? 1 : 0, id);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to toggle session status' });
  }
});

app.post('/api/sessions/:id/close-time', (req, res) => {
  const { id } = req.params;
  const { close_at } = req.body;
  try {
    const stmt = db.prepare('UPDATE sessions SET close_at = ? WHERE id = ?');
    stmt.run(close_at || null, id);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update close time' });
  }
});

// Update a specific session/week
app.put('/api/sessions/:id', (req, res) => {
  const { id } = req.params;
  const { week_number, title, date, close_at, latitude, longitude, radius, require_device_fingerprint } = req.body;
  if (!week_number || !title || !date) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  try {
    const rad = radius !== undefined && radius !== null && radius !== '' ? parseInt(radius) : 500;
    const lat = latitude !== undefined && latitude !== null && latitude !== '' ? parseFloat(latitude) : null;
    const lng = longitude !== undefined && longitude !== null && longitude !== '' ? parseFloat(longitude) : null;
    const reqFp = require_device_fingerprint === 1 ? 1 : 0;

    const stmt = db.prepare('UPDATE sessions SET week_number = ?, title = ?, date = ?, close_at = ?, latitude = ?, longitude = ?, radius = ?, require_device_fingerprint = ? WHERE id = ?');
    const result = stmt.run(...[week_number, title, date, close_at || null, lat, lng, rad, reqFp, id] as any[]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'ไม่พบคาบกิจกรรมที่ระบุ' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Delete a specific session/week (and its attendances)
app.delete('/api/sessions/:id', (req, res) => {
  const { id } = req.params;
  try {
    // Delete attendance records for this session first to satisfy SQLite reference rules
    const deleteAttendances = db.prepare('DELETE FROM attendances WHERE session_id = ?');
    deleteAttendances.run(id);

    // Delete session
    const deleteSession = db.prepare('DELETE FROM sessions WHERE id = ?');
    const result = deleteSession.run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'ไม่พบคาบกิจกรรมที่ระบุ' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

// Composite Device Identification — Confidence Scoring
interface DeviceSignals {
  hardwareFingerprint?: string;
  screenInfo?: string;
  cpuCores?: number;
  deviceMemory?: number | null;
  timezone?: string;
  platform?: string;
  os?: string;
  gpuVendor?: string;
  gpuRenderer?: string;
  canvasHash?: string;
  batteryLevel?: number | null;
  userAgent?: string;
}

interface ConfidenceResult {
  score: number;
  flags: Record<string, boolean>;
  matchDetails: Record<string, number>;
}

function calculateConfidenceScore(
  signals: DeviceSignals,
  deviceUuid: string,
  ipAddress: string,
  registrations: any[]
): ConfidenceResult {
  const flags: Record<string, boolean> = {};
  const matchDetails: Record<string, number> = {};

  // If no registrations exist for this student, this is a new device
  if (!registrations || registrations.length === 0) {
    flags.new_device = true;
    // New device gets a moderate score — not suspicious, just unknown
    return { score: 0.6, flags, matchDetails: { hardware: 0, uuid: 0, network: 0, battery: 0 } };
  }

  // Weight configuration
  const W_HARDWARE = 0.4;
  const W_UUID = 0.3;
  const W_NETWORK = 0.2;
  const W_BATTERY = 0.1;

  let bestHwMatch = 0;
  let bestUuidMatch = 0;
  let bestNetworkMatch = 0;
  let bestBatteryMatch = 0;

  for (const reg of registrations) {
    // Hardware fingerprint match
    let hwScore = 0;
    if (signals.hardwareFingerprint && reg.hardware_fingerprint) {
      if (signals.hardwareFingerprint === reg.hardware_fingerprint) {
        hwScore = 1.0;
      } else if (signals.screenInfo && reg.screen_info && signals.screenInfo === reg.screen_info) {
        // Screen matches but overall fingerprint changed (iOS update, browser change)
        hwScore = 0.6;
        flags.fingerprint_changed = true;
      } else {
        hwScore = 0;
      }
    }

    // Software UUID match
    let uuidScore = 0;
    if (deviceUuid && reg.device_uuid) {
      if (deviceUuid === reg.device_uuid) {
        uuidScore = 1.0;
      }
    }

    // Network (IP subnet) match — compare first 3 octets for IPv4
    let networkScore = 0;
    if (ipAddress && reg.ip_address) {
      const currentSubnet = ipAddress.split('.').slice(0, 3).join('.');
      const regSubnet = reg.ip_address.split('.').slice(0, 3).join('.');
      if (currentSubnet === regSubnet) {
        networkScore = 1.0;
      } else if (ipAddress.split('.').slice(0, 2).join('.') === reg.ip_address.split('.').slice(0, 2).join('.')) {
        networkScore = 0.5; // Same /16 subnet
      }
    }

    // Battery level pattern — not compared against registration, just adds slight entropy
    // We give a base score of 0.5 if battery data is available
    let batteryScore = 0.5; // neutral baseline
    if (signals.batteryLevel !== null && signals.batteryLevel !== undefined) {
      batteryScore = 0.7; // Having battery data is slightly positive
    }

    bestHwMatch = Math.max(bestHwMatch, hwScore);
    bestUuidMatch = Math.max(bestUuidMatch, uuidScore);
    bestNetworkMatch = Math.max(bestNetworkMatch, networkScore);
    bestBatteryMatch = Math.max(bestBatteryMatch, batteryScore);
  }

  // If UUID matches perfectly but hardware changed, it's likely the same device with updates
  if (bestUuidMatch === 1.0 && bestHwMatch < 1.0 && bestHwMatch > 0) {
    flags.fingerprint_changed = true;
  }

  matchDetails.hardware = bestHwMatch;
  matchDetails.uuid = bestUuidMatch;
  matchDetails.network = bestNetworkMatch;
  matchDetails.battery = bestBatteryMatch;

  const totalScore = (W_HARDWARE * bestHwMatch) + (W_UUID * bestUuidMatch) + (W_NETWORK * bestNetworkMatch) + (W_BATTERY * bestBatteryMatch);

  return { score: Math.round(totalScore * 100) / 100, flags, matchDetails };
}

function upsertDeviceRegistration(
  studentId: string,
  deviceUuid: string,
  signals: DeviceSignals,
  ipAddress: string
): void {
  try {
    const existing = db.prepare('SELECT id, times_seen FROM device_registrations WHERE student_id = ? AND device_uuid = ?').get(studentId, deviceUuid) as any;
    const now = getBangkokISOString(new Date());

    if (existing) {
      db.prepare(`UPDATE device_registrations SET 
        hardware_fingerprint = COALESCE(?, hardware_fingerprint),
        screen_info = COALESCE(?, screen_info),
        user_agent = COALESCE(?, user_agent),
        ip_address = COALESCE(?, ip_address),
        last_seen_at = ?,
        times_seen = times_seen + 1
        WHERE id = ?`
      ).run(
        signals.hardwareFingerprint || null,
        signals.screenInfo || null,
        signals.userAgent || null,
        ipAddress || null,
        now,
        existing.id
      );
    } else {
      db.prepare(`INSERT INTO device_registrations (student_id, device_uuid, hardware_fingerprint, screen_info, user_agent, ip_address, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        studentId,
        deviceUuid,
        signals.hardwareFingerprint || null,
        signals.screenInfo || null,
        signals.userAgent || null,
        ipAddress || null,
        now,
        now
      );
    }
  } catch (e) {
    console.error('Error upserting device registration:', e);
  }
}

// Logs rejected check-in attempts with similarity details for admin audit
function logAttendanceRejection(
  sessionId: number | null,
  studentId: string,
  prefix: string,
  firstName: string,
  lastName: string,
  level: string,
  year: string,
  majorName: string,
  majorCode: string,
  room: string,
  deviceUuid: string | null,
  hwFingerprint: string | null,
  ipAddress: string | null,
  confidenceScore: number | null,
  deviceFlags: Record<string, any> | null,
  reason: string
): void {
  try {
    const flagsStr = deviceFlags ? JSON.stringify(deviceFlags) : null;
    db.prepare(`
      INSERT INTO attendance_rejections (
        session_id, student_id, prefix, first_name, last_name, level, year, major_name, major_code, room, 
        device_uuid, hardware_fingerprint, ip_address, confidence_score, device_flags, rejection_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId, studentId, prefix || null, firstName || null, lastName || null, level || null, year || null, majorName || null, majorCode || null, room || null,
      deviceUuid || null, hwFingerprint || null, ipAddress || null, confidenceScore, flagsStr, reason
    );
  } catch (e) {
    console.error('Error logging attendance rejection:', e);
  }
}

// Attendance CRUD
app.post('/api/attendances', async (req, res) => {
  const { session_id, prefix, first_name, last_name, student_id, level, year, major_name, major_code, room, device_uuid, latitude, longitude, bypass_gps, device_signals } = req.body;
  
  if (!session_id || !prefix || !first_name || !last_name || !student_id || !level || !year || !major_name || !major_code || !room) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  // Validate student ID: exactly 11 digits
  if (!/^\d{11}$/.test(student_id)) {
    return res.status(400).json({ error: 'รหัสนักศึกษาต้องเป็นตัวเลข 11 หลักเท่านั้น' });
  }

  try {
    // Check if session exists and is active/not expired
    const sessionStmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
    const session = sessionStmt.get(session_id) as any;

    if (!session) {
      return res.status(404).json({ error: 'ไม่พบคราบกิจกรรมนี้ในระบบ' });
    }

    if (session.is_active === 0) {
      return res.status(400).json({ error: 'ผู้ดูแลระบบได้ปิดการสแกนเช็กชื่อสำหรับคาบกิจกรรมนี้แล้ว' });
    }

    const attendedAt = await getThaiTimeISO();

    if (session.close_at) {
      const now = new Date(attendedAt);
      const closeTime = new Date(session.close_at);
      if (now > closeTime) {
        return res.status(400).json({ error: 'หมดเวลาสำหรับการเช็กชื่อเข้าร่วมกิจกรรมในคาบเรียนนี้แล้ว' });
      }
    }

    // GPS Geofence Check (Bypassed if bypass_gps flag is set, but requires Admin PIN verification)
    if (bypass_gps === true) {
      const ADMIN_PIN = process.env.ADMIN_PIN || '250669';
      const pin = req.header('X-Admin-Pin');
      if (!pin || !safeCompare(pin, ADMIN_PIN)) {
        return res.status(401).json({ error: 'ไม่พบสิทธิ์การใช้งานของแอดมินหรือรหัส PIN ไม่ถูกต้องสำหรับการข้ามพิกัด GPS' });
      }
    }

    if (session.latitude !== null && session.longitude !== null && bypass_gps !== true) {
      if (latitude === undefined || latitude === null || latitude === '' ||
          longitude === undefined || longitude === null || longitude === '') {
        return res.status(400).json({ error: 'กรุณาเปิดระบบระบุตำแหน่ง GPS บนอุปกรณ์ของท่านเพื่อทำรายการเช็กชื่อ' });
      }
      
      const sLat = parseFloat(latitude);
      const sLng = parseFloat(longitude);
      if (isNaN(sLat) || isNaN(sLng)) {
        return res.status(400).json({ error: 'พิกัด GPS ไม่ถูกต้อง' });
      }
      
      const distance = getDistance(session.latitude, session.longitude, sLat, sLng);
      const allowedRadius = session.radius || 500;
      if (distance > allowedRadius) {
        const distanceStr = distance >= 1000 
          ? `${(distance / 1000).toFixed(2)} กิโลเมตร` 
          : `${Math.round(distance)} เมตร`;
        const allowedRadiusStr = allowedRadius >= 1000 
          ? `${(allowedRadius / 1000).toFixed(2)} กิโลเมตร` 
          : `${allowedRadius} เมตร`;
        return res.status(400).json({ 
          error: `คุณอยู่นอกพื้นที่เช็กชื่อกิจกรรมที่กำหนด (คุณอยู่ห่างจากสถานที่กิจกรรมประมาณ ${distanceStr} ซึ่งเกินระยะที่อนุญาต ${allowedRadiusStr})` 
        });
      }
    }

    // Check duplicate check-in
    const duplicateStmt = db.prepare('SELECT id FROM attendances WHERE session_id = ? AND student_id = ?');
    if (duplicateStmt.get(session_id, student_id)) {
      return res.status(400).json({ error: 'คุณได้เช็กชื่อเข้าร่วมคาบกิจกรรมสัปดาห์นี้ไปแล้ว' });
    }

    // Get client IP address
    let ipAddress = '';
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
      const list = typeof xForwardedFor === 'string' ? xForwardedFor.split(',') : xForwardedFor[0].split(',');
      ipAddress = list[0].trim();
    } else {
      ipAddress = req.socket.remoteAddress || '';
    }

    // --- Composite Device Identification ---
    const signals: DeviceSignals = device_signals || {};
    let confidenceScore: number | null = null;
    let deviceFlags: Record<string, any> = {};
    const hwFingerprint = signals.hardwareFingerprint || null;

    if (session.require_device_fingerprint === 1) {
      // Get student's registered devices
      const registrations = db.prepare('SELECT * FROM device_registrations WHERE student_id = ? AND is_active = 1').all(student_id) as any[];

      // Calculate confidence score
      const confidence = calculateConfidenceScore(signals, device_uuid, ipAddress, registrations);
      confidenceScore = confidence.score;
      deviceFlags = confidence.flags;
      deviceFlags.match_details = confidence.matchDetails;
      deviceFlags.weights = { hardware: 0.4, uuid: 0.3, network: 0.2, battery: 0.1 };

      // Check if hardware fingerprint was already used by ANOTHER student in this session
      if (hwFingerprint) {
        const hwDuplicateStmt = db.prepare('SELECT student_id, first_name, last_name FROM attendances WHERE session_id = ? AND hardware_fingerprint = ? AND student_id != ?');
        const hwExisting = hwDuplicateStmt.get(session_id, hwFingerprint, student_id) as any;
        if (hwExisting) {
          // Same hardware fingerprint used by different student in same session
          // Check if this is a genuine collision (e.g. same iPhone model) or proxy attempt
          if (confidenceScore >= 0.7) {
            // High confidence this is the same device — likely proxy check-in
            const reason = `เครื่องนี้ได้ทำการเช็กชื่อกิจกรรมครั้งนี้ไปแล้ว (รหัสนักศึกษา: ${hwExisting.student_id} - ${hwExisting.first_name} ${hwExisting.last_name}) ไม่สามารถใช้เช็กชื่อให้บุคคลอื่นได้`;
            logAttendanceRejection(session_id, student_id, prefix, first_name, last_name, level, year, major_name, major_code, room, device_uuid, hwFingerprint, ipAddress, confidenceScore, deviceFlags, reason);
            return res.status(400).json({
              error: reason
            });
          } else {
            // Low confidence — possibly different devices with same fingerprint (iPhone collision)
            // Allow but flag it
            deviceFlags.possible_fingerprint_collision = true;
          }
        }
      }

      // Also check software UUID duplicate (original check, kept as secondary)
      if (device_uuid) {
        const deviceDuplicateStmt = db.prepare('SELECT student_id, first_name, last_name FROM attendances WHERE session_id = ? AND device_uuid = ? AND student_id != ?');
        const existing = deviceDuplicateStmt.get(session_id, device_uuid, student_id) as any;
        if (existing) {
          const reason = `เครื่องนี้ได้ทำการเช็กชื่อกิจกรรมครั้งนี้ไปแล้ว (รหัสนักศึกษา: ${existing.student_id} - ${existing.first_name} ${existing.last_name}) ไม่สามารถใช้เช็กชื่อให้บุคคลอื่นได้`;
          logAttendanceRejection(session_id, student_id, prefix, first_name, last_name, level, year, major_name, major_code, room, device_uuid, hwFingerprint, ipAddress, confidenceScore, deviceFlags, reason);
          return res.status(400).json({
            error: reason
          });
        }
      }

      // Register/update device for this student
      upsertDeviceRegistration(student_id, device_uuid || `anon_${Date.now()}`, signals, ipAddress);

    } else {
      // Legacy mode: require_device_fingerprint === 0 — use original binary UUID check
      if (device_uuid) {
        const deviceDuplicateStmt = db.prepare('SELECT student_id, first_name, last_name FROM attendances WHERE session_id = ? AND device_uuid = ?');
        const existing = deviceDuplicateStmt.get(session_id, device_uuid) as any;
        if (existing) {
          const reason = `เครื่องนี้ได้ทำการเช็กชื่อกิจกรรมครั้งนี้ไปแล้ว (รหัสนักศึกษา: ${existing.student_id} - ${existing.first_name} ${existing.last_name}) ไม่สามารถใช้เช็กชื่อให้บุคคลอื่นได้`;
          logAttendanceRejection(session_id, student_id, prefix, first_name, last_name, level, year, major_name, major_code, room, device_uuid, hwFingerprint, ipAddress, confidenceScore, deviceFlags, reason);
          return res.status(400).json({
            error: reason
          });
        }
      }
    }

    const studentLat = latitude !== undefined && latitude !== null && latitude !== '' ? parseFloat(latitude) : null;
    const studentLng = longitude !== undefined && longitude !== null && longitude !== '' ? parseFloat(longitude) : null;

    // Insert attendance
    const insertStmt = db.prepare(`
      INSERT INTO attendances (session_id, prefix, first_name, last_name, student_id, major, class_year, major_code, room, attended_at, academic_year, term, level, year, major_name, device_uuid, latitude, longitude, ip_address, confidence_score, device_flags, hardware_fingerprint)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insertStmt.run(
      session_id, 
      prefix.trim(), 
      first_name.trim(), 
      last_name.trim(), 
      student_id, 
      `${year.trim()}${major_code.trim().toUpperCase()}${room.trim()}`,
      year.trim(), 
      major_code.trim().toUpperCase(), 
      room.trim(),
      attendedAt,
      session.academic_year,
      session.term,
      level.trim(),
      year.trim(),
      major_name.trim(),
      device_uuid || null,
      studentLat,
      studentLng,
      ipAddress || null,
      confidenceScore,
      Object.keys(deviceFlags).length > 0 ? JSON.stringify(deviceFlags) : null,
      hwFingerprint
    );
    
    const attendanceRecord = {
      id: result.lastInsertRowid,
      session_id,
      prefix: prefix.trim(),
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      student_id,
      class_year: year.trim(),
      major_code: major_code.trim().toUpperCase(),
      room: room.trim(),
      attended_at: attendedAt,
      academic_year: session.academic_year,
      term: session.term,
      level: level.trim(),
      year: year.trim(),
      major_name: major_name.trim(),
      ip_address: ipAddress || null,
      confidence_score: confidenceScore,
      device_flags: Object.keys(deviceFlags).length > 0 ? JSON.stringify(deviceFlags) : null
    };

    // Trigger async sync to Google Sheets
    syncToGoogleSheets(session, attendanceRecord);

    // Return confidence warning if score is low
    const response: any = { success: true, attendance: attendanceRecord };
    if (confidenceScore !== null && confidenceScore < 0.8) {
      response.confidence_warning = true;
      response.confidence_score = confidenceScore;
      if (confidenceScore < 0.5) {
        response.confidence_level = 'low';
      } else {
        response.confidence_level = 'medium';
      }
    }
    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to record attendance' });
  }
});

// Check if a specific device has already checked in for a session
// Uses composite check: first by device_uuid, then by hardware_fingerprint
app.get('/api/attendances/session/:sessionId/device/:deviceUuid', (req, res) => {
  const { sessionId, deviceUuid } = req.params;
  const hwFingerprint = req.query.hw as string | undefined;
  try {
    // First check by software UUID
    let attendance = db.prepare('SELECT student_id, prefix, first_name, last_name, level, year, major_code, major_name, room, attended_at FROM attendances WHERE session_id = ? AND device_uuid = ?').get(sessionId, deviceUuid) as any;

    // If not found by UUID and hardware fingerprint is provided, check by hardware fingerprint
    if (!attendance && hwFingerprint) {
      attendance = db.prepare('SELECT student_id, prefix, first_name, last_name, level, year, major_code, major_name, room, attended_at FROM attendances WHERE session_id = ? AND hardware_fingerprint = ?').get(sessionId, hwFingerprint) as any;
    }

    res.json(attendance || null);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to check device attendance' });
  }
});

// Get device registrations for a specific student (admin only)
app.get('/api/device-registrations/:studentId', (req, res) => {
  const { studentId } = req.params;
  try {
    const registrations = db.prepare('SELECT * FROM device_registrations WHERE student_id = ? ORDER BY last_seen_at DESC').all(studentId);
    res.json(registrations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch device registrations' });
  }
});

// Delete a device registration (admin only)
app.delete('/api/device-registrations/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM device_registrations WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete device registration' });
  }
});

// Get rejected check-in attempts (admin only)
app.get('/api/attendance-rejections', (req, res) => {
  try {
    const { academic_year, term } = getActiveSettings();
    const rejections = db.prepare(`
      SELECT r.*, s.title as session_title, s.week_number 
      FROM attendance_rejections r
      JOIN sessions s ON r.session_id = s.id
      WHERE s.academic_year = ? AND s.term = ?
      ORDER BY r.rejected_at DESC
    `).all(academic_year, term);
    res.json(rejections);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch attendance rejections' });
  }
});

// Log background check-in duplicate attempt silently (no user interface intervention)
app.post('/api/attendance-rejections/log-attempt', (req, res) => {
  const { session_id, device_uuid, hardware_fingerprint, stored_student_id, device_signals } = req.body;

  try {
    // 1. Get client IP address
    let ipAddress = '';
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
      const list = typeof xForwardedFor === 'string' ? xForwardedFor.split(',') : xForwardedFor[0].split(',');
      ipAddress = list[0].trim();
    } else {
      ipAddress = req.socket.remoteAddress || '';
    }

    // 2. Query who has already checked in on this device in this session
    let existingAttendance = null;
    if (device_uuid) {
      existingAttendance = db.prepare('SELECT student_id, prefix, first_name, last_name FROM attendances WHERE session_id = ? AND device_uuid = ?').get(session_id, device_uuid) as any;
    }
    if (!existingAttendance && hardware_fingerprint) {
      existingAttendance = db.prepare('SELECT student_id, prefix, first_name, last_name FROM attendances WHERE session_id = ? AND hardware_fingerprint = ?').get(session_id, hardware_fingerprint) as any;
    }

    // If no duplicate checked-in on this device, it's a normal load, nothing to log as rejection
    if (!existingAttendance) {
      return res.json({ success: true, logged: false });
    }

    // If the student currently loading is the SAME student who checked in:
    // This is just page reload, not a spoof attempt. Do not log.
    if (stored_student_id && stored_student_id === existingAttendance.student_id) {
      return res.json({ success: true, logged: false });
    }

    // This is a duplicate attempt (either a different student, or someone with a clean browser)
    // 3. Look up current student's information if stored_student_id is provided
    let currentStudent = { prefix: null, first_name: 'ผู้ใช้ปริศนา (Anonymous)', last_name: '', level: null, year: null, major_name: null, major_code: null, room: null };
    if (stored_student_id) {
      const studentDetails = db.prepare('SELECT prefix, first_name, last_name, level, year, major_name, major_code, room FROM students WHERE student_id = ?').get(stored_student_id) as any;
      if (studentDetails) {
        currentStudent = studentDetails;
      }
    }

    // 4. Calculate confidence scoring compared to the student who already checked in
    const signals: DeviceSignals = device_signals || {};
    const registrations = db.prepare('SELECT * FROM device_registrations WHERE student_id = ? AND is_active = 1').all(existingAttendance.student_id) as any[];

    const confidence = calculateConfidenceScore(signals, device_uuid, ipAddress, registrations);
    const confidenceScore = confidence.score;
    const deviceFlags: Record<string, any> = { ...confidence.flags };
    deviceFlags.match_details = confidence.matchDetails;
    deviceFlags.weights = { hardware: 0.4, uuid: 0.3, network: 0.2, battery: 0.1 };

    // 5. Construct rejection reason
    let reason = '';
    if (stored_student_id) {
      reason = `ผู้ใช้งานรหัส ${stored_student_id} (${currentStudent.prefix || ''}${currentStudent.first_name || ''} ${currentStudent.last_name || ''}) พยายามเข้าหน้าเช็กชื่อ บนเครื่องที่ถูกใช้เช็กชื่อไปก่อนหน้านี้โดยรหัส ${existingAttendance.student_id} (${existingAttendance.prefix || ''}${existingAttendance.first_name || ''} ${existingAttendance.last_name || ''})`;
    } else {
      reason = `ผู้ใช้นิรนาม/ล้างแคช พยายามเข้าหน้าเช็กชื่อ บนเครื่องที่ถูกใช้เช็กชื่อไปก่อนหน้านี้โดยรหัส ${existingAttendance.student_id} (${existingAttendance.prefix || ''}${existingAttendance.first_name || ''} ${existingAttendance.last_name || ''})`;
    }

    // 6. Log it into database
    logAttendanceRejection(
      session_id,
      stored_student_id || 'UNKNOWN',
      currentStudent.prefix || '',
      currentStudent.first_name || '',
      currentStudent.last_name || '',
      currentStudent.level || '',
      currentStudent.year || '',
      currentStudent.major_name || '',
      currentStudent.major_code || '',
      currentStudent.room || '',
      device_uuid || null,
      hardware_fingerprint || null,
      ipAddress || null,
      confidenceScore,
      deviceFlags,
      reason
    );

    res.json({ success: true, logged: true });
  } catch (error) {
    console.error('Error logging background rejection attempt:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Fetch all attendance records for a specific session/week
app.get('/api/attendances/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  try {
    const stmt = db.prepare(`
      SELECT * FROM attendances 
      WHERE session_id = ? 
      ORDER BY attended_at DESC
    `);
    const records = stmt.all(sessionId);
    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch session attendance' });
  }
});

// Attendance heatmap: returns sessions + students with per-session attendance flags
app.get('/api/attendance-heatmap', (req, res) => {
  const { level, year, major_code, room } = req.query as Record<string, string>;
  const { academic_year, term } = getActiveSettings();
  try {
    // 1) Get all sessions for this term
    const sessions = db.prepare(
      'SELECT id, week_number, title, date FROM sessions WHERE academic_year = ? AND term = ? ORDER BY week_number ASC'
    ).all(academic_year, term) as { id: number; week_number: number; title: string; date: string }[];

    // 2) Build student query with optional filters
    let studentQuery = 'SELECT * FROM students WHERE academic_year = ? AND term = ?';
    const studentParams: any[] = [academic_year, term];
    if (level)      { studentQuery += ' AND level = ?';      studentParams.push(level); }
    if (year)       { studentQuery += ' AND year = ?';       studentParams.push(year); }
    if (major_code) { studentQuery += ' AND major_code = ?'; studentParams.push(major_code); }
    if (room)       { studentQuery += ' AND room = ?';       studentParams.push(room); }
    studentQuery += ' ORDER BY student_id ASC';
    const students = db.prepare(studentQuery).all(studentParams) as any[];

    // 3) Get attendance flags for these students in this term
    const sessionIds = sessions.map(s => s.id);
    if (sessionIds.length === 0) {
      return res.json({ sessions, students: students.map(s => ({ ...s, attendance: {}, remarks: {} })) });
    }
    const placeholders = sessionIds.map(() => '?').join(',');
    const studentIds = students.map(s => s.student_id);
    if (studentIds.length === 0) {
      return res.json({ sessions, students: [] });
    }
    const studentPlaceholders = studentIds.map(() => '?').join(',');
    const attRows = db.prepare(`
      SELECT student_id, session_id, attended_at
      FROM attendances
      WHERE session_id IN (${placeholders})
        AND student_id IN (${studentPlaceholders})
    `).all([...sessionIds, ...studentIds]) as { student_id: string; session_id: number; attended_at: string }[];

    // 4) Build lookup map: student_id -> { session_id: attended_at }
    const attMap: Record<string, Record<number, string>> = {};
    for (const row of attRows) {
      if (!attMap[row.student_id]) attMap[row.student_id] = {};
      attMap[row.student_id][row.session_id] = row.attended_at;
    }

    // 5) Fetch attendance remarks for these students and sessions
    const remarkRows = db.prepare(`
      SELECT student_id, session_id, remark
      FROM attendance_remarks
      WHERE session_id IN (${placeholders})
        AND student_id IN (${studentPlaceholders})
    `).all([...sessionIds, ...studentIds]) as { student_id: string; session_id: number; remark: string }[];

    const remarkMap: Record<string, Record<number, string>> = {};
    for (const row of remarkRows) {
      if (!remarkMap[row.student_id]) remarkMap[row.student_id] = {};
      remarkMap[row.student_id][row.session_id] = row.remark;
    }

    const result = students.map(s => ({
      ...s,
      attendance: attMap[s.student_id] || {},
      remarks: remarkMap[s.student_id] || {}
    }));

    res.json({ sessions, students: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch attendance heatmap' });
  }
});

// Update attendance status and remark
app.post('/api/attendances/update-status-remark', (req, res) => {
  const { student_id, session_id, status, remark } = req.body;
  if (!student_id || !session_id || !status) {
    return res.status(400).json({ error: 'กรุณาระบุข้อมูลให้ครบถ้วน' });
  }

  try {
    // 1) Handle status
    const currentAtt = db.prepare('SELECT id FROM attendances WHERE session_id = ? AND student_id = ?').get(session_id, student_id) as { id: number } | undefined;

    if (status === 'present') {
      if (!currentAtt) {
        // Need to fetch student info to insert attendance record
        const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(student_id) as any;
        const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_id) as any;

        if (student && session) {
          const insertStmt = db.prepare(`
            INSERT INTO attendances (session_id, prefix, first_name, last_name, student_id, major, class_year, major_code, room, attended_at, academic_year, term, level, year, major_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          const attendedAt = new Date().toISOString();
          insertStmt.run(
            session_id,
            student.prefix || '',
            student.first_name,
            student.last_name,
            student_id,
            `${student.year}${student.major_code}${student.room}`,
            student.year,
            student.major_code,
            student.room,
            attendedAt,
            session.academic_year,
            session.term,
            student.level,
            student.year,
            student.major_name
          );

          // Trigger sync to Google Sheets
          const attendanceRecord = {
            session_id,
            prefix: student.prefix || '',
            first_name: student.first_name,
            last_name: student.last_name,
            student_id,
            class_year: student.year,
            major_code: student.major_code,
            room: student.room,
            attended_at: attendedAt,
            academic_year: session.academic_year,
            term: session.term,
            level: student.level,
            year: student.year,
            major_name: student.major_name
          };
          syncToGoogleSheets(session, attendanceRecord);
        }
      }
    } else if (status === 'absent') {
      if (currentAtt) {
        // Delete attendance record
        db.prepare('DELETE FROM attendances WHERE id = ?').run(currentAtt.id);
      }
    }

    // 2) Handle remark
    if (remark && remark.trim() !== '') {
      db.prepare(`
        INSERT OR REPLACE INTO attendance_remarks (session_id, student_id, remark)
        VALUES (?, ?, ?)
      `).run(session_id, student_id, remark.trim());
    } else {
      db.prepare('DELETE FROM attendance_remarks WHERE session_id = ? AND student_id = ?').run(session_id, student_id);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating attendance status and remark:', error);
    res.status(500).json({ error: 'ไม่สามารถบันทึกข้อมูลได้' });
  }
});


// Update a specific attendance record
app.put('/api/attendances/:id', (req, res) => {
  const { id } = req.params;
  const { prefix, first_name, last_name, student_id, level, year, major_name, major_code, room } = req.body;

  if (!prefix || !first_name || !last_name || !student_id || !level || !year || !major_name || !major_code || !room) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  if (!/^\d{11}$/.test(student_id)) {
    return res.status(400).json({ error: 'รหัสนักศึกษาต้องเป็นตัวเลข 11 หลักเท่านั้น' });
  }

  try {
    const stmt = db.prepare(`
      UPDATE attendances 
      SET prefix = ?, first_name = ?, last_name = ?, student_id = ?, major = ?, class_year = ?, major_code = ?, room = ?, level = ?, year = ?, major_name = ?
      WHERE id = ?
    `);
    const result = stmt.run(
      prefix.trim(),
      first_name.trim(),
      last_name.trim(),
      student_id,
      `${year.trim()}${major_code.trim().toUpperCase()}${room.trim()}`,
      year.trim(),
      major_code.trim().toUpperCase(),
      room.trim(),
      level.trim(),
      year.trim(),
      major_name.trim(),
      id
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'ไม่พบรายการที่ต้องการแก้ไข' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update attendance record' });
  }
});

// Delete a specific attendance record
app.delete('/api/attendances/:id', (req, res) => {
  const { id } = req.params;
  try {
    const stmt = db.prepare('DELETE FROM attendances WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'ไม่พบรายการที่ต้องการลบ' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete attendance record' });
  }
});

// System Logs for Admin
app.get('/api/systemlogs', (req, res) => {
  try {
    const { academic_year, term } = getActiveSettings();
    
    // Fetch all attendances with session info for current semester
    const stmt = db.prepare(`
      SELECT a.*, s.title as session_title, s.week_number 
      FROM attendances a
      JOIN sessions s ON a.session_id = s.id
      WHERE s.academic_year = ? AND s.term = ?
      ORDER BY a.attended_at DESC
    `);
    const logs = stmt.all(academic_year, term) as any[];

    // Calculate flagging logic
    // A record is flagged if there is another record with the same session_id, same non-empty ip_address,
    // different student_id, and check-in times within 5 minutes (300,000 ms) of each other.
    const windowMs = 5 * 60 * 1000;
    
    const processedLogs = logs.map((log) => {
      const currentLogTime = new Date(log.attended_at).getTime();
      
      // Find matches
      const matches = logs.filter((other) => {
        if (other.id === log.id) return false;
        if (other.session_id !== log.session_id) return false;
        if (!log.ip_address || !other.ip_address) return false;
        if (log.ip_address !== other.ip_address) return false;
        if (log.student_id === other.student_id) return false;
        
        const otherLogTime = new Date(other.attended_at).getTime();
        return Math.abs(currentLogTime - otherLogTime) <= windowMs;
      });

      return {
        ...log,
        is_flagged: matches.length > 0,
        flagged_count: matches.length,
        flagged_details: matches.map(m => ({
          student_id: m.student_id,
          name: `${m.prefix || ''}${m.first_name} ${m.last_name}`,
          attended_at: m.attended_at
        }))
      };
    });

    res.json(processedLogs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch system logs' });
  }
});

// Search student attendance history
app.get('/api/attendances/recent', (req, res) => {
  const { academic_year, term } = getActiveSettings();
  try {
    const stmt = db.prepare(`
      SELECT 
        a.id, 
        a.prefix,
        a.first_name, 
        a.last_name, 
        a.student_id, 
        a.class_year,
        a.major_code,
        a.room,
        a.attended_at,
        a.level,
        a.year,
        a.major_name,
        s.week_number, 
        s.title as session_title
      FROM attendances a
      JOIN sessions s ON a.session_id = s.id
      WHERE a.academic_year = ? AND a.term = ?
      ORDER BY a.attended_at DESC
      LIMIT 10
    `);
    const records = stmt.all(academic_year, term);
    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch recent attendances' });
  }
});

app.get('/api/attendances/student/:studentId', (req, res) => {
  const { studentId } = req.params;
  const { academic_year, term } = getActiveSettings();
  try {
    const stmt = db.prepare(`
      SELECT 
        a.id, 
        a.session_id, 
        a.prefix,
        a.first_name, 
        a.last_name, 
        a.student_id, 
        a.class_year,
        a.major_code,
        a.room,
        a.attended_at,
        a.level,
        a.year,
        a.major_name,
        s.week_number, 
        s.title as session_title, 
        s.date as session_date 
      FROM attendances a 
      JOIN sessions s ON a.session_id = s.id 
      WHERE a.student_id = ? AND a.academic_year = ? AND a.term = ?
      ORDER BY s.week_number ASC
    `);
    const records = stmt.all(studentId, academic_year, term);
    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch student attendance' });
  }
});

// Stats overview
app.get('/api/stats', (req, res) => {
  const { academic_year, term } = getActiveSettings();
  try {
    const totalSessions = (db.prepare('SELECT COUNT(*) as count FROM sessions WHERE academic_year = ? AND term = ?').get(academic_year, term) as { count: number }).count;
    const totalAttendances = (db.prepare('SELECT COUNT(*) as count FROM attendances WHERE academic_year = ? AND term = ?').get(academic_year, term) as { count: number }).count;
    const totalStudents = (db.prepare('SELECT COUNT(*) as count FROM students WHERE academic_year = ? AND term = ?').get(academic_year, term) as { count: number }).count;
    
    // Check if Sheets is connected
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as { sheet_id: string; credentials_json: string } | undefined;
    const isSheetsConnected = !!(settings && settings.sheet_id && settings.credentials_json);

    res.json({
      totalSessions,
      totalAttendances,
      totalStudents,
      isSheetsConnected
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Advanced Stats API for redone dashboard
app.get('/api/admin/dashboard-stats', (req, res) => {
  const { academic_year, term } = getActiveSettings();
  try {
    const sessionIdQuery = req.query.sessionId;
    const level = req.query.level as string || '';
    const classYear = req.query.classYear as string || ''; // representing 'year'
    const majorCode = req.query.majorCode as string || '';
    const room = req.query.room as string || '';
    const gender = req.query.gender as string || '';

    const excludeLevel = req.query.excludeLevel === 'true';
    const excludeClassYear = req.query.excludeClassYear === 'true';
    const excludeMajorCode = req.query.excludeMajorCode === 'true';
    const excludeRoom = req.query.excludeRoom === 'true';
    const excludeGender = req.query.excludeGender === 'true';

    const excludedGroupsStr = req.query.excludedGroups as string || '';
    const excludedGroupsList = excludedGroupsStr ? excludedGroupsStr.split(',') : [];

    // 1. Fetch all sessions for selection dropdown (filtered by active semester)
    const allSessions = db.prepare('SELECT id, week_number, title, date, is_active, close_at, latitude, longitude, radius FROM sessions WHERE academic_year = ? AND term = ? ORDER BY week_number ASC').all(academic_year, term) as any[];

    if (allSessions.length === 0) {
      return res.json({
        sessions: [],
        selectedSessionId: null,
        totalExpected: 0,
        totalPresent: 0,
        totalAbsent: 0,
        attendanceRate: 0,
        presentList: [],
        absentList: [],
        weeklyTrend: [],
        roomStats: [],
        allGroups: [],
        genderStats: {
          male: { expected: 0, present: 0, absent: 0, rate: 0 },
          female: { expected: 0, present: 0, absent: 0, rate: 0 }
        }
      });
    }

    // Determine target sessionId (can be 'all' or a specific number)
    let targetSessionId: number | 'all' = 'all';
    if (sessionIdQuery !== 'all') {
      const parsed = sessionIdQuery ? Number(sessionIdQuery) : null;
      if (parsed && !isNaN(parsed)) {
        targetSessionId = parsed;
      } else {
        // Default to active session if exists, otherwise the latest session
        const activeSession = db.prepare('SELECT id FROM sessions WHERE is_active = 1 AND academic_year = ? AND term = ? ORDER BY date DESC, id DESC LIMIT 1').get(academic_year, term) as { id: number } | undefined;
        if (activeSession) {
          targetSessionId = activeSession.id;
        } else {
          targetSessionId = allSessions[allSessions.length - 1].id;
        }
      }
    }

    // Build base filter strings (excluding gender filter)
    let baseFilterSql = '';
    const baseFilterParams: any[] = [];

    if (level) {
      baseFilterSql += excludeLevel ? ' AND level != ?' : ' AND level = ?';
      baseFilterParams.push(level);
    }
    if (classYear) {
      baseFilterSql += excludeClassYear ? ' AND year != ?' : ' AND year = ?';
      baseFilterParams.push(classYear);
    }
    if (majorCode) {
      baseFilterSql += excludeMajorCode ? ' AND major_code != ?' : ' AND major_code = ?';
      baseFilterParams.push(majorCode);
    }
    if (room) {
      baseFilterSql += excludeRoom ? ' AND room != ?' : ' AND room = ?';
      baseFilterParams.push(room);
    }

    if (excludedGroupsList.length > 0) {
      const placeholders = excludedGroupsList.map(() => '?').join(',');
      baseFilterSql += ` AND (year || major_code || room) NOT IN (${placeholders})`;
      baseFilterParams.push(...excludedGroupsList);
    }

    // Full filters (including gender filter)
    let filterSql = baseFilterSql;
    const filterParams = [...baseFilterParams];
    if (gender === 'male') {
      if (excludeGender) {
        filterSql += " AND NOT (prefix = 'นาย' OR prefix = 'เด็กชาย' OR prefix = 'ด.ช.' OR prefix = 'ด.ช')";
      } else {
        filterSql += " AND (prefix = 'นาย' OR prefix = 'เด็กชาย' OR prefix = 'ด.ช.' OR prefix = 'ด.ช')";
      }
    } else if (gender === 'female') {
      if (excludeGender) {
        filterSql += " AND NOT (prefix != 'นาย' AND prefix != 'เด็กชาย' AND prefix != 'ด.ช.' AND prefix != 'ด.ช')";
      } else {
        filterSql += " AND (prefix != 'นาย' AND prefix != 'เด็กชาย' AND prefix != 'ด.ช.' AND prefix != 'ด.ช')";
      }
    }

    // 2. Fetch expected students from roster (with full filters)
    const rosterStmt = db.prepare(`SELECT * FROM students WHERE academic_year = ? AND term = ? ${filterSql} ORDER BY student_id ASC`);
    const expectedStudents = rosterStmt.all(academic_year, term, ...filterParams) as any[];

    // 3. Fetch present students checked in
    let presentList: any[] = [];
    if (targetSessionId === 'all') {
      const presentStmt = db.prepare(`
        SELECT a.*, s.week_number, s.title as session_title 
        FROM attendances a
        JOIN sessions s ON a.session_id = s.id
        WHERE a.academic_year = ? AND a.term = ? ${filterSql} 
        ORDER BY a.attended_at DESC
      `);
      presentList = presentStmt.all(academic_year, term, ...filterParams) as any[];
    } else {
      const presentStmt = db.prepare(`
        SELECT * FROM attendances 
        WHERE session_id = ? ${filterSql} 
        ORDER BY attended_at DESC
      `);
      presentList = presentStmt.all(targetSessionId, ...filterParams) as any[];
    }
    const totalPresent = presentList.length;

    // 4. Calculate absent students
    let absentList: any[] = [];
    if (targetSessionId === 'all') {
      for (const session of allSessions) {
        const sessionAbsentStmt = db.prepare(`
          SELECT s.*, ? as session_id, ? as week_number, ? as session_title
          FROM students s
          WHERE s.academic_year = ? AND s.term = ? ${filterSql} 
            AND s.student_id NOT IN (
              SELECT student_id FROM attendances WHERE session_id = ?
            )
        `);
        const sessionAbsents = sessionAbsentStmt.all(session.id, session.week_number, session.title, academic_year, term, ...filterParams, session.id) as any[];
        absentList.push(...sessionAbsents);
      }
      absentList.sort((a, b) => a.student_id.localeCompare(b.student_id) || a.week_number - b.week_number);
    } else {
      const absentStmt = db.prepare(`
        SELECT * FROM students 
        WHERE academic_year = ? AND term = ? ${filterSql} 
          AND student_id NOT IN (
            SELECT student_id FROM attendances WHERE session_id = ?
          )
        ORDER BY student_id ASC
      `);
      absentList = absentStmt.all(academic_year, term, ...filterParams, targetSessionId) as any[];
    }
    const totalAbsent = absentList.length;

    // Adjust totalExpected to include both check-ins and absent roster students (preventing > 100% rate)
    const totalExpected = totalPresent + totalAbsent;
    const attendanceRate = totalExpected > 0 ? Math.round((totalPresent / totalExpected) * 100) : 0;

    // 5. Weekly trend statistics (all sessions) - frontend controls display limit via slider
    const trendSessions = allSessions;
    const weeklyTrend = trendSessions.map(s => {
      const presCount = db.prepare(`SELECT COUNT(*) as count FROM attendances WHERE session_id = ? ${filterSql}`).get(s.id, ...filterParams) as { count: number };
      const absCount = db.prepare(`
        SELECT COUNT(*) as count FROM students 
        WHERE academic_year = ? AND term = ? ${filterSql} 
          AND student_id NOT IN (
            SELECT student_id FROM attendances WHERE session_id = ?
          )
      `).get(academic_year, term, ...filterParams, s.id) as { count: number };
      
      const totalExp = presCount.count + absCount.count;
      const rate = totalExp > 0 ? Math.round((presCount.count / totalExp) * 100) : 0;
      return {
        sessionId: s.id,
        weekNumber: s.week_number,
        title: s.title,
        rate
      };
    });

    // 6. Stats by Class Group (level + year + major_name + major_code + room/group) for the selected session
    const classGroups = db.prepare(`
      SELECT DISTINCT level, year, major_name, major_code, room FROM students WHERE academic_year = ? AND term = ?
      UNION
      SELECT level, year, major_name, major_code, room FROM majors WHERE academic_year = ? AND term = ?
      ORDER BY level ASC, year ASC, major_code ASC, room ASC
    `).all(academic_year, term, academic_year, term) as Array<{ level: string; year: string; major_name: string; major_code: string; room: string }>;

    const roomStats = classGroups.map(g => {
      const gLabel = `${g.year}${g.major_code}${g.room}`;
      const gDetails = `${g.level} ปี ${g.year} ${g.major_name} กลุ่ม ${g.room}`;
      
      let gFilterSql = ' AND level = ? AND year = ? AND major_code = ? AND room = ?';
      const gFilterParams = [g.level, g.year, g.major_code, g.room];

      if (gender === 'male') {
        if (excludeGender) {
          gFilterSql += " AND NOT (prefix = 'นาย' OR prefix = 'เด็กชาย' OR prefix = 'ด.ช.' OR prefix = 'ด.ช')";
        } else {
          gFilterSql += " AND (prefix = 'นาย' OR prefix = 'เด็กชาย' OR prefix = 'ด.ช.' OR prefix = 'ด.ช')";
        }
      } else if (gender === 'female') {
        if (excludeGender) {
          gFilterSql += " AND NOT (prefix != 'นาย' AND prefix != 'เด็กชาย' AND prefix != 'ด.ช.' AND prefix != 'ด.ช')";
        } else {
          gFilterSql += " AND (prefix != 'นาย' AND prefix != 'เด็กชาย' AND prefix != 'ด.ช.' AND prefix != 'ด.ช')";
        }
      }

      let gPresentCount = 0;
      let gAbsentCount = 0;

      if (targetSessionId === 'all') {
        const pres = db.prepare(`SELECT COUNT(*) as count FROM attendances WHERE academic_year = ? AND term = ? ${gFilterSql}`).get(academic_year, term, ...gFilterParams) as { count: number };
        gPresentCount = pres.count;

        for (const session of allSessions) {
          const abs = db.prepare(`
            SELECT COUNT(*) as count FROM students 
            WHERE academic_year = ? AND term = ? ${gFilterSql} 
              AND student_id NOT IN (
                SELECT student_id FROM attendances WHERE session_id = ?
              )
          `).get(academic_year, term, ...gFilterParams, session.id) as { count: number };
          gAbsentCount += abs.count;
        }
      } else {
        const pres = db.prepare(`SELECT COUNT(*) as count FROM attendances WHERE session_id = ? ${gFilterSql}`).get(targetSessionId, ...gFilterParams) as { count: number };
        gPresentCount = pres.count;

        const abs = db.prepare(`
          SELECT COUNT(*) as count FROM students 
          WHERE academic_year = ? AND term = ? ${gFilterSql} 
            AND student_id NOT IN (
              SELECT student_id FROM attendances WHERE session_id = ?
            )
        `).get(academic_year, term, ...gFilterParams, targetSessionId) as { count: number };
        gAbsentCount = abs.count;
      }

      const gExpected = gPresentCount + gAbsentCount;

      return {
        room: gLabel,
        roomDetails: gDetails,
        expected: gExpected,
        present: gPresentCount,
        absent: gAbsentCount,
        rate: gExpected > 0 ? Math.round((gPresentCount / gExpected) * 100) : 0
      };
    }).filter(stat => stat.expected > 0);

    // 7. Scan Peak time distribution (timezone-safe)
    const timeMap: { [key: string]: number } = {};
    presentList.forEach(p => {
      if (!p.attended_at) return;
      try {
        const d = new Date(p.attended_at);
        if (isNaN(d.getTime())) return;
        const { hour, minute } = getBangkokHourAndMinute(d);
        const key = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} น.`;
        timeMap[key] = (timeMap[key] || 0) + 1;
      } catch (e) {
        // Ignore
      }
    });

    const scanDistribution = Object.keys(timeMap)
      .sort()
      .map(time => ({
        time,
        count: timeMap[time]
      }));

    // 8. Gender comparison stats (computed using base filters)
    let genderPresentList: any[] = [];
    let genderAbsentList: any[] = [];

    if (targetSessionId === 'all') {
      let attBaseFilterSql = baseFilterSql.replace(/(class_year|major_code|room|prefix)/g, 'a.$1');
      const presentStmt = db.prepare(`
        SELECT a.prefix FROM attendances a
        WHERE 1=1 ${attBaseFilterSql}
      `);
      genderPresentList = presentStmt.all(...baseFilterParams) as any[];

      for (const session of allSessions) {
        const sessionAbsentStmt = db.prepare(`
          SELECT prefix FROM students 
          WHERE 1=1 ${baseFilterSql} 
            AND student_id NOT IN (
              SELECT student_id FROM attendances WHERE session_id = ?
            )
        `);
        const sessionAbsents = sessionAbsentStmt.all(...baseFilterParams, session.id) as any[];
        genderAbsentList.push(...sessionAbsents);
      }
    } else {
      const presentStmt = db.prepare(`
        SELECT prefix FROM attendances 
        WHERE session_id = ? ${baseFilterSql}
      `);
      genderPresentList = presentStmt.all(targetSessionId, ...baseFilterParams) as any[];

      const absentStmt = db.prepare(`
        SELECT prefix FROM students 
        WHERE 1=1 ${baseFilterSql} 
          AND student_id NOT IN (
            SELECT student_id FROM attendances WHERE session_id = ?
          )
      `);
      genderAbsentList = absentStmt.all(...baseFilterParams, targetSessionId) as any[];
    }

    let mPres = 0, fPres = 0;
    genderPresentList.forEach(p => {
      if (getGenderFromPrefix(p.prefix) === 'male') mPres++;
      else fPres++;
    });

    let mAbs = 0, fAbs = 0;
    genderAbsentList.forEach(a => {
      if (getGenderFromPrefix(a.prefix) === 'male') mAbs++;
      else fAbs++;
    });

    const mExp = mPres + mAbs;
    const fExp = fPres + fAbs;

    const genderStats = {
      male: {
        expected: mExp,
        present: mPres,
        absent: mAbs,
        rate: mExp > 0 ? Math.round((mPres / mExp) * 100) : 0
      },
      female: {
        expected: fExp,
        present: fPres,
        absent: fAbs,
        rate: fExp > 0 ? Math.round((fPres / fExp) * 100) : 0
      }
    };

    const filteredRoomStats = roomStats.filter(stat => !excludedGroupsList.includes(stat.room));

    res.json({
      sessions: allSessions,
      selectedSessionId: targetSessionId,
      totalExpected,
      totalPresent,
      totalAbsent,
      attendanceRate,
      presentList,
      absentList,
      weeklyTrend,
      roomStats: filteredRoomStats,
      allGroups: classGroups.map(g => ({
        code: `${g.year}${g.major_code}${g.room}`,
        label: `${g.year}${g.major_code}${g.room} (${g.level})`,
        level: g.level
      })),
      scanDistribution,
      genderStats
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch advanced dashboard stats' });
  }
});

// GET /api/admin/student-attendance/:studentId
app.get('/api/admin/student-attendance/:studentId', (req, res) => {
  try {
    const studentId = req.params.studentId;
    
    // 1. Fetch student info
    const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId) as any;
    
    // If student not found in roster, check if they checked in at least once
    let studentInfo = student;
    if (!studentInfo) {
      const attendance = db.prepare('SELECT prefix, first_name, last_name, class_year, major_code, room FROM attendances WHERE student_id = ? LIMIT 1').get(studentId) as any;
      if (attendance) {
        studentInfo = {
          student_id: studentId,
          prefix: attendance.prefix,
          first_name: attendance.first_name,
          last_name: attendance.last_name,
          class_year: attendance.class_year,
          major_code: attendance.major_code,
          room: attendance.room,
          is_temporary: true
        };
      } else {
        return res.status(404).json({ error: 'ไม่พบข้อมูลนักศึกษารหัสนี้' });
      }
    }

    // 2. Fetch all sessions
    const sessions = db.prepare('SELECT id, week_number, title, date, is_active FROM sessions ORDER BY week_number ASC').all() as any[];

    // 3. Fetch check-in records for this student
    const checkins = db.prepare('SELECT session_id, attended_at FROM attendances WHERE student_id = ?').all(studentId) as any[];
    const checkinMap = new Map(checkins.map(c => [c.session_id, c.attended_at]));

    // 4. Combine session and check-in info
    const history = sessions.map(s => {
      const attendedAt = checkinMap.get(s.id);
      return {
        sessionId: s.id,
        weekNumber: s.week_number,
        title: s.title,
        date: s.date,
        status: attendedAt ? 'present' : 'absent',
        attended_at: attendedAt || null
      };
    });

    const totalSessions = sessions.length;
    const totalPresent = checkins.length;
    const totalAbsent = totalSessions - totalPresent;
    const attendanceRate = totalSessions > 0 ? Math.round((totalPresent / totalSessions) * 100) : 0;

    res.json({
      student: studentInfo,
      stats: {
        totalSessions,
        totalPresent,
        totalAbsent,
        attendanceRate
      },
      history
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch student attendance history' });
  }
});

app.get('/api/time', async (req, res) => {
  try {
    const datetime = await getThaiTimeISO();
    res.json({ datetime });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch current time' });
  }
});

// Helper to parse Thai name and extract prefix, first name, last name
function parseStudentName(fullName: string) {
  fullName = fullName.trim();
  const prefixes = ['นาย', 'นางสาว', 'นาง', 'เด็กชาย', 'เด็กหญิง', 'ด.ช.', 'ด.ญ.', 'น.ส.', 'ด.ญ', 'ด.ช'];
  let prefix = '';
  let restOfName = fullName;
  
  for (const p of prefixes) {
    if (fullName.startsWith(p)) {
      prefix = p;
      restOfName = fullName.slice(p.length).trim();
      break;
    }
  }

  // Normalize prefix to 'นาย' or 'นางสาว' (Gender Splitting)
  if (prefix === 'น.ส.' || prefix === 'น.ส' || prefix === 'นาง' || prefix === 'นางสาว' || prefix === 'เด็กหญิง' || prefix === 'ด.ญ.' || prefix === 'ด.ญ') {
    prefix = 'นางสาว';
  } else if (prefix === 'นาย' || prefix === 'เด็กชาย' || prefix === 'ด.ช.' || prefix === 'ด.ช') {
    prefix = 'นาย';
  }
  
  const parts = restOfName.split(/\s+/).filter(Boolean);
  const first_name = parts[0] || '';
  const last_name = parts.slice(1).join(' ') || '';
  
  return { prefix, first_name, last_name };
}

// Student APIs
app.get('/api/students', (req, res) => {
  const { search, level, year, major_code, room } = req.query;
  const { academic_year, term } = getActiveSettings();
  try {
    let query = 'SELECT * FROM students WHERE academic_year = ? AND term = ?';
    const params: any[] = [academic_year, term];
    
    if (search) {
      query += ' AND (student_id LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
    }
    
    if (level) {
      query += ' AND level = ?';
      params.push(level);
    }
    
    if (year) {
      query += ' AND year = ?';
      params.push(year);
    }
    
    if (major_code) {
      query += ' AND major_code = ?';
      params.push(major_code);
    }
    
    if (room) {
      query += ' AND room = ?';
      params.push(room);
    }
    
    query += ' ORDER BY student_id ASC';
    
    const stmt = db.prepare(query);
    const list = stmt.all(params);
    res.json(list);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

app.get('/api/students/:studentId', (req, res) => {
  const { studentId } = req.params;
  const { academic_year, term } = getActiveSettings();
  try {
    const stmt = db.prepare('SELECT * FROM students WHERE student_id = ? AND academic_year = ? AND term = ?');
    const student = stmt.get(studentId, academic_year, term);
    if (!student) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลนักศึกษาในระบบลงทะเบียนล่วงหน้า' });
    }
    res.json(student);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch student' });
  }
});

app.post('/api/students/import', (req, res) => {
  const { level, year, major_name, major_code, room, student_ids, student_names } = req.body;
  const { academic_year, term } = getActiveSettings();
  
  if (!level || !year || !major_name || !major_code || !room || !student_ids || !student_names) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  
  const ids = student_ids.split('\n').map((line: string) => line.trim()).filter(Boolean);
  const names = student_names.split('\n').map((line: string) => line.trim()).filter(Boolean);
  
  if (ids.length !== names.length) {
    return res.status(400).json({ error: `จำนวนรายการไม่เท่ากัน: รหัสนักศึกษามี ${ids.length} รายการ แต่รายชื่อมี ${names.length} รายการ` });
  }
  
  try {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO students (student_id, prefix, first_name, last_name, academic_year, term, level, year, major_name, major_code, room)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const runTransaction = db.transaction((dataList: any[]) => {
      for (const data of dataList) {
        insertStmt.run(
          data.student_id,
          data.prefix,
          data.first_name,
          data.last_name,
          data.academic_year,
          data.term,
          data.level,
          data.year,
          data.major_name,
          data.major_code,
          data.room
        );
      }
    });
    
    const parsedStudents = ids.map((id: string, idx: number) => {
      const { prefix, first_name, last_name } = parseStudentName(names[idx]);
      return {
        student_id: id,
        prefix,
        first_name,
        last_name,
        academic_year,
        term,
        level: level.trim(),
        year: year.trim(),
        major_name: major_name.trim(),
        major_code: major_code.trim().toUpperCase(),
        room: room.trim()
      };
    });
    
    runTransaction(parsedStudents);
    res.json({ success: true, count: parsedStudents.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to import students' });
  }
});

app.put('/api/students/:id', (req, res) => {
  const { id } = req.params;
  const { student_id, prefix, first_name, last_name, level, year, major_name, major_code, room } = req.body;
  const { academic_year, term } = getActiveSettings();

  if (!student_id || !prefix || !first_name || !last_name || !level || !year || !major_name || !major_code || !room) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  if (!/^\d{11}$/.test(student_id)) {
    return res.status(400).json({ error: 'รหัสนักศึกษาต้องเป็นตัวเลข 11 หลักเท่านั้น' });
  }

  try {
    const checkStmt = db.prepare('SELECT id FROM students WHERE student_id = ? AND academic_year = ? AND term = ? AND id != ?');
    const existing = checkStmt.get(student_id, academic_year, term, id);
    if (existing) {
      return res.status(400).json({ error: 'รหัสนักศึกษานี้ถูกใช้งานโดยนักศึกษาคนอื่นในเทอมนี้แล้ว' });
    }

    const stmt = db.prepare(`
      UPDATE students 
      SET student_id = ?, prefix = ?, first_name = ?, last_name = ?, level = ?, year = ?, major_name = ?, major_code = ?, room = ?
      WHERE id = ?
    `);
    stmt.run(student_id, prefix, first_name, last_name, level, year, major_name, major_code, room, id);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update student' });
  }
});

app.delete('/api/students/:id', (req, res) => {
  const { id } = req.params;
  try {
    const stmt = db.prepare('DELETE FROM students WHERE id = ?');
    stmt.run(id);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

app.delete('/api/students', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM students');
    stmt.run();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to clear students roster' });
  }
});

// ============================================================
// BACKUP SYSTEM ROUTES
// ============================================================

const dataDir = path.join(__dirname, '../data');
const backupDir = path.join(dataDir, 'backups');
const snapshotsDir = path.join(backupDir, 'snapshots');

// Ensure backup directories exist
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
if (!fs.existsSync(snapshotsDir)) fs.mkdirSync(snapshotsDir, { recursive: true });

// Multer for import uploads (memory storage)
const importStorage = multer.memoryStorage();
const importUpload = multer({ storage: importStorage, limits: { fileSize: 100 * 1024 * 1024 } });

function logBackupAction(log_type: string, action: string, description: string, metadata: object, status: string = 'success') {
  try {
    db.prepare(
      'INSERT INTO backup_logs (log_type, action, description, metadata, status) VALUES (?, ?, ?, ?, ?)'
    ).run(log_type, action, description, JSON.stringify(metadata), status);
  } catch (e) {
    console.error('Error writing backup log:', e);
  }
}

function getTableRecordCounts(): Record<string, number> {
  const tables = ['settings', 'sessions', 'attendances', 'majors', 'students', 'academic_years', 'attendance_remarks'];
  const counts: Record<string, number> = {};
  for (const t of tables) {
    try {
      const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${t}`).get() as { cnt: number };
      counts[t] = row.cnt;
    } catch { counts[t] = 0; }
  }
  return counts;
}

// GET /api/backup/export — Export all tables as downloadable JSON
app.get('/api/backup/export', (req, res) => {
  try {
    const tables = ['settings', 'sessions', 'attendances', 'majors', 'students', 'academic_years', 'attendance_remarks'];
    const exportData: Record<string, any[]> = {};
    for (const table of tables) {
      try {
        let rows = db.prepare(`SELECT * FROM ${table}`).all() as any[];
        if (table === 'settings') {
          rows = rows.map(r => {
            const { credentials_json, ...rest } = r;
            return rest;
          });
        }
        exportData[table] = rows;
      } catch { exportData[table] = []; }
    }
    const payload = {
      exported_at: new Date().toISOString(),
      version: '1.0',
      system: 'AAS-Activity-Attendance-System',
      record_counts: getTableRecordCounts(),
      data: exportData
    };
    const filename = `AAS_backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
    logBackupAction('export', 'EXPORT_DATA', 'ส่งออกข้อมูลทั้งระบบเป็นไฟล์ JSON', { filename, record_counts: payload.record_counts });
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(payload);
  } catch (error) {
    console.error('Export error:', error);
    logBackupAction('export', 'EXPORT_DATA', 'ส่งออกข้อมูลล้มเหลว', {}, 'error');
    res.status(500).json({ error: 'Export failed' });
  }
});

// POST /api/backup/import — Import JSON backup
app.post('/api/backup/import', importUpload.single('backup_file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'ไม่พบไฟล์ที่อัปโหลด' });
    }
    const raw = req.file.buffer.toString('utf8');
    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'รูปแบบไฟล์ไม่ถูกต้อง ต้องเป็น JSON' });
    }
    if (!payload.data || !payload.version) {
      return res.status(400).json({ error: 'ไฟล์ backup ไม่ถูกต้อง (missing data/version fields)' });
    }
    const { data } = payload;
    const importedCounts: Record<string, number> = {};
    const importTx = db.transaction(() => {
      // Sessions
      if (Array.isArray(data.sessions)) {
        db.prepare('DELETE FROM sessions').run();
        const ins = db.prepare(`
          INSERT OR REPLACE INTO sessions (
            id, week_number, title, date, is_active, close_at, created_at, academic_year, term, token, latitude, longitude, radius, require_device_fingerprint
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const r of data.sessions) {
          ins.run(
            r.id,
            r.week_number,
            r.title,
            r.date,
            r.is_active !== undefined ? r.is_active : 1,
            r.close_at || null,
            r.created_at,
            r.academic_year,
            r.term,
            r.token || null,
            r.latitude !== undefined ? r.latitude : null,
            r.longitude !== undefined ? r.longitude : null,
            r.radius !== undefined ? r.radius : 500,
            r.require_device_fingerprint !== undefined ? r.require_device_fingerprint : 0
          );
        }
        importedCounts['sessions'] = data.sessions.length;
      }
      // Attendances
      if (Array.isArray(data.attendances)) {
        db.prepare('DELETE FROM attendances').run();
        const ins = db.prepare(`
          INSERT OR REPLACE INTO attendances (
            id, session_id, prefix, first_name, last_name, student_id, major, class_year, major_code, room, attended_at, academic_year, term, level, year, major_name, device_uuid, latitude, longitude, ip_address, confidence_score, device_flags, hardware_fingerprint
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const r of data.attendances) {
          ins.run(
            r.id,
            r.session_id,
            r.prefix || null,
            r.first_name,
            r.last_name,
            r.student_id,
            r.major || null,
            r.class_year || null,
            r.major_code || null,
            r.room || null,
            r.attended_at,
            r.academic_year,
            r.term,
            r.level || null,
            r.year || null,
            r.major_name || null,
            r.device_uuid || null,
            r.latitude !== undefined ? r.latitude : null,
            r.longitude !== undefined ? r.longitude : null,
            r.ip_address || null,
            r.confidence_score !== undefined ? r.confidence_score : null,
            r.device_flags || null,
            r.hardware_fingerprint || null
          );
        }
        importedCounts['attendances'] = data.attendances.length;
      }
      // Students
      if (Array.isArray(data.students)) {
        db.prepare('DELETE FROM students').run();
        const ins = db.prepare('INSERT OR REPLACE INTO students (id,student_id,prefix,first_name,last_name,academic_year,term,level,year,major_name,major_code,room,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
        for (const r of data.students) ins.run(r.id,r.student_id,r.prefix,r.first_name,r.last_name,r.academic_year,r.term,r.level,r.year,r.major_name,r.major_code,r.room,r.created_at);
        importedCounts['students'] = data.students.length;
      }
      // Majors
      if (Array.isArray(data.majors)) {
        db.prepare('DELETE FROM majors').run();
        const ins = db.prepare('INSERT OR REPLACE INTO majors (id,academic_year,term,level,year,major_name,major_code,room,created_at) VALUES (?,?,?,?,?,?,?,?,?)');
        for (const r of data.majors) ins.run(r.id,r.academic_year,r.term,r.level,r.year,r.major_name,r.major_code,r.room,r.created_at);
        importedCounts['majors'] = data.majors.length;
      }
      // Academic Years
      if (Array.isArray(data.academic_years)) {
        db.prepare('DELETE FROM academic_years').run();
        const ins = db.prepare('INSERT OR REPLACE INTO academic_years (id,year,term,is_active,created_at) VALUES (?,?,?,?,?)');
        for (const r of data.academic_years) ins.run(r.id,r.year,r.term,r.is_active,r.created_at);
        importedCounts['academic_years'] = data.academic_years.length;
      }
      // Attendance Remarks
      if (Array.isArray(data.attendance_remarks)) {
        db.prepare('DELETE FROM attendance_remarks').run();
        const ins = db.prepare('INSERT OR REPLACE INTO attendance_remarks (id,session_id,student_id,remark,created_at) VALUES (?,?,?,?,?)');
        for (const r of data.attendance_remarks) ins.run(r.id,r.session_id,r.student_id,r.remark,r.created_at);
        importedCounts['attendance_remarks'] = data.attendance_remarks.length;
      }
    });
    
    db.pragma('foreign_keys = OFF');
    try {
      importTx();
    } finally {
      db.pragma('foreign_keys = ON');
    }

    logBackupAction('import', 'IMPORT_DATA', `นำเข้าข้อมูลจากไฟล์ ${req.file.originalname}`, { filename: req.file.originalname, original_exported_at: payload.exported_at, imported_counts: importedCounts });
    res.json({ success: true, imported_counts: importedCounts });
  } catch (error: any) {
    console.error('Import error:', error);
    logBackupAction('import', 'IMPORT_DATA', 'นำเข้าข้อมูลล้มเหลว', { error: String(error) }, 'error');
    res.status(500).json({ error: 'Import failed: ' + error.message });
  }
});

// POST /api/backup/snapshot — Create a SQLite file snapshot
app.post('/api/backup/snapshot', express.json(), async (req, res) => {
  try {
    const label = (req.body?.label || '').trim() || 'snapshot';
    const description = (req.body?.description || '').trim();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const snapshotId = `snap_${ts}`;
    const filename = `${snapshotId}.sqlite`;
    const destPath = path.join(snapshotsDir, filename);
    // Use SQLite backup API via better-sqlite3
    await (db as any).backup(destPath);
    const stats = fs.statSync(destPath);
    const counts = getTableRecordCounts();
    const metadata = {
      snapshotId,
      filename,
      label,
      description,
      size_bytes: stats.size,
      record_counts: counts,
      created_at: new Date().toISOString()
    };
    logBackupAction('snapshot', 'CREATE_SNAPSHOT', `สร้าง snapshot: ${label}`, metadata);
    res.json({ success: true, snapshot: metadata });
  } catch (error: any) {
    console.error('Snapshot error:', error);
    logBackupAction('snapshot', 'CREATE_SNAPSHOT', 'สร้าง snapshot ล้มเหลว', { error: String(error) }, 'error');
    res.status(500).json({ error: 'Snapshot failed: ' + error.message });
  }
});

// GET /api/backup/snapshots — List all snapshots
app.get('/api/backup/snapshots', (req, res) => {
  try {
    const snapshotLogs = db.prepare(
      `SELECT * FROM backup_logs WHERE log_type = 'snapshot' AND action = 'CREATE_SNAPSHOT' AND status = 'success' ORDER BY created_at DESC`
    ).all() as any[];
    const snapshots = snapshotLogs.map(log => {
      let meta: any = {};
      try { meta = JSON.parse(log.metadata || '{}'); } catch {}
      // Check if file still exists
      const filePath = path.join(snapshotsDir, meta.filename || '');
      const fileExists = meta.filename ? fs.existsSync(filePath) : false;
      let size_bytes = meta.size_bytes || 0;
      if (fileExists) {
        try { size_bytes = fs.statSync(filePath).size; } catch {}
      }
      return {
        id: log.id,
        snapshotId: meta.snapshotId,
        filename: meta.filename,
        label: meta.label || 'snapshot',
        description: meta.description || '',
        size_bytes,
        record_counts: meta.record_counts || {},
        created_at: log.created_at,
        file_exists: fileExists
      };
    });
    res.json(snapshots);
  } catch (error) {
    console.error('List snapshots error:', error);
    res.status(500).json({ error: 'Failed to list snapshots' });
  }
});

// POST /api/backup/rollback/:snapshotId — Rollback from snapshot
app.post('/api/backup/rollback/:snapshotId', async (req, res) => {
  try {
    const { snapshotId } = req.params;
    // Find snapshot log
    const snapshotLog = db.prepare(
      `SELECT * FROM backup_logs WHERE log_type = 'snapshot' AND action = 'CREATE_SNAPSHOT' AND status = 'success' AND id = ?`
    ).get(snapshotId) as any;
    if (!snapshotLog) {
      return res.status(404).json({ error: 'ไม่พบ snapshot ที่ระบุ' });
    }
    let meta: any = {};
    try { meta = JSON.parse(snapshotLog.metadata || '{}'); } catch {}
    const snapshotFile = path.join(snapshotsDir, meta.filename || '');
    if (!fs.existsSync(snapshotFile)) {
      return res.status(404).json({ error: 'ไม่พบไฟล์ snapshot บนเซิร์ฟเวอร์' });
    }
    // Before rollback: take automatic pre-rollback snapshot
    const preTs = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const preSnapshotId = `snap_prerollback_${preTs}`;
    const preFilename = `${preSnapshotId}.sqlite`;
    const preDest = path.join(snapshotsDir, preFilename);
    try {
      await (db as any).backup(preDest);
      const preStats = fs.statSync(preDest);
      logBackupAction('snapshot', 'CREATE_SNAPSHOT', `Auto snapshot ก่อน rollback`, {
        snapshotId: preSnapshotId,
        filename: preFilename,
        label: `[Auto] ก่อน rollback ไปยัง ${meta.label}`,
        description: 'สร้างอัตโนมัติก่อนทำ rollback',
        size_bytes: preStats.size,
        record_counts: getTableRecordCounts(),
        created_at: new Date().toISOString()
      });
    } catch (e) { console.error('Pre-rollback snapshot failed:', e); }
    // Restore: read snapshot data and write into current DB
    const Database = require('better-sqlite3');
    const snapDb = new Database(snapshotFile, { readonly: true });
    const tables = ['sessions', 'attendances', 'students', 'majors', 'academic_years', 'attendance_remarks'];
    const rollbackTx = db.transaction(() => {
      for (const table of tables) {
        try {
          db.prepare(`DELETE FROM ${table}`).run();
          const rows = snapDb.prepare(`SELECT * FROM ${table}`).all() as any[];
          if (rows.length === 0) continue;
          const cols = Object.keys(rows[0]);
          const placeholders = cols.map(() => '?').join(',');
          const ins = db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`);
          for (const row of rows) ins.run(cols.map((c: string) => row[c]));
        } catch (e) { console.error(`Rollback table ${table} error:`, e); }
      }
    });
    db.pragma('foreign_keys = OFF');
    try {
      rollbackTx();
    } finally {
      db.pragma('foreign_keys = ON');
    }
    snapDb.close();
    const restoredCounts = getTableRecordCounts();
    logBackupAction('rollback', 'ROLLBACK_DATA', `คืนข้อมูลจาก snapshot: ${meta.label}`, {
      from_snapshot_id: meta.snapshotId,
      from_snapshot_label: meta.label,
      from_snapshot_created_at: snapshotLog.created_at,
      restored_counts: restoredCounts
    });
    res.json({ success: true, restored_counts: restoredCounts, from_snapshot: meta.label });
  } catch (error: any) {
    console.error('Rollback error:', error);
    logBackupAction('rollback', 'ROLLBACK_DATA', 'Rollback ล้มเหลว', { error: String(error) }, 'error');
    res.status(500).json({ error: 'Rollback failed: ' + error.message });
  }
});

// DELETE /api/backup/snapshots/:snapshotId — Delete snapshot
app.delete('/api/backup/snapshots/:snapshotId', (req, res) => {
  try {
    const { snapshotId } = req.params;
    const snapshotLog = db.prepare(
      `SELECT * FROM backup_logs WHERE id = ? AND log_type = 'snapshot'`
    ).get(snapshotId) as any;
    if (!snapshotLog) {
      return res.status(404).json({ error: 'ไม่พบ snapshot' });
    }
    let meta: any = {};
    try { meta = JSON.parse(snapshotLog.metadata || '{}'); } catch {}
    if (meta.filename) {
      const filePath = path.join(snapshotsDir, meta.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.prepare('DELETE FROM backup_logs WHERE id = ?').run(snapshotId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete snapshot error:', error);
    res.status(500).json({ error: 'Delete snapshot failed' });
  }
});

// GET /api/backup/logs — Get all backup logs
app.get('/api/backup/logs', (req, res) => {
  try {
    const log_type = req.query.log_type as string | undefined;
    const limit = parseInt(req.query.limit as string || '100', 10);
    let query = 'SELECT * FROM backup_logs';
    const params: any[] = [];
    if (log_type) {
      query += ' WHERE log_type = ?';
      params.push(log_type);
    }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    const logs = db.prepare(query).all(...params) as any[];
    const parsed = logs.map(l => ({ ...l, metadata: (() => { try { return JSON.parse(l.metadata || '{}'); } catch { return {}; } })() }));
    res.json(parsed);
  } catch (error) {
    console.error('Logs error:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// GET /api/backup/download/:snapshotId — Download snapshot file
app.get('/api/backup/download/:snapshotId', (req, res) => {
  try {
    const { snapshotId } = req.params;
    const snapshotLog = db.prepare(
      `SELECT * FROM backup_logs WHERE id = ? AND log_type = 'snapshot'`
    ).get(snapshotId) as any;
    if (!snapshotLog) return res.status(404).json({ error: 'ไม่พบ snapshot' });
    let meta: any = {};
    try { meta = JSON.parse(snapshotLog.metadata || '{}'); } catch {}
    const filePath = path.join(snapshotsDir, meta.filename || '');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'ไม่พบไฟล์ snapshot' });
    res.download(filePath, meta.filename);
  } catch (error) {
    console.error('Download snapshot error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// ============================================================================
// MORNING ASSEMBLY (ระบบเช็กชื่อเข้าแถวหน้าเสาธง) ENDPOINTS & LOGIC
// ============================================================================

const assemblyUploadsDir = path.join(__dirname, '../uploads/assembly');
if (!fs.existsSync(assemblyUploadsDir)) {
  fs.mkdirSync(assemblyUploadsDir, { recursive: true });
}

const assemblyUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, assemblyUploadsDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      const uniqueName = `assembly_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
      cb(null, uniqueName);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

function getBangkokDateOnly(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
  return parts; // Returns YYYY-MM-DD
}

function getBangkokTimeOnly(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
  return parts; // Returns HH:mm
}

function getBangkokDayNum(date: Date = new Date()): number {
  const dayStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    weekday: 'short'
  }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[dayStr] ?? date.getDay();
}

function saveBase64AssemblyPhoto(base64Data: string): string | null {
  try {
    const matches = base64Data.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    let buffer: Buffer;
    let ext = '.jpg';
    if (matches && matches.length === 3) {
      ext = matches[1] === 'png' ? '.png' : '.jpg';
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(base64Data, 'base64');
    }
    const filename = `assembly_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    const fullPath = path.join(assemblyUploadsDir, filename);
    fs.writeFileSync(fullPath, buffer);
    return `/uploads/assembly/${filename}`;
  } catch (err) {
    console.error('Error saving base64 assembly photo:', err);
    return null;
  }
}

async function syncAssemblyToGoogleSheets(record: {
  academic_year: string;
  term: string;
  date: string;
  attended_at: string;
  status: string;
  level: string;
  year: string;
  major_code: string;
  major_name: string;
  room: string;
  student_id: string;
  prefix: string;
  first_name: string;
  last_name: string;
  matched_location: string;
}) {
  try {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as { sheet_id: string; credentials_json: string } | undefined;
    if (!settings || !settings.sheet_id || !settings.credentials_json) return;

    const rawSheetId = settings.sheet_id;
    const match = rawSheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const spreadsheetId = match ? match[1] : rawSheetId.trim();
    const sheets = getSheetsClient(settings.credentials_json);

    const sheetTabTitle = 'ประวัติเข้าแถว';

    // Check if sheet tab exists, if not create it
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const tabExists = (meta.data.sheets || []).some((s: any) => s.properties?.title === sheetTabTitle);

      if (!tabExists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: { title: sheetTabTitle }
                }
              }
            ]
          }
        });
        // Add headers
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `'${sheetTabTitle}'!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[
              'ปีการศึกษา', 'เทอม', 'วันที่', 'เวลาเช็กชื่อ', 'สถานะ',
              'ระดับชั้น', 'ชั้นปี', 'รหัสสาขา', 'ชื่อสาขาวิชา', 'กลุ่มห้อง',
              'รหัสนักศึกษา', 'คำนำหน้า', 'ชื่อจริง', 'นามสกุล', 'จุดเช็กชื่อ'
            ]]
          }
        });
      }
    } catch (e) {
      console.warn('Google Sheet tab check/creation warning:', e);
    }

    const statusLabel = record.status === 'present' ? 'มา' : record.status === 'late' ? 'สาย' : record.status === 'leave' ? 'ลา' : 'ขาด';
    const values = [[
      record.academic_year,
      record.term,
      record.date,
      new Date(record.attended_at).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }),
      statusLabel,
      record.level,
      record.year,
      record.major_code,
      record.major_name,
      record.room,
      record.student_id,
      record.prefix || '',
      record.first_name,
      record.last_name,
      record.matched_location || '-'
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${sheetTabTitle}'!A:O`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });
  } catch (error) {
    console.error('Failed to sync assembly to Google Sheets:', error);
  }
}

function getOrCreateTodayAssemblySession(): any {
  const today = getBangkokDateOnly();
  const activeSem = getActiveSettings();
  let session = db.prepare('SELECT * FROM assembly_sessions WHERE date = ?').get(today) as any;
  if (!session) {
    const dailyToken = crypto.randomBytes(8).toString('hex');
    db.prepare(`
      INSERT INTO assembly_sessions (date, daily_token, is_active, academic_year, term)
      VALUES (?, ?, 1, ?, ?)
    `).run(today, dailyToken, activeSem.academic_year, activeSem.term);
    session = db.prepare('SELECT * FROM assembly_sessions WHERE date = ?').get(today);
  }
  return session;
}

// 1. GET /api/assembly/settings
app.get('/api/assembly/settings', (req, res) => {
  try {
    let settings = db.prepare('SELECT * FROM assembly_settings WHERE id = 1').get() as any;
    if (!settings) {
      const defaultToken = crypto.randomBytes(8).toString('hex');
      db.prepare(`
        INSERT INTO assembly_settings (id, is_enabled, qr_mode, static_token, start_time, late_time, close_time, active_days, require_device_fingerprint)
        VALUES (1, 1, 'static', ?, '07:30', '08:00', '08:30', '1,2,3,4,5', 0)
      `).run(defaultToken);
      settings = db.prepare('SELECT * FROM assembly_settings WHERE id = 1').get();
    }
    const activeSem = getActiveSettings();
    const todaySession = getOrCreateTodayAssemblySession();
    res.json({
      ...settings,
      require_device_fingerprint: settings.require_device_fingerprint === 1,
      academic_year: activeSem.academic_year,
      term: activeSem.term,
      today_date: getBangkokDateOnly(),
      today_daily_token: todaySession.daily_token
    });
  } catch (error) {
    console.error('Error getting assembly settings:', error);
    res.status(500).json({ error: 'Failed to fetch assembly settings' });
  }
});

// 2. POST /api/assembly/settings
app.post('/api/assembly/settings', (req, res) => {
  try {
    const {
      is_enabled,
      qr_mode,
      start_time,
      late_time,
      close_time,
      active_days,
      require_photo,
      require_gps,
      require_device_fingerprint,
      start_date,
      end_date_type,
      end_date,
      location1_name,
      location1_lat,
      location1_lng,
      location1_radius,
      location2_enabled,
      location2_name,
      location2_lat,
      location2_lng,
      location2_radius,
      regenerate_static_token
    } = req.body;

    if (start_date !== undefined && !start_date) {
      return res.status(400).json({ error: 'กรุณาระบุวันเริ่มต้นนับการเข้าแถว (วันเปิดภาคเรียน)' });
    }

    if (end_date_type === 'specific' && end_date && start_date && end_date < start_date) {
      return res.status(400).json({ error: 'วันสิ้นสุดภาคเรียนต้องอยู่หลังวันเริ่มต้นภาคเรียน' });
    }

    let settings = db.prepare('SELECT * FROM assembly_settings WHERE id = 1').get() as any;
    let staticToken = settings?.static_token;
    if (!staticToken || regenerate_static_token) {
      staticToken = crypto.randomBytes(8).toString('hex');
    }

    const finalEndDate = end_date_type === 'specific' ? (end_date || null) : null;

    db.prepare(`
      UPDATE assembly_settings SET
        is_enabled = COALESCE(?, is_enabled),
        qr_mode = COALESCE(?, qr_mode),
        static_token = ?,
        start_time = COALESCE(?, start_time),
        late_time = COALESCE(?, late_time),
        close_time = COALESCE(?, close_time),
        active_days = COALESCE(?, active_days),
        require_photo = COALESCE(?, require_photo),
        require_gps = COALESCE(?, require_gps),
        require_device_fingerprint = COALESCE(?, require_device_fingerprint),
        start_date = COALESCE(?, start_date),
        end_date_type = COALESCE(?, end_date_type),
        end_date = ?,
        location1_name = COALESCE(?, location1_name),
        location1_lat = ?,
        location1_lng = ?,
        location1_radius = COALESCE(?, location1_radius),
        location2_enabled = COALESCE(?, location2_enabled),
        location2_name = COALESCE(?, location2_name),
        location2_lat = ?,
        location2_lng = ?,
        location2_radius = COALESCE(?, location2_radius)
      WHERE id = 1
    `).run(
      is_enabled !== undefined ? (is_enabled ? 1 : 0) : null,
      qr_mode || null,
      staticToken,
      start_time || null,
      late_time || null,
      close_time || null,
      active_days || null,
      require_photo !== undefined ? (require_photo ? 1 : 0) : null,
      require_gps !== undefined ? (require_gps ? 1 : 0) : null,
      require_device_fingerprint !== undefined ? (require_device_fingerprint ? 1 : 0) : null,
      start_date || null,
      end_date_type || null,
      finalEndDate,
      location1_name || null,
      location1_lat !== undefined && location1_lat !== '' && location1_lat !== null ? parseFloat(location1_lat) : null,
      location1_lng !== undefined && location1_lng !== '' && location1_lng !== null ? parseFloat(location1_lng) : null,
      location1_radius ? parseInt(location1_radius, 10) : null,
      location2_enabled !== undefined ? (location2_enabled ? 1 : 0) : null,
      location2_name || null,
      location2_lat !== undefined && location2_lat !== '' && location2_lat !== null ? parseFloat(location2_lat) : null,
      location2_lng !== undefined && location2_lng !== '' && location2_lng !== null ? parseFloat(location2_lng) : null,
      location2_radius ? parseInt(location2_radius, 10) : null
    );

    res.json({ success: true, static_token: staticToken });
  } catch (error) {
    console.error('Error updating assembly settings:', error);
    res.status(500).json({ error: 'Failed to update assembly settings' });
  }
});

// 3. POST /api/assembly/override (Manual open/close override)
app.post('/api/assembly/override', (req, res) => {
  try {
    const { open } = req.body;
    const today = getBangkokDateOnly();
    const overrideVal = open ? 1 : 0;
    db.prepare(`
      UPDATE assembly_settings SET
        manual_override_open = ?,
        manual_override_date = ?
      WHERE id = 1
    `).run(overrideVal, today);

    res.json({ success: true, manual_override_open: overrideVal, manual_override_date: today });
  } catch (error) {
    console.error('Error overriding assembly status:', error);
    res.status(500).json({ error: 'Failed to override assembly status' });
  }
});

// 4. Holidays CRUD
app.get('/api/assembly/holidays', (req, res) => {
  try {
    const activeSem = getActiveSettings();
    const holidays = db.prepare(`
      SELECT * FROM assembly_holidays 
      WHERE academic_year = ? AND term = ? 
      ORDER BY date ASC
    `).all(activeSem.academic_year, activeSem.term);
    res.json(holidays);
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

app.post('/api/assembly/holidays', (req, res) => {
  try {
    const { date, title } = req.body;
    if (!date || !title) {
      return res.status(400).json({ error: 'กรุณากรอกวันที่และชื่อวันหยุด' });
    }
    const activeSem = getActiveSettings();
    db.prepare(`
      INSERT INTO assembly_holidays (date, title, academic_year, term)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET title = excluded.title
    `).run(date, title.trim(), activeSem.academic_year, activeSem.term);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving holiday:', error);
    res.status(500).json({ error: 'Failed to save holiday' });
  }
});

app.delete('/api/assembly/holidays/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM assembly_holidays WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting holiday:', error);
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
});

// 5. GET /api/assembly/check-status (Public status for scan page)
app.get('/api/assembly/check-status', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM assembly_settings WHERE id = 1').get() as any;
    if (!settings || settings.is_enabled === 0) {
      return res.json({
        isOpen: false,
        reason: 'ระบบเช็กชื่อเข้าแถวถูกปิดการใช้งานชั่วคราวโดยผู้ดูแลระบบ'
      });
    }

    const todayDate = getBangkokDateOnly();
    const currentTime = getBangkokTimeOnly();
    const dayNum = getBangkokDayNum();
    const todaySession = getOrCreateTodayAssemblySession();

    // Check manual override
    const isOverridden = settings.manual_override_open === 1 && settings.manual_override_date === todayDate;

    // Check semester start date
    if (settings.start_date && todayDate < settings.start_date && !isOverridden) {
      return res.json({
        isOpen: false,
        isBeforeSemester: true,
        reason: `ยังไม่ถึงกำหนดวันเริ่มต้นภาคเรียน (เริ่มวันที่ ${settings.start_date})`,
        todayDate,
        currentTime,
        startDate: settings.start_date
      });
    }

    // Check semester end date (if specific)
    if (settings.end_date_type === 'specific' && settings.end_date && todayDate > settings.end_date && !isOverridden) {
      return res.json({
        isOpen: false,
        isAfterSemester: true,
        reason: `สิ้นสุดภาคเรียนแล้ว (ปิดรับการเข้าแถวตั้งแต่วันที่ ${settings.end_date})`,
        todayDate,
        currentTime,
        endDate: settings.end_date
      });
    }

    // Check holiday
    const holiday = db.prepare('SELECT * FROM assembly_holidays WHERE date = ?').get(todayDate) as any;
    if (holiday && !isOverridden) {
      return res.json({
        isOpen: false,
        isHoliday: true,
        reason: `วันนี้เป็นวันหยุด: ${holiday.title}`,
        todayDate,
        currentTime
      });
    }

    // Check day of week
    const activeDays = (settings.active_days || '1,2,3,4,5').split(',').map((d: string) => parseInt(d.trim(), 10));
    if (!activeDays.includes(dayNum) && !isOverridden) {
      return res.json({
        isOpen: false,
        isExcludedDay: true,
        reason: 'วันนี้ไม่ใช่วันเข้าแถวตามกำหนดการ',
        todayDate,
        currentTime
      });
    }

    // Time window logic
    let isOpen = true;
    let currentStatus: 'present' | 'late' | 'closed' | 'not_started' = 'present';
    let reason = '';

    if (!isOverridden) {
      if (currentTime < settings.start_time) {
        isOpen = false;
        currentStatus = 'not_started';
        reason = `ยังไม่ถึงเวลาเริ่มเข้าแถว (เปิดรับเวลา ${settings.start_time} น.)`;
      } else if (currentTime > settings.close_time) {
        isOpen = false;
        currentStatus = 'closed';
        reason = `หมดเวลาการเข้าแถวสำหรับวันนี้แล้ว (ปิดรับเวลา ${settings.close_time} น.)`;
      } else if (currentTime > settings.late_time) {
        currentStatus = 'late';
        reason = `เช็กชื่อตอนนี้จะได้รับสถานะ "มาสาย" (เริ่มสายเวลา ${settings.late_time} น.)`;
      } else {
        currentStatus = 'present';
        reason = 'เปิดรับเช็กชื่อตามเวลาปกติ';
      }
    } else {
      reason = 'เปิดรับการเช็กชื่อรอบพิเศษโดยผู้ดูแลระบบ';
      if (currentTime > settings.late_time) {
        currentStatus = 'late';
      }
    }

    const locations = [];
    if (settings.location1_lat !== null && settings.location1_lng !== null) {
      locations.push({
        id: 1,
        name: settings.location1_name || 'จุดเข้าแถวที่ 1',
        lat: settings.location1_lat,
        lng: settings.location1_lng,
        radius: settings.location1_radius || 150
      });
    }
    if (settings.location2_enabled === 1 && settings.location2_lat !== null && settings.location2_lng !== null) {
      locations.push({
        id: 2,
        name: settings.location2_name || 'จุดเข้าแถวที่ 2',
        lat: settings.location2_lat,
        lng: settings.location2_lng,
        radius: settings.location2_radius || 150
      });
    }

    const validToken = settings.qr_mode === 'dynamic' ? todaySession.daily_token : settings.static_token;

    res.json({
      isOpen,
      currentStatus,
      reason,
      todayDate,
      currentTime,
      startTime: settings.start_time,
      lateTime: settings.late_time,
      closeTime: settings.close_time,
      requirePhoto: settings.require_photo === 1,
      requireGps: settings.require_gps === 1,
      requireDeviceFingerprint: settings.require_device_fingerprint === 1,
      locations,
      qrMode: settings.qr_mode,
      activeToken: validToken,
      isOverridden
    });
  } catch (error) {
    console.error('Error checking assembly status:', error);
    res.status(500).json({ error: 'Failed to check assembly status' });
  }
});

// Helper to log rejection in Morning Assembly
function logAssemblyRejection(params: {
  date: string;
  student_id: string;
  prefix?: string;
  first_name?: string;
  last_name?: string;
  level?: string;
  year?: string;
  major_name?: string;
  major_code?: string;
  room?: string;
  device_uuid?: string | null;
  hardware_fingerprint?: string | null;
  ip_address?: string | null;
  confidence_score?: number | null;
  device_flags?: string | null;
  rejection_reason: string;
  academic_year?: string;
  term?: string;
}) {
  try {
    const activeSem = getActiveSettings();
    db.prepare(`
      INSERT INTO assembly_rejections (
        date, student_id, prefix, first_name, last_name,
        level, year, major_name, major_code, room,
        device_uuid, hardware_fingerprint, ip_address,
        confidence_score, device_flags, rejection_reason,
        academic_year, term
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.date,
      params.student_id,
      params.prefix || '',
      params.first_name || '',
      params.last_name || '',
      params.level || '',
      params.year || '',
      params.major_name || '',
      params.major_code || '',
      params.room || '',
      params.device_uuid || null,
      params.hardware_fingerprint || null,
      params.ip_address || null,
      params.confidence_score !== undefined && params.confidence_score !== null ? parseFloat(params.confidence_score as any) : null,
      params.device_flags || null,
      params.rejection_reason,
      params.academic_year || activeSem.academic_year,
      params.term || activeSem.term
    );
  } catch (e) {
    console.error('Failed to log assembly rejection:', e);
  }
}

// 6. POST /api/assembly/checkin (Public student check-in)
app.post('/api/assembly/checkin', assemblyUpload.single('photo'), async (req, res) => {
  try {
    const {
      student_id,
      token,
      device_uuid,
      latitude,
      longitude,
      bypass_gps,
      photo_base64,
      hardware_fingerprint,
      confidence_score,
      device_flags
    } = req.body;

    // Client IP
    let ipAddress = '';
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
      const list = typeof xForwardedFor === 'string' ? xForwardedFor.split(',') : xForwardedFor[0].split(',');
      ipAddress = list[0].trim();
    } else {
      ipAddress = req.socket.remoteAddress || '';
    }

    const todayDate = getBangkokDateOnly();
    const currentTime = getBangkokTimeOnly();
    const dayNum = getBangkokDayNum();
    const activeSem = getActiveSettings();
    const devFlagsStr = typeof device_flags === 'object' ? JSON.stringify(device_flags) : device_flags || null;
    const confScoreNum = confidence_score !== undefined && confidence_score !== '' && confidence_score !== null ? parseFloat(confidence_score) : null;

    if (!student_id || !/^\d{11}$/.test(student_id.trim())) {
      logAssemblyRejection({
        date: todayDate,
        student_id: student_id || 'INVALID',
        device_uuid: device_uuid || null,
        hardware_fingerprint: hardware_fingerprint || null,
        ip_address: ipAddress,
        confidence_score: confScoreNum,
        device_flags: devFlagsStr,
        rejection_reason: 'รหัสนักศึกษาไม่ถูกต้อง (ต้องเป็นตัวเลข 11 หลัก)'
      });
      return res.status(400).json({ error: 'รหัสนักศึกษาต้องเป็นตัวเลข 11 หลักเท่านั้น' });
    }

    const cleanStudentId = student_id.trim();

    // 1. Verify student exists in students table
    const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(cleanStudentId) as any;
    if (!student) {
      logAssemblyRejection({
        date: todayDate,
        student_id: cleanStudentId,
        device_uuid: device_uuid || null,
        hardware_fingerprint: hardware_fingerprint || null,
        ip_address: ipAddress,
        confidence_score: confScoreNum,
        device_flags: devFlagsStr,
        rejection_reason: 'ไม่พบรหัสนักศึกษานี้ในฐานข้อมูลของวิทยาลัย'
      });
      return res.status(400).json({ error: 'ไม่พบรหัสนักศึกษานี้ในรายชื่อนักศึกษาของวิทยาลัย กรุณาติดต่อผู้ดูแลระบบ' });
    }

    const settings = db.prepare('SELECT * FROM assembly_settings WHERE id = 1').get() as any;
    if (!settings || settings.is_enabled === 0) {
      return res.status(400).json({ error: 'ระบบเช็กชื่อเข้าแถวถูกปิดการใช้งานชั่วคราว' });
    }

    const todaySession = getOrCreateTodayAssemblySession();
    const isOverridden = settings.manual_override_open === 1 && settings.manual_override_date === todayDate;

    // 2. Token verification
    const expectedToken = settings.qr_mode === 'dynamic' ? todaySession.daily_token : settings.static_token;
    if (token && token.trim() !== expectedToken) {
      logAssemblyRejection({
        date: todayDate,
        student_id: cleanStudentId,
        prefix: student.prefix,
        first_name: student.first_name,
        last_name: student.last_name,
        level: student.level,
        year: student.year,
        major_name: student.major_name,
        major_code: student.major_code,
        room: student.room,
        device_uuid: device_uuid || null,
        hardware_fingerprint: hardware_fingerprint || null,
        ip_address: ipAddress,
        confidence_score: confScoreNum,
        device_flags: devFlagsStr,
        rejection_reason: 'รหัส QR Code สำหรับเข้าแถวไม่ถูกต้องหรือหมดอายุ'
      });
      return res.status(400).json({ error: 'รหัส QR Code สำหรับเข้าแถวไม่ถูกต้องหรือหมดอายุแล้ว กรุณาสแกนใหม่จากป้ายหรือจอที่ลานเข้าแถว' });
    }

    // 2.1 Semester start & end dates verification
    if (settings.start_date && todayDate < settings.start_date && !isOverridden) {
      const rejMsg = `ยังไม่ถึงกำหนดวันเริ่มต้นภาคเรียน (เริ่มวันที่ ${settings.start_date})`;
      logAssemblyRejection({
        date: todayDate,
        student_id: cleanStudentId,
        prefix: student.prefix,
        first_name: student.first_name,
        last_name: student.last_name,
        level: student.level,
        year: student.year,
        major_name: student.major_name,
        major_code: student.major_code,
        room: student.room,
        device_uuid: device_uuid || null,
        hardware_fingerprint: hardware_fingerprint || null,
        ip_address: ipAddress,
        confidence_score: confScoreNum,
        device_flags: devFlagsStr,
        rejection_reason: rejMsg
      });
      return res.status(400).json({ error: rejMsg });
    }

    if (settings.end_date_type === 'specific' && settings.end_date && todayDate > settings.end_date && !isOverridden) {
      const rejMsg = `สิ้นสุดภาคเรียนแล้ว (ปิดรับการเข้าแถวตั้งแต่วันที่ ${settings.end_date})`;
      logAssemblyRejection({
        date: todayDate,
        student_id: cleanStudentId,
        prefix: student.prefix,
        first_name: student.first_name,
        last_name: student.last_name,
        level: student.level,
        year: student.year,
        major_name: student.major_name,
        major_code: student.major_code,
        room: student.room,
        device_uuid: device_uuid || null,
        hardware_fingerprint: hardware_fingerprint || null,
        ip_address: ipAddress,
        confidence_score: confScoreNum,
        device_flags: devFlagsStr,
        rejection_reason: rejMsg
      });
      return res.status(400).json({ error: rejMsg });
    }

    // 3. Holiday & day of week verification
    const holiday = db.prepare('SELECT * FROM assembly_holidays WHERE date = ?').get(todayDate) as any;
    if (holiday && !isOverridden) {
      return res.status(400).json({ error: `วันนี้เป็นวันหยุด (${holiday.title}) ไม่เปิดให้เช็กชื่อเข้าแถว` });
    }

    const activeDays = (settings.active_days || '1,2,3,4,5').split(',').map((d: string) => parseInt(d.trim(), 10));
    if (!activeDays.includes(dayNum) && !isOverridden) {
      return res.status(400).json({ error: 'วันนี้ไม่ใช่วันเข้าแถวตามกำหนดการ' });
    }

    // 4. Time window check
    if (!isOverridden) {
      if (currentTime < settings.start_time) {
        logAssemblyRejection({
          date: todayDate,
          student_id: cleanStudentId,
          prefix: student.prefix,
          first_name: student.first_name,
          last_name: student.last_name,
          level: student.level,
          year: student.year,
          major_name: student.major_name,
          major_code: student.major_code,
          room: student.room,
          device_uuid: device_uuid || null,
          hardware_fingerprint: hardware_fingerprint || null,
          ip_address: ipAddress,
          confidence_score: confScoreNum,
          device_flags: devFlagsStr,
          rejection_reason: `สแกนก่อนเวลาเปิดรับ (${currentTime} น. < ${settings.start_time} น.)`
        });
        return res.status(400).json({ error: `ยังไม่ถึงเวลาเริ่มเข้าแถว (เปิดรับเวลา ${settings.start_time} น.)` });
      }
      if (currentTime > settings.close_time) {
        logAssemblyRejection({
          date: todayDate,
          student_id: cleanStudentId,
          prefix: student.prefix,
          first_name: student.first_name,
          last_name: student.last_name,
          level: student.level,
          year: student.year,
          major_name: student.major_name,
          major_code: student.major_code,
          room: student.room,
          device_uuid: device_uuid || null,
          hardware_fingerprint: hardware_fingerprint || null,
          ip_address: ipAddress,
          confidence_score: confScoreNum,
          device_flags: devFlagsStr,
          rejection_reason: `สแกนหลังเวลาปิดรับ (${currentTime} น. > ${settings.close_time} น.)`
        });
        return res.status(400).json({ error: `หมดเวลาสำหรับการเข้าแถววันนี้แล้ว (ปิดรับเวลา ${settings.close_time} น.)` });
      }
    }

    // Determine status (present or late)
    let finalStatus = 'present';
    if (currentTime > settings.late_time && !isOverridden) {
      finalStatus = 'late';
    }

    // 5. Check duplicate check-in for this student on today's date
    const existingAtt = db.prepare('SELECT id, attended_at, status FROM assembly_attendances WHERE date = ? AND student_id = ?').get(todayDate, cleanStudentId) as any;
    if (existingAtt) {
      const timeStr = new Date(existingAtt.attended_at).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' });
      return res.status(400).json({ error: `คุณได้ทำการเช็กชื่อเข้าแถวสำหรับวันนี้ไปแล้ว (เวลา ${timeStr})` });
    }

    // 6. Check duplicate device scan (1 device cannot scan for multiple students on the same day)
    if (device_uuid) {
      const otherScan = db.prepare('SELECT student_id, first_name, last_name FROM assembly_attendances WHERE date = ? AND device_uuid = ? AND student_id != ?').get(todayDate, device_uuid, cleanStudentId) as any;
      if (otherScan) {
        const rejMsg = `อุปกรณ์เครื่องนี้ได้ทำการเช็กชื่อให้นักศึกษาคนอื่นแล้ว (${otherScan.student_id} ${otherScan.first_name} ${otherScan.last_name})`;
        logAssemblyRejection({
          date: todayDate,
          student_id: cleanStudentId,
          prefix: student.prefix,
          first_name: student.first_name,
          last_name: student.last_name,
          level: student.level,
          year: student.year,
          major_name: student.major_name,
          major_code: student.major_code,
          room: student.room,
          device_uuid: device_uuid,
          hardware_fingerprint: hardware_fingerprint || null,
          ip_address: ipAddress,
          confidence_score: confScoreNum,
          device_flags: devFlagsStr,
          rejection_reason: rejMsg
        });
        return res.status(400).json({ error: `${rejMsg} เพื่อความโปร่งใสไม่อนุญาตให้สแกนแทนกัน` });
      }
    }

    // 6.1 Check duplicate hardware fingerprint scan if present
    if (hardware_fingerprint) {
      const otherHwScan = db.prepare('SELECT student_id, first_name, last_name FROM assembly_attendances WHERE date = ? AND hardware_fingerprint = ? AND student_id != ?').get(todayDate, hardware_fingerprint, cleanStudentId) as any;
      if (otherHwScan) {
        const rejMsg = `ตรวจพบลายนิ้วมืออุปกรณ์ซ้ำซ้อนกับนักศึกษาคนอื่น (${otherHwScan.student_id} ${otherHwScan.first_name} ${otherHwScan.last_name})`;
        logAssemblyRejection({
          date: todayDate,
          student_id: cleanStudentId,
          prefix: student.prefix,
          first_name: student.first_name,
          last_name: student.last_name,
          level: student.level,
          year: student.year,
          major_name: student.major_name,
          major_code: student.major_code,
          room: student.room,
          device_uuid: device_uuid || null,
          hardware_fingerprint: hardware_fingerprint,
          ip_address: ipAddress,
          confidence_score: confScoreNum,
          device_flags: devFlagsStr,
          rejection_reason: rejMsg
        });
        return res.status(400).json({ error: `${rejMsg} เพื่อความโปร่งใสไม่อนุญาตให้สแกนแทนกัน` });
      }
    }

    // 6.2 Check if require_device_fingerprint is enforced
    if (settings.require_device_fingerprint === 1 && !hardware_fingerprint && !device_uuid) {
      const rejMsg = 'ระบบกำหนดให้ต้องตรวจสอบลายนิ้วมืออุปกรณ์ (Device Fingerprint) แต่ไม่พบข้อมูลจากเบราว์เซอร์';
      logAssemblyRejection({
        date: todayDate,
        student_id: cleanStudentId,
        prefix: student.prefix,
        first_name: student.first_name,
        last_name: student.last_name,
        level: student.level,
        year: student.year,
        major_name: student.major_name,
        major_code: student.major_code,
        room: student.room,
        ip_address: ipAddress,
        rejection_reason: rejMsg
      });
      return res.status(400).json({ error: rejMsg });
    }

    // 7. Geofence verification
    let matchedLocationName = 'ลานเข้าแถว';
    if (settings.require_gps === 1 && bypass_gps !== true && bypass_gps !== 'true') {
      const sLat = latitude !== undefined && latitude !== '' ? parseFloat(latitude) : NaN;
      const sLng = longitude !== undefined && longitude !== '' ? parseFloat(longitude) : NaN;

      if (isNaN(sLat) || isNaN(sLng)) {
        logAssemblyRejection({
          date: todayDate,
          student_id: cleanStudentId,
          prefix: student.prefix,
          first_name: student.first_name,
          last_name: student.last_name,
          level: student.level,
          year: student.year,
          major_name: student.major_name,
          major_code: student.major_code,
          room: student.room,
          device_uuid: device_uuid || null,
          hardware_fingerprint: hardware_fingerprint || null,
          ip_address: ipAddress,
          confidence_score: confScoreNum,
          device_flags: devFlagsStr,
          rejection_reason: 'ไม่ได้ระบุพิกัด GPS หรืออุปกรณ์ไม่สามารถอ่านค่าพิกัดได้'
        });
        return res.status(400).json({ error: 'กรุณาเปิดระบบระบุตำแหน่ง GPS บนอุปกรณ์ของท่านเพื่อทำรายการเช็กชื่อเข้าแถว' });
      }

      let inRange = false;
      let minDistance = 999999;
      let nearestAllowed = 150;

      // Check Location 1
      if (settings.location1_lat !== null && settings.location1_lng !== null) {
        const d1 = getDistance(settings.location1_lat, settings.location1_lng, sLat, sLng);
        if (d1 < minDistance) {
          minDistance = d1;
          nearestAllowed = settings.location1_radius || 150;
          matchedLocationName = settings.location1_name || 'จุดเข้าแถวที่ 1';
        }
        if (d1 <= (settings.location1_radius || 150)) {
          inRange = true;
          matchedLocationName = settings.location1_name || 'จุดเข้าแถวที่ 1';
        }
      }

      // Check Location 2 (if enabled)
      if (settings.location2_enabled === 1 && settings.location2_lat !== null && settings.location2_lng !== null) {
        const d2 = getDistance(settings.location2_lat, settings.location2_lng, sLat, sLng);
        if (d2 < minDistance) {
          minDistance = d2;
          nearestAllowed = settings.location2_radius || 150;
        }
        if (d2 <= (settings.location2_radius || 150)) {
          inRange = true;
          matchedLocationName = settings.location2_name || 'จุดเข้าแถวที่ 2';
        }
      }

      // If at least one location is configured, verify distance
      const hasConfiguredLocation = (settings.location1_lat !== null && settings.location1_lng !== null) ||
                                    (settings.location2_enabled === 1 && settings.location2_lat !== null && settings.location2_lng !== null);

      if (hasConfiguredLocation && !inRange) {
        const distStr = minDistance >= 1000 ? `${(minDistance / 1000).toFixed(2)} กิโลเมตร` : `${Math.round(minDistance)} เมตร`;
        const allowedStr = nearestAllowed >= 1000 ? `${(nearestAllowed / 1000).toFixed(2)} กิโลเมตร` : `${nearestAllowed} เมตร`;
        const rejMsg = `อยู่นอกพื้นที่เข้าแถว (ห่างจากจุดที่กำหนดประมาณ ${distStr} เกินระยะที่อนุญาต ${allowedStr})`;
        logAssemblyRejection({
          date: todayDate,
          student_id: cleanStudentId,
          prefix: student.prefix,
          first_name: student.first_name,
          last_name: student.last_name,
          level: student.level,
          year: student.year,
          major_name: student.major_name,
          major_code: student.major_code,
          room: student.room,
          device_uuid: device_uuid || null,
          hardware_fingerprint: hardware_fingerprint || null,
          ip_address: ipAddress,
          confidence_score: confScoreNum,
          device_flags: devFlagsStr,
          rejection_reason: rejMsg
        });
        return res.status(400).json({ error: `คุณอยู่นอกพื้นที่เข้าแถว (ห่างจากจุดที่กำหนดประมาณ ${distStr} ซึ่งเกินระยะที่อนุญาต ${allowedStr})` });
      }
    }

    // 8. Photo verification & save
    let photoPath: string | null = null;
    if (req.file) {
      photoPath = `/uploads/assembly/${req.file.filename}`;
    } else if (photo_base64 && typeof photo_base64 === 'string' && photo_base64.length > 50) {
      photoPath = saveBase64AssemblyPhoto(photo_base64);
    }

    if (settings.require_photo === 1 && !photoPath) {
      logAssemblyRejection({
        date: todayDate,
        student_id: cleanStudentId,
        prefix: student.prefix,
        first_name: student.first_name,
        last_name: student.last_name,
        level: student.level,
        year: student.year,
        major_name: student.major_name,
        major_code: student.major_code,
        room: student.room,
        device_uuid: device_uuid || null,
        hardware_fingerprint: hardware_fingerprint || null,
        ip_address: ipAddress,
        confidence_score: confScoreNum,
        device_flags: devFlagsStr,
        rejection_reason: 'ไม่ได้แนบภาพถ่ายหลักฐานในแถว'
      });
      return res.status(400).json({ error: 'กรุณาถ่ายภาพหรือแนบภาพถ่ายหลักฐานขณะอยู่ในแถว' });
    }

    const attendedAt = await getThaiTimeISO();

    // 10. Insert into assembly_attendances
    const insertStmt = db.prepare(`
      INSERT INTO assembly_attendances (
        assembly_session_id, date, student_id, prefix, first_name, last_name,
        level, year, major_name, major_code, room, status, photo_path, attended_at,
        academic_year, term, device_uuid, latitude, longitude, matched_location, ip_address,
        confidence_score, device_flags, hardware_fingerprint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      todaySession.id,
      todayDate,
      cleanStudentId,
      student.prefix || '',
      student.first_name,
      student.last_name,
      student.level || 'ปวช',
      student.year || '1',
      student.major_name || '',
      student.major_code || '',
      student.room || '1',
      finalStatus,
      photoPath,
      attendedAt,
      activeSem.academic_year,
      activeSem.term,
      device_uuid || null,
      latitude !== undefined && latitude !== '' ? parseFloat(latitude) : null,
      longitude !== undefined && longitude !== '' ? parseFloat(longitude) : null,
      matchedLocationName,
      ipAddress,
      confScoreNum,
      devFlagsStr,
      hardware_fingerprint || null
    );

    // 11. Async sync to Google Sheets
    syncAssemblyToGoogleSheets({
      academic_year: activeSem.academic_year,
      term: activeSem.term,
      date: todayDate,
      attended_at: attendedAt,
      status: finalStatus,
      level: student.level || 'ปวช',
      year: student.year || '1',
      major_code: student.major_code || '',
      major_name: student.major_name || '',
      room: student.room || '1',
      student_id: cleanStudentId,
      prefix: student.prefix || '',
      first_name: student.first_name,
      last_name: student.last_name,
      matched_location: matchedLocationName
    });

    res.json({
      success: true,
      status: finalStatus,
      message: finalStatus === 'present' ? 'เช็กชื่อเข้าแถวสำเร็จทันเวลา' : 'เช็กชื่อเข้าแถวสำเร็จ (บันทึกเป็นมาสาย)',
      student: {
        student_id: cleanStudentId,
        prefix: student.prefix,
        first_name: student.first_name,
        last_name: student.last_name,
        level: student.level,
        year: student.year,
        major_code: student.major_code,
        major_name: student.major_name,
        room: student.room
      },
      attended_at: attendedAt,
      photo_path: photoPath
    });
  } catch (error: any) {
    console.error('Assembly check-in error:', error);
    if (error.message?.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'คุณได้ทำการเช็กชื่อเข้าแถวสำหรับวันนี้ไปแล้ว' });
    }
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกการเข้าแถว กรุณาลองใหม่อีกครั้ง' });
  }
});

// 6.1 POST /api/assembly/log-rejection (Client-side rejection reporting)
app.post('/api/assembly/log-rejection', (req, res) => {
  try {
    const {
      student_id,
      device_uuid,
      hardware_fingerprint,
      confidence_score,
      device_flags,
      rejection_reason
    } = req.body;

    let student: any = null;
    if (student_id && /^\d{11}$/.test(student_id.trim())) {
      student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(student_id.trim());
    }

    let ipAddress = '';
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
      const list = typeof xForwardedFor === 'string' ? xForwardedFor.split(',') : xForwardedFor[0].split(',');
      ipAddress = list[0].trim();
    } else {
      ipAddress = req.socket.remoteAddress || '';
    }

    logAssemblyRejection({
      date: getBangkokDateOnly(),
      student_id: student_id || 'UNKNOWN',
      prefix: student?.prefix || '',
      first_name: student?.first_name || '',
      last_name: student?.last_name || '',
      level: student?.level || '',
      year: student?.year || '',
      major_name: student?.major_name || '',
      major_code: student?.major_code || '',
      room: student?.room || '',
      device_uuid: device_uuid || null,
      hardware_fingerprint: hardware_fingerprint || null,
      ip_address: ipAddress || null,
      confidence_score: confidence_score !== undefined && confidence_score !== '' && confidence_score !== null ? parseFloat(confidence_score) : null,
      device_flags: typeof device_flags === 'object' ? JSON.stringify(device_flags) : device_flags || null,
      rejection_reason: rejection_reason || 'Client-side rejection'
    });

    res.json({ success: true, logged: true });
  } catch (err) {
    console.error('Error logging assembly rejection attempt:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 7. GET /api/assembly/student-summary/:studentId (Student personal assembly summary)
app.get('/api/assembly/student-summary/:studentId', (req, res) => {
  try {
    const { studentId } = req.params;
    const activeSem = getActiveSettings();

    const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId) as any;
    if (!student) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลนักศึกษา' });
    }

    // All assembly records for this student in current semester
    const attendances = db.prepare(`
      SELECT * FROM assembly_attendances
      WHERE student_id = ? AND academic_year = ? AND term = ?
      ORDER BY date DESC
    `).all(studentId, activeSem.academic_year, activeSem.term) as any[];

    // Distinct past assembly dates
    const distinctDates = db.prepare(`
      SELECT DISTINCT date FROM assembly_attendances
      WHERE academic_year = ? AND term = ?
    `).all(activeSem.academic_year, activeSem.term) as { date: string }[];

    const totalDays = Math.max(distinctDates.length, attendances.length);
    const presentCount = attendances.filter(a => a.status === 'present').length;
    const lateCount = attendances.filter(a => a.status === 'late').length;
    const leaveCount = attendances.filter(a => a.status === 'leave').length;
    const attendedCount = presentCount + lateCount;
    const absentCount = Math.max(0, totalDays - attendedCount - leaveCount);
    const rate = totalDays > 0 ? Math.round((attendedCount / totalDays) * 100) : 0;

    res.json({
      student,
      summary: {
        totalDays,
        presentCount,
        lateCount,
        leaveCount,
        absentCount,
        rate,
        isPass: rate >= 80
      },
      history: attendances
    });
  } catch (error) {
    console.error('Error fetching student assembly summary:', error);
    res.status(500).json({ error: 'Failed to fetch student assembly summary' });
  }
});

// 8. GET /api/assembly/dashboard-summary (Admin Assembly Overview)
app.get('/api/assembly/dashboard-summary', (req, res) => {
  try {
    const activeSem = getActiveSettings();
    const queryYear = (req.query.academic_year as string) || activeSem.academic_year;
    const queryTerm = (req.query.term as string) || activeSem.term;
    const today = getBangkokDateOnly();

    // Total enrolled students
    const totalStudentsRow = db.prepare(`
      SELECT COUNT(*) as count FROM students 
      WHERE academic_year = ? AND term = ?
    `).get(queryYear, queryTerm) as { count: number };
    const totalStudents = totalStudentsRow.count || 0;

    // Today's attendances
    const todayAttendances = db.prepare(`
      SELECT status, COUNT(*) as count FROM assembly_attendances
      WHERE date = ? AND academic_year = ? AND term = ?
      GROUP BY status
    `).all(today, queryYear, queryTerm) as { status: string; count: number }[];

    let todayPresent = 0;
    let todayLate = 0;
    let todayLeave = 0;
    for (const r of todayAttendances) {
      if (r.status === 'present') todayPresent = r.count;
      if (r.status === 'late') todayLate = r.count;
      if (r.status === 'leave') todayLeave = r.count;
    }
    const todayCheckedIn = todayPresent + todayLate;
    const todayAbsent = Math.max(0, totalStudents - todayCheckedIn - todayLeave);
    const todayRate = totalStudents > 0 ? Math.round((todayCheckedIn / totalStudents) * 100) : 0;

    // Last 14 days trend
    const pastDates = db.prepare(`
      SELECT DISTINCT date FROM assembly_attendances
      WHERE academic_year = ? AND term = ?
      ORDER BY date DESC
      LIMIT 14
    `).all(queryYear, queryTerm) as { date: string }[];

    const trend = [];
    for (const d of pastDates.reverse()) {
      const stats = db.prepare(`
        SELECT status, COUNT(*) as count FROM assembly_attendances
        WHERE date = ? AND academic_year = ? AND term = ?
        GROUP BY status
      `).all(d.date, queryYear, queryTerm) as { status: string; count: number }[];

      let pres = 0;
      let late = 0;
      let leave = 0;
      for (const s of stats) {
        if (s.status === 'present') pres = s.count;
        if (s.status === 'late') late = s.count;
        if (s.status === 'leave') leave = s.count;
      }
      const chk = pres + late;
      const rate = totalStudents > 0 ? Math.round((chk / totalStudents) * 100) : 0;
      trend.push({
        date: d.date,
        present: pres,
        late,
        leave,
        absent: Math.max(0, totalStudents - chk - leave),
        rate
      });
    }

    // Attendance rate by Department (major_code)
    const majorStats = db.prepare(`
      SELECT major_code, major_name, COUNT(DISTINCT student_id) as student_count
      FROM students
      WHERE academic_year = ? AND term = ?
      GROUP BY major_code
    `).all(queryYear, queryTerm) as any[];

    const departmentRankings = majorStats.map(m => {
      const attCountRow = db.prepare(`
        SELECT COUNT(*) as count FROM assembly_attendances
        WHERE date = ? AND major_code = ? AND (status = 'present' OR status = 'late')
      `).get(today, m.major_code) as { count: number };
      const checkedIn = attCountRow.count || 0;
      const rate = m.student_count > 0 ? Math.round((checkedIn / m.student_count) * 100) : 0;
      return {
        major_code: m.major_code,
        major_name: m.major_name,
        total_students: m.student_count,
        checked_in: checkedIn,
        rate
      };
    }).sort((a, b) => b.rate - a.rate);

    res.json({
      today_date: today,
      total_students: totalStudents,
      today: {
        checked_in: todayCheckedIn,
        present: todayPresent,
        late: todayLate,
        leave: todayLeave,
        absent: todayAbsent,
        rate: todayRate
      },
      trend,
      department_rankings: departmentRankings
    });
  } catch (error) {
    console.error('Error fetching assembly dashboard summary:', error);
    res.status(500).json({ error: 'Failed to fetch assembly dashboard summary' });
  }
});

// 9. GET /api/assembly/attendance-daily (Admin daily attendance list)
app.get('/api/assembly/attendance-daily', (req, res) => {
  try {
    const { date, level, year, major_code, room } = req.query;
    const activeSem = getActiveSettings();
    const queryAcademicYear = (req.query.academic_year as string) || activeSem.academic_year;
    const queryTerm = (req.query.term as string) || activeSem.term;
    const todayDate = getBangkokDateOnly();
    const queryDate = (date as string) || todayDate;

    const settings = db.prepare('SELECT * FROM assembly_settings WHERE id = 1').get() as any;

    let studentQuery = `SELECT * FROM students WHERE academic_year = ? AND term = ?`;
    const studentParams: any[] = [queryAcademicYear, queryTerm];

    if (level) {
      studentQuery += ` AND level = ?`;
      studentParams.push(level);
    }
    if (year) {
      studentQuery += ` AND year = ?`;
      studentParams.push(year);
    }
    if (major_code) {
      studentQuery += ` AND major_code = ?`;
      studentParams.push(major_code);
    }
    if (room) {
      studentQuery += ` AND room = ?`;
      studentParams.push(room);
    }

    studentQuery += ` ORDER BY student_id ASC`;
    const students = db.prepare(studentQuery).all(...studentParams) as any[];

    // Fetch attendance records for this date
    const attendances = db.prepare(`
      SELECT * FROM assembly_attendances
      WHERE date = ? AND academic_year = ? AND term = ?
    `).all(queryDate, queryAcademicYear, queryTerm) as any[];

    const attMap = new Map<string, any>();
    for (const a of attendances) {
      attMap.set(a.student_id, a);
    }

    // Determine date status and classifications
    const isFuture = queryDate > todayDate;
    const isBeforeSemester = !!(settings?.start_date && queryDate < settings.start_date);
    const isAfterSemester = !!(settings?.end_date_type === 'specific' && settings?.end_date && queryDate > settings.end_date);

    // Day of week calculation
    const [qY, qM, qD] = queryDate.split('-').map(Number);
    const dateObj = new Date(qY, qM - 1, qD);
    let dayNum = dateObj.getDay();
    if (dayNum === 0) dayNum = 7; // Mon=1 ... Sun=7
    const activeDays = (settings?.active_days || '1,2,3,4,5').split(',').map((d: string) => parseInt(d.trim(), 10));
    const isNonActiveDay = !activeDays.includes(dayNum);

    // Holiday check
    const holiday = db.prepare('SELECT * FROM assembly_holidays WHERE date = ?').get(queryDate) as any;

    let dateCategory: 'normal' | 'future' | 'before_semester' | 'after_semester' | 'holiday' | 'weekend' = 'normal';
    let dateMessage = '';

    if (isFuture) {
      dateCategory = 'future';
      dateMessage = 'ยังไม่ถึงกำหนดวันเข้าแถว (วันในอนาคต)';
    } else if (isBeforeSemester) {
      dateCategory = 'before_semester';
      dateMessage = `ยังไม่ถึงกำหนดวันเริ่มต้นภาคเรียน (เริ่มวันที่ ${settings?.start_date || '-'})`;
    } else if (isAfterSemester) {
      dateCategory = 'after_semester';
      dateMessage = `สิ้นสุดภาคเรียนแล้ว (ปิดภาคเรียนวันที่ ${settings?.end_date || '-'})`;
    } else if (holiday) {
      dateCategory = 'holiday';
      dateMessage = `วันหยุดวิทยาลัย: ${holiday.title}`;
    } else if (isNonActiveDay) {
      dateCategory = 'weekend';
      dateMessage = 'วันหยุดประจำสัปดาห์ (ไม่มีการจัดกิจกรรมเข้าแถว)';
    }

    let defaultStatus = 'absent';
    if (dateCategory === 'future') defaultStatus = 'not_reached';
    else if (dateCategory === 'before_semester') defaultStatus = 'before_term';
    else if (dateCategory === 'after_semester') defaultStatus = 'after_term';
    else if (dateCategory === 'holiday') defaultStatus = 'holiday';
    else if (dateCategory === 'weekend') defaultStatus = 'weekend';

    const list = students.map(s => {
      const att = attMap.get(s.student_id);
      return {
        ...s,
        status: att ? att.status : defaultStatus,
        attended_at: att ? att.attended_at : null,
        photo_path: att ? att.photo_path : null,
        remark: att ? att.remark : (dateMessage ? dateMessage : ''),
        matched_location: att ? att.matched_location : null
      };
    });

    const presentCount = list.filter(s => s.status === 'present').length;
    const lateCount = list.filter(s => s.status === 'late').length;
    const leaveCount = list.filter(s => s.status === 'leave').length;
    // Only count as absent if it is a normal assembly day in the past/today
    const absentCount = dateCategory === 'normal' 
      ? list.filter(s => s.status === 'absent').length 
      : 0;
    const total = list.length;
    const rate = (total > 0 && dateCategory === 'normal') 
      ? Math.round(((presentCount + lateCount) / total) * 100) 
      : (presentCount + lateCount > 0 ? Math.round(((presentCount + lateCount) / total) * 100) : 0);

    // Latest date with checkins
    const latestAttRow = db.prepare(`
      SELECT date FROM assembly_attendances
      WHERE academic_year = ? AND term = ?
      ORDER BY date DESC LIMIT 1
    `).get(queryAcademicYear, queryTerm) as any;
    const latestRecordDate = latestAttRow ? latestAttRow.date : null;

    res.json({
      date: queryDate,
      students: list,
      date_category: dateCategory,
      date_message: dateMessage,
      latest_record_date: latestRecordDate,
      summary: {
        total,
        present: presentCount,
        late: lateCount,
        leave: leaveCount,
        absent: absentCount,
        rate
      }
    });
  } catch (error) {
    console.error('Error fetching daily assembly attendance:', error);
    res.status(500).json({ error: 'Failed to fetch daily assembly attendance' });
  }
});

// 10. GET /api/assembly/attendance-matrix (Admin weekly/monthly/semester matrix)
app.get('/api/assembly/attendance-matrix', (req, res) => {
  try {
    const { start_date, end_date, level, year, major_code, room } = req.query;
    const activeSem = getActiveSettings();

    let studentQuery = `SELECT * FROM students WHERE academic_year = ? AND term = ?`;
    const studentParams: any[] = [activeSem.academic_year, activeSem.term];

    if (level) { studentQuery += ` AND level = ?`; studentParams.push(level); }
    if (year) { studentQuery += ` AND year = ?`; studentParams.push(year); }
    if (major_code) { studentQuery += ` AND major_code = ?`; studentParams.push(major_code); }
    if (room) { studentQuery += ` AND room = ?`; studentParams.push(room); }
    studentQuery += ` ORDER BY student_id ASC`;

    const students = db.prepare(studentQuery).all(...studentParams) as any[];

    // Fetch dates
    let dateQuery = `SELECT DISTINCT date FROM assembly_attendances WHERE academic_year = ? AND term = ?`;
    const dateParams: any[] = [activeSem.academic_year, activeSem.term];

    if (start_date && end_date) {
      dateQuery += ` AND date >= ? AND date <= ?`;
      dateParams.push(start_date, end_date);
    }
    dateQuery += ` ORDER BY date ASC`;

    const distinctDates = db.prepare(dateQuery).all(...dateParams) as { date: string }[];
    const dates = distinctDates.map(d => d.date);

    // Fetch all attendance rows in this range
    let attQuery = `SELECT * FROM assembly_attendances WHERE academic_year = ? AND term = ?`;
    const attParams: any[] = [activeSem.academic_year, activeSem.term];
    if (start_date && end_date) {
      attQuery += ` AND date >= ? AND date <= ?`;
      attParams.push(start_date, end_date);
    }

    const attendances = db.prepare(attQuery).all(...attParams) as any[];
    const attLookup: Record<string, Record<string, any>> = {};
    for (const a of attendances) {
      if (!attLookup[a.student_id]) attLookup[a.student_id] = {};
      attLookup[a.student_id][a.date] = {
        status: a.status,
        attended_at: a.attended_at,
        photo_path: a.photo_path,
        remark: a.remark
      };
    }

    const matrix = students.map(s => {
      const records = attLookup[s.student_id] || {};
      let presentCount = 0;
      let lateCount = 0;
      let leaveCount = 0;

      for (const d of dates) {
        const item = records[d];
        if (item) {
          if (item.status === 'present') presentCount++;
          else if (item.status === 'late') lateCount++;
          else if (item.status === 'leave') leaveCount++;
        }
      }

      const totalAttended = presentCount + lateCount;
      const totalDays = dates.length;
      const absentCount = Math.max(0, totalDays - totalAttended - leaveCount);
      const rate = totalDays > 0 ? Math.round((totalAttended / totalDays) * 100) : 0;

      return {
        ...s,
        attendance: records,
        stats: {
          totalDays,
          present: presentCount,
          late: lateCount,
          leave: leaveCount,
          absent: absentCount,
          rate
        }
      };
    });

    res.json({
      dates,
      students: matrix
    });
  } catch (error) {
    console.error('Error fetching assembly attendance matrix:', error);
    res.status(500).json({ error: 'Failed to fetch assembly attendance matrix' });
  }
});

// 11. POST /api/assembly/update-status (Admin manual update of status/remark)
app.post('/api/assembly/update-status', (req, res) => {
  try {
    const { student_id, date, status, remark } = req.body;
    if (!student_id || !date || !status) {
      return res.status(400).json({ error: 'กรุณาระบุ student_id, date และ status' });
    }

    const activeSem = getActiveSettings();
    const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(student_id) as any;
    if (!student) {
      return res.status(404).json({ error: 'ไม่พบนักศึกษา' });
    }

    const todaySession = getOrCreateTodayAssemblySession();
    const existing = db.prepare('SELECT id FROM assembly_attendances WHERE date = ? AND student_id = ?').get(date, student_id) as any;

    if (status === 'absent') {
      if (existing) {
        db.prepare('DELETE FROM assembly_attendances WHERE id = ?').run(existing.id);
      }
      return res.json({ success: true, status: 'absent' });
    }

    if (existing) {
      db.prepare(`
        UPDATE assembly_attendances SET
          status = ?,
          remark = COALESCE(?, remark)
        WHERE id = ?
      `).run(status, remark !== undefined ? remark : null, existing.id);
    } else {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO assembly_attendances (
          assembly_session_id, date, student_id, prefix, first_name, last_name,
          level, year, major_name, major_code, room, status, remark, attended_at,
          academic_year, term, matched_location
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        todaySession.id,
        date,
        student_id,
        student.prefix || '',
        student.first_name,
        student.last_name,
        student.level || 'ปวช',
        student.year || '1',
        student.major_name || '',
        student.major_code || '',
        student.room || '1',
        status,
        remark || '',
        now,
        activeSem.academic_year,
        activeSem.term,
        'บันทึกโดยแอดมิน'
      );
    }

    res.json({ success: true, status });
  } catch (error) {
    console.error('Error updating assembly status:', error);
    res.status(500).json({ error: 'Failed to update assembly status' });
  }
});

// 12. GET /api/assembly/report-export (Admin export CSV)
app.get('/api/assembly/report-export', (req, res) => {
  try {
    const { start_date, end_date, level, year, major_code, room } = req.query;
    const activeSem = getActiveSettings();

    let studentQuery = `SELECT * FROM students WHERE academic_year = ? AND term = ?`;
    const studentParams: any[] = [activeSem.academic_year, activeSem.term];
    if (level) { studentQuery += ` AND level = ?`; studentParams.push(level); }
    if (year) { studentQuery += ` AND year = ?`; studentParams.push(year); }
    if (major_code) { studentQuery += ` AND major_code = ?`; studentParams.push(major_code); }
    if (room) { studentQuery += ` AND room = ?`; studentParams.push(room); }
    studentQuery += ` ORDER BY student_id ASC`;

    const students = db.prepare(studentQuery).all(...studentParams) as any[];

    let dateQuery = `SELECT DISTINCT date FROM assembly_attendances WHERE academic_year = ? AND term = ?`;
    const dateParams: any[] = [activeSem.academic_year, activeSem.term];
    if (start_date && end_date) {
      dateQuery += ` AND date >= ? AND date <= ?`;
      dateParams.push(start_date, end_date);
    }
    dateQuery += ` ORDER BY date ASC`;
    const dates = (db.prepare(dateQuery).all(...dateParams) as { date: string }[]).map(d => d.date);

    let attQuery = `SELECT * FROM assembly_attendances WHERE academic_year = ? AND term = ?`;
    const attParams: any[] = [activeSem.academic_year, activeSem.term];
    if (start_date && end_date) {
      attQuery += ` AND date >= ? AND date <= ?`;
      attParams.push(start_date, end_date);
    }
    const attendances = db.prepare(attQuery).all(...attParams) as any[];
    const attLookup: Record<string, Record<string, string>> = {};
    for (const a of attendances) {
      if (!attLookup[a.student_id]) attLookup[a.student_id] = {};
      attLookup[a.student_id][a.date] = a.status;
    }

    // Build CSV with UTF-8 BOM
    const headers = ['ลำดับ', 'รหัสนักศึกษา', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'ระดับชั้น', 'ปี', 'สาขา', 'ห้อง', ...dates, 'มา', 'สาย', 'ลา', 'ขาด', 'ร้อยละ', 'ผลประเมิน'];
    const rows = [headers];

    students.forEach((s, idx) => {
      const records = attLookup[s.student_id] || {};
      let pres = 0;
      let late = 0;
      let leave = 0;
      const dateCols = dates.map(d => {
        const st = records[d];
        if (st === 'present') { pres++; return 'มา'; }
        if (st === 'late') { late++; return 'สาย'; }
        if (st === 'leave') { leave++; return 'ลา'; }
        return 'ขาด';
      });

      const attended = pres + late;
      const total = dates.length;
      const absent = Math.max(0, total - attended - leave);
      const rate = total > 0 ? Math.round((attended / total) * 100) : 0;
      const pass = rate >= 80 ? 'ผ่าน' : 'ไม่ผ่าน';

      rows.push([
        (idx + 1).toString(),
        s.student_id,
        s.prefix || '',
        s.first_name,
        s.last_name,
        s.level,
        s.year,
        s.major_code,
        s.room,
        ...dateCols,
        pres.toString(),
        late.toString(),
        leave.toString(),
        absent.toString(),
        `${rate}%`,
        pass
      ]);
    });

    const csvContent = '\uFEFF' + rows.map(r => r.map(c => `"${(c || '').toString().replace(/"/g, '""')}"`).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=assembly_report_${getBangkokDateOnly()}.csv`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting assembly CSV report:', error);
    res.status(500).json({ error: 'Failed to export CSV report' });
  }
});

// 13. GET /api/assembly/systemlogs (Assembly System Logs with Fraud & Multi-scan Flagging)
app.get('/api/assembly/systemlogs', (req, res) => {
  try {
    const activeSem = getActiveSettings();
    const queryAcademicYear = (req.query.academic_year as string) || activeSem.academic_year;
    const queryTerm = (req.query.term as string) || activeSem.term;
    const queryDate = req.query.date as string;

    let sql = `
      SELECT * FROM assembly_attendances
      WHERE academic_year = ? AND term = ?
    `;
    const params: any[] = [queryAcademicYear, queryTerm];
    if (queryDate) {
      sql += ` AND date = ?`;
      params.push(queryDate);
    }
    sql += ` ORDER BY attended_at DESC`;

    const logs = db.prepare(sql).all(...params) as any[];

    // Calculate flagging logic
    // A record is flagged if:
    // 1. Same date, same non-empty device_uuid or hardware_fingerprint, but different student_id
    // 2. Same date, same non-empty ip_address, different student_id, and check-in times within 3 minutes (180,000 ms)
    const windowMs = 3 * 60 * 1000;

    const processedLogs = logs.map((log) => {
      const currentLogTime = new Date(log.attended_at).getTime();

      const matches = logs.filter((other) => {
        if (other.id === log.id) return false;
        if (other.date !== log.date) return false;
        if (other.student_id === log.student_id) return false;

        // Device UUID match
        if (log.device_uuid && other.device_uuid && log.device_uuid === other.device_uuid) {
          return true;
        }

        // Hardware Fingerprint match
        if (log.hardware_fingerprint && other.hardware_fingerprint && log.hardware_fingerprint === other.hardware_fingerprint) {
          return true;
        }

        // IP address match within time window
        if (log.ip_address && other.ip_address && log.ip_address === other.ip_address) {
          const otherLogTime = new Date(other.attended_at).getTime();
          if (Math.abs(currentLogTime - otherLogTime) <= windowMs) {
            return true;
          }
        }

        return false;
      });

      return {
        ...log,
        is_flagged: matches.length > 0,
        flagged_count: matches.length,
        flagged_details: matches.map(m => {
          let reason = 'พบการใช้งานซ้ำซ้อน';
          if (log.device_uuid && log.device_uuid === m.device_uuid) {
            reason = 'ใช้อุปกรณ์เครื่องเดียวกัน (Device UUID)';
          } else if (log.hardware_fingerprint && log.hardware_fingerprint === m.hardware_fingerprint) {
            reason = 'ลายนิ้วมือเครื่องเดียวกัน (Fingerprint)';
          } else if (log.ip_address && log.ip_address === m.ip_address) {
            reason = 'IP เดียวกันในเวลาใกล้เคียงกัน';
          }
          return {
            student_id: m.student_id,
            name: `${m.prefix || ''}${m.first_name} ${m.last_name}`,
            attended_at: m.attended_at,
            reason
          };
        })
      };
    });

    res.json(processedLogs);
  } catch (error) {
    console.error('Error fetching assembly system logs:', error);
    res.status(500).json({ error: 'Failed to fetch assembly system logs' });
  }
});

// 14. GET /api/assembly/rejections (Assembly Rejection Logs)
app.get('/api/assembly/rejections', (req, res) => {
  try {
    const activeSem = getActiveSettings();
    const queryAcademicYear = (req.query.academic_year as string) || activeSem.academic_year;
    const queryTerm = (req.query.term as string) || activeSem.term;
    const queryDate = req.query.date as string;

    let sql = `
      SELECT * FROM assembly_rejections
      WHERE academic_year = ? AND term = ?
    `;
    const params: any[] = [queryAcademicYear, queryTerm];
    if (queryDate) {
      sql += ` AND date = ?`;
      params.push(queryDate);
    }
    sql += ` ORDER BY rejected_at DESC`;

    const records = db.prepare(sql).all(...params);
    res.json(records);
  } catch (error) {
    console.error('Error fetching assembly rejections:', error);
    res.status(500).json({ error: 'Failed to fetch assembly rejections' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

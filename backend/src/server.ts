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
const PORT = process.env.PORT || 5000;

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
app.use(express.json());

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
    (path.startsWith('/api/attendance-rejections') && !path.endsWith('/log-attempt'));

  if (isAdminPath) {
    const pin = req.header('X-Admin-Pin');
    if (!pin || !safeCompare(pin, ADMIN_PIN)) {
      return res.status(401).json({ error: 'ไม่พบสิทธิ์การใช้งานของแอดมินหรือรหัส PIN ไม่ถูกต้อง' });
    }
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

  if (!pin) {
    return res.status(400).json({ error: 'กรุณากรอกรหัส PIN' });
  }

  if (safeCompare(pin, ADMIN_PIN)) {
    res.json({ success: true });
  } else {
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
        exportData[table] = db.prepare(`SELECT * FROM ${table}`).all();
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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

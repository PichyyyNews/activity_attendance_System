import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { google } from 'googleapis';
import db from './db';

// Load environment variables from root workspace .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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
        const thaiTimeMs = gmtTime.getTime() + (7 * 60 * 60 * 1000);
        const thaiDate = new Date(thaiTimeMs);
        return thaiDate.toISOString().replace('Z', '+07:00');
      }
    }
  } catch (err: any) {
    console.warn('Google Date header sync failed:', err.message || err);
  }

  // 4. Final fallback to local system time (adjusted to UTC+7)
  const now = new Date();
  const tzOffset = 7 * 60; // UTC+7
  const localTime = new Date(now.getTime() + (tzOffset + now.getTimezoneOffset()) * 60000);
  return localTime.toISOString().replace('Z', '+07:00');
}

// Helper function to sync attendance row to Google Sheets
async function syncToGoogleSheets(
  session: { week_number: number; title: string }, 
  attendance: { student_id: string; prefix?: string; first_name: string; last_name: string; class_year: string; major_code: string; room: string; attended_at?: string }
) {
  try {
    const stmt = db.prepare('SELECT * FROM settings WHERE id = 1');
    const settings = stmt.get() as { sheet_id: string; credentials_json: string } | undefined;

    if (!settings || !settings.sheet_id || !settings.credentials_json) {
      console.log('Google Sheets sync skipped: settings not fully configured.');
      return;
    }

    const credentials = JSON.parse(settings.credentials_json);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
    const auth = google.auth.fromJSON(credentials);
    auth.scopes = ['https://www.googleapis.com/auth/spreadsheets'];

    const sheets = google.sheets({ version: 'v4', auth });
    
    // Values to append: Week, Title, Student ID, Prefix, First Name, Last Name, Class Year, Major Code, Room, Timestamp
    const values = [[
      `Week ${session.week_number}`,
      session.title,
      attendance.student_id,
      attendance.prefix || '',
      attendance.first_name,
      attendance.last_name,
      attendance.class_year,
      attendance.major_code,
      attendance.room,
      new Date(attendance.attended_at || new Date()).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: settings.sheet_id,
      range: 'A:J',
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

// Settings CRUD
app.get('/api/settings', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM settings WHERE id = 1');
    const settings = stmt.get();
    res.json(settings || { sheet_id: '', credentials_json: '' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.post('/api/settings', (req, res) => {
  const { sheet_id, credentials_json } = req.body;
  try {
    const stmt = db.prepare(`
      INSERT INTO settings (id, sheet_id, credentials_json) 
      VALUES (1, ?, ?) 
      ON CONFLICT(id) DO UPDATE SET 
      sheet_id = excluded.sheet_id, 
      credentials_json = excluded.credentials_json
    `);
    stmt.run(sheet_id || '', credentials_json || '');
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Majors CRUD
app.get('/api/majors', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM majors ORDER BY class_year ASC, major_code ASC, room ASC');
    const list = stmt.all();
    res.json(list);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch majors' });
  }
});

app.post('/api/majors', (req, res) => {
  const { class_year, major_code, room } = req.body;
  if (!class_year || !major_code || !room) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  try {
    const stmt = db.prepare('INSERT INTO majors (class_year, major_code, room) VALUES (?, ?, ?)');
    const result = stmt.run(class_year.trim(), major_code.trim().toUpperCase(), room.trim());
    res.json({ id: result.lastInsertRowid, class_year: class_year.trim(), major_code: major_code.trim().toUpperCase(), room: room.trim() });
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'สาขาวิชา/ห้องเรียนนี้มีอยู่ในระบบแล้ว' });
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
    const stmt = db.prepare('SELECT * FROM sessions ORDER BY week_number ASC');
    const list = stmt.all();
    res.json(list);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
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
  const { week_number, title, date, close_at } = req.body;
  if (!week_number || !title || !date) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  try {
    const stmt = db.prepare('INSERT INTO sessions (week_number, title, date, close_at) VALUES (?, ?, ?, ?)');
    const result = stmt.run(week_number, title, date, close_at || null);
    res.json({ id: result.lastInsertRowid, week_number, title, date, close_at: close_at || null });
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
  const { week_number, title, date, close_at } = req.body;
  if (!week_number || !title || !date) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  try {
    const stmt = db.prepare('UPDATE sessions SET week_number = ?, title = ?, date = ?, close_at = ? WHERE id = ?');
    const result = stmt.run(week_number, title, date, close_at || null, id);
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

// Attendance CRUD
app.post('/api/attendances', async (req, res) => {
  const { session_id, prefix, first_name, last_name, student_id, class_year, major_code, room } = req.body;
  
  if (!session_id || !prefix || !first_name || !last_name || !student_id || !class_year || !major_code || !room) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  // Validate student ID: exactly 11 digits
  if (!/^\d{11}$/.test(student_id)) {
    return res.status(400).json({ error: 'รหัสนักศึกษาต้องเป็นตัวเลข 11 หลักเท่านั้น' });
  }

  try {
    // Check if session exists and is active/not expired
    const sessionStmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
    const session = sessionStmt.get(session_id) as { id: number; week_number: number; title: string; date: string; is_active: number; close_at: string | null } | undefined;

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

    // Check duplicate check-in
    const duplicateStmt = db.prepare('SELECT id FROM attendances WHERE session_id = ? AND student_id = ?');
    if (duplicateStmt.get(session_id, student_id)) {
      return res.status(400).json({ error: 'คุณได้เช็กชื่อเข้าร่วมคาบกิจกรรมสัปดาห์นี้ไปแล้ว' });
    }

    // Insert attendance
    const insertStmt = db.prepare(`
      INSERT INTO attendances (session_id, prefix, first_name, last_name, student_id, major, class_year, major_code, room, attended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insertStmt.run(
      session_id, 
      prefix.trim(), 
      first_name.trim(), 
      last_name.trim(), 
      student_id, 
      `${class_year.trim()}${major_code.trim().toUpperCase()}${room.trim()}`,
      class_year.trim(), 
      major_code.trim().toUpperCase(), 
      room.trim(),
      attendedAt
    );
    
    const attendanceRecord = {
      id: result.lastInsertRowid,
      session_id,
      prefix: prefix.trim(),
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      student_id,
      class_year: class_year.trim(),
      major_code: major_code.trim().toUpperCase(),
      room: room.trim(),
      attended_at: attendedAt
    };

    // Trigger async sync to Google Sheets
    syncToGoogleSheets(session, attendanceRecord);

    res.json({ success: true, attendance: attendanceRecord });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to record attendance' });
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

// Update a specific attendance record
app.put('/api/attendances/:id', (req, res) => {
  const { id } = req.params;
  const { prefix, first_name, last_name, student_id, class_year, major_code, room } = req.body;

  if (!prefix || !first_name || !last_name || !student_id || !class_year || !major_code || !room) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  if (!/^\d{11}$/.test(student_id)) {
    return res.status(400).json({ error: 'รหัสนักศึกษาต้องเป็นตัวเลข 11 หลักเท่านั้น' });
  }

  try {
    const stmt = db.prepare(`
      UPDATE attendances 
      SET prefix = ?, first_name = ?, last_name = ?, student_id = ?, major = ?, class_year = ?, major_code = ?, room = ?
      WHERE id = ?
    `);
    const result = stmt.run(
      prefix.trim(),
      first_name.trim(),
      last_name.trim(),
      student_id,
      `${class_year.trim()}${major_code.trim().toUpperCase()}${room.trim()}`,
      class_year.trim(),
      major_code.trim().toUpperCase(),
      room.trim(),
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

// Search student attendance history
app.get('/api/attendances/recent', (req, res) => {
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
        s.week_number, 
        s.title as session_title
      FROM attendances a
      JOIN sessions s ON a.session_id = s.id
      ORDER BY a.attended_at DESC
      LIMIT 10
    `);
    const records = stmt.all();
    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch recent attendances' });
  }
});

app.get('/api/attendances/student/:studentId', (req, res) => {
  const { studentId } = req.params;
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
        s.week_number, 
        s.title as session_title, 
        s.date as session_date 
      FROM attendances a 
      JOIN sessions s ON a.session_id = s.id 
      WHERE a.student_id = ? 
      ORDER BY s.week_number ASC
    `);
    const records = stmt.all(studentId);
    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch student attendance' });
  }
});

// Stats overview
app.get('/api/stats', (req, res) => {
  try {
    const totalSessions = (db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number }).count;
    const totalAttendances = (db.prepare('SELECT COUNT(*) as count FROM attendances').get() as { count: number }).count;
    
    // Check if Sheets is connected
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as { sheet_id: string; credentials_json: string } | undefined;
    const isSheetsConnected = !!(settings && settings.sheet_id && settings.credentials_json);

    res.json({
      totalSessions,
      totalAttendances,
      isSheetsConnected
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch stats' });
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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

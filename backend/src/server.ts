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

    const rawSheetId = settings.sheet_id;
    const sheetIdMatch = rawSheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const sheetId = sheetIdMatch ? sheetIdMatch[1] : rawSheetId.trim();

    const credentials = JSON.parse(settings.credentials_json);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
    const auth = google.auth.fromJSON(credentials) as any;
    auth.scopes = ['https://www.googleapis.com/auth/spreadsheets'];

    const sheets = google.sheets({ version: 'v4', auth: auth as any });
    
    // Check if sheet already has header row (row 1)
    let hasHeaders = false;
    try {
      const checkRes = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'A1:J1'
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
        'สัปดาห์ที่',
        'หัวข้อกิจกรรม',
        'รหัสนักศึกษา',
        'คำนำหน้า',
        'ชื่อจริง',
        'นามสกุล',
        'ชั้นปี',
        'สาขาวิชา',
        'ห้องเรียน',
        'เวลาเช็กชื่อ'
      ]);
    }

    // Values to append: Week, Title, Student ID, Prefix, First Name, Last Name, Class Year, Major Code, Room, Timestamp
    values.push([
      session.week_number,
      session.title,
      attendance.student_id,
      attendance.prefix || '',
      attendance.first_name,
      attendance.last_name,
      attendance.class_year,
      attendance.major_code,
      attendance.room,
      new Date(attendance.attended_at || new Date()).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
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
  const sheetIdMatch = (sheet_id || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const cleanSheetId = sheetIdMatch ? sheetIdMatch[1] : (sheet_id || '').trim();
  try {
    const stmt = db.prepare(`
      INSERT INTO settings (id, sheet_id, credentials_json) 
      VALUES (1, ?, ?) 
      ON CONFLICT(id) DO UPDATE SET 
      sheet_id = excluded.sheet_id, 
      credentials_json = excluded.credentials_json
    `);
    stmt.run(cleanSheetId, credentials_json || '');
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
    const totalStudents = (db.prepare('SELECT COUNT(*) as count FROM students').get() as { count: number }).count;
    
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
  try {
    const sessionIdQuery = req.query.sessionId;
    const classYear = req.query.classYear as string || '';
    const majorCode = req.query.majorCode as string || '';
    const room = req.query.room as string || '';
    const gender = req.query.gender as string || '';

    // 1. Fetch all sessions for selection dropdown
    const allSessions = db.prepare('SELECT id, week_number, title, date, is_active, close_at FROM sessions ORDER BY week_number ASC').all() as any[];

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
        const activeSession = db.prepare('SELECT id FROM sessions WHERE is_active = 1 ORDER BY date DESC, id DESC LIMIT 1').get() as { id: number } | undefined;
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

    if (classYear) {
      baseFilterSql += ' AND class_year = ?';
      baseFilterParams.push(classYear);
    }
    if (majorCode) {
      baseFilterSql += ' AND major_code = ?';
      baseFilterParams.push(majorCode);
    }
    if (room) {
      baseFilterSql += ' AND room = ?';
      baseFilterParams.push(room);
    }

    // Full filters (including gender filter)
    let filterSql = baseFilterSql;
    const filterParams = [...baseFilterParams];
    if (gender === 'male') {
      filterSql += " AND (prefix = 'นาย' OR prefix = 'เด็กชาย' OR prefix = 'ด.ช.' OR prefix = 'ด.ช')";
    } else if (gender === 'female') {
      filterSql += " AND (prefix != 'นาย' AND prefix != 'เด็กชาย' AND prefix != 'ด.ช.' AND prefix != 'ด.ช')";
    }

    // 2. Fetch expected students from roster (with full filters)
    const rosterStmt = db.prepare(`SELECT * FROM students WHERE 1=1 ${filterSql} ORDER BY student_id ASC`);
    const expectedStudents = rosterStmt.all(...filterParams) as any[];

    // 3. Fetch present students checked in
    let presentList: any[] = [];
    if (targetSessionId === 'all') {
      let attFilterSql = filterSql.replace(/(class_year|major_code|room|prefix)/g, 'a.$1');
      const presentStmt = db.prepare(`
        SELECT a.*, s.week_number, s.title as session_title 
        FROM attendances a
        JOIN sessions s ON a.session_id = s.id
        WHERE 1=1 ${attFilterSql} 
        ORDER BY a.attended_at DESC
      `);
      presentList = presentStmt.all(...filterParams) as any[];
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
          WHERE 1=1 ${filterSql} 
            AND s.student_id NOT IN (
              SELECT student_id FROM attendances WHERE session_id = ?
            )
        `);
        const sessionAbsents = sessionAbsentStmt.all(...filterParams, session.id, session.week_number, session.title, session.id) as any[];
        absentList.push(...sessionAbsents);
      }
      absentList.sort((a, b) => a.student_id.localeCompare(b.student_id) || a.week_number - b.week_number);
    } else {
      const absentStmt = db.prepare(`
        SELECT * FROM students 
        WHERE 1=1 ${filterSql} 
          AND student_id NOT IN (
            SELECT student_id FROM attendances WHERE session_id = ?
          )
        ORDER BY student_id ASC
      `);
      absentList = absentStmt.all(...filterParams, targetSessionId) as any[];
    }
    const totalAbsent = absentList.length;

    // Adjust totalExpected to include both check-ins and absent roster students (preventing > 100% rate)
    const totalExpected = totalPresent + totalAbsent;
    const attendanceRate = totalExpected > 0 ? Math.round((totalPresent / totalExpected) * 100) : 0;

    // 5. Weekly trend statistics (last 6 sessions) - uses full filters
    const trendSessions = allSessions.slice(-6);
    const weeklyTrend = trendSessions.map(s => {
      const presCount = db.prepare(`SELECT COUNT(*) as count FROM attendances WHERE session_id = ? ${filterSql}`).get(s.id, ...filterParams) as { count: number };
      const absCount = db.prepare(`
        SELECT COUNT(*) as count FROM students 
        WHERE 1=1 ${filterSql} 
          AND student_id NOT IN (
            SELECT student_id FROM attendances WHERE session_id = ?
          )
      `).get(...filterParams, s.id) as { count: number };
      
      const totalExp = presCount.count + absCount.count;
      const rate = totalExp > 0 ? Math.round((presCount.count / totalExp) * 100) : 0;
      return {
        sessionId: s.id,
        weekNumber: s.week_number,
        title: s.title,
        rate
      };
    });

    // 6. Stats by Class Group (class_year + major_code + room, e.g. 1ชทค1, 2สทค3) for the selected session
    const classGroups = db.prepare(`
      SELECT DISTINCT class_year, major_code, room FROM students
      UNION
      SELECT class_year, major_code, room FROM majors
      ORDER BY class_year ASC, major_code ASC, room ASC
    `).all() as Array<{ class_year: string; major_code: string; room: string }>;

    const roomStats = classGroups.map(g => {
      const gLabel = `${g.class_year}${g.major_code}${g.room}`;
      
      let gFilterSql = ' AND class_year = ? AND major_code = ? AND room = ?';
      const gFilterParams = [g.class_year, g.major_code, g.room];

      if (gender === 'male') {
        gFilterSql += " AND (prefix = 'นาย' OR prefix = 'เด็กชาย' OR prefix = 'ด.ช.' OR prefix = 'ด.ช')";
      } else if (gender === 'female') {
        gFilterSql += " AND (prefix != 'นาย' AND prefix != 'เด็กชาย' AND prefix != 'ด.ช.' AND prefix != 'ด.ช')";
      }

      let gPresentCount = 0;
      let gAbsentCount = 0;

      if (targetSessionId === 'all') {
        const pres = db.prepare(`SELECT COUNT(*) as count FROM attendances WHERE 1=1 ${gFilterSql}`).get(...gFilterParams) as { count: number };
        gPresentCount = pres.count;

        for (const session of allSessions) {
          const abs = db.prepare(`
            SELECT COUNT(*) as count FROM students 
            WHERE 1=1 ${gFilterSql} 
              AND student_id NOT IN (
                SELECT student_id FROM attendances WHERE session_id = ?
              )
          `).get(...gFilterParams, session.id) as { count: number };
          gAbsentCount += abs.count;
        }
      } else {
        const pres = db.prepare(`SELECT COUNT(*) as count FROM attendances WHERE session_id = ? ${gFilterSql}`).get(targetSessionId, ...gFilterParams) as { count: number };
        gPresentCount = pres.count;

        const abs = db.prepare(`
          SELECT COUNT(*) as count FROM students 
          WHERE 1=1 ${gFilterSql} 
            AND student_id NOT IN (
              SELECT student_id FROM attendances WHERE session_id = ?
            )
        `).get(...gFilterParams, targetSessionId) as { count: number };
        gAbsentCount = abs.count;
      }

      const gExpected = gPresentCount + gAbsentCount;

      return {
        room: gLabel,
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
        const roundedMinutes = Math.floor(minute / 10) * 10;
        const key = `${hour.toString().padStart(2, '0')}:${roundedMinutes.toString().padStart(2, '0')} น.`;
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
      roomStats,
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
  const { search, class_year, major_code, room } = req.query;
  try {
    let query = 'SELECT * FROM students WHERE 1=1';
    const params: any[] = [];
    
    if (search) {
      query += ' AND (student_id LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
    }
    
    if (class_year) {
      query += ' AND class_year = ?';
      params.push(class_year);
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
  try {
    const stmt = db.prepare('SELECT * FROM students WHERE student_id = ?');
    const student = stmt.get(studentId);
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
  const { class_year, major_code, room, student_ids, student_names } = req.body;
  
  if (!class_year || !major_code || !room || !student_ids || !student_names) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  
  const ids = student_ids.split('\n').map((line: string) => line.trim()).filter(Boolean);
  const names = student_names.split('\n').map((line: string) => line.trim()).filter(Boolean);
  
  if (ids.length !== names.length) {
    return res.status(400).json({ error: `จำนวนรายการไม่เท่ากัน: รหัสนักศึกษามี ${ids.length} รายการ แต่รายชื่อมี ${names.length} รายการ` });
  }
  
  try {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO students (student_id, prefix, first_name, last_name, class_year, major_code, room)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const runTransaction = db.transaction((dataList: any[]) => {
      for (const data of dataList) {
        insertStmt.run(
          data.student_id,
          data.prefix,
          data.first_name,
          data.last_name,
          data.class_year,
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
        class_year: class_year.trim(),
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
  const { student_id, prefix, first_name, last_name, class_year, major_code, room } = req.body;

  if (!student_id || !prefix || !first_name || !last_name || !class_year || !major_code || !room) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }

  if (!/^\d{11}$/.test(student_id)) {
    return res.status(400).json({ error: 'รหัสนักศึกษาต้องเป็นตัวเลข 11 หลักเท่านั้น' });
  }

  try {
    const checkStmt = db.prepare('SELECT id FROM students WHERE student_id = ? AND id != ?');
    const existing = checkStmt.get(student_id, id);
    if (existing) {
      return res.status(400).json({ error: 'รหัสนักศึกษานี้ถูกใช้งานโดยนักศึกษาคนอื่นในระบบแล้ว' });
    }

    const stmt = db.prepare(`
      UPDATE students 
      SET student_id = ?, prefix = ?, first_name = ?, last_name = ?, class_year = ?, major_code = ?, room = ?
      WHERE id = ?
    `);
    stmt.run(student_id, prefix, first_name, last_name, class_year, major_code, room, id);
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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

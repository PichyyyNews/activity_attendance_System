import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'database.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Drop old majors table if it contains old schema (missing level column)
try {
  const tableInfo = db.prepare("PRAGMA table_info(majors)").all() as any[];
  const hasLevel = tableInfo.some(col => col.name === 'level');
  if (tableInfo.length > 0 && !hasLevel) {
    db.exec("DROP TABLE majors;");
    console.log("Database Migration: Dropped old majors table for schema upgrade.");
  }
} catch (e) {
  // majors table might not exist yet, which is fine
}

// Drop old students table if it contains old schema (missing academic_year column)
try {
  const tableInfo = db.prepare("PRAGMA table_info(students)").all() as any[];
  const hasAcademicYear = tableInfo.some(col => col.name === 'academic_year');
  if (tableInfo.length > 0 && !hasAcademicYear) {
    db.exec("DROP TABLE students;");
    console.log("Database Migration: Dropped old students table for schema upgrade.");
  }
} catch (e) {
  // students table might not exist yet, which is fine
}

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    sheet_id TEXT,
    credentials_json TEXT,
    academic_year TEXT DEFAULT '2569',
    term TEXT DEFAULT '1'
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    close_at TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    academic_year TEXT DEFAULT '2569',
    term TEXT DEFAULT '1',
    token TEXT,
    latitude REAL DEFAULT NULL,
    longitude REAL DEFAULT NULL,
    radius INTEGER DEFAULT 500
  );

  CREATE TABLE IF NOT EXISTS attendances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    prefix TEXT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    student_id TEXT NOT NULL,
    major TEXT,
    class_year TEXT,
    major_code TEXT,
    room TEXT,
    attended_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    academic_year TEXT DEFAULT '2569',
    term TEXT DEFAULT '1',
    level TEXT DEFAULT 'ปวช',
    year TEXT,
    major_name TEXT,
    device_uuid TEXT,
    latitude REAL DEFAULT NULL,
    longitude REAL DEFAULT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions (id)
  );

  CREATE TABLE IF NOT EXISTS majors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    academic_year TEXT NOT NULL,
    term TEXT NOT NULL,
    level TEXT NOT NULL,
    year TEXT NOT NULL,
    major_name TEXT NOT NULL,
    major_code TEXT NOT NULL,
    room TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(academic_year, term, level, year, major_code, room)
  );

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    prefix TEXT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    term TEXT NOT NULL,
    level TEXT NOT NULL,
    year TEXT NOT NULL,
    major_name TEXT NOT NULL,
    major_code TEXT NOT NULL,
    room TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, academic_year, term)
  );

  CREATE TABLE IF NOT EXISTS academic_years (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year TEXT NOT NULL,
    term TEXT NOT NULL DEFAULT '1',
    is_active INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(year, term)
  );

  CREATE TABLE IF NOT EXISTS attendance_remarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    student_id TEXT NOT NULL,
    remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, student_id),
    FOREIGN KEY (session_id) REFERENCES sessions (id)
  );

  CREATE TABLE IF NOT EXISTS backup_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_type TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    metadata TEXT,
    status TEXT DEFAULT 'success',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_students_student_id ON students (student_id);
  CREATE INDEX IF NOT EXISTS idx_attendances_session_student ON attendances (session_id, student_id);
  CREATE INDEX IF NOT EXISTS idx_attendances_student_id ON attendances (student_id);
`);

// Safe migrations for settings columns
try {
  db.exec('ALTER TABLE settings ADD COLUMN academic_year TEXT DEFAULT "2569";');
  console.log('Database Migration: Added academic_year column to settings table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (settings.academic_year):', error);
  }
}

try {
  db.exec('ALTER TABLE settings ADD COLUMN term TEXT DEFAULT "1";');
  console.log('Database Migration: Added term column to settings table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (settings.term):', error);
  }
}

// Safe migrations for sessions columns
try {
  db.exec('ALTER TABLE sessions ADD COLUMN is_active INTEGER DEFAULT 1;');
  console.log('Database Migration: Added is_active column to sessions table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (sessions.is_active):', error);
  }
}

try {
  db.exec('ALTER TABLE sessions ADD COLUMN close_at TEXT DEFAULT NULL;');
  console.log('Database Migration: Added close_at column to sessions table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (sessions.close_at):', error);
  }
}

try {
  db.exec('ALTER TABLE sessions ADD COLUMN academic_year TEXT DEFAULT "2569";');
  console.log('Database Migration: Added academic_year column to sessions table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (sessions.academic_year):', error);
  }
}

try {
  db.exec('ALTER TABLE sessions ADD COLUMN term TEXT DEFAULT "1";');
  console.log('Database Migration: Added term column to sessions table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (sessions.term):', error);
  }
}

// Add token column to sessions for secure URL tokens
try {
  db.exec('ALTER TABLE sessions ADD COLUMN token TEXT;');
  console.log('Database Migration: Added token column to sessions table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (sessions.token):', error);
  }
}

// Back-fill token for existing sessions that have no token
try {
  const sessionsWithoutToken = db.prepare("SELECT id FROM sessions WHERE token IS NULL OR token = ''").all() as { id: number }[];
  if (sessionsWithoutToken.length > 0) {
    const updateToken = db.prepare('UPDATE sessions SET token = ? WHERE id = ?');
    for (const s of sessionsWithoutToken) {
      updateToken.run(crypto.randomBytes(16).toString('hex'), s.id);
    }
    console.log(`Database Migration: Generated tokens for ${sessionsWithoutToken.length} existing session(s).`);
  }
} catch (error) {
  console.error('Error back-filling session tokens:', error);
}

// Safe migrations for attendances columns
try {
  db.exec('ALTER TABLE attendances ADD COLUMN class_year TEXT;');
  console.log('Database Migration: Added class_year column to attendances table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (attendances.class_year):', error);
  }
}

try {
  db.exec('ALTER TABLE attendances ADD COLUMN major_code TEXT;');
  console.log('Database Migration: Added major_code column to attendances table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (attendances.major_code):', error);
  }
}

try {
  db.exec('ALTER TABLE attendances ADD COLUMN room TEXT;');
  console.log('Database Migration: Added room column to attendances table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (attendances.room):', error);
  }
}

try {
  db.exec('ALTER TABLE attendances ADD COLUMN academic_year TEXT DEFAULT "2569";');
  console.log('Database Migration: Added academic_year column to attendances table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (attendances.academic_year):', error);
  }
}

try {
  db.exec('ALTER TABLE attendances ADD COLUMN term TEXT DEFAULT "1";');
  console.log('Database Migration: Added term column to attendances table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (attendances.term):', error);
  }
}

try {
  db.exec('ALTER TABLE attendances ADD COLUMN level TEXT DEFAULT "ปวช";');
  console.log('Database Migration: Added level column to attendances table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (attendances.level):', error);
  }
}

try {
  db.exec('ALTER TABLE attendances ADD COLUMN year TEXT;');
  console.log('Database Migration: Added year column to attendances table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (attendances.year):', error);
  }
}

try {
  db.exec('ALTER TABLE attendances ADD COLUMN major_name TEXT;');
  console.log('Database Migration: Added major_name column to attendances table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (attendances.major_name):', error);
  }
}

try {
  db.exec('ALTER TABLE attendances ADD COLUMN device_uuid TEXT;');
  console.log('Database Migration: Added device_uuid column to attendances table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (attendances.device_uuid):', error);
  }
}

try {
  db.exec('ALTER TABLE sessions ADD COLUMN latitude REAL DEFAULT NULL;');
  console.log('Database Migration: Added latitude column to sessions table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (sessions.latitude):', error);
  }
}

try {
  db.exec('ALTER TABLE sessions ADD COLUMN longitude REAL DEFAULT NULL;');
  console.log('Database Migration: Added longitude column to sessions table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (sessions.longitude):', error);
  }
}

try {
  db.exec('ALTER TABLE sessions ADD COLUMN radius INTEGER DEFAULT 500;');
  console.log('Database Migration: Added radius column to sessions table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (sessions.radius):', error);
  }
}

try {
  db.exec('ALTER TABLE attendances ADD COLUMN latitude REAL DEFAULT NULL;');
  console.log('Database Migration: Added latitude column to attendances table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (attendances.latitude):', error);
  }
}

try {
  db.exec('ALTER TABLE attendances ADD COLUMN longitude REAL DEFAULT NULL;');
  console.log('Database Migration: Added longitude column to attendances table.');
} catch (error: any) {
  if (!error.message.includes('duplicate column name')) {
    console.error('Migration Error (attendances.longitude):', error);
  }
}

// Migrate old data in attendances where new columns are null
try {
  const records = db.prepare('SELECT id, major, class_year, major_code, room FROM attendances WHERE year IS NULL OR major_name IS NULL').all() as any[];
  const updateStmt = db.prepare('UPDATE attendances SET year = ?, major_name = ? WHERE id = ?');
  let migratedCount = 0;
  for (const record of records) {
    const yr = record.class_year || '1';
    let majName = 'เทคนิคคอมพิวเตอร์';
    if (record.major_code === 'คพ') majName = 'คอมพิวเตอร์กราฟิก';
    if (record.major_code === 'ทส') majName = 'เทคโนโลยีสารสนเทศ';
    if (record.major_code === 'ดม') majName = 'ดิจิทัลมีเดีย';
    updateStmt.run(yr, majName, record.id);
    migratedCount++;
  }
  if (migratedCount > 0) {
    console.log(`Database Migration: Migrated ${migratedCount} old attendance records with new year and major_name.`);
  }
} catch (error) {
  console.error('Error migrating old attendance records:', error);
}

// Seed default Google Sheet credentials and sheet ID if not set
let defaultCredPath = '/app/google-credentials.json';
const defaultSheetId = '1U_DKH5N7PPpqJ7TRsbaRjIcTqe1dbveSaxek6Gy9h6w';

if (!fs.existsSync(defaultCredPath)) {
  const rootDir = path.join(__dirname, '../../');
  try {
    const files = fs.readdirSync(rootDir);
    const credFile = files.find(f => f.startsWith('acoustic-arch-') && f.endsWith('.json'));
    if (credFile) {
      defaultCredPath = path.join(rootDir, credFile);
      console.log(`Auto-detected Google Sheets credentials file: ${credFile}`);
    } else {
      defaultCredPath = path.join(rootDir, 'acoustic-arch-477716-p3-fcde8dc29abd.json');
    }
  } catch (err) {
    defaultCredPath = path.join(__dirname, '../../acoustic-arch-477716-p3-fcde8dc29abd.json');
  }
}

if (fs.existsSync(defaultCredPath)) {
  try {
    const defaultCred = fs.readFileSync(defaultCredPath, 'utf8');
    const existing = db.prepare('SELECT * FROM settings WHERE id = 1').get() as { sheet_id: string, credentials_json: string } | undefined;
    
    if (!existing) {
      db.prepare("INSERT INTO settings (id, sheet_id, credentials_json, academic_year, term) VALUES (1, ?, ?, '2569', '1')")
        .run(defaultSheetId, defaultCred);
      console.log('Successfully pre-populated settings with default Google Sheets key and sheet ID.');
    } else if (!existing.credentials_json || !existing.sheet_id) {
      db.prepare('UPDATE settings SET sheet_id = ?, credentials_json = ? WHERE id = 1')
        .run(defaultSheetId, defaultCred);
      console.log('Successfully updated settings with default Google Sheets key and sheet ID.');
    }
  } catch (error) {
    console.error('Error pre-populating credentials:', error);
  }
}

// Seed default majors if empty
try {
  const majorsCount = db.prepare('SELECT COUNT(*) as count FROM majors').get() as { count: number };
  if (majorsCount.count === 0) {
    const defaultMajors = [
      { academic_year: '2569', term: '1', level: 'ปวช', year: '1', major_name: 'เทคนิคคอมพิวเตอร์', major_code: 'ชทค', room: '1' },
      { academic_year: '2569', term: '1', level: 'ปวช', year: '1', major_name: 'เทคนิคคอมพิวเตอร์', major_code: 'ชทค', room: '2' },
      { academic_year: '2569', term: '1', level: 'ปวช', year: '2', major_name: 'เทคนิคคอมพิวเตอร์', major_code: 'ชทค', room: '1' },
      { academic_year: '2569', term: '1', level: 'ปวส', year: '1', major_name: 'เทคนิคคอมพิวเตอร์', major_code: 'ชทค', room: '1' }
    ];
    const insertMajor = db.prepare('INSERT OR IGNORE INTO majors (academic_year, term, level, year, major_name, major_code, room) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const major of defaultMajors) {
      insertMajor.run(major.academic_year, major.term, major.level, major.year, major.major_name, major.major_code, major.room);
    }
    console.log('Seeded default split majors into SQLite.');
  }
} catch (error) {
  console.error('Error seeding default majors:', error);
}

// Seed academic_years from existing settings if academic_years table is empty
try {
  const ayCount = db.prepare('SELECT COUNT(*) as count FROM academic_years').get() as { count: number };
  if (ayCount.count === 0) {
    // Pull all distinct year+term combos from existing data
    const existingYears = db.prepare(`
      SELECT DISTINCT academic_year as year, term FROM settings WHERE academic_year IS NOT NULL AND academic_year != ''
      UNION
      SELECT DISTINCT academic_year as year, term FROM majors WHERE academic_year IS NOT NULL AND academic_year != ''
      UNION
      SELECT DISTINCT academic_year as year, term FROM students WHERE academic_year IS NOT NULL AND academic_year != ''
    `).all() as { year: string; term: string }[];

    // Get current active year from settings
    const activeSettings = db.prepare('SELECT academic_year, term FROM settings WHERE id = 1').get() as { academic_year: string; term: string } | undefined;

    if (existingYears.length > 0) {
      const insertAY = db.prepare('INSERT OR IGNORE INTO academic_years (year, term, is_active) VALUES (?, ?, ?)');
      for (const row of existingYears) {
        const isActive = (activeSettings && row.year === activeSettings.academic_year && row.term === activeSettings.term) ? 1 : 0;
        insertAY.run(row.year, row.term, isActive);
      }
      console.log(`Database Migration: Seeded ${existingYears.length} academic year(s) into academic_years table.`);
    } else {
      // Fallback: seed 2569/term1 as default
      db.prepare('INSERT OR IGNORE INTO academic_years (year, term, is_active) VALUES (?, ?, ?)').run('2569', '1', 1);
      console.log('Database Migration: Seeded default academic year 2569/1 into academic_years table.');
    }
  }
} catch (error) {
  console.error('Error seeding academic_years:', error);
}

export default db;

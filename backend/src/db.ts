import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'database.sqlite'));

// Drop old majors table if it contains old schema
try {
  const tableInfo = db.prepare("PRAGMA table_info(majors)").all() as any[];
  const hasName = tableInfo.some(col => col.name === 'name');
  if (hasName) {
    db.exec("DROP TABLE majors;");
    console.log("Database Migration: Dropped old majors table for schema upgrade.");
  }
} catch (e) {
  // majors table might not exist yet, which is fine
}

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    sheet_id TEXT,
    credentials_json TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    close_at TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    FOREIGN KEY (session_id) REFERENCES sessions (id)
  );

  CREATE TABLE IF NOT EXISTS majors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_year TEXT NOT NULL,
    major_code TEXT NOT NULL,
    room TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_year, major_code, room)
  );
`);

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

// Migrate old data in attendances where new columns are null
try {
  const records = db.prepare('SELECT id, major FROM attendances WHERE class_year IS NULL OR major_code IS NULL OR room IS NULL').all() as any[];
  const updateStmt = db.prepare('UPDATE attendances SET class_year = ?, major_code = ?, room = ? WHERE id = ?');
  let migratedCount = 0;
  for (const record of records) {
    if (record.major) {
      const match = record.major.trim().match(/^(\d+)([^\d]+)(\d+)$/);
      if (match) {
        updateStmt.run(match[1], match[2], match[3], record.id);
        migratedCount++;
      } else {
        updateStmt.run('1', record.major.trim(), '1', record.id);
        migratedCount++;
      }
    }
  }
  if (migratedCount > 0) {
    console.log(`Database Migration: Migrated ${migratedCount} old attendance major formats.`);
  }
} catch (error) {
  console.error('Error migrating old attendance records:', error);
}

// Seed default Google Sheet credentials and sheet ID if not set
const defaultCredPath = path.join(__dirname, '../../acoustic-arch-477716-p3-a56a5fe41614.json');
const defaultSheetId = '1U_DKH5N7PPpqJ7TRsbaRjIcTqe1dbveSaxek6Gy9h6w';
if (fs.existsSync(defaultCredPath)) {
  try {
    const defaultCred = fs.readFileSync(defaultCredPath, 'utf8');
    const existing = db.prepare('SELECT * FROM settings WHERE id = 1').get() as { sheet_id: string, credentials_json: string } | undefined;
    
    if (!existing) {
      db.prepare('INSERT INTO settings (id, sheet_id, credentials_json) VALUES (1, ?, ?)')
        .run(defaultSheetId, defaultCred);
      console.log('Successfully pre-populated settings with default Google Sheets key and sheet ID.');
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
      { class_year: '1', major_code: 'ชทค', room: '1' },
      { class_year: '1', major_code: 'คพ', room: '1' },
      { class_year: '2', major_code: 'ทส', room: '2' },
      { class_year: '3', major_code: 'ดม', room: '1' }
    ];
    const insertMajor = db.prepare('INSERT OR IGNORE INTO majors (class_year, major_code, room) VALUES (?, ?, ?)');
    for (const major of defaultMajors) {
      insertMajor.run(major.class_year, major.major_code, major.room);
    }
    console.log('Seeded default split majors into SQLite.');
  }
} catch (error) {
  console.error('Error seeding default majors:', error);
}

export default db;

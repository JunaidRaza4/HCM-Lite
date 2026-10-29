import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

let dbInstance: Database | null = null;
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'hcm.sqlite');

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  const SQL = await initSqlJs();

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  initSchema(dbInstance);
  saveDb();
  return dbInstance;
}

let inTransaction = false;

export function saveDb(): void {
  if (!dbInstance || inTransaction) return;
  const data = dbInstance.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_FILE, buffer);
}

function initSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      office_start TEXT NOT NULL DEFAULT '09:00',
      grace_period_mins INTEGER NOT NULL DEFAULT 15,
      weekend_days TEXT NOT NULL DEFAULT 'Saturday,Sunday',
      office_lat REAL DEFAULT 24.8607,
      office_lng REAL DEFAULT 67.0011,
      geofence_radius_meters REAL DEFAULT 150,
      geofence_enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leave_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      quota_days INTEGER NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS public_holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'hr', 'employee')),
      must_change_password INTEGER NOT NULL DEFAULT 0,
      employee_id INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      security_question TEXT DEFAULT 'What was the brand or model of your first mobile phone?',
      security_answer TEXT DEFAULT 'nokia',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      department_id INTEGER,
      join_date TEXT NOT NULL,
      basic_salary REAL NOT NULL,
      phone TEXT,
      designation TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(department_id) REFERENCES departments(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      leave_type_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days_count REAL NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by INTEGER,
      reviewed_at TEXT,
      admin_comment TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(employee_id) REFERENCES employees(id),
      FOREIGN KEY(leave_type_id) REFERENCES leave_types(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER,
      actor_name TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT,
      work_hours REAL DEFAULT 0,
      status TEXT NOT NULL,
      notes TEXT,
      source TEXT DEFAULT 'web',
      location_lat REAL,
      location_lng REAL,
      location_accuracy REAL,
      distance_meters REAL,
      face_verified INTEGER DEFAULT 0,
      face_descriptor TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(employee_id, date),
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS attendance_corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by INTEGER,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(employee_id) REFERENCES employees(id),
      FOREIGN KEY(reviewed_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payroll_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft', 'finalized')),
      created_by INTEGER,
      finalized_by INTEGER,
      total_gross REAL NOT NULL DEFAULT 0,
      total_net REAL NOT NULL DEFAULT 0,
      employee_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      finalized_at TEXT,
      FOREIGN KEY(created_by) REFERENCES users(id),
      FOREIGN KEY(finalized_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payslips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payroll_run_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      basic_salary REAL NOT NULL,
      hra REAL NOT NULL,
      medical REAL NOT NULL,
      allowances REAL NOT NULL,
      gross REAL NOT NULL,
      working_days INTEGER NOT NULL,
      attended_days REAL NOT NULL DEFAULT 0,
      absent_days REAL NOT NULL DEFAULT 0,
      unpaid_leave_days REAL NOT NULL DEFAULT 0,
      half_days REAL NOT NULL DEFAULT 0,
      prorate_factor REAL NOT NULL DEFAULT 1,
      per_day_rate REAL NOT NULL,
      absent_deduction REAL NOT NULL DEFAULT 0,
      unpaid_leave_deduction REAL NOT NULL DEFAULT 0,
      half_day_deduction REAL NOT NULL DEFAULT 0,
      total_deductions REAL NOT NULL DEFAULT 0,
      taxable_gross REAL NOT NULL DEFAULT 0,
      annual_gross REAL NOT NULL DEFAULT 0,
      annual_tax REAL NOT NULL DEFAULT 0,
      monthly_tax REAL NOT NULL DEFAULT 0,
      net_salary REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      UNIQUE(employee_id, month),
      FOREIGN KEY(payroll_run_id) REFERENCES payroll_runs(id),
      FOREIGN KEY(employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      author_id INTEGER,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL,
      link TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS ai_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_email TEXT,
      user_role TEXT,
      prompt TEXT NOT NULL,
      tools_used TEXT,
      response TEXT NOT NULL,
      latency_ms INTEGER,
      created_at TEXT NOT NULL
    );
  `);

  // Safe idempotent migrations for existing databases
  const migrations = [
    `ALTER TABLE companies ADD COLUMN office_lat REAL DEFAULT 24.8607;`,
    `ALTER TABLE companies ADD COLUMN office_lng REAL DEFAULT 67.0011;`,
    `ALTER TABLE companies ADD COLUMN office_radius INTEGER DEFAULT 150;`,
    `ALTER TABLE companies ADD COLUMN geofence_radius_meters REAL DEFAULT 150;`,
    `ALTER TABLE companies ADD COLUMN geofence_enabled INTEGER DEFAULT 1;`,
    `UPDATE companies SET office_radius = geofence_radius_meters WHERE office_radius IS NULL;`,
    `UPDATE companies SET geofence_radius_meters = office_radius WHERE geofence_radius_meters IS NULL;`,
    `ALTER TABLE attendance ADD COLUMN source TEXT DEFAULT 'web';`,
    `ALTER TABLE attendance ADD COLUMN location_lat REAL;`,
    `ALTER TABLE attendance ADD COLUMN location_lng REAL;`,
    `ALTER TABLE attendance ADD COLUMN location_accuracy REAL;`,
    `ALTER TABLE attendance ADD COLUMN distance_meters REAL;`,
    `ALTER TABLE attendance ADD COLUMN checkin_lat REAL;`,
    `ALTER TABLE attendance ADD COLUMN checkin_lng REAL;`,
    `ALTER TABLE attendance ADD COLUMN checkin_accuracy REAL;`,
    `ALTER TABLE attendance ADD COLUMN checkout_lat REAL;`,
    `ALTER TABLE attendance ADD COLUMN checkout_lng REAL;`,
    `ALTER TABLE attendance ADD COLUMN checkout_accuracy REAL;`,
    `ALTER TABLE attendance ADD COLUMN checkout_distance_meters INTEGER;`,
    `UPDATE attendance SET checkin_lat = location_lat WHERE checkin_lat IS NULL;`,
    `UPDATE attendance SET checkin_lng = location_lng WHERE checkin_lng IS NULL;`,
    `UPDATE attendance SET checkin_accuracy = location_accuracy WHERE checkin_accuracy IS NULL;`,
    `ALTER TABLE attendance ADD COLUMN face_verified INTEGER DEFAULT 0;`,
    `ALTER TABLE attendance ADD COLUMN face_descriptor TEXT;`,
    `ALTER TABLE employees ADD COLUMN employee_code TEXT;`,
    `ALTER TABLE employees ADD COLUMN basic REAL;`,
    `UPDATE employees SET employee_code = code WHERE employee_code IS NULL;`,
    `UPDATE employees SET basic = basic_salary WHERE basic IS NULL;`,
    `ALTER TABLE payslips ADD COLUMN net_pay REAL;`,
    `UPDATE payslips SET net_pay = net_salary WHERE net_pay IS NULL;`,
    `DROP VIEW IF EXISTS company;`,
    `CREATE VIEW company AS SELECT * FROM companies;`,
    `DROP VIEW IF EXISTS holidays;`,
    `CREATE VIEW holidays AS SELECT * FROM public_holidays;`,
    `ALTER TABLE leave_requests ADD COLUMN admin_comment TEXT;`,
    `ALTER TABLE users ADD COLUMN security_question TEXT DEFAULT 'What was the brand or model of your first mobile phone?';`,
    `ALTER TABLE users ADD COLUMN security_answer TEXT DEFAULT 'nokia';`,
    `ALTER TABLE attendance ADD COLUMN checkout_face_descriptor TEXT;`,
    `ALTER TABLE users ADD COLUMN company_id INTEGER;`,
    `ALTER TABLE departments ADD COLUMN company_id INTEGER;`,
    `ALTER TABLE employees ADD COLUMN company_id INTEGER;`,
    `ALTER TABLE leave_types ADD COLUMN company_id INTEGER;`,
    `ALTER TABLE public_holidays ADD COLUMN company_id INTEGER;`,
    `ALTER TABLE attendance ADD COLUMN company_id INTEGER;`,
    `ALTER TABLE payroll_runs ADD COLUMN company_id INTEGER;`,
    `ALTER TABLE payslips ADD COLUMN company_id INTEGER;`,
    `ALTER TABLE announcements ADD COLUMN company_id INTEGER;`,
    `ALTER TABLE notifications ADD COLUMN company_id INTEGER;`,
    `ALTER TABLE audit_logs ADD COLUMN company_id INTEGER;`,
    `UPDATE users SET company_id = (SELECT id FROM companies LIMIT 1) WHERE company_id IS NULL AND (SELECT id FROM companies LIMIT 1) IS NOT NULL;`,
    `UPDATE departments SET company_id = (SELECT id FROM companies LIMIT 1) WHERE company_id IS NULL AND (SELECT id FROM companies LIMIT 1) IS NOT NULL;`,
    `UPDATE employees SET company_id = (SELECT id FROM companies LIMIT 1) WHERE company_id IS NULL AND (SELECT id FROM companies LIMIT 1) IS NOT NULL;`,
  ];
  for (const m of migrations) {
    try {
      db.run(m);
    } catch (_) {
      // Column or view already exists
    }
  }
}

/**
 * Execute a query that returns multiple rows as plain JavaScript objects
 */
export function query<T = any>(sql: string, params: any[] = []): T[] {
  if (!dbInstance) throw new Error('Database not initialized. Call getDb() first.');
  const stmt = dbInstance.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

/**
 * Execute a query that returns a single row as a plain JavaScript object
 */
export function queryOne<T = any>(sql: string, params: any[] = []): T | null {
  const rows = query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute an INSERT, UPDATE, or DELETE statement and automatically persist to disk
 */
export function run(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number } {
  if (!dbInstance) throw new Error('Database not initialized. Call getDb() first.');
  dbInstance.run(sql, params);
  
  // Get last insert rowid
  const rowidResult = dbInstance.exec('SELECT last_insert_rowid() as id');
  const lastInsertRowid = rowidResult.length > 0 && rowidResult[0].values.length > 0
    ? Number(rowidResult[0].values[0][0])
    : 0;

  // Save changes to disk
  saveDb();

  return {
    changes: dbInstance.getRowsModified(),
    lastInsertRowid,
  };
}

/**
 * Execute a block of statements in ONE SQLite transaction
 */
export function transaction<T>(fn: () => T): T {
  if (!dbInstance) throw new Error('Database not initialized. Call getDb() first.');
  inTransaction = true;
  dbInstance.run('BEGIN TRANSACTION;');
  try {
    const result = fn();
    dbInstance.run('COMMIT;');
    inTransaction = false;
    saveDb();
    return result;
  } catch (err) {
    try {
      dbInstance.run('ROLLBACK;');
    } catch (_) {}
    inTransaction = false;
    throw err;
  }
}


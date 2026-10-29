import { Router, Request, Response } from 'express';
import { queryOne, run, transaction } from '../db/database';
import { hashPassword, generateToken } from '../services/authService';
import { logAudit } from '../services/auditService';

export const setupRouter = Router();

/**
 * Check if the application needs first-run setup.
 * Setup is needed if NO company exists in the entire database.
 */
export function checkNeedsSetup(): boolean {
  try {
    const compRow = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM companies');
    const adminRow = queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND status = 'active'");
    
    const companyCount = compRow?.count ?? 0;
    const adminCount = adminRow?.count ?? 0;

    return companyCount === 0 || adminCount === 0;
  } catch (err) {
    return true;
  }
}

// GET /api/setup/status -> { needsSetup: boolean, initialized: boolean }
setupRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const needsSetup = checkNeedsSetup();
    res.json({
      needsSetup,
      initialized: !needsSetup,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve setup status: ' + error.message });
  }
});

// Step 1: Initialize Company and Admin Account
// Can be called during first run OR whenever a user wants to set up a new company with a new email
const handleSetupInitialization = async (req: Request, res: Response) => {
  try {
    const {
      companyName,
      adminName,
      adminEmail,
      adminPassword,
      officeStart = '09:00',
      gracePeriodMins = 15,
      weekendDays = 'Saturday,Sunday',
      officeLat = 24.8607,
      officeLng = 67.0011,
      officeRadius = 150,
      securityQuestion = 'What was the brand or model of your first mobile phone?',
      securityAnswer = 'nokia',
    } = req.body;

    // Validate required fields
    if (!companyName || !companyName.trim()) {
      res.status(400).json({ error: 'Company Name is required', field: 'companyName' });
      return;
    }
    if (!adminName || !adminName.trim()) {
      res.status(400).json({ error: 'Your Name is required', field: 'adminName' });
      return;
    }
    if (!adminEmail || !adminEmail.trim()) {
      res.status(400).json({ error: 'Admin Email is required', field: 'adminEmail' });
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(adminEmail.trim())) {
      res.status(400).json({ error: 'Please enter a valid email address', field: 'adminEmail' });
      return;
    }

    const cleanEmail = adminEmail.toLowerCase().trim();

    // Check if an account with this email already exists
    const existingUser = queryOne<any>('SELECT id, email, role FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (existingUser) {
      res.status(400).json({
        error: `An account with email '${cleanEmail}' already exists. Please log in with your password.`,
        field: 'adminEmail',
        exists: true,
      });
      return;
    }

    // Strong Password validation
    if (!adminPassword || adminPassword.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long', field: 'adminPassword' });
      return;
    }
    const hasUpper = /[A-Z]/.test(adminPassword);
    const hasLower = /[a-z]/.test(adminPassword);
    const hasDigit = /[0-9]/.test(adminPassword);
    const hasSpecial = /[^A-Za-z0-9]/.test(adminPassword);
    if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
      res.status(400).json({
        error: 'Use strong password: minimum 8 characters, including uppercase, lowercase, number, and special character.',
        field: 'adminPassword',
      });
      return;
    }

    const now = new Date().toISOString();
    const weekendsStr = Array.isArray(weekendDays) ? weekendDays.join(',') : weekendDays;
    const cleanAdminName = adminName.trim();
    const cleanCompanyName = companyName.trim();
    const parsedLat = Number(officeLat) || 24.8607;
    const parsedLng = Number(officeLng) || 67.0011;
    const parsedRadius = Number(officeRadius) || 150;
    const cleanQuestion = (securityQuestion || 'What was the brand or model of your first mobile phone?').trim();
    const cleanAnswer = (securityAnswer || 'nokia').trim().toLowerCase();

    // Atomic transaction: Insert Company + Admin User + Audit Log
    let companyId = 0;
    let adminId = 0;
    let token = '';

    transaction(() => {
      // 1. Insert new company row
      const compResult = run(
        `INSERT INTO companies (name, office_start, grace_period_mins, weekend_days, office_lat, office_lng, office_radius, geofence_radius_meters, geofence_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [cleanCompanyName, officeStart, Number(gracePeriodMins), weekendsStr, parsedLat, parsedLng, parsedRadius, parsedRadius, now, now]
      );
      companyId = compResult.lastInsertRowid;

      // 2. Insert Admin user linked to this company
      const passwordHash = hashPassword(adminPassword);
      const userResult = run(
        `INSERT INTO users (email, password_hash, name, role, must_change_password, status, security_question, security_answer, company_id, created_at, updated_at)
         VALUES (?, ?, ?, 'admin', 0, 'active', ?, ?, ?, ?, ?)`,
        [cleanEmail, passwordHash, cleanAdminName, cleanQuestion, cleanAnswer, companyId, now, now]
      );
      adminId = userResult.lastInsertRowid;

      // 3. Generate initial session token
      token = generateToken({
        id: adminId,
        email: cleanEmail,
        name: cleanAdminName,
        role: 'admin',
        companyId,
        mustChangePassword: 0,
      });

      // 4. Log Audit Entry
      logAudit({
        actorId: adminId,
        actorName: cleanAdminName,
        actorRole: 'admin',
        action: 'COMPANY_SETUP',
        entity: 'company',
        entityId: companyId,
        details: {
          companyName: cleanCompanyName,
          adminEmail: cleanEmail,
          officeStart,
          gracePeriodMins: Number(gracePeriodMins),
          weekendDays: weekendsStr,
          officeLat: parsedLat,
          officeLng: parsedLng,
          officeRadius: parsedRadius,
          securityQuestion: cleanQuestion,
        },
        ipAddress: req.ip,
      });
    });

    res.status(201).json({
      success: true,
      message: 'Company initialized successfully! Proceed to Step 2 to configure your team.',
      token,
      companyId,
      adminId,
      user: {
        id: adminId,
        email: cleanEmail,
        name: cleanAdminName,
        role: 'admin',
        company_id: companyId,
      },
      company: {
        id: companyId,
        name: cleanCompanyName,
        office_start: officeStart,
        grace_period_mins: Number(gracePeriodMins),
        weekend_days: weekendsStr,
        office_lat: parsedLat,
        office_lng: parsedLng,
        office_radius: parsedRadius,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Setup failed: ' + error.message });
  }
};

// POST /api/setup
setupRouter.post('/', handleSetupInitialization);
setupRouter.post('/initialize', handleSetupInitialization);

// Step 2: Configure Initial Department & Initial HR / Employee
setupRouter.post('/step2-team', async (req: Request, res: Response) => {
  try {
    const {
      companyId,
      departmentName,
      hrName,
      hrEmail,
      hrPassword = 'Welcome@123',
      hrRole = 'hr',
      employeeCode = 'EMP001',
      designation = 'HR Lead',
      basicSalary = 75000,
    } = req.body;

    if (!companyId) {
      res.status(400).json({ error: 'companyId is required for Step 2.' });
      return;
    }

    const now = new Date().toISOString();
    const todayStr = now.split('T')[0];
    let createdDeptId: number | null = null;
    let createdEmpId: number | null = null;

    transaction(() => {
      // 1. Create first department if provided
      if (departmentName && departmentName.trim()) {
        const cleanDept = departmentName.trim();
        const existingDept = queryOne<any>(
          'SELECT id FROM departments WHERE LOWER(name) = LOWER(?) AND (company_id = ? OR company_id IS NULL)',
          [cleanDept, companyId]
        );
        if (existingDept) {
          createdDeptId = existingDept.id;
        } else {
          const deptRes = run(
            'INSERT INTO departments (name, description, company_id, created_at) VALUES (?, ?, ?, ?)',
            [cleanDept, 'Initial department', companyId, now]
          );
          createdDeptId = deptRes.lastInsertRowid;
        }
      }

      // 2. Create first HR / Employee if provided
      if (hrName && hrName.trim() && hrEmail && hrEmail.trim()) {
        const cleanHrEmail = hrEmail.trim().toLowerCase();
        const cleanHrName = hrName.trim();
        const cleanCode = (employeeCode || 'EMP001').trim().toUpperCase();
        const role = hrRole === 'employee' ? 'employee' : 'hr';
        const salaryNum = Number(basicSalary) || 75000;

        // Check if user already exists
        const existingUser = queryOne<any>('SELECT id FROM users WHERE LOWER(email) = ?', [cleanHrEmail]);
        if (!existingUser) {
          const pass = (hrPassword && hrPassword.trim().length >= 6) ? hrPassword.trim() : 'Welcome@123';
          const passHash = hashPassword(pass);

          const userRes = run(
            `INSERT INTO users (email, password_hash, name, role, must_change_password, status, security_question, security_answer, company_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, 'active', 'What was the brand or model of your first mobile phone?', 'nokia', ?, ?, ?)`,
            [cleanHrEmail, passHash, cleanHrName, role, companyId, now, now]
          );
          const newUserId = userRes.lastInsertRowid;

          const empRes = run(
            `INSERT INTO employees (user_id, code, name, email, department_id, join_date, basic_salary, designation, status, company_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
            [newUserId, cleanCode, cleanHrName, cleanHrEmail, createdDeptId, todayStr, salaryNum, designation || 'Team Member', companyId, now, now]
          );
          createdEmpId = empRes.lastInsertRowid;

          // Link employee back to user
          run('UPDATE users SET employee_id = ? WHERE id = ?', [createdEmpId, newUserId]);

          logAudit({
            actorId: newUserId,
            actorName: cleanHrName,
            actorRole: role,
            action: 'INITIAL_TEAM_MEMBER_CREATED',
            entity: 'employee',
            entityId: createdEmpId,
            details: { email: cleanHrEmail, role, code: cleanCode, companyId },
            ipAddress: req.ip,
          });
        }
      }
    });

    res.json({
      success: true,
      message: 'Initial team and department successfully configured!',
      departmentId: createdDeptId,
      employeeId: createdEmpId,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to configure team: ' + error.message });
  }
});

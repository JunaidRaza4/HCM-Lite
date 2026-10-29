import { Router, Response } from 'express';
import { query, queryOne, run, transaction } from '../db/database';
import { authenticate, requireRole, checkEmployeeDataScope, AuthenticatedRequest } from '../middleware/authMiddleware';
import { hashPassword, generateTemporaryPassword } from '../services/authService';
import { logAudit } from '../services/auditService';

export const employeeRouter = Router();

// Next suggested employee code
employeeRouter.get('/next-code', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const compId = req.user?.companyId || 1;
    const lastEmp = queryOne<any>(
      'SELECT code FROM employees WHERE company_id = ? OR company_id IS NULL ORDER BY id DESC LIMIT 1',
      [compId]
    );
    let nextCode = 'EMP001';
    if (lastEmp && lastEmp.code) {
      const match = lastEmp.code.match(/EMP(\d+)/i);
      if (match) {
        const nextNum = parseInt(match[1], 10) + 1;
        nextCode = `EMP${String(nextNum).padStart(3, '0')}`;
      } else {
        const count = queryOne<{ count: number }>(
          'SELECT COUNT(*) as count FROM employees WHERE company_id = ? OR company_id IS NULL',
          [compId]
        );
        nextCode = `EMP${String((count?.count ?? 0) + 1).padStart(3, '0')}`;
      }
    }
    res.json({ nextCode });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List Employees with Scope Enforcement
employeeRouter.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;

    // Scope check: If employee, only return their own record
    if (user.role === 'employee') {
      const myEmployee = query<any>(`
        SELECT e.*, d.name as department_name, u.role, u.status as user_status
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN users u ON e.user_id = u.id
        WHERE e.id = ? OR e.user_id = ?
      `, [user.employeeId || 0, user.id]);

      res.json(myEmployee);
      return;
    }

    // HR and Admin can list all employees with search and department filtering
    const search = req.query.search as string;
    const departmentId = req.query.department_id as string;
    const compId = user.companyId || 1;

    let sql = `
      SELECT e.*, d.name as department_name, u.role, u.must_change_password, u.status as user_status
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE (e.company_id = ? OR e.company_id IS NULL)
    `;
    const params: any[] = [compId];

    if (search && search.trim()) {
      sql += ` AND (LOWER(e.name) LIKE ? OR LOWER(e.email) LIKE ? OR LOWER(e.code) LIKE ?)`;
      const term = `%${search.trim().toLowerCase()}%`;
      params.push(term, term, term);
    }

    if (departmentId) {
      sql += ` AND e.department_id = ?`;
      params.push(Number(departmentId));
    }

    sql += ` ORDER BY e.id DESC`;

    const employees = query<any>(sql, params);
    res.json(employees);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Single Employee with Scope Enforcement
employeeRouter.get('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetId = Number(req.params.id);

    // Enforce data scope: Employee can only view themselves
    if (!checkEmployeeDataScope(req, targetId)) {
      res.status(403).json({
        error: 'Forbidden: You do not have permission to view other employee records.',
      });
      return;
    }

    const employee = queryOne<any>(`
      SELECT e.*, d.name as department_name, u.role, u.must_change_password, u.status as user_status
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.id = ?
    `, [targetId]);

    if (!employee) {
      res.status(404).json({ error: 'Employee not found.' });
      return;
    }

    res.json(employee);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Register New Employee (HR or Admin)
employeeRouter.post('/', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      code,
      name,
      email,
      department_id,
      join_date,
      basic_salary,
      phone,
      designation,
      custom_password,
    } = req.body;

    // Validate required fields
    if (!code || !name || !email || !department_id || !join_date || basic_salary === undefined) {
      res.status(400).json({
        error: 'Missing required fields: code, name, email, department, join date, and basic salary are required.',
      });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = code.toUpperCase().trim();
    const salaryNum = Number(basic_salary);

    if (isNaN(salaryNum) || salaryNum < 0) {
      res.status(400).json({ error: 'Basic salary must be a valid non-negative number.' });
      return;
    }

    // Check unique code
    const existingCode = queryOne('SELECT id FROM employees WHERE UPPER(code) = ?', [cleanCode]);
    if (existingCode) {
      res.status(400).json({ error: `Employee code '${cleanCode}' is already registered.` });
      return;
    }

    // Check unique email in users and employees
    const existingEmail = queryOne('SELECT id FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (existingEmail) {
      res.status(400).json({ error: `An account with email '${cleanEmail}' already exists.` });
      return;
    }

    // Verify department exists
    const dept = queryOne<any>('SELECT * FROM departments WHERE id = ?', [Number(department_id)]);
    if (!dept) {
      res.status(400).json({ error: 'Selected department does not exist.' });
      return;
    }

    // Generate temporary password
    const tempPassword = custom_password && custom_password.trim().length >= 6
      ? custom_password.trim()
      : generateTemporaryPassword();

    const passwordHash = hashPassword(tempPassword);
    const now = new Date().toISOString();

    // 1. Create User account with must_change_password = 1
    const compId = req.user?.companyId || 1;
    const userResult = run(
      `INSERT INTO users (email, password_hash, name, role, must_change_password, status, company_id, created_at, updated_at)
       VALUES (?, ?, ?, 'employee', 1, 'active', ?, ?, ?)`,
      [cleanEmail, passwordHash, name.trim(), compId, now, now]
    );
    const newUserId = userResult.lastInsertRowid;

    // 2. Create Employee record
    const empResult = run(
      `INSERT INTO employees (user_id, code, name, email, department_id, join_date, basic_salary, phone, designation, status, company_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [
        newUserId,
        cleanCode,
        name.trim(),
        cleanEmail,
        Number(department_id),
        join_date.trim(),
        salaryNum,
        phone ? phone.trim() : null,
        designation ? designation.trim() : null,
        compId,
        now,
        now,
      ]
    );
    const newEmpId = empResult.lastInsertRowid;

    // 3. Link user to employee_id
    run('UPDATE users SET employee_id = ? WHERE id = ?', [newEmpId, newUserId]);

    // 4. Log audit
    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'EMPLOYEE_REGISTER',
      entity: 'employee',
      entityId: newEmpId,
      details: {
        code: cleanCode,
        name: name.trim(),
        email: cleanEmail,
        department: dept.name,
        joinDate: join_date,
        basicSalary: salaryNum,
      },
      ipAddress: req.ip,
    });

    const createdEmp = queryOne<any>(`
      SELECT e.*, d.name as department_name, u.role, u.must_change_password
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.id = ?
    `, [newEmpId]);

    res.status(201).json({
      success: true,
      employee: createdEmp,
      temporaryPassword: tempPassword,
      message: 'Employee registered successfully with temporary login credentials.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update Employee (HR or Admin)
employeeRouter.put('/:id', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const empId = Number(req.params.id);
    const current = queryOne<any>('SELECT * FROM employees WHERE id = ?', [empId]);
    if (!current) {
      res.status(404).json({ error: 'Employee not found.' });
      return;
    }

    const {
      name,
      department_id,
      join_date,
      basic_salary,
      phone,
      designation,
      status,
    } = req.body;

    const now = new Date().toISOString();
    const updatedSalary = basic_salary !== undefined ? Number(basic_salary) : current.basic_salary;
    const updatedDept = department_id !== undefined ? Number(department_id) : current.department_id;
    const updatedStatus = status || current.status;

    run(
      `UPDATE employees
       SET name = ?, department_id = ?, join_date = ?, basic_salary = ?, phone = ?, designation = ?, status = ?, updated_at = ?
       WHERE id = ?`,
      [
        name ? name.trim() : current.name,
        updatedDept,
        join_date || current.join_date,
        updatedSalary,
        phone !== undefined ? phone : current.phone,
        designation !== undefined ? designation : current.designation,
        updatedStatus,
        now,
        empId,
      ]
    );

    // Also update user's name or status if changed
    if (current.user_id) {
      run(
        `UPDATE users SET name = ?, status = ?, updated_at = ? WHERE id = ?`,
        [name ? name.trim() : current.name, updatedStatus, now, current.user_id]
      );
    }

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'EMPLOYEE_UPDATED',
      entity: 'employee',
      entityId: empId,
      details: { name, department_id: updatedDept, basic_salary: updatedSalary, status: updatedStatus },
      ipAddress: req.ip,
    });

    const updated = queryOne<any>(`
      SELECT e.*, d.name as department_name, u.role, u.must_change_password, u.status as user_status
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.id = ?
    `, [empId]);

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ================= CSV EXPORT =================
employeeRouter.get('/export/csv', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const employees = query<any>(`
      SELECT e.code, e.name, e.email, d.name as department_name, e.designation, e.join_date, e.basic_salary, e.phone, e.status
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY e.id ASC
    `);

    const headers = ['Employee Code', 'Full Name', 'Email', 'Department', 'Designation', 'Join Date', 'Basic Salary', 'Phone', 'Status'];
    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvLines = [
      headers.map(escapeCsv).join(','),
      ...employees.map(e => [
        escapeCsv(e.code),
        escapeCsv(e.name),
        escapeCsv(e.email),
        escapeCsv(e.department_name || ''),
        escapeCsv(e.designation || ''),
        escapeCsv(e.join_date || ''),
        escapeCsv(e.basic_salary || 0),
        escapeCsv(e.phone || ''),
        escapeCsv(e.status || 'active'),
      ].join(',')),
    ];

    const csvContent = csvLines.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="hcm_employees_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvContent);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ================= CSV IMPORT WITH DRY-RUN =================
employeeRouter.post('/import/csv', authenticate, requireRole('admin', 'hr'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { csvText, rows: inputRows, dry_run = false } = req.body;
    let rawRows: any[] = [];

    if (Array.isArray(inputRows) && inputRows.length > 0) {
      rawRows = inputRows;
    } else if (typeof csvText === 'string' && csvText.trim()) {
      // Parse CSV text
      const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        res.status(400).json({ error: 'CSV file must have a header row and at least one data row.' });
        return;
      }

      // Simple robust CSV line parser handling quotes
      const parseLine = (line: string): string[] => {
        const result: string[] = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              cur += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(cur.trim());
            cur = '';
          } else {
            cur += char;
          }
        }
        result.push(cur.trim());
        return result;
      };

      const headerCells = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
      for (let i = 1; i < lines.length; i++) {
        const cells = parseLine(lines[i]);
        if (cells.length === 0 || cells.every(c => !c)) continue;
        const rowObj: any = {};
        headerCells.forEach((h, idx) => {
          rowObj[h] = cells[idx] || '';
        });
        rawRows.push(rowObj);
      }
    } else {
      res.status(400).json({ error: 'Please provide CSV content in `csvText` or parsed `rows`.' });
      return;
    }

    if (rawRows.length === 0) {
      res.status(400).json({ error: 'No employee records found to process.' });
      return;
    }

    // Fetch existing records for duplication checking
    const existingEmails = new Set(
      query<{ email: string }>('SELECT LOWER(email) as email FROM users UNION SELECT LOWER(email) FROM employees')
        .map(r => r.email.toLowerCase())
    );
    const existingCodes = new Set(
      query<{ code: string }>('SELECT UPPER(code) as code FROM employees')
        .map(r => r.code.toUpperCase())
    );
    const departments = query<{ id: number; name: string }>('SELECT id, name FROM departments');
    const deptMap = new Map<string, number>();
    departments.forEach(d => deptMap.set(d.name.toLowerCase().trim(), d.id));

    // Determine starting auto-code counter
    const lastEmp = queryOne<any>('SELECT code FROM employees ORDER BY id DESC LIMIT 1');
    let codeCounter = 1;
    if (lastEmp && lastEmp.code) {
      const match = lastEmp.code.match(/EMP(\d+)/i);
      if (match) codeCounter = parseInt(match[1], 10) + 1;
    }

    const errors: Array<{ row: number; code?: string; name?: string; email?: string; reason: string }> = [];
    const validRows: Array<{
      code: string;
      name: string;
      email: string;
      department_id: number | null;
      department_name?: string;
      designation: string;
      join_date: string;
      basic_salary: number;
      phone: string;
    }> = [];

    const seenEmailsInBatch = new Set<string>();
    const seenCodesInBatch = new Set<string>();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const todayStr = new Date().toISOString().slice(0, 10);

    rawRows.forEach((r, idx) => {
      const rowNum = idx + 2; // +1 for 0-index, +1 for header
      const name = (r.name || r.fullname || r.employee_name || r.employeename || '').trim();
      const email = (r.email || r.work_email || '').trim().toLowerCase();
      let code = (r.code || r.employeecode || r.employee_code || '').trim().toUpperCase();
      const deptVal = (r.department || r.department_name || r.departmentname || '').trim();
      const designation = (r.designation || r.title || r.position || 'Staff').trim();
      const joinDate = (r.join_date || r.joindate || todayStr).trim();
      const rawSalary = r.basic_salary || r.basicsalary || r.salary || 50000;
      const salary = Number(rawSalary);
      const phone = (r.phone || r.phone_number || '').trim();

      if (!name) {
        errors.push({ row: rowNum, code, name, email, reason: 'Full Name is required.' });
        return;
      }

      if (!email || !emailRegex.test(email)) {
        errors.push({ row: rowNum, code, name, email, reason: `Invalid or missing email address: "${email}".` });
        return;
      }

      if (existingEmails.has(email) || seenEmailsInBatch.has(email)) {
        errors.push({ row: rowNum, code, name, email, reason: `Email "${email}" is already registered in the system.` });
        return;
      }

      // Generate code if missing
      if (!code) {
        while (existingCodes.has(`EMP${String(codeCounter).padStart(3, '0')}`) || seenCodesInBatch.has(`EMP${String(codeCounter).padStart(3, '0')}`)) {
          codeCounter++;
        }
        code = `EMP${String(codeCounter).padStart(3, '0')}`;
        codeCounter++;
      } else {
        if (existingCodes.has(code) || seenCodesInBatch.has(code)) {
          errors.push({ row: rowNum, code, name, email, reason: `Employee code "${code}" already exists.` });
          return;
        }
      }

      if (isNaN(salary) || salary <= 0) {
        errors.push({ row: rowNum, code, name, email, reason: `Basic salary must be a valid positive number. Got: "${rawSalary}".` });
        return;
      }

      let matchedDeptId: number | null = null;
      if (deptVal) {
        if (deptMap.has(deptVal.toLowerCase())) {
          matchedDeptId = deptMap.get(deptVal.toLowerCase())!;
        } else if (!isNaN(Number(deptVal)) && departments.some(d => d.id === Number(deptVal))) {
          matchedDeptId = Number(deptVal);
        }
      }

      seenEmailsInBatch.add(email);
      seenCodesInBatch.add(code);

      validRows.push({
        code,
        name,
        email,
        department_id: matchedDeptId,
        department_name: deptVal || undefined,
        designation,
        join_date: joinDate,
        basic_salary: salary,
        phone,
      });
    });

    // If dry run requested, return validation report without committing
    if (dry_run) {
      res.json({
        dry_run: true,
        total_rows: rawRows.length,
        valid_count: validRows.length,
        error_count: errors.length,
        errors,
        preview: validRows.slice(0, 10),
      });
      return;
    }

    // Real import: If there are errors, enforce dry-run inspection first
    if (errors.length > 0) {
      res.status(400).json({
        error: `CSV validation failed with ${errors.length} error(s). Please review and correct the errors below before importing.`,
        error_count: errors.length,
        valid_count: validRows.length,
        errors,
      });
      return;
    }

    // Execute atomic transaction to import all valid rows
    const now = new Date().toISOString();
    const createdUsers: any[] = [];
    const compId = req.user?.companyId || 1;

    transaction(() => {
      for (const row of validRows) {
        const tempPassword = generateTemporaryPassword();
        const passwordHash = hashPassword(tempPassword);

        const userResult = run(
          `INSERT INTO users (email, password_hash, role, name, must_change_password, status, company_id, created_at, updated_at)
           VALUES (?, ?, 'employee', ?, 1, 'active', ?, ?, ?)`,
          [row.email, passwordHash, row.name, compId, now, now]
        );
        const newUserId = userResult.lastInsertRowid;

        const empResult = run(
          `INSERT INTO employees (user_id, code, name, email, department_id, join_date, basic_salary, phone, designation, status, company_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
          [
            newUserId,
            row.code,
            row.name,
            row.email,
            row.department_id,
            row.join_date,
            row.basic_salary,
            row.phone || null,
            row.designation,
            compId,
            now,
            now,
          ]
        );

        createdUsers.push({
          code: row.code,
          name: row.name,
          email: row.email,
          tempPassword,
        });

        logAudit({
          actorId: req.user!.id,
          actorName: req.user!.name,
          actorRole: req.user!.role,
          action: 'EMPLOYEE_IMPORTED',
          entity: 'employee',
          entityId: empResult.lastInsertRowid,
          details: { code: row.code, name: row.name, email: row.email },
          ipAddress: req.ip,
        });
      }
    });

    res.status(201).json({
      success: true,
      message: `Successfully imported ${validRows.length} employee(s).`,
      imported_count: validRows.length,
      credentials_created: createdUsers,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ================= EMPLOYEE 360 PROFILE VIEW =================
employeeRouter.get('/:id/360', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const empId = Number(req.params.id);
    const user = req.user!;

    // Scope Check: Employee can only view own 360 profile
    if (user.role === 'employee' && user.employeeId !== empId) {
      res.status(403).json({ error: 'You are only authorized to view your own profile.' });
      return;
    }

    const employee = queryOne<any>(`
      SELECT e.*, d.name as department_name, u.role, u.status as user_status, u.must_change_password
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.id = ?
    `, [empId]);

    if (!employee) {
      res.status(404).json({ error: 'Employee not found.' });
      return;
    }

    // Attendance stats
    const attendanceRecords = query<any>(`
      SELECT * FROM attendance
      WHERE employee_id = ?
      ORDER BY date DESC
      LIMIT 60
    `, [empId]);

    const attCounts = {
      total_days: attendanceRecords.length,
      present: attendanceRecords.filter(a => a.status === 'present').length,
      late: attendanceRecords.filter(a => a.status === 'late').length,
      half_day: attendanceRecords.filter(a => a.status === 'half_day').length,
      absent: attendanceRecords.filter(a => a.status === 'absent').length,
      missing_checkout: attendanceRecords.filter(a => a.status === 'missing_checkout').length,
    };

    // Leave Balances
    const leaveTypes = query<any>('SELECT * FROM leave_types ORDER BY quota_days DESC');
    const leaveBalances = leaveTypes.map(lt => {
      const approvedUsage = queryOne<{ total: number }>(`
        SELECT COALESCE(SUM(days_count), 0) as total
        FROM leave_requests
        WHERE employee_id = ? AND leave_type_id = ? AND status = 'approved'
      `, [empId, lt.id])?.total || 0;

      const pendingUsage = queryOne<{ total: number }>(`
        SELECT COALESCE(SUM(days_count), 0) as total
        FROM leave_requests
        WHERE employee_id = ? AND leave_type_id = ? AND status = 'pending'
      `, [empId, lt.id])?.total || 0;

      return {
        id: lt.id,
        name: lt.name,
        quota: lt.quota_days,
        used: approvedUsage,
        pending: pendingUsage,
        remaining: Math.max(0, lt.quota_days - approvedUsage),
      };
    });

    const recentLeaves = query<any>(`
      SELECT lr.*, lt.name as leave_type_name, u.name as reviewer_name
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      LEFT JOIN users u ON lr.reviewed_by = u.id
      WHERE lr.employee_id = ?
      ORDER BY lr.id DESC
      LIMIT 10
    `, [empId]);

    // Recent Payslips
    const recentPayslips = query<any>(`
      SELECT id, month, gross, net_salary, total_deductions, status, created_at
      FROM payslips
      WHERE employee_id = ?
      ORDER BY month DESC
      LIMIT 6
    `, [empId]);

    // Audit logs for this employee
    const auditHistory = query<any>(`
      SELECT action, actor_name, actor_role, details, created_at
      FROM audit_logs
      WHERE (entity = 'employee' AND entity_id = ?)
         OR (entity = 'leave_request' AND details LIKE ?)
      ORDER BY id DESC
      LIMIT 10
    `, [String(empId), `%"employeeId":${empId}%`]);

    res.json({
      employee,
      attendance_summary: attCounts,
      recent_attendance: attendanceRecords.slice(0, 14),
      leave_balances: leaveBalances,
      recent_leaves: recentLeaves,
      recent_payslips: recentPayslips,
      audit_history: auditHistory,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

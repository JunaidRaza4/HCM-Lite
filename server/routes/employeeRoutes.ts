import { Router, Response } from 'express';
import { query, queryOne, run } from '../db/database';
import { authenticate, requireRole, checkEmployeeDataScope, AuthenticatedRequest } from '../middleware/authMiddleware';
import { hashPassword, generateTemporaryPassword } from '../services/authService';
import { logAudit } from '../services/auditService';

export const employeeRouter = Router();

// Next suggested employee code
employeeRouter.get('/next-code', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const lastEmp = queryOne<any>('SELECT code FROM employees ORDER BY id DESC LIMIT 1');
    let nextCode = 'EMP001';
    if (lastEmp && lastEmp.code) {
      const match = lastEmp.code.match(/EMP(\d+)/i);
      if (match) {
        const nextNum = parseInt(match[1], 10) + 1;
        nextCode = `EMP${String(nextNum).padStart(3, '0')}`;
      } else {
        const count = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM employees');
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

    let sql = `
      SELECT e.*, d.name as department_name, u.role, u.must_change_password, u.status as user_status
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

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
    const userResult = run(
      `INSERT INTO users (email, password_hash, name, role, must_change_password, status, created_at, updated_at)
       VALUES (?, ?, ?, 'employee', 1, 'active', ?, ?)`,
      [cleanEmail, passwordHash, name.trim(), now, now]
    );
    const newUserId = userResult.lastInsertRowid;

    // 2. Create Employee record
    const empResult = run(
      `INSERT INTO employees (user_id, code, name, email, department_id, join_date, basic_salary, phone, designation, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
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

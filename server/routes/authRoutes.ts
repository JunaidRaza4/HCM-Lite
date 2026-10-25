import { Router, Response } from 'express';
import { queryOne, run } from '../db/database';
import { verifyPassword, hashPassword, generateToken } from '../services/authService';
import { authenticate, AuthenticatedRequest } from '../middleware/authMiddleware';
import { logAudit } from '../services/auditService';

export const authRouter = Router();

// User Login
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const user = queryOne<any>(
      `SELECT u.*, e.id as emp_id, e.code as emp_code, e.department_id as emp_dept_id, e.basic_salary, e.join_date, d.name as dept_name
       FROM users u
       LEFT JOIN employees e ON u.id = e.user_id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE LOWER(u.email) = LOWER(?)`,
      [email.trim()]
    );

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (user.status !== 'active') {
      res.status(403).json({ error: 'Your account has been deactivated. Contact HR or Administrator.' });
      return;
    }

    const isMatch = verifyPassword(password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const company = queryOne('SELECT * FROM companies LIMIT 1');

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      employeeId: user.emp_id || user.employee_id || null,
      mustChangePassword: user.must_change_password,
    });

    logAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'USER_LOGIN',
      entity: 'user',
      entityId: user.id,
      details: { email: user.email, role: user.role },
      ipAddress: req.ip,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePassword: Boolean(user.must_change_password),
        employeeId: user.emp_id || user.employee_id || null,
        employeeCode: user.emp_code || null,
        departmentName: user.dept_name || null,
        joinDate: user.join_date || null,
        basicSalary: user.basic_salary || null,
      },
      company,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Login error: ' + error.message });
  }
});

// Current User Profile
authRouter.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = queryOne<any>(
      `SELECT u.id, u.email, u.name, u.role, u.must_change_password, u.status, u.created_at,
              e.id as emp_id, e.code as emp_code, e.department_id as emp_dept_id, e.basic_salary, e.join_date, e.phone, e.designation,
              d.name as dept_name
       FROM users u
       LEFT JOIN employees e ON u.id = e.user_id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE u.id = ?`,
      [userId]
    );

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const company = queryOne('SELECT * FROM companies LIMIT 1');

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePassword: Boolean(user.must_change_password),
        status: user.status,
        createdAt: user.created_at,
        employeeId: user.emp_id || null,
        employeeCode: user.emp_code || null,
        departmentName: user.dept_name || null,
        departmentId: user.emp_dept_id || null,
        joinDate: user.join_date || null,
        basicSalary: user.basic_salary || null,
        phone: user.phone || null,
        designation: user.designation || null,
      },
      company,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch user profile: ' + error.message });
  }
});

// Change Password (handles first sign-in required change or user voluntary change)
authRouter.post('/change-password', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters long.' });
      return;
    }

    const user = queryOne<any>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    // If user is not flagged with must_change_password, require verification of current password
    if (!user.must_change_password) {
      if (!currentPassword) {
        res.status(400).json({ error: 'Current password is required.' });
        return;
      }
      const isMatch = verifyPassword(currentPassword, user.password_hash);
      if (!isMatch) {
        res.status(400).json({ error: 'Current password is incorrect.' });
        return;
      }
    }

    const newHash = hashPassword(newPassword);
    const now = new Date().toISOString();

    run(
      `UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?`,
      [newHash, now, userId]
    );

    logAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'PASSWORD_CHANGED',
      entity: 'user',
      entityId: user.id,
      details: { mustChangeCleared: Boolean(user.must_change_password) },
      ipAddress: req.ip,
    });

    // Generate fresh token with mustChangePassword = 0
    const newToken = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      employeeId: user.employee_id,
      mustChangePassword: 0,
    });

    res.json({
      success: true,
      message: 'Password updated successfully.',
      token: newToken,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to change password: ' + error.message });
  }
});

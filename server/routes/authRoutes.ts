import { Router, Response } from 'express';
import { queryOne, run } from '../db/database';
import { verifyPassword, hashPassword, generateToken, generateTemporaryPassword } from '../services/authService';
import { authenticate, AuthenticatedRequest } from '../middleware/authMiddleware';
import { logAudit } from '../services/auditService';

export const authRouter = Router();

// Self-Service Forgot Password / Account Recovery (Public)
authRouter.post('/forgot-password', async (req, res) => {
  try {
    const { identifier } = req.body;

    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      res.status(400).json({ error: 'Please enter your registered email address or employee code.' });
      return;
    }

    const cleanInput = identifier.trim().toLowerCase();

    // Find user by email or by linked employee code
    const user = queryOne<any>(
      `SELECT u.*, e.code as emp_code
       FROM users u
       LEFT JOIN employees e ON u.id = e.user_id
       WHERE LOWER(u.email) = ? OR LOWER(e.code) = ?`,
      [cleanInput, cleanInput]
    );

    if (!user) {
      res.status(404).json({
        error: 'No active account found matching that email or employee code. Please verify your input or contact Administrator.',
      });
      return;
    }

    if (user.status !== 'active') {
      res.status(403).json({
        error: 'Your account has been deactivated. Please contact your company Administrator.',
      });
      return;
    }

    // Generate a temporary reset password
    const tempPassword = generateTemporaryPassword();
    const newHash = hashPassword(tempPassword);
    const now = new Date().toISOString();

    run(
      `UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?`,
      [newHash, now, user.id]
    );

    logAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'PASSWORD_RESET_SELF_SERVICE',
      entity: 'user',
      entityId: user.id,
      details: { email: user.email, method: 'self_service_forgot_password' },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Temporary recovery password generated successfully.',
      email: user.email,
      name: user.name,
      role: user.role,
      temporaryPassword: tempPassword,
      tempPassword: tempPassword,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to process password recovery: ' + error.message });
  }
});

// Step 1: Retrieve security question for user
authRouter.post('/forgot-password/question', async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      res.status(400).json({ error: 'Please enter your registered email address or employee code.' });
      return;
    }

    const cleanInput = identifier.trim().toLowerCase();
    const user = queryOne<any>(
      `SELECT u.*, e.code as emp_code
       FROM users u
       LEFT JOIN employees e ON u.id = e.user_id
       WHERE LOWER(u.email) = ? OR LOWER(e.code) = ?`,
      [cleanInput, cleanInput]
    );

    if (!user) {
      res.status(404).json({
        error: 'No account found matching that email or employee code.',
      });
      return;
    }

    if (user.status !== 'active') {
      res.status(403).json({
        error: 'This account has been deactivated. Please contact your administrator.',
      });
      return;
    }

    const defaultQuestion = 'What was the brand or model of your first mobile phone?';
    res.json({
      success: true,
      email: user.email,
      name: user.name,
      security_question: user.security_question || defaultQuestion,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve security question: ' + error.message });
  }
});

// Step 2: Verify security answer and reset password with strong password check
authRouter.post('/forgot-password/verify-and-reset', async (req, res) => {
  try {
    const { identifier, security_answer, new_password } = req.body;

    if (!identifier || !security_answer || !new_password) {
      res.status(400).json({ error: 'Identifier, security answer, and new password are required.' });
      return;
    }

    const cleanInput = identifier.trim().toLowerCase();
    const user = queryOne<any>(
      `SELECT u.*, e.code as emp_code
       FROM users u
       LEFT JOIN employees e ON u.id = e.user_id
       WHERE LOWER(u.email) = ? OR LOWER(e.code) = ?`,
      [cleanInput, cleanInput]
    );

    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    if (user.status !== 'active') {
      res.status(403).json({ error: 'Account is deactivated.' });
      return;
    }

    // Compare security answer case-insensitively
    const expectedAnswer = (user.security_answer || 'nokia').trim().toLowerCase();
    const providedAnswer = security_answer.trim().toLowerCase();

    if (providedAnswer !== expectedAnswer) {
      res.status(400).json({
        error: 'Security answer is incorrect. Access denied.',
      });
      return;
    }

    // Strong password validation
    if (new_password.length < 8) {
      res.status(400).json({
        error: 'Use strong password: minimum 8 characters, including uppercase, lowercase, number, and special character.',
      });
      return;
    }

    const hasUpper = /[A-Z]/.test(new_password);
    const hasLower = /[a-z]/.test(new_password);
    const hasDigit = /[0-9]/.test(new_password);
    const hasSpecial = /[^A-Za-z0-9]/.test(new_password);

    if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
      res.status(400).json({
        error: 'Use strong password: minimum 8 characters, including uppercase, lowercase, number, and special character.',
      });
      return;
    }

    const newHash = hashPassword(new_password);
    const now = new Date().toISOString();

    run(
      `UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?`,
      [newHash, now, user.id]
    );

    logAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'PASSWORD_RESET_VIA_SECURITY_QUESTION',
      entity: 'user',
      entityId: user.id,
      details: { email: user.email },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Password reset successfully! You can now sign in with your new password.',
      email: user.email,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to reset password: ' + error.message });
  }
});

// Check Email Existence (Seamless route to setup for new emails)
authRouter.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      res.status(400).json({ error: 'Email is required.' });
      return;
    }
    const cleanEmail = email.toLowerCase().trim();
    const user = queryOne<any>('SELECT id, email, name, role, company_id FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (!user) {
      res.json({ exists: false, email: cleanEmail });
      return;
    }
    res.json({ exists: true, email: user.email, name: user.name, role: user.role, companyId: user.company_id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// User Login
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = queryOne<any>(
      `SELECT u.*, e.id as emp_id, e.code as emp_code, e.department_id as emp_dept_id, e.basic_salary, e.join_date, d.name as dept_name
       FROM users u
       LEFT JOIN employees e ON u.id = e.user_id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE LOWER(u.email) = ?`,
      [cleanEmail]
    );

    if (!user) {
      // Return notFound: true so frontend seamlessly routes new email to setup
      res.status(404).json({
        error: 'No account found for this email.',
        notFound: true,
        email: cleanEmail,
      });
      return;
    }

    if (user.status !== 'active') {
      res.status(403).json({ error: 'Your account has been deactivated. Contact HR or Administrator.' });
      return;
    }

    const isMatch = verifyPassword(password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: 'Incorrect password. Please verify and try again.' });
      return;
    }

    const company = user.company_id
      ? queryOne('SELECT * FROM companies WHERE id = ?', [user.company_id])
      : queryOne('SELECT * FROM companies ORDER BY id DESC LIMIT 1');

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      employeeId: user.emp_id || user.employee_id || null,
      companyId: user.company_id || (company ? (company as any).id : null),
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

    const company = user.company_id
      ? queryOne('SELECT * FROM companies WHERE id = ?', [user.company_id])
      : queryOne('SELECT * FROM companies ORDER BY id DESC LIMIT 1');

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
    const { currentPassword, newPassword, securityQuestion, securityAnswer } = req.body;

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

    if (securityQuestion && securityAnswer) {
      run(
        `UPDATE users SET password_hash = ?, security_question = ?, security_answer = ?, must_change_password = 0, updated_at = ? WHERE id = ?`,
        [newHash, securityQuestion.trim(), securityAnswer.trim().toLowerCase(), now, userId]
      );
    } else {
      run(
        `UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?`,
        [newHash, now, userId]
      );
    }

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

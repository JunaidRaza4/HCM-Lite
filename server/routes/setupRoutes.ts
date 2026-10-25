import { Router, Request, Response } from 'express';
import { queryOne, run, transaction } from '../db/database';
import { hashPassword } from '../services/authService';
import { logAudit } from '../services/auditService';

export const setupRouter = Router();

// Check if initial setup is completed
setupRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const userCountRow = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
    const isInitialized = (userCountRow?.count ?? 0) > 0;

    res.json({
      initialized: isInitialized,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to retrieve setup status: ' + error.message });
  }
});

// Run first-run setup: creates company record + Admin user in ONE transaction
setupRouter.post('/initialize', async (req: Request, res: Response) => {
  try {
    // 6. After setup, no one can access /api/setup again (return 403)
    const userCountRow = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
    if ((userCountRow?.count ?? 0) > 0) {
      res.status(403).json({ error: 'Forbidden: Setup has already been completed.' });
      return;
    }

    const {
      companyName,
      officeStart = '09:00',
      gracePeriodMins = 15,
      weekendDays = 'Saturday,Sunday',
      adminName,
      adminEmail,
      adminPassword,
    } = req.body;

    if (!companyName || !companyName.trim()) {
      res.status(400).json({ error: 'Company name is required.' });
      return;
    }

    if (!adminName || !adminName.trim() || !adminEmail || !adminEmail.trim() || !adminPassword) {
      res.status(400).json({ error: 'Admin full name, email, and password are required.' });
      return;
    }

    if (adminPassword.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const now = new Date().toISOString();
    const weekendsStr = Array.isArray(weekendDays) ? weekendDays.join(',') : weekendDays;

    // ONE transaction for company record + Admin user
    transaction(() => {
      // 1. Create Company
      const compResult = run(
        `INSERT INTO companies (name, office_start, grace_period_mins, weekend_days, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [companyName.trim(), officeStart, Number(gracePeriodMins), weekendsStr, now, now]
      );
      const companyId = compResult.lastInsertRowid;

      // 2. Create Admin user
      const passwordHash = hashPassword(adminPassword);
      const userResult = run(
        `INSERT INTO users (email, password_hash, name, role, must_change_password, status, created_at, updated_at)
         VALUES (?, ?, ?, 'admin', 0, 'active', ?, ?)`,
        [adminEmail.toLowerCase().trim(), passwordHash, adminName.trim(), now, now]
      );
      const adminId = userResult.lastInsertRowid;

      // 3. Log audit
      logAudit({
        actorId: adminId,
        actorName: adminName.trim(),
        actorRole: 'admin',
        action: 'COMPANY_SETUP',
        entity: 'company',
        entityId: companyId,
        details: {
          companyName: companyName.trim(),
          adminEmail: adminEmail.toLowerCase().trim(),
          officeStart,
          gracePeriodMins: Number(gracePeriodMins),
          weekendDays: weekendsStr,
        },
        ipAddress: req.ip,
      });
    });

    res.status(201).json({
      success: true,
      message: 'Company and Administrator account created successfully. Please sign in.',
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Setup failed: ' + error.message });
  }
});

// Block any other POST or mutation on /api/setup if accessed after setup
setupRouter.all('*', (req: Request, res: Response) => {
  const userCountRow = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
  if ((userCountRow?.count ?? 0) > 0) {
    res.status(403).json({ error: 'Forbidden: Setup has already been completed.' });
    return;
  }
  res.status(404).json({ error: 'Endpoint not found.' });
});

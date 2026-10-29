import { Router, Response } from 'express';
import { query, queryOne, run } from '../db/database';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/authMiddleware';
import { logAudit } from '../services/auditService';
import { hashPassword, generateTemporaryPassword } from '../services/authService';

export const companyRouter = Router();

// ================= COMPANY SETTINGS =================

// View company settings (All authenticated users)
companyRouter.get('/company', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetCompId = req.user?.companyId || 1;
    const company = queryOne('SELECT * FROM companies WHERE id = ?', [targetCompId]) || queryOne('SELECT * FROM companies LIMIT 1');
    res.json(company || null);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update company settings (Admin only)
companyRouter.put('/company', authenticate, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      name,
      office_start,
      grace_period_mins,
      weekend_days,
      office_lat,
      office_lng,
      office_radius,
      geofence_radius_meters,
      geofence_enabled,
    } = req.body;
    const now = new Date().toISOString();
    const targetCompId = req.user?.companyId || 1;
    const current = queryOne<any>('SELECT * FROM companies WHERE id = ?', [targetCompId]) || queryOne<any>('SELECT * FROM companies LIMIT 1');
    if (!current) {
      res.status(404).json({ error: 'Company record not found.' });
      return;
    }

    const radiusVal = office_radius !== undefined
      ? Number(office_radius)
      : (geofence_radius_meters !== undefined ? Number(geofence_radius_meters) : (current.office_radius ?? current.geofence_radius_meters ?? 150));

    run(
      `UPDATE companies SET
        name = ?,
        office_start = ?,
        grace_period_mins = ?,
        weekend_days = ?,
        office_lat = ?,
        office_lng = ?,
        office_radius = ?,
        geofence_radius_meters = ?,
        geofence_enabled = ?,
        updated_at = ?
       WHERE id = ?`,
      [
        name || current.name,
        office_start || current.office_start,
        grace_period_mins !== undefined ? Number(grace_period_mins) : current.grace_period_mins,
        Array.isArray(weekend_days) ? weekend_days.join(',') : (weekend_days || current.weekend_days),
        office_lat !== undefined ? Number(office_lat) : (current.office_lat ?? 24.8607),
        office_lng !== undefined ? Number(office_lng) : (current.office_lng ?? 67.0011),
        radiusVal,
        radiusVal,
        geofence_enabled !== undefined ? (geofence_enabled ? 1 : 0) : (current.geofence_enabled ?? 1),
        now,
        current.id,
      ]
    );

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'COMPANY_UPDATED',
      entity: 'company',
      entityId: current.id,
      details: {
        name,
        office_start,
        grace_period_mins,
        weekend_days,
        office_lat,
        office_lng,
        office_radius: radiusVal,
        geofence_radius_meters: radiusVal,
        geofence_enabled,
      },
      ipAddress: req.ip,
    });

    const updated = queryOne('SELECT * FROM companies WHERE id = ?', [current.id]);
    res.json({ success: true, company: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ================= DEDICATED LOCATION SETTINGS (PUT /api/settings/location) =================
// ADMIN only.
// Validations: lat -90..90, lng -180..180, radius 50..5000.
// Updates company table + audit log (action='OFFICE_LOCATION_UPDATED')
const handleUpdateLocationSettings = (req: AuthenticatedRequest, res: Response) => {
  try {
    const { office_lat, office_lng, office_radius } = req.body || {};

    if (office_lat === undefined || office_lng === undefined || office_radius === undefined) {
      res.status(400).json({ error: 'office_lat, office_lng, and office_radius are all required.' });
      return;
    }

    const lat = Number(office_lat);
    const lng = Number(office_lng);
    const radius = Number(office_radius);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      res.status(400).json({ error: 'Latitude must be a valid number between -90 and 90.' });
      return;
    }

    if (isNaN(lng) || lng < -180 || lng > 180) {
      res.status(400).json({ error: 'Longitude must be a valid number between -180 and 180.' });
      return;
    }

    if (isNaN(radius) || radius < 50 || radius > 5000) {
      res.status(400).json({ error: 'Office radius must be between 50 and 5000 meters.' });
      return;
    }

    const targetCompId = req.user?.companyId || 1;
    const current = queryOne<any>('SELECT * FROM companies WHERE id = ?', [targetCompId]) || queryOne<any>('SELECT * FROM companies LIMIT 1');
    if (!current) {
      res.status(404).json({ error: 'Company record not found.' });
      return;
    }

    const now = new Date().toISOString();
    run(
      `UPDATE companies SET
        office_lat = ?,
        office_lng = ?,
        office_radius = ?,
        geofence_radius_meters = ?,
        updated_at = ?
       WHERE id = ?`,
      [lat, lng, radius, radius, now, current.id]
    );

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'OFFICE_LOCATION_UPDATED',
      entity: 'company',
      entityId: current.id,
      details: {
        office_lat: lat,
        office_lng: lng,
        office_radius: radius,
      },
      ipAddress: req.ip,
    });

    const updated = queryOne('SELECT * FROM companies WHERE id = ?', [current.id]);
    res.json({
      success: true,
      message: 'Office location updated successfully.',
      company: updated,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

companyRouter.put('/settings/location', authenticate, requireRole('admin'), handleUpdateLocationSettings);
companyRouter.put('/company/location', authenticate, requireRole('admin'), handleUpdateLocationSettings);

// ================= DEPARTMENTS =================

// List departments (All authenticated users: Admin, HR, Employee)
companyRouter.get('/departments', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const compId = req.user?.companyId || 1;
    const departments = query<any>(`
      SELECT d.*, COUNT(e.id) as employee_count
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'active'
      WHERE d.company_id = ? OR d.company_id IS NULL
      GROUP BY d.id
      ORDER BY d.name ASC
    `, [compId]);
    res.json(departments);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create department (Admin only)
companyRouter.post('/departments', authenticate, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Department name is required.' });
      return;
    }

    const compId = req.user?.companyId || 1;
    const existing = queryOne(
      'SELECT id FROM departments WHERE LOWER(name) = LOWER(?) AND (company_id = ? OR company_id IS NULL)',
      [name.trim(), compId]
    );
    if (existing) {
      res.status(400).json({ error: 'A department with this name already exists in your organization.' });
      return;
    }

    const now = new Date().toISOString();
    const result = run(
      `INSERT INTO departments (name, description, company_id, created_at) VALUES (?, ?, ?, ?)`,
      [name.trim(), description ? description.trim() : null, compId, now]
    );

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'DEPARTMENT_CREATED',
      entity: 'department',
      entityId: result.lastInsertRowid,
      details: { name: name.trim(), description },
      ipAddress: req.ip,
    });

    const newDept = queryOne('SELECT * FROM departments WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(newDept);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete department (Admin only)
companyRouter.delete('/departments/:id', authenticate, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const deptId = Number(req.params.id);
    const existing = queryOne<any>('SELECT * FROM departments WHERE id = ?', [deptId]);
    if (!existing) {
      res.status(404).json({ error: 'Department not found.' });
      return;
    }

    const empCount = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM employees WHERE department_id = ?', [deptId]);
    if ((empCount?.count ?? 0) > 0) {
      res.status(400).json({ error: 'Cannot delete department with assigned employees. Reassign employees first.' });
      return;
    }

    run('DELETE FROM departments WHERE id = ?', [deptId]);

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'DEPARTMENT_DELETED',
      entity: 'department',
      entityId: deptId,
      details: { name: existing.name },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Department removed successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ================= LEAVE TYPES =================

// List leave types with quotas (All authenticated users: Admin, HR, Employee)
companyRouter.get('/leave-types', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const compId = req.user?.companyId || 1;
    const leaveTypes = query<any>(
      'SELECT * FROM leave_types WHERE company_id = ? OR company_id IS NULL ORDER BY quota_days DESC',
      [compId]
    );
    res.json(leaveTypes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create leave type (Admin only)
companyRouter.post('/leave-types', authenticate, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, quota_days, description } = req.body;
    if (!name || quota_days === undefined || quota_days === null) {
      res.status(400).json({ error: 'Name and yearly quota days are required.' });
      return;
    }

    const quotaNum = Number(quota_days);
    if (isNaN(quotaNum) || quotaNum < 0) {
      res.status(400).json({ error: 'Quota days must be a positive number.' });
      return;
    }

    const compId = req.user?.companyId || 1;
    const existing = queryOne(
      'SELECT id FROM leave_types WHERE LOWER(name) = LOWER(?) AND (company_id = ? OR company_id IS NULL)',
      [name.trim(), compId]
    );
    if (existing) {
      res.status(400).json({ error: 'A leave type with this name already exists.' });
      return;
    }

    const now = new Date().toISOString();
    const result = run(
      `INSERT INTO leave_types (name, quota_days, description, company_id, created_at) VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), quotaNum, description ? description.trim() : null, compId, now]
    );

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'LEAVE_TYPE_CREATED',
      entity: 'leave_type',
      entityId: result.lastInsertRowid,
      details: { name: name.trim(), quota_days: quotaNum, description },
      ipAddress: req.ip,
    });

    const newLt = queryOne('SELECT * FROM leave_types WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(newLt);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update leave type (Admin only)
companyRouter.put('/leave-types/:id', authenticate, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { name, quota_days, description } = req.body;

    const existing = queryOne<any>('SELECT * FROM leave_types WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Leave type not found.' });
      return;
    }

    const updatedName = name ? name.trim() : existing.name;
    const updatedQuota = quota_days !== undefined ? Number(quota_days) : existing.quota_days;
    const updatedDesc = description !== undefined ? description : existing.description;

    run(
      `UPDATE leave_types SET name = ?, quota_days = ?, description = ? WHERE id = ?`,
      [updatedName, updatedQuota, updatedDesc, id]
    );

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'LEAVE_TYPE_UPDATED',
      entity: 'leave_type',
      entityId: id,
      details: { name: updatedName, quota_days: updatedQuota, description: updatedDesc },
      ipAddress: req.ip,
    });

    const updated = queryOne('SELECT * FROM leave_types WHERE id = ?', [id]);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete leave type (Admin only)
companyRouter.delete('/leave-types/:id', authenticate, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = queryOne<any>('SELECT * FROM leave_types WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Leave type not found.' });
      return;
    }

    run('DELETE FROM leave_types WHERE id = ?', [id]);

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'LEAVE_TYPE_DELETED',
      entity: 'leave_type',
      entityId: id,
      details: { name: existing.name },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Leave type removed.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ================= PUBLIC HOLIDAYS =================

// List public holidays (All authenticated users: Admin, HR, Employee)
companyRouter.get('/holidays', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const compId = req.user?.companyId || 1;
    const holidays = query<any>(
      'SELECT * FROM public_holidays WHERE company_id = ? OR company_id IS NULL ORDER BY date ASC',
      [compId]
    );
    res.json(holidays);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create public holiday (Admin only)
companyRouter.post('/holidays', authenticate, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, date, description } = req.body;
    if (!name || !date) {
      res.status(400).json({ error: 'Holiday name and date (YYYY-MM-DD) are required.' });
      return;
    }

    const compId = req.user?.companyId || 1;
    const now = new Date().toISOString();
    const result = run(
      `INSERT INTO public_holidays (name, date, description, company_id, created_at) VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), date.trim(), description ? description.trim() : null, compId, now]
    );

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'HOLIDAY_CREATED',
      entity: 'holiday',
      entityId: result.lastInsertRowid,
      details: { name: name.trim(), date: date.trim(), description },
      ipAddress: req.ip,
    });

    const newHoliday = queryOne('SELECT * FROM public_holidays WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(newHoliday);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete public holiday (Admin only)
companyRouter.delete('/holidays/:id', authenticate, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = queryOne<any>('SELECT * FROM public_holidays WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Holiday not found.' });
      return;
    }

    run('DELETE FROM public_holidays WHERE id = ?', [id]);

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'HOLIDAY_DELETED',
      entity: 'holiday',
      entityId: id,
      details: { name: existing.name, date: existing.date },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Holiday deleted.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ================= USER & HR MANAGEMENT (ADMIN ONLY) =================

// List all system user logins
companyRouter.get('/users', authenticate, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const compId = req.user?.companyId || 1;
    const users = query<any>(`
      SELECT u.id, u.email, u.role, u.name, u.status, u.must_change_password, u.created_at,
             e.id as employee_id, e.code as employee_code, d.name as department_name
      FROM users u
      LEFT JOIN employees e ON e.user_id = u.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE u.company_id = ? OR u.company_id IS NULL
      ORDER BY u.id ASC
    `, [compId]);
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create HR Login
companyRouter.post('/users/hr', authenticate, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email) {
      res.status(400).json({ error: 'Name and email are required to create an HR user.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = queryOne('SELECT id FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (existing) {
      res.status(400).json({ error: `User with email "${cleanEmail}" already exists.` });
      return;
    }

    const compId = req.user?.companyId || 1;
    const tempPassword = (password && password.trim().length >= 8) ? password.trim() : generateTemporaryPassword();
    const passwordHash = hashPassword(tempPassword);
    const now = new Date().toISOString();

    const result = run(
      `INSERT INTO users (email, password_hash, role, name, must_change_password, status, company_id, created_at, updated_at)
       VALUES (?, ?, 'hr', ?, 1, 'active', ?, ?, ?)`,
      [cleanEmail, passwordHash, name.trim(), compId, now, now]
    );

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'HR_USER_CREATED',
      entity: 'user',
      entityId: result.lastInsertRowid,
      details: { email: cleanEmail, name: name.trim(), role: 'hr' },
      ipAddress: req.ip,
    });

    const newUser = queryOne('SELECT id, email, role, name, status, must_change_password, created_at FROM users WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({
      success: true,
      message: 'HR account created successfully.',
      user: newUser,
      tempPassword,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle user status (Activate / Deactivate)
companyRouter.put('/users/:id/status', authenticate, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetUserId = Number(req.params.id);
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      res.status(400).json({ error: 'Status must be active or inactive.' });
      return;
    }

    if (targetUserId === req.user!.id) {
      res.status(400).json({ error: 'You cannot deactivate your own admin account.' });
      return;
    }

    const targetUser = queryOne<any>('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const now = new Date().toISOString();
    run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [status, now, targetUserId]);

    // Also update linked employee status if exists
    run('UPDATE employees SET status = ?, updated_at = ? WHERE user_id = ?', [status, now, targetUserId]);

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: status === 'active' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entity: 'user',
      entityId: targetUserId,
      details: { previousStatus: targetUser.status, newStatus: status, email: targetUser.email },
      ipAddress: req.ip,
    });

    const updated = queryOne('SELECT id, email, role, name, status, updated_at FROM users WHERE id = ?', [targetUserId]);
    res.json({ success: true, user: updated, message: `User status updated to ${status}.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin Reset User Password
companyRouter.post('/users/:id/reset-password', authenticate, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetUserId = Number(req.params.id);
    const targetUser = queryOne<any>('SELECT * FROM users WHERE id = ?', [targetUserId]);

    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const tempPassword = generateTemporaryPassword();
    const passwordHash = hashPassword(tempPassword);
    const now = new Date().toISOString();

    run(
      'UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?',
      [passwordHash, now, targetUserId]
    );

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'USER_PASSWORD_RESET_BY_ADMIN',
      entity: 'user',
      entityId: targetUserId,
      details: { email: targetUser.email },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: `Password reset successfully for ${targetUser.email}.`,
      tempPassword,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

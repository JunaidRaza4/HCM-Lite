import { Router, Response } from 'express';
import { query, queryOne, run } from '../db/database';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/authMiddleware';
import { logAudit } from '../services/auditService';

export const companyRouter = Router();

// ================= COMPANY SETTINGS =================

// View company settings (All authenticated users)
companyRouter.get('/company', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const company = queryOne('SELECT * FROM companies LIMIT 1');
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
      geofence_radius_meters,
      geofence_enabled,
    } = req.body;
    const now = new Date().toISOString();

    const current = queryOne<any>('SELECT * FROM companies LIMIT 1');
    if (!current) {
      res.status(404).json({ error: 'Company record not found.' });
      return;
    }

    run(
      `UPDATE companies SET
        name = ?,
        office_start = ?,
        grace_period_mins = ?,
        weekend_days = ?,
        office_lat = ?,
        office_lng = ?,
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
        geofence_radius_meters !== undefined ? Number(geofence_radius_meters) : (current.geofence_radius_meters ?? 150),
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
        geofence_radius_meters,
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

// ================= DEPARTMENTS =================

// List departments (All authenticated users: Admin, HR, Employee)
companyRouter.get('/departments', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const departments = query<any>(`
      SELECT d.*, COUNT(e.id) as employee_count
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'active'
      GROUP BY d.id
      ORDER BY d.name ASC
    `);
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

    const existing = queryOne('SELECT id FROM departments WHERE LOWER(name) = LOWER(?)', [name.trim()]);
    if (existing) {
      res.status(400).json({ error: 'A department with this name already exists.' });
      return;
    }

    const now = new Date().toISOString();
    const result = run(
      `INSERT INTO departments (name, description, created_at) VALUES (?, ?, ?)`,
      [name.trim(), description ? description.trim() : null, now]
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
    const leaveTypes = query<any>('SELECT * FROM leave_types ORDER BY quota_days DESC');
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

    const existing = queryOne('SELECT id FROM leave_types WHERE LOWER(name) = LOWER(?)', [name.trim()]);
    if (existing) {
      res.status(400).json({ error: 'A leave type with this name already exists.' });
      return;
    }

    const now = new Date().toISOString();
    const result = run(
      `INSERT INTO leave_types (name, quota_days, description, created_at) VALUES (?, ?, ?, ?)`,
      [name.trim(), quotaNum, description ? description.trim() : null, now]
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
    const holidays = query<any>('SELECT * FROM public_holidays ORDER BY date ASC');
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

    const now = new Date().toISOString();
    const result = run(
      `INSERT INTO public_holidays (name, date, description, created_at) VALUES (?, ?, ?, ?)`,
      [name.trim(), date.trim(), description ? description.trim() : null, now]
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

import { Router, Response } from 'express';
import { query, queryOne, run } from '../db/database';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/authMiddleware';
import { logAudit } from '../services/auditService';
import { createNotification } from '../services/notificationService';

export const leaveRouter = Router();

// Get leave balances & requests
leaveRouter.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;

    if (user.role === 'employee') {
      if (!user.employeeId) {
        res.status(400).json({ error: 'No employee record associated with this account.' });
        return;
      }

      // Return employee's own requests
      const requests = query<any>(`
        SELECT lr.*, lt.name as leave_type_name, lt.quota_days, u.name as reviewer_name
        FROM leave_requests lr
        JOIN leave_types lt ON lr.leave_type_id = lt.id
        LEFT JOIN users u ON lr.reviewed_by = u.id
        WHERE lr.employee_id = ?
        ORDER BY lr.id DESC
      `, [user.employeeId]);

      // Calculate quota usage
      const compId = user.companyId || 1;
      const leaveTypes = query<any>(
        'SELECT * FROM leave_types WHERE company_id = ? OR company_id IS NULL ORDER BY quota_days DESC',
        [compId]
      );
      const balances = leaveTypes.map(lt => {
        const approvedCount = queryOne<{ total: number }>(`
          SELECT COALESCE(SUM(days_count), 0) as total
          FROM leave_requests
          WHERE employee_id = ? AND leave_type_id = ? AND status = 'approved'
        `, [user.employeeId, lt.id])?.total || 0;

        const pendingCount = queryOne<{ total: number }>(`
          SELECT COALESCE(SUM(days_count), 0) as total
          FROM leave_requests
          WHERE employee_id = ? AND leave_type_id = ? AND status = 'pending'
        `, [user.employeeId, lt.id])?.total || 0;

        return {
          id: lt.id,
          name: lt.name,
          quota: lt.quota_days,
          used: approvedCount,
          pending: pendingCount,
          remaining: Math.max(0, lt.quota_days - approvedCount),
        };
      });

      res.json({ requests, balances });
      return;
    }

    // Admin & HR can see all leave requests
    const employeeIdFilter = req.query.employee_id as string;
    const compId = user.companyId || 1;
    let sql = `
      SELECT lr.*, lt.name as leave_type_name, lt.quota_days, e.name as employee_name, e.code as employee_code, d.name as department_name, u.name as reviewer_name
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      JOIN employees e ON lr.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON lr.reviewed_by = u.id
      WHERE (e.company_id = ? OR e.company_id IS NULL)
    `;
    const params: any[] = [compId];
    if (employeeIdFilter) {
      sql += ` AND lr.employee_id = ?`;
      params.push(Number(employeeIdFilter));
    }
    sql += ` ORDER BY lr.id DESC`;

    const requests = query<any>(sql, params);
    res.json({ requests });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/leave/my-balance or /api/leaves/my-balance (Employee balance summary)
leaveRouter.get('/my-balance', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!user.employeeId) {
      res.json([]);
      return;
    }

    const compId = user.companyId || 1;
    const leaveTypes = query<any>(
      'SELECT * FROM leave_types WHERE company_id = ? OR company_id IS NULL ORDER BY quota_days DESC',
      [compId]
    );
    const balances = leaveTypes.map((lt) => {
      const approvedCount =
        queryOne<{ total: number }>(
          `SELECT COALESCE(SUM(days_count), 0) as total
           FROM leave_requests
           WHERE employee_id = ? AND leave_type_id = ? AND status = 'approved'`,
          [user.employeeId, lt.id]
        )?.total || 0;

      const pendingCount =
        queryOne<{ total: number }>(
          `SELECT COALESCE(SUM(days_count), 0) as total
           FROM leave_requests
           WHERE employee_id = ? AND leave_type_id = ? AND status = 'pending'`,
          [user.employeeId, lt.id]
        )?.total || 0;

      return {
        id: lt.id,
        name: lt.name,
        quota: lt.quota_days,
        used: approvedCount,
        pending: pendingCount,
        remaining: Math.max(0, lt.quota_days - approvedCount),
      };
    });

    res.json(balances);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Submit leave request (Employee for themselves, or HR/Admin for employee)
leaveRouter.post('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { leave_type_id, start_date, end_date, days_count, reason, employee_id } = req.body;

    let targetEmployeeId: number;
    if (user.role === 'employee') {
      if (!user.employeeId) {
        res.status(400).json({ error: 'No employee profile linked to user account.' });
        return;
      }
      targetEmployeeId = user.employeeId;
    } else {
      // HR or Admin can submit on behalf of an employee
      if (!employee_id) {
        res.status(400).json({ error: 'employee_id is required.' });
        return;
      }
      targetEmployeeId = Number(employee_id);
    }

    if (!leave_type_id || !start_date || !end_date || days_count === undefined) {
      res.status(400).json({ error: 'Leave type, start date, end date, and days count are required.' });
      return;
    }

    const days = Number(days_count);
    if (isNaN(days) || days <= 0) {
      res.status(400).json({ error: 'Days count must be greater than 0.' });
      return;
    }

    const leaveType = queryOne<any>('SELECT * FROM leave_types WHERE id = ?', [Number(leave_type_id)]);
    if (!leaveType) {
      res.status(404).json({ error: 'Leave type not found.' });
      return;
    }

    // 1. HTTP 422 Validation: Exceeding available quota check
    const approvedUsage = queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(days_count), 0) as total
       FROM leave_requests
       WHERE employee_id = ? AND leave_type_id = ? AND status = 'approved'`,
      [targetEmployeeId, Number(leave_type_id)]
    )?.total || 0;

    const remainingQuota = Math.max(0, leaveType.quota_days - approvedUsage);
    if (days > remainingQuota) {
      res.status(422).json({
        error: `Leave request of ${days} day(s) exceeds remaining quota of ${remainingQuota} day(s) for ${leaveType.name}.`,
      });
      return;
    }

    // 2. HTTP 422 Validation: Date overlap check
    const overlapping = queryOne<any>(
      `SELECT id, start_date, end_date FROM leave_requests
       WHERE employee_id = ?
         AND status IN ('approved', 'pending')
         AND NOT (end_date < ? OR start_date > ?)
       LIMIT 1`,
      [targetEmployeeId, start_date, end_date]
    );

    if (overlapping) {
      res.status(422).json({
        error: `Date overlap detected: You already have a ${overlapping.status || 'active'} leave request from ${overlapping.start_date} to ${overlapping.end_date}.`,
      });
      return;
    }

    const now = new Date().toISOString();
    const compId = user.companyId || 1;
    const result = run(
      `INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, days_count, reason, status, company_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [targetEmployeeId, Number(leave_type_id), start_date, end_date, days, reason ? reason.trim() : null, compId, now]
    );

    logAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'LEAVE_REQUESTED',
      entity: 'leave_request',
      entityId: result.lastInsertRowid,
      details: {
        employeeId: targetEmployeeId,
        leaveType: leaveType.name,
        days,
        startDate: start_date,
        endDate: end_date,
      },
      ipAddress: req.ip,
    });

    const newReq = queryOne('SELECT * FROM leave_requests WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(newReq);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel pending leave request (Employee who owns it or Admin/HR)
leaveRouter.post('/:id/cancel', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const reqId = Number(req.params.id);
    const user = req.user!;
    const existing = queryOne<any>('SELECT * FROM leave_requests WHERE id = ?', [reqId]);

    if (!existing) {
      res.status(404).json({ error: 'Leave request not found.' });
      return;
    }

    // Authorization: Employee can only cancel own requests
    if (user.role === 'employee' && existing.employee_id !== user.employeeId) {
      res.status(403).json({ error: 'You are only authorized to cancel your own leave requests.' });
      return;
    }

    if (existing.status !== 'pending') {
      res.status(400).json({ error: `Cannot cancel a leave request with status '${existing.status}'. Only pending requests can be cancelled.` });
      return;
    }

    const now = new Date().toISOString();
    run(
      `UPDATE leave_requests SET status = 'cancelled', reviewed_at = ? WHERE id = ?`,
      [now, reqId]
    );

    logAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'LEAVE_CANCELLED',
      entity: 'leave_request',
      entityId: reqId,
      details: { employeeId: existing.employee_id, previousStatus: existing.status },
      ipAddress: req.ip,
    });

    const updated = queryOne('SELECT * FROM leave_requests WHERE id = ?', [reqId]);
    res.json({ success: true, message: 'Leave request successfully cancelled.', leave: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Also support PUT /:id/cancel for convenience
leaveRouter.put('/:id/cancel', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const reqId = Number(req.params.id);
    const user = req.user!;
    const existing = queryOne<any>('SELECT * FROM leave_requests WHERE id = ?', [reqId]);

    if (!existing) {
      res.status(404).json({ error: 'Leave request not found.' });
      return;
    }

    if (user.role === 'employee' && existing.employee_id !== user.employeeId) {
      res.status(403).json({ error: 'You are only authorized to cancel your own leave requests.' });
      return;
    }

    if (existing.status !== 'pending') {
      res.status(400).json({ error: `Cannot cancel a leave request with status '${existing.status}'. Only pending requests can be cancelled.` });
      return;
    }

    const now = new Date().toISOString();
    run(`UPDATE leave_requests SET status = 'cancelled', reviewed_at = ? WHERE id = ?`, [now, reqId]);

    logAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'LEAVE_CANCELLED',
      entity: 'leave_request',
      entityId: reqId,
      details: { employeeId: existing.employee_id, previousStatus: existing.status },
      ipAddress: req.ip,
    });

    const updated = queryOne('SELECT * FROM leave_requests WHERE id = ?', [reqId]);
    res.json({ success: true, message: 'Leave request successfully cancelled.', leave: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Approve or Reject leave request (Admin or HR only)
leaveRouter.put('/:id/status', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const reqId = Number(req.params.id);
    const { status, comment, admin_comment } = req.body;
    const reviewComment = (comment || admin_comment || '').trim();

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      res.status(400).json({ error: 'Status must be approved, rejected, or pending.' });
      return;
    }

    // Mandatory comment check for HR/Admin decision
    if ((status === 'approved' || status === 'rejected') && !reviewComment) {
      res.status(400).json({ error: 'A review comment is mandatory when approving or rejecting a leave request.' });
      return;
    }

    const existing = queryOne<any>('SELECT * FROM leave_requests WHERE id = ?', [reqId]);
    if (!existing) {
      res.status(404).json({ error: 'Leave request not found.' });
      return;
    }

    const now = new Date().toISOString();
    run(
      `UPDATE leave_requests SET status = ?, reviewed_by = ?, reviewed_at = ?, admin_comment = ? WHERE id = ?`,
      [status, req.user!.id, now, reviewComment || null, reqId]
    );

    // Send in-app notification to employee
    const targetEmp = queryOne<any>('SELECT user_id, name FROM employees WHERE id = ?', [existing.employee_id]);
    if (targetEmp?.user_id) {
      createNotification({
        userId: targetEmp.user_id,
        title: `Leave Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: `Your leave request for ${existing.days_count} day(s) (${existing.start_date} to ${existing.end_date}) was ${status}.${reviewComment ? ` Note: "${reviewComment}"` : ''}`,
        type: 'leave',
        link: '/leaves',
      });
    }

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: `LEAVE_${status.toUpperCase()}`,
      entity: 'leave_request',
      entityId: reqId,
      details: {
        employeeId: existing.employee_id,
        previousStatus: existing.status,
        newStatus: status,
        comment: reviewComment,
      },
      ipAddress: req.ip,
    });

    const updated = queryOne<any>(`
      SELECT lr.*, lt.name as leave_type_name, e.name as employee_name, u.name as reviewer_name
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      JOIN employees e ON lr.employee_id = e.id
      LEFT JOIN users u ON lr.reviewed_by = u.id
      WHERE lr.id = ?
    `, [reqId]);

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

import { Router, Response } from 'express';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/authMiddleware';
import { query, queryOne } from '../db/database';
import { createOrUpdatePayrollDraft, finalizePayrollRun } from '../services/payrollService';
import { logAudit } from '../services/auditService';

export const payrollRouter = Router();

// 1. HR or Admin creates monthly payroll run as DRAFT
payrollRouter.post('/draft', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { month } = req.body;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ error: 'Valid month in YYYY-MM format is required (e.g., 2026-10).' });
      return;
    }

    const result = createOrUpdatePayrollDraft({
      month,
      createdBy: req.user!.id,
    });

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'PAYROLL_DRAFT_CREATED',
      entity: 'payroll_run',
      entityId: result.run.id,
      details: { month, totalGross: result.run.total_gross, employeeCount: result.run.employee_count },
      ipAddress: req.ip,
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// 2. List all payroll runs
payrollRouter.get('/runs', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const runs = query<any>(`
      SELECT pr.*, u1.name as creator_name, u2.name as finalizer_name
      FROM payroll_runs pr
      LEFT JOIN users u1 ON pr.created_by = u1.id
      LEFT JOIN users u2 ON pr.finalized_by = u2.id
      ORDER BY pr.month DESC
    `);
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Get single payroll run with all payslips
payrollRouter.get('/runs/:id', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const runId = Number(req.params.id);
    const pr = queryOne<any>(`
      SELECT pr.*, u1.name as creator_name, u2.name as finalizer_name
      FROM payroll_runs pr
      LEFT JOIN users u1 ON pr.created_by = u1.id
      LEFT JOIN users u2 ON pr.finalized_by = u2.id
      WHERE pr.id = ?
    `, [runId]);

    if (!pr) {
      res.status(404).json({ error: 'Payroll run not found.' });
      return;
    }

    const payslips = query<any>(`
      SELECT p.*, e.name as employee_name, e.code as employee_code, d.name as department_name, e.designation, e.email
      FROM payslips p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE p.payroll_run_id = ?
      ORDER BY e.name ASC
    `, [runId]);

    res.json({ run: pr, payslips });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Admin ONLY can finalize payroll run
payrollRouter.post('/runs/:id/finalize', authenticate, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const runId = Number(req.params.id);
    const updatedRun = finalizePayrollRun(runId, req.user!.id);

    logAudit({
      actorId: req.user!.id,
      actorName: req.user!.name,
      actorRole: req.user!.role,
      action: 'PAYROLL_FINALIZED',
      entity: 'payroll_run',
      entityId: runId,
      details: { month: updatedRun.month, totalGross: updatedRun.total_gross, totalNet: updatedRun.total_net },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `Payroll run for ${updatedRun.month} finalized and locked.`, run: updatedRun });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// 5. Employee view their own payslips
payrollRouter.get('/my-payslips', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!user.employeeId) {
      res.json([]);
      return;
    }

    // Only return finalized payslips to employee (drafts are internal to HR/Admin)
    const payslips = query<any>(`
      SELECT p.*, pr.status as run_status, e.name as employee_name, e.code as employee_code,
             d.name as department_name, e.designation, c.name as company_name
      FROM payslips p
      JOIN payroll_runs pr ON p.payroll_run_id = pr.id
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN companies c ON 1=1
      WHERE p.employee_id = ? AND pr.status = 'finalized'
      ORDER BY p.month DESC
    `, [user.employeeId]);

    res.json(payslips);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. View specific payslip detail (by ID)
payrollRouter.get('/payslips/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const payslipId = Number(req.params.id);
    const payslip = queryOne<any>(`
      SELECT p.*, pr.status as run_status, e.name as employee_name, e.code as employee_code,
             d.name as department_name, e.designation, e.email, e.join_date, c.name as company_name
      FROM payslips p
      JOIN payroll_runs pr ON p.payroll_run_id = pr.id
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN companies c ON 1=1
      WHERE p.id = ?
    `, [payslipId]);

    if (!payslip) {
      res.status(404).json({ error: 'Payslip not found.' });
      return;
    }

    // Authorization check: Employee can only see their own payslip
    if (req.user!.role === 'employee' && payslip.employee_id !== req.user!.employeeId) {
      res.status(403).json({ error: 'Forbidden: You cannot access another employee’s payslip.' });
      return;
    }

    // If employee, can only view if run is finalized
    if (req.user!.role === 'employee' && payslip.run_status !== 'finalized') {
      res.status(403).json({ error: 'This payslip is still in draft state.' });
      return;
    }

    res.json(payslip);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

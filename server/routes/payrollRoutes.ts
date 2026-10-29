import { Router, Response } from 'express';
import PDFDocument from 'pdfkit';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/authMiddleware';
import { query, queryOne } from '../db/database';
import { createOrUpdatePayrollDraft, finalizePayrollRun } from '../services/payrollService';
import { logAudit } from '../services/auditService';

export const payrollRouter = Router();

// ==========================================
// 1. POST /api/payroll/create-draft (or /draft)
// ==========================================
// HR or Admin only.
// Creates payroll_runs row (month UNIQUE), computes each active employee's payslip, updates totals.
// Returns 409 if month's run is already finalized.
const handleCreateDraft = (req: AuthenticatedRequest, res: Response) => {
  try {
    const { month } = req.body;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ error: 'Valid month in YYYY-MM format is required (e.g. 2026-10).' });
      return;
    }

    const result = createOrUpdatePayrollDraft({
      month,
      createdBy: req.user!.id,
      companyId: req.user?.companyId || 1,
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
};

payrollRouter.post('/create-draft', authenticate, requireRole('admin', 'hr'), handleCreateDraft);
payrollRouter.post('/draft', authenticate, requireRole('admin', 'hr'), handleCreateDraft);

// ==========================================
// 2. GET /api/payroll/runs
// ==========================================
// HR/Admin: saari runs + status
payrollRouter.get('/runs', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const compId = req.user?.companyId || 1;
    const runs = query<any>(`
      SELECT pr.*, u1.name as creator_name, u2.name as finalizer_name
      FROM payroll_runs pr
      LEFT JOIN users u1 ON pr.created_by = u1.id
      LEFT JOIN users u2 ON pr.finalized_by = u2.id
      WHERE pr.company_id = ? OR pr.company_id IS NULL
      ORDER BY pr.month DESC
    `, [compId]);
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. POST /api/payroll/:runId/finalize (and /runs/:id/finalize)
// ==========================================
// ADMIN ONLY.
// If already finalized -> 409.
// Transaction: run status='finalized', finalized_at, payslip status='finalized',
// employee notification ("Your payslip for {month} is ready"), audit log.
const handleFinalizeRun = (req: AuthenticatedRequest, res: Response) => {
  try {
    const runId = Number(req.params.runId || req.params.id);
    if (!runId) {
      res.status(400).json({ error: 'Valid run ID is required.' });
      return;
    }

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

    res.json({
      success: true,
      message: 'Payroll finalized and locked.',
      run: updatedRun,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

payrollRouter.post('/:runId/finalize', authenticate, requireRole('admin'), handleFinalizeRun);
payrollRouter.post('/runs/:id/finalize', authenticate, requireRole('admin'), handleFinalizeRun);

// ==========================================
// 4. GET /api/payroll/:runId/payslips (and /runs/:id)
// ==========================================
// HR/Admin: run ki sab payslips list
const handleGetRunPayslips = (req: AuthenticatedRequest, res: Response) => {
  try {
    const runId = Number(req.params.runId || req.params.id);
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
      SELECT p.*, e.name as employee_name, COALESCE(e.code, e.employee_code) as employee_code,
             d.name as department_name, e.designation, e.email
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
};

payrollRouter.get('/:runId/payslips', authenticate, requireRole('admin', 'hr'), handleGetRunPayslips);
payrollRouter.get('/runs/:id', authenticate, requireRole('admin', 'hr'), handleGetRunPayslips);

// ==========================================
// 5. GET /api/payroll/:runId/payslip/:employeeId/pdf
// ==========================================
// admin/hr/employee.
// SCOPE CHECK: employee role ho to sirf apni employee_id allow, warna 403.
// Run finalized na ho to 403 "Available after payroll is finalized".
// pdfkit se A4 payslip PDF:
//   company name header
//   employee info (name, code, dept, designation)
//   earnings table (Basic, HRA 40%, Medical 10%, Gross bold)
//   attendance summary (present/working, absent, unpaid, half days)
//   deductions (absence, half-day, tax)
//   NET PAY bold + line
//   footer "System-generated — Status: FINALIZED"
const handleDownloadPayslipPdf = (req: AuthenticatedRequest, res: Response) => {
  try {
    const runId = Number(req.params.runId);
    const employeeId = Number(req.params.employeeId);

    // 1. Scope check for employee role
    if (req.user!.role === 'employee' && req.user!.employeeId !== employeeId) {
      res.status(403).json({ error: 'Forbidden: You can only download your own payslip.' });
      return;
    }

    // 2. Fetch run
    const pr = queryOne<any>('SELECT * FROM payroll_runs WHERE id = ?', [runId]);
    if (!pr) {
      res.status(404).json({ error: 'Payroll run not found.' });
      return;
    }

    // 3. Finalization check
    if (pr.status !== 'finalized') {
      res.status(403).json({ error: 'Available after payroll is finalized.' });
      return;
    }

    // 4. Fetch payslip with employee and company details
    const payslip = queryOne<any>(`
      SELECT p.*, e.name as employee_name, COALESCE(e.code, e.employee_code, 'EMP') as employee_code,
             d.name as department_name, e.designation, e.email, e.join_date,
             c.name as company_name, c.office_start, c.weekend_days
      FROM payslips p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN companies c ON 1=1
      WHERE p.payroll_run_id = ? AND p.employee_id = ?
    `, [runId, employeeId]);

    if (!payslip) {
      res.status(404).json({ error: 'Payslip not found for this employee and run.' });
      return;
    }

    const companyName = payslip.company_name || 'HCM Lite Enterprise';
    const month = payslip.month;
    const employeeCode = payslip.employee_code || `EMP${String(employeeId).padStart(3, '0')}`;

    // 5. Build PDF using PDFKit (A4, 40pt margins)
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `Payslip - ${employeeCode} - ${month}`,
        Author: companyName,
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Payslip_${employeeCode}_${month}.pdf"`);

    doc.pipe(res);

    // --- Header Section ---
    doc.fillColor('#0F172A').fontSize(18).font('Helvetica-Bold').text(companyName, 40, 40);
    doc.fillColor('#475569').fontSize(10).font('Helvetica').text('CONFIDENTIAL SALARY PAYSLIP', 40, 62);

    doc.fillColor('#4F46E5').fontSize(12).font('Helvetica-Bold').text(`Pay Period: ${month}`, 380, 40, { align: 'right' });
    doc.fillColor('#16A34A').fontSize(9).font('Helvetica-Bold').text('STATUS: FINALIZED & LOCKED', 380, 58, { align: 'right' });

    // Decorative divider line
    doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(40, 80).lineTo(555, 80).stroke();

    // --- Employee Information Box ---
    let y = 92;
    doc.rect(40, y, 515, 64).fillAndStroke('#F8FAFC', '#E2E8F0');

    doc.fillColor('#64748B').fontSize(8).font('Helvetica-Bold').text('EMPLOYEE NAME', 52, y + 10);
    doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold').text(payslip.employee_name, 52, y + 22);

    doc.fillColor('#64748B').fontSize(8).font('Helvetica-Bold').text('EMPLOYEE CODE', 220, y + 10);
    doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold').text(employeeCode, 220, y + 22);

    doc.fillColor('#64748B').fontSize(8).font('Helvetica-Bold').text('DEPARTMENT', 380, y + 10);
    doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold').text(payslip.department_name || 'General', 380, y + 22);

    doc.fillColor('#64748B').fontSize(8).font('Helvetica-Bold').text('DESIGNATION', 52, y + 38);
    doc.fillColor('#334155').fontSize(9).font('Helvetica').text(payslip.designation || 'Staff', 52, y + 49);

    doc.fillColor('#64748B').fontSize(8).font('Helvetica-Bold').text('WORKING DAYS', 220, y + 38);
    doc.fillColor('#334155').fontSize(9).font('Helvetica').text(`${payslip.working_days} Days`, 220, y + 49);

    doc.fillColor('#64748B').fontSize(8).font('Helvetica-Bold').text('GENERATED ON', 380, y + 38);
    doc.fillColor('#334155').fontSize(9).font('Helvetica').text(new Date().toISOString().slice(0, 10), 380, y + 49);

    // --- Attendance Summary Section ---
    y = 170;
    doc.fillColor('#0F172A').fontSize(11).font('Helvetica-Bold').text('Attendance & Shift Summary', 40, y);
    y += 18;

    doc.rect(40, y, 515, 42).fillAndStroke('#FFFFFF', '#E2E8F0');

    const attCols = [
      { label: 'Attended Days', val: `${payslip.attended_days} d`, x: 50 },
      { label: 'Working Days', val: `${payslip.working_days} d`, x: 155 },
      { label: 'Absent Days', val: `${payslip.absent_days} d`, x: 260 },
      { label: 'Unpaid Leave', val: `${payslip.unpaid_leave_days || 0} d`, x: 365 },
      { label: 'Half Days', val: `${payslip.half_days || 0} d`, x: 470 },
    ];

    attCols.forEach((col) => {
      doc.fillColor('#64748B').fontSize(8).font('Helvetica').text(col.label, col.x, y + 8);
      doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold').text(col.val, col.x, y + 22);
    });

    // --- Earnings & Deductions Tables Side-by-Side ---
    y = 230;

    // Left: Earnings Table
    const tableW = 250;
    doc.rect(40, y, tableW, 22).fillAndStroke('#EEF2FF', '#C7D2FE');
    doc.fillColor('#4338CA').fontSize(9).font('Helvetica-Bold').text('EARNINGS', 50, y + 6);
    doc.text('AMOUNT ($)', 210, y + 6, { align: 'right' });

    let ey = y + 26;
    const earningsRows = [
      { label: 'Basic Salary', val: Number(payslip.basic_salary).toLocaleString(undefined, { minimumFractionDigits: 2 }) },
      { label: 'House Rent Allowance (HRA 40%)', val: Number(payslip.hra).toLocaleString(undefined, { minimumFractionDigits: 2 }) },
      { label: 'Medical Allowance (10%)', val: Number(payslip.medical).toLocaleString(undefined, { minimumFractionDigits: 2 }) },
    ];

    earningsRows.forEach((row, i) => {
      if (i % 2 === 1) {
        doc.rect(40, ey - 2, tableW, 18).fill('#F8FAFC');
      }
      doc.fillColor('#334155').fontSize(9).font('Helvetica').text(row.label, 50, ey + 2);
      doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold').text(row.val, 210, ey + 2, { align: 'right' });
      ey += 20;
    });

    // Gross Total Bar
    doc.rect(40, ey, tableW, 24).fillAndStroke('#F1F5F9', '#CBD5E1');
    doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold').text('GROSS SALARY (1.5x)', 50, ey + 7);
    doc.fillColor('#4F46E5').fontSize(10).font('Helvetica-Bold').text(
      `$${Number(payslip.gross).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      210,
      ey + 7,
      { align: 'right' }
    );

    // Right: Deductions Table
    const rightX = 305;
    doc.rect(rightX, y, tableW, 22).fillAndStroke('#FEF2F2', '#FECACA');
    doc.fillColor('#B91C1C').fontSize(9).font('Helvetica-Bold').text('DEDUCTIONS & TAX', rightX + 10, y + 6);
    doc.text('AMOUNT ($)', rightX + 170, y + 6, { align: 'right' });

    let dy = y + 26;
    const absenceDeduction = Number(payslip.absent_deduction || payslip.deduction_absence || 0);
    const halfDayDeduction = Number(payslip.half_day_deduction || payslip.deduction_half || 0);
    const taxAmount = Number(payslip.monthly_tax || payslip.tax || 0);

    const deductionRows = [
      { label: `Absence/Unpaid (${payslip.absent_days + (payslip.unpaid_leave_days || 0)}d)`, val: absenceDeduction.toLocaleString(undefined, { minimumFractionDigits: 2 }) },
      { label: `Half-Day Deductions (${payslip.half_days || 0}d)`, val: halfDayDeduction.toLocaleString(undefined, { minimumFractionDigits: 2 }) },
      { label: 'Income Tax (Monthly Slab)', val: taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) },
    ];

    deductionRows.forEach((row, i) => {
      if (i % 2 === 1) {
        doc.rect(rightX, dy - 2, tableW, 18).fill('#F8FAFC');
      }
      doc.fillColor('#334155').fontSize(9).font('Helvetica').text(row.label, rightX + 10, dy + 2);
      doc.fillColor('#DC2626').fontSize(9).font('Helvetica-Bold').text(`-${row.val}`, rightX + 170, dy + 2, { align: 'right' });
      dy += 20;
    });

    // Total Deductions Bar
    const totalDeds = Number(payslip.total_deductions).toLocaleString(undefined, { minimumFractionDigits: 2 });
    doc.rect(rightX, dy, tableW, 24).fillAndStroke('#F1F5F9', '#CBD5E1');
    doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold').text('TOTAL DEDUCTIONS', rightX + 10, dy + 7);
    doc.fillColor('#DC2626').fontSize(10).font('Helvetica-Bold').text(`-$${totalDeds}`, rightX + 170, dy + 7, { align: 'right' });

    // --- NET SALARY PAYABLE BANNER ---
    const netY = Math.max(ey, dy) + 38;
    doc.rect(40, netY, 515, 52).fillAndStroke('#ECFDF5', '#6EE7B7');

    doc.fillColor('#065F46').fontSize(10).font('Helvetica-Bold').text('NET PAYABLE SALARY (Take-Home Pay)', 55, netY + 12);
    doc.fillColor('#047857').fontSize(8).font('Helvetica').text('Transferred to employee verified bank account', 55, netY + 28);

    const netSalaryVal = Number(payslip.net_pay || payslip.net_salary).toLocaleString(undefined, { minimumFractionDigits: 2 });
    doc.fillColor('#047857').fontSize(18).font('Helvetica-Bold').text(`$${netSalaryVal}`, 360, netY + 16, { align: 'right' });

    // --- Annual Tax Slabs Summary Footnote ---
    const footY = netY + 70;
    doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(40, footY).lineTo(555, footY).stroke();

    doc.fillColor('#64748B').fontSize(7.5).font('Helvetica').text(
      `Tax Slabs Reference: Up to 600k (0%) | 600k-1.2M (5%) | 1.2M-2.4M (30k+15%) | 2.4M-3.6M (210k+25%) | >3.6M (510k+35%)`,
      40,
      footY + 8
    );
    doc.text(
      `Per-day rate = Gross / Working Days ($${Number(payslip.gross).toFixed(2)} / ${payslip.working_days} = $${Number(payslip.per_day_rate).toFixed(2)}/day).`,
      40,
      footY + 20
    );

    // Footer
    doc.fillColor('#94A3B8').fontSize(8).font('Helvetica-Bold').text(
      'System-generated — Status: FINALIZED',
      40,
      760,
      { align: 'center' }
    );

    doc.end();
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate PDF: ' + err.message });
  }
};

payrollRouter.get('/:runId/payslip/:employeeId/pdf', authenticate, handleDownloadPayslipPdf);
payrollRouter.get('/runs/:runId/payslips/:employeeId/pdf', authenticate, handleDownloadPayslipPdf);

// ==========================================
// 6. Existing Helper Routes
// ==========================================
// Employee view their own finalized payslips
payrollRouter.get('/my-payslips', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!user.employeeId) {
      res.json([]);
      return;
    }

    const payslips = query<any>(`
      SELECT p.*, pr.status as run_status, e.name as employee_name, COALESCE(e.code, e.employee_code) as employee_code,
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

// Single payslip details (with scope check)
payrollRouter.get('/payslips/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const payslipId = Number(req.params.id);
    const payslip = queryOne<any>(`
      SELECT p.*, pr.status as run_status, e.name as employee_name, COALESCE(e.code, e.employee_code) as employee_code,
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

    if (req.user!.role === 'employee' && payslip.employee_id !== req.user!.employeeId) {
      res.status(403).json({ error: 'Forbidden: You cannot access another employee’s payslip.' });
      return;
    }

    if (req.user!.role === 'employee' && payslip.run_status !== 'finalized') {
      res.status(403).json({ error: 'Available after payroll is finalized.' });
      return;
    }

    res.json(payslip);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

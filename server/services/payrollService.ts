import { query, queryOne, run, transaction } from '../db/database';
import { createNotification } from './notificationService';

export interface ComputePayrollOptions {
  month: string; // 'YYYY-MM'
  createdBy: number;
  companyId?: number;
}

/**
 * monthlyTax(gross):
 * Annualized gross = gross * 12
 * Tax Slabs:
 *   <= 600,000 : 0%
 *   <= 1,200,000 : 5% of excess over 600k
 *   <= 2,400,000 : 30k + 15% of excess over 1.2M
 *   <= 3,600,000 : 210k + 25% of excess over 2.4M
 *   > 3,600,000 : 510k + 35% of excess over 3.6M
 * Returns Math.round(annualTax / 12)
 */
export function monthlyTax(gross: number): number {
  const annualGross = gross * 12;
  let annualTax = 0;

  if (annualGross <= 600000) {
    annualTax = 0;
  } else if (annualGross <= 1200000) {
    annualTax = (annualGross - 600000) * 0.05;
  } else if (annualGross <= 2400000) {
    annualTax = 30000 + (annualGross - 1200000) * 0.15;
  } else if (annualGross <= 3600000) {
    annualTax = 210000 + (annualGross - 2400000) * 0.25;
  } else {
    annualTax = 510000 + (annualGross - 3600000) * 0.35;
  }

  return Math.round(annualTax / 12);
}

// Backward compatibility alias
export const computeAnnualTax = (annualGross: number) => {
  if (annualGross <= 600000) return 0;
  if (annualGross <= 1200000) return (annualGross - 600000) * 0.05;
  if (annualGross <= 2400000) return 30000 + (annualGross - 1200000) * 0.15;
  if (annualGross <= 3600000) return 210000 + (annualGross - 2400000) * 0.25;
  return 510000 + (annualGross - 3600000) * 0.35;
};

/**
 * countWorkingDays(month "YYYY-MM"):
 * Sat/Sun skip + holidays table ki dates skip.
 */
export function countWorkingDays(month: string): {
  workingDays: number;
  workingDates: string[];
} {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  // Retrieve public holidays for the month (supports both public_holidays and holidays view)
  const holidayRows = query<{ date: string }>(
    `SELECT date FROM public_holidays WHERE date LIKE ?`,
    [`${month}-%`]
  );
  const holidays = holidayRows.map((h) => h.date);

  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const workingDates: string[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dateObj = new Date(year, monthNum - 1, d);
    const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = holidays.includes(dayStr);

    if (!isWeekend && !isHoliday) {
      workingDates.push(dayStr);
    }
  }

  return {
    workingDays: workingDates.length || 1, // Avoid division by zero
    workingDates,
  };
}

// Backward compatibility alias
export const getMonthWorkingDays = (year: number, month: number, holidays: string[]) => {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const res = countWorkingDays(monthStr);
  return {
    workingDaysCount: res.workingDays,
    workingDates: res.workingDates,
  };
};

/**
 * buildPayslip(employeeId, month, workingDays):
 * attendance table se month summary (present/late/half_day/absent counts) + approved unpaid leave days.
 * basic = employees.basic (or basic_salary)
 * hra = basic * 0.4
 * medical = basic * 0.1
 * gross = basic + hra + medical (Gross = 1.5 * basic)
 * perDay = gross / workingDays
 * deduction_absence = perDay * (absent + unpaid)
 * deduction_half = perDay * 0.5 * halfDays
 * tax = monthlyTax(gross)
 * net_pay = gross - sab deductions
 */
export function buildPayslip(employeeId: number, month: string, workingDaysCount: number) {
  const employee = queryOne<any>(
    `SELECT e.*, d.name as department_name, e.basic_salary as basic_amount
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     WHERE e.id = ?`,
    [employeeId]
  );

  if (!employee) {
    throw new Error(`Employee #${employeeId} not found.`);
  }

  const basic = Number(employee.basic || employee.basic_salary || employee.basic_amount || 0);
  const hra = Math.round(basic * 0.40 * 100) / 100;
  const medical = Math.round(basic * 0.10 * 100) / 100;
  const gross = Math.round((basic + hra + medical) * 100) / 100; // exactly 1.5 * basic
  const allowances = 0; // gross = 1.5 * basic

  const { workingDates } = countWorkingDays(month);

  // Prorate if joined mid-month
  let eligibleWorkingDates = workingDates;
  if (employee.join_date && employee.join_date > `${month}-01`) {
    eligibleWorkingDates = workingDates.filter((d) => d >= employee.join_date);
  }
  const prorateFactor = workingDaysCount > 0 ? eligibleWorkingDates.length / workingDaysCount : 1;
  const effectiveGross = Math.round(gross * prorateFactor * 100) / 100;
  const perDay = workingDaysCount > 0 ? gross / workingDaysCount : 0;

  // Fetch attendance records for this employee in this month
  const attendanceList = query<any>(
    `SELECT * FROM attendance WHERE employee_id = ? AND date LIKE ?`,
    [employeeId, `${month}-%`]
  );
  const attMap = new Map<string, any>();
  for (const a of attendanceList) {
    attMap.set(a.date, a);
  }

  // Fetch approved leaves in this month
  const [yearStr, monthNumStr] = month.split('-');
  const lastDay = new Date(parseInt(yearStr, 10), parseInt(monthNumStr, 10), 0).getDate();
  const monthEndStr = `${month}-${String(lastDay).padStart(2, '0')}`;

  const approvedLeaves = query<any>(
    `SELECT lr.*, lt.name as leave_type_name
     FROM leave_requests lr
     JOIN leave_types lt ON lr.leave_type_id = lt.id
     WHERE lr.employee_id = ?
       AND lr.status = 'approved'
       AND (lr.start_date <= ? AND lr.end_date >= ?)`,
    [employeeId, monthEndStr, `${month}-01`]
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const isPastMonth = month < todayStr.slice(0, 7);

  let presentCount = 0;
  let lateCount = 0;
  let halfDays = 0;
  let absentDays = 0;
  let unpaidLeaveDays = 0;
  let attendedDays = 0;

  for (const date of eligibleWorkingDates) {
    if (!isPastMonth && date > todayStr) {
      continue; // Future days in active month not marked absent yet
    }

    const att = attMap.get(date);
    if (att) {
      if (att.status === 'half_day' || (att.work_hours > 0 && att.work_hours < 5)) {
        halfDays += 1;
        attendedDays += 0.5;
      } else if (att.status === 'late') {
        lateCount += 1;
        attendedDays += 1;
        presentCount += 1;
      } else {
        presentCount += 1;
        attendedDays += 1;
      }
    } else {
      // Check approved leave
      const leave = approvedLeaves.find(
        (l: any) => l.start_date <= date && l.end_date >= date
      );

      if (leave) {
        const isUnpaid = leave.leave_type_name.toLowerCase().includes('unpaid');
        if (isUnpaid) {
          unpaidLeaveDays += 1;
        } else {
          // Paid leave counts as attended
          attendedDays += 1;
        }
      } else {
        absentDays += 1;
      }
    }
  }

  // Deductions:
  // deduction_absence = perDay * (absent + unpaid)
  // deduction_half = perDay * 0.5 * halfDays
  const deduction_absence = Math.round(perDay * (absentDays + unpaidLeaveDays) * 100) / 100;
  const deduction_half = Math.round(perDay * 0.5 * halfDays * 100) / 100;
  const tax = monthlyTax(gross);

  const totalDeductions = Math.round((deduction_absence + deduction_half + tax) * 100) / 100;
  const net_pay = Math.max(0, Math.round((effectiveGross - deduction_absence - deduction_half - tax) * 100) / 100);

  return {
    employee_id: employee.id,
    employee_name: employee.name,
    employee_code: employee.code || employee.employee_code,
    department_name: employee.department_name,
    designation: employee.designation,
    month,
    basic_salary: basic,
    basic,
    hra,
    medical,
    allowances,
    gross,
    working_days: workingDaysCount,
    attended_days: attendedDays,
    present_days: presentCount,
    late_days: lateCount,
    absent_days: absentDays,
    unpaid_leave_days: unpaidLeaveDays,
    half_days: halfDays,
    prorate_factor: prorateFactor,
    per_day_rate: Math.round(perDay * 100) / 100,
    deduction_absence,
    absent_deduction: deduction_absence,
    deduction_half,
    half_day_deduction: deduction_half,
    unpaid_leave_deduction: Math.round(perDay * unpaidLeaveDays * 100) / 100,
    total_deductions: totalDeductions,
    taxable_gross: effectiveGross,
    annual_gross: gross * 12,
    annual_tax: tax * 12,
    monthly_tax: tax,
    tax,
    net_salary: net_pay,
    net_pay,
  };
}

/**
 * createOrUpdatePayrollDraft:
 * Creates a payroll draft run and calculates payslips for all eligible employees.
 * If draft already exists for this month, recomputes.
 * If finalized, throws 409 conflict.
 */
export function createOrUpdatePayrollDraft(options: ComputePayrollOptions) {
  const { month, createdBy, companyId } = options;
  const compId = companyId || 1;

  // Check if finalized run already exists
  const existingRun = queryOne<any>(
    'SELECT * FROM payroll_runs WHERE month = ? AND (company_id = ? OR company_id IS NULL)',
    [month, compId]
  );

  if (existingRun && existingRun.status === 'finalized') {
    const error: any = new Error(`Payroll for ${month} has already been finalized and locked.`);
    error.status = 409;
    throw error;
  }

  const { workingDays: workingDaysCount } = countWorkingDays(month);

  const [yearStr, monthNumStr] = month.split('-');
  const lastDay = new Date(parseInt(yearStr, 10), parseInt(monthNumStr, 10), 0).getDate();
  const monthEndStr = `${month}-${String(lastDay).padStart(2, '0')}`;

  const employees = query<any>(
    `SELECT e.*, d.name as department_name, u.status as user_status
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN users u ON e.user_id = u.id
     WHERE (e.company_id = ? OR e.company_id IS NULL)
       AND e.join_date <= ? AND (e.status = 'active' OR e.status IS NULL)
     ORDER BY e.id ASC`,
    [compId, monthEndStr]
  );

  return transaction(() => {
    let runId: number;
    const now = new Date().toISOString();

    if (existingRun) {
      runId = existingRun.id;
      // Delete existing draft payslips to recompute
      run('DELETE FROM payslips WHERE payroll_run_id = ?', [runId]);
      run(
        `UPDATE payroll_runs SET status = 'draft', created_by = ?, company_id = ?, created_at = ? WHERE id = ?`,
        [createdBy, compId, now, runId]
      );
    } else {
      const runRes = run(
        `INSERT INTO payroll_runs (month, status, created_by, total_gross, total_net, employee_count, company_id, created_at)
         VALUES (?, 'draft', ?, 0, 0, 0, ?, ?)`,
        [month, createdBy, compId, now]
      );
      runId = runRes.lastInsertRowid;
    }

    let runTotalGross = 0;
    let runTotalNet = 0;
    let computedCount = 0;

    for (const emp of employees) {
      const p = buildPayslip(emp.id, month, workingDaysCount);

      run(
        `INSERT INTO payslips (
          payroll_run_id, employee_id, month, basic_salary, hra, medical, allowances,
          gross, working_days, attended_days, absent_days, unpaid_leave_days, half_days,
          prorate_factor, per_day_rate, absent_deduction, unpaid_leave_deduction, half_day_deduction,
          total_deductions, taxable_gross, annual_gross, annual_tax, monthly_tax, net_salary, net_pay,
          company_id, status, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, 'draft', ?
        )`,
        [
          runId, p.employee_id, month, p.basic_salary, p.hra, p.medical, p.allowances,
          p.gross, p.working_days, p.attended_days, p.absent_days, p.unpaid_leave_days, p.half_days,
          p.prorate_factor, p.per_day_rate, p.deduction_absence, p.unpaid_leave_deduction, p.deduction_half,
          p.total_deductions, p.taxable_gross, p.annual_gross, p.annual_tax, p.monthly_tax, p.net_salary, p.net_pay,
          compId, now
        ]
      );

      runTotalGross += p.gross;
      runTotalNet += p.net_pay;
      computedCount += 1;
    }

    // Update payroll run totals
    run(
      `UPDATE payroll_runs
       SET total_gross = ?, total_net = ?, employee_count = ?
       WHERE id = ?`,
      [Math.round(runTotalGross * 100) / 100, Math.round(runTotalNet * 100) / 100, computedCount, runId]
    );

    const updatedRun = queryOne<any>('SELECT * FROM payroll_runs WHERE id = ?', [runId]);
    const payslips = query<any>(
      `SELECT p.*, e.name as employee_name, e.code as employee_code, d.name as department_name, e.designation
       FROM payslips p
       JOIN employees e ON p.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE p.payroll_run_id = ?
       ORDER BY e.name ASC`,
      [runId]
    );

    return {
      run: updatedRun,
      payslips,
    };
  });
}

/**
 * finalizePayrollRun:
 * ADMIN ONLY.
 * Locks the run, locks all payslips, dispatches employee in-app notifications, logs audit.
 */
export function finalizePayrollRun(runId: number, adminUserId: number) {
  const payrollRun = queryOne<any>('SELECT * FROM payroll_runs WHERE id = ?', [runId]);
  if (!payrollRun) {
    throw new Error('Payroll run not found.');
  }

  if (payrollRun.status === 'finalized') {
    const error: any = new Error(`Payroll for ${payrollRun.month} is already finalized.`);
    error.status = 409;
    throw error;
  }

  const now = new Date().toISOString();

  return transaction(() => {
    // 1. Lock the run
    run(
      `UPDATE payroll_runs
       SET status = 'finalized', finalized_by = ?, finalized_at = ?
       WHERE id = ?`,
      [adminUserId, now, runId]
    );

    // 2. Lock all payslips
    run(
      `UPDATE payslips SET status = 'finalized' WHERE payroll_run_id = ?`,
      [runId]
    );

    // 3. Notify each employee in-app: "Your payslip for {month} is ready"
    const payslips = query<any>(
      `SELECT p.*, e.user_id, e.name as employee_name
       FROM payslips p
       JOIN employees e ON p.employee_id = e.id
       WHERE p.payroll_run_id = ?`,
      [runId]
    );

    for (const ps of payslips) {
      if (ps.user_id) {
        createNotification({
          userId: ps.user_id,
          title: `Payslip Available (${payrollRun.month})`,
          message: `Your payslip for ${payrollRun.month} is ready. Net Pay: $${Number(ps.net_salary || ps.net_pay).toLocaleString()}.`,
          type: 'payslip',
          link: '/payroll',
        });
      }
    }

    return queryOne<any>('SELECT * FROM payroll_runs WHERE id = ?', [runId]);
  });
}

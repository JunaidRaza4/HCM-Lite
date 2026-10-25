import { query, queryOne, run, transaction } from '../db/database';
import { createNotification } from './notificationService';

export interface ComputePayrollOptions {
  month: string; // 'YYYY-MM'
  createdBy: number;
}

export function computeAnnualTax(annualGross: number): number {
  if (annualGross <= 600000) {
    return 0;
  } else if (annualGross <= 1200000) {
    return (annualGross - 600000) * 0.05;
  } else if (annualGross <= 2400000) {
    return 30000 + (annualGross - 1200000) * 0.15;
  } else if (annualGross <= 3600000) {
    return 210000 + (annualGross - 2400000) * 0.25;
  } else {
    return 510000 + (annualGross - 3600000) * 0.35;
  }
}

export function getMonthWorkingDays(year: number, month: number, holidays: string[]): {
  workingDaysCount: number;
  workingDates: string[];
} {
  const daysInMonth = new Date(year, month, 0).getDate();
  const workingDates: string[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dateObj = new Date(year, month - 1, d);
    const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = holidays.includes(dayStr);

    if (!isWeekend && !isHoliday) {
      workingDates.push(dayStr);
    }
  }

  return {
    workingDaysCount: workingDates.length || 1, // prevent division by zero
    workingDates,
  };
}

export function createOrUpdatePayrollDraft(options: ComputePayrollOptions) {
  const { month, createdBy } = options;
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  // Check if finalized run already exists for this month
  const existingRun = queryOne<any>(
    'SELECT * FROM payroll_runs WHERE month = ?',
    [month]
  );

  if (existingRun && existingRun.status === 'finalized') {
    const error: any = new Error(`Payroll for ${month} has already been finalized and locked.`);
    error.status = 409;
    throw error;
  }

  // Get public holidays for this month
  const holidayRows = query<{ date: string }>(
    `SELECT date FROM public_holidays WHERE date LIKE ?`,
    [`${month}-%`]
  );
  const holidays = holidayRows.map((h) => h.date);

  const { workingDaysCount, workingDates } = getMonthWorkingDays(year, monthNum, holidays);

  // Fetch all employees eligible up to this month
  const monthEndStr = `${month}-${String(new Date(year, monthNum, 0).getDate()).padStart(2, '0')}`;
  const employees = query<any>(
    `SELECT e.*, d.name as department_name, u.status as user_status
     FROM employees e
     LEFT JOIN departments d ON e.department_id = d.id
     LEFT JOIN users u ON e.user_id = u.id
     WHERE e.join_date <= ?
     ORDER BY e.id ASC`,
    [monthEndStr]
  );

  // Fetch all attendance records for this month
  const attendanceRecords = query<any>(
    `SELECT * FROM attendance WHERE date LIKE ?`,
    [`${month}-%`]
  );
  const attMap = new Map<string, any>();
  for (const r of attendanceRecords) {
    attMap.set(`${r.employee_id}_${r.date}`, r);
  }

  // Fetch all approved leaves for this month
  const approvedLeaves = query<any>(
    `SELECT lr.*, lt.name as leave_type_name
     FROM leave_requests lr
     JOIN leave_types lt ON lr.leave_type_id = lt.id
     WHERE lr.status = 'approved'
       AND (lr.start_date <= ? AND lr.end_date >= ?)`,
    [monthEndStr, `${month}-01`]
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const isPastMonth = month < todayStr.slice(0, 7);

  return transaction(() => {
    let runId: number;
    const now = new Date().toISOString();

    if (existingRun) {
      runId = existingRun.id;
      // Delete existing draft payslips to recompute
      run('DELETE FROM payslips WHERE payroll_run_id = ?', [runId]);
      run(
        `UPDATE payroll_runs SET status = 'draft', created_by = ?, created_at = ? WHERE id = ?`,
        [createdBy, now, runId]
      );
    } else {
      const runRes = run(
        `INSERT INTO payroll_runs (month, status, created_by, total_gross, total_net, employee_count, created_at)
         VALUES (?, 'draft', ?, 0, 0, 0, ?)`,
        [month, createdBy, now]
      );
      runId = runRes.lastInsertRowid;
    }

    let runTotalGross = 0;
    let runTotalNet = 0;
    let computedCount = 0;

    for (const emp of employees) {
      const basic = Number(emp.basic_salary) || 0;
      // 1. Salary structure per employee: GROSS = 1.5 × basic salary
      // HRA = 40% of basic, Medical = 10% of basic, remaining = allowances
      const gross = Math.round(basic * 1.5 * 100) / 100;
      const hra = Math.round(basic * 0.40 * 100) / 100;
      const medical = Math.round(basic * 0.10 * 100) / 100;
      const allowances = Math.max(0, Math.round((gross - basic - hra - medical) * 100) / 100);

      // Prorate if employee joined mid-month
      let eligibleWorkingDates = workingDates;
      if (emp.join_date > `${month}-01`) {
        eligibleWorkingDates = workingDates.filter((d) => d >= emp.join_date);
      }

      const prorateFactor = workingDaysCount > 0 ? (eligibleWorkingDates.length / workingDaysCount) : 1;
      const effectiveGross = Math.round(gross * prorateFactor * 100) / 100;
      const perDayRate = workingDaysCount > 0 ? (gross / workingDaysCount) : 0;

      // Count attendance & deductions
      let attendedDays = 0;
      let absentDays = 0;
      let unpaidLeaveDays = 0;
      let halfDays = 0;

      for (const date of eligibleWorkingDates) {
        // If current month, only evaluate days up to today
        if (!isPastMonth && date > todayStr) {
          continue; // future days are not absent yet
        }

        const att = attMap.get(`${emp.id}_${date}`);
        if (att) {
          if (att.status === 'half_day' || (att.work_hours > 0 && att.work_hours < 5)) {
            halfDays += 1;
            attendedDays += 0.5;
          } else {
            attendedDays += 1;
          }
        } else {
          // Check if on approved leave
          const leave = approvedLeaves.find(
            (l) => l.employee_id === emp.id && l.start_date <= date && l.end_date >= date
          );

          if (leave) {
            const isUnpaid = leave.leave_type_name.toLowerCase().includes('unpaid');
            if (isUnpaid) {
              unpaidLeaveDays += 1;
            } else {
              // Paid leave: count as excused, no deduction
              attendedDays += 1;
            }
          } else {
            absentDays += 1;
          }
        }
      }

      // Deductions: 1 day per ABSENT day, 1 day per UNPAID leave day, 0.5 day per HALF day
      const absentDeduction = Math.round(absentDays * 1 * perDayRate * 100) / 100;
      const unpaidLeaveDeduction = Math.round(unpaidLeaveDays * 1 * perDayRate * 100) / 100;
      const halfDayDeduction = Math.round(halfDays * 0.5 * perDayRate * 100) / 100;
      const totalDeductions = Math.round((absentDeduction + unpaidLeaveDeduction + halfDayDeduction) * 100) / 100;

      // Tax: compute on annualized gross (gross × 12) with these slabs:
      const annualGross = gross * 12;
      const annualTax = computeAnnualTax(annualGross);
      const monthlyTax = Math.round((annualTax / 12) * 100) / 100;

      // Net salary
      const netSalary = Math.max(0, Math.round((effectiveGross - totalDeductions - monthlyTax) * 100) / 100);

      run(
        `INSERT INTO payslips (
          payroll_run_id, employee_id, month, basic_salary, hra, medical, allowances,
          gross, working_days, attended_days, absent_days, unpaid_leave_days, half_days,
          prorate_factor, per_day_rate, absent_deduction, unpaid_leave_deduction, half_day_deduction,
          total_deductions, taxable_gross, annual_gross, annual_tax, monthly_tax, net_salary,
          status, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          'draft', ?
        )`,
        [
          runId, emp.id, month, basic, hra, medical, allowances,
          gross, workingDaysCount, attendedDays, absentDays, unpaidLeaveDays, halfDays,
          prorateFactor, Math.round(perDayRate * 100) / 100, absentDeduction, unpaidLeaveDeduction, halfDayDeduction,
          totalDeductions, effectiveGross, annualGross, Math.round(annualTax * 100) / 100, monthlyTax, netSalary,
          now
        ]
      );

      runTotalGross += gross;
      runTotalNet += netSalary;
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

    // 3. Notify all relevant employees in-app
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
          message: `Your payslip for ${payrollRun.month} is now finalized. Net Pay: $${Number(ps.net_salary).toLocaleString()}.`,
          type: 'payslip',
          link: '/payroll',
        });
      }
    }

    return queryOne<any>('SELECT * FROM payroll_runs WHERE id = ?', [runId]);
  });
}

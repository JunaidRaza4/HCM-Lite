import { query, queryOne } from '../db/database';
import { getMonthWorkingDays } from './payrollService';

export interface FilterOptions {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  departmentId?: number;
}

export function computeAttendanceRate(stats: {
  present: number;
  late: number;
  missing_checkout: number;
  half_day: number;
  total_working_records: number;
  on_leave: number;
}): number {
  const numerator = stats.present + stats.late + stats.missing_checkout + (0.5 * stats.half_day);
  const denominator = stats.total_working_records - stats.on_leave;
  if (denominator <= 0) return 0;
  const rate = (numerator / denominator) * 100;
  return Math.min(100, Math.max(0, Math.round(rate * 10) / 10));
}

export function getHrAnalytics(filters: FilterOptions = {}) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthStr = todayStr.slice(0, 7);

  // Department filter clause
  const deptClause = filters.departmentId ? 'AND e.department_id = ?' : '';
  const deptParams = filters.departmentId ? [filters.departmentId] : [];

  // 1. Headcount
  const headcountRow = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM employees e WHERE e.status = 'active' ${deptClause}`,
    deptParams
  );
  const headcount = headcountRow?.count || 0;

  // 2. Today's attendance counts
  const presentTodayRow = queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT a.employee_id) as count
     FROM attendance a
     JOIN employees e ON a.employee_id = e.id
     WHERE a.date = ? AND e.status = 'active' ${deptClause}`,
    [todayStr, ...deptParams]
  );
  const presentToday = presentTodayRow?.count || 0;

  const lateTodayRow = queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT a.employee_id) as count
     FROM attendance a
     JOIN employees e ON a.employee_id = e.id
     WHERE a.date = ? AND a.status = 'late' AND e.status = 'active' ${deptClause}`,
    [todayStr, ...deptParams]
  );
  const lateToday = lateTodayRow?.count || 0;

  const onLeaveTodayRow = queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT lr.employee_id) as count
     FROM leave_requests lr
     JOIN employees e ON lr.employee_id = e.id
     WHERE lr.status = 'approved' AND lr.start_date <= ? AND lr.end_date >= ?
       AND e.status = 'active' ${deptClause}`,
    [todayStr, todayStr, ...deptParams]
  );
  const onLeaveToday = onLeaveTodayRow?.count || 0;

  // 3. Pending approvals (pending leaves + pending corrections)
  const pendingLeavesRow = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM leave_requests lr
     JOIN employees e ON lr.employee_id = e.id
     WHERE lr.status = 'pending' ${deptClause}`,
    deptParams
  );
  const pendingCorrectionsRow = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM attendance_corrections ac
     JOIN employees e ON ac.employee_id = e.id
     WHERE ac.status = 'pending' ${deptClause}`,
    deptParams
  );
  const pendingApprovals = (pendingLeavesRow?.count || 0) + (pendingCorrectionsRow?.count || 0);

  // 4. Attendance trend (last 30 days daily attendance rate using the exact formula)
  const trendDays: Array<{
    date: string;
    rate: number;
    present: number;
    late: number;
    missing_checkout: number;
    half_day: number;
    on_leave: number;
    expected: number;
  }> = [];

  const holidays = query<{ date: string }>('SELECT date FROM public_holidays').map((h) => h.date);

  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = holidays.includes(dateStr);

    if (isWeekend || isHoliday) {
      continue; // only track working-day attendance
    }

    // Attendance stats for dateStr
    const atts = query<any>(
      `SELECT a.* FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       WHERE a.date = ? ${deptClause}`,
      [dateStr, ...deptParams]
    );

    const onLeave = queryOne<{ count: number }>(
      `SELECT COUNT(DISTINCT lr.employee_id) as count
       FROM leave_requests lr
       JOIN employees e ON lr.employee_id = e.id
       WHERE lr.status = 'approved' AND lr.start_date <= ? AND lr.end_date >= ? ${deptClause}`,
      [dateStr, dateStr, ...deptParams]
    )?.count || 0;

    let present = 0;
    let late = 0;
    let missing_checkout = 0;
    let half_day = 0;

    for (const a of atts) {
      if (a.status === 'half_day' || (a.work_hours > 0 && a.work_hours < 5)) {
        half_day += 1;
      } else if (a.status === 'late') {
        late += 1;
      } else if (a.status === 'present') {
        present += 1;
      }

      if (dateStr < todayStr && a.check_in && !a.check_out) {
        missing_checkout += 1;
      }
    }

    const totalWorkingRecords = headcount;
    const rate = computeAttendanceRate({
      present,
      late,
      missing_checkout,
      half_day,
      total_working_records: totalWorkingRecords,
      on_leave: onLeave,
    });

    trendDays.push({
      date: dateStr,
      rate,
      present,
      late,
      missing_checkout,
      half_day,
      on_leave: onLeave,
      expected: totalWorkingRecords,
    });
  }

  // 5. Absenteeism by department: (absent days ÷ expected working days)
  const departments = query<any>('SELECT * FROM departments ORDER BY name ASC');
  const absenteeismByDept: Array<{
    departmentId: number;
    departmentName: string;
    absentDays: number;
    expectedWorkingDays: number;
    absenteeismRate: number;
  }> = [];

  // Determine working days in this month up to today
  const [currY, currM] = currentMonthStr.split('-').map(Number);
  const { workingDates } = getMonthWorkingDays(currY, currM, holidays);
  const pastWorkingDatesThisMonth = workingDates.filter((d) => d <= todayStr);
  const workingDaysElapsed = pastWorkingDatesThisMonth.length || 1;

  for (const dept of departments) {
    if (filters.departmentId && dept.id !== filters.departmentId) continue;

    const deptEmps = query<any>(
      `SELECT id FROM employees WHERE department_id = ? AND status = 'active'`,
      [dept.id]
    );
    const expected = deptEmps.length * workingDaysElapsed;

    let absentCount = 0;
    for (const emp of deptEmps) {
      for (const wDate of pastWorkingDatesThisMonth) {
        const att = queryOne('SELECT id FROM attendance WHERE employee_id = ? AND date = ?', [emp.id, wDate]);
        if (!att) {
          const leave = queryOne(
            `SELECT id FROM leave_requests WHERE employee_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?`,
            [emp.id, wDate, wDate]
          );
          if (!leave) {
            absentCount += 1;
          }
        }
      }
    }

    const rate = expected > 0 ? (absentCount / expected) * 100 : 0;
    absenteeismByDept.push({
      departmentId: dept.id,
      departmentName: dept.name,
      absentDays: absentCount,
      expectedWorkingDays: expected,
      absenteeismRate: Math.round(rate * 10) / 10,
    });
  }

  // 6. Leave utilization per type (approved days ÷ quota), per department
  const leaveTypes = query<any>('SELECT * FROM leave_types ORDER BY name ASC');
  const leaveUtilization: Array<{
    departmentId: number;
    departmentName: string;
    leaveTypeId: number;
    leaveTypeName: string;
    quotaDays: number;
    totalQuota: number;
    approvedDays: number;
    utilizationRate: number;
  }> = [];

  for (const dept of departments) {
    if (filters.departmentId && dept.id !== filters.departmentId) continue;
    const deptEmpsCount = queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM employees WHERE department_id = ? AND status = "active"',
      [dept.id]
    )?.count || 0;

    for (const lt of leaveTypes) {
      const totalQuota = deptEmpsCount * lt.quota_days;
      const approvedRow = queryOne<{ total: number }>(
        `SELECT SUM(lr.days_count) as total
         FROM leave_requests lr
         JOIN employees e ON lr.employee_id = e.id
         WHERE lr.status = 'approved' AND lr.leave_type_id = ? AND e.department_id = ?`,
        [lt.id, dept.id]
      );
      const approvedDays = approvedRow?.total || 0;
      const utilRate = totalQuota > 0 ? (approvedDays / totalQuota) * 100 : 0;

      leaveUtilization.push({
        departmentId: dept.id,
        departmentName: dept.name,
        leaveTypeId: lt.id,
        leaveTypeName: lt.name,
        quotaDays: lt.quota_days,
        totalQuota,
        approvedDays,
        utilizationRate: Math.round(utilRate * 10) / 10,
      });
    }
  }

  // 7. Top 5 late-comers this month (most late days)
  const topLateComers = query<any>(
    `SELECT e.id as employee_id, e.name as employee_name, e.code as employee_code,
            d.name as department_name, e.designation,
            COUNT(a.id) as late_count
     FROM attendance a
     JOIN employees e ON a.employee_id = e.id
     LEFT JOIN departments d ON e.department_id = d.id
     WHERE a.status = 'late' AND a.date LIKE ? ${deptClause}
     GROUP BY e.id
     ORDER BY late_count DESC
     LIMIT 5`,
    [`${currentMonthStr}-%`, ...deptParams]
  );

  return {
    kpis: {
      headcount,
      presentToday,
      onLeaveToday,
      lateToday,
      pendingApprovals,
    },
    attendanceTrend: trendDays,
    absenteeismByDepartment: absenteeismByDept,
    leaveUtilization,
    topLateComers,
  };
}

export function getAdminAnalytics(filters: FilterOptions = {}) {
  const deptClause = filters.departmentId ? 'AND e.department_id = ?' : '';
  const deptParams = filters.departmentId ? [filters.departmentId] : [];

  // Headcount
  const headcountRow = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM employees e WHERE e.status = 'active' ${deptClause}`,
    deptParams
  );
  const headcount = headcountRow?.count || 0;

  // Attrition (exits in period ÷ average headcount × 100)
  const totalEmployeesEver = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM employees e WHERE 1=1 ${deptClause}`,
    deptParams
  )?.count || 1;
  const exitedCount = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM employees e WHERE e.status != 'active' ${deptClause}`,
    deptParams
  )?.count || 0;

  const avgHeadcount = (headcount + (headcount + exitedCount)) / 2 || 1;
  const attritionRate = Math.round((exitedCount / avgHeadcount) * 1000) / 10;

  // Payroll cost (sum of gross AND net) & average salary
  const latestPayrollRun = queryOne<any>(
    `SELECT * FROM payroll_runs ORDER BY month DESC LIMIT 1`
  );

  let totalGross = 0;
  let totalNet = 0;
  if (latestPayrollRun) {
    if (filters.departmentId) {
      const deptPay = queryOne<any>(
        `SELECT SUM(p.gross) as sum_gross, SUM(p.net_salary) as sum_net
         FROM payslips p
         JOIN employees e ON p.employee_id = e.id
         WHERE p.payroll_run_id = ? AND e.department_id = ?`,
        [latestPayrollRun.id, filters.departmentId]
      );
      totalGross = deptPay?.sum_gross || 0;
      totalNet = deptPay?.sum_net || 0;
    } else {
      totalGross = latestPayrollRun.total_gross || 0;
      totalNet = latestPayrollRun.total_net || 0;
    }
  }

  // Average basic/gross salary
  const avgSalRow = queryOne<{ avg_basic: number }>(
    `SELECT AVG(basic_salary) as avg_basic FROM employees e WHERE e.status = 'active' ${deptClause}`,
    deptParams
  );
  const averageBasic = avgSalRow?.avg_basic || 0;
  const averageGross = Math.round(averageBasic * 1.5 * 100) / 100;

  // Headcount by department
  const headcountByDept = query<any>(
    `SELECT d.id as department_id, d.name as department_name, COUNT(e.id) as headcount
     FROM departments d
     LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'active'
     GROUP BY d.id
     ORDER BY d.name ASC`
  );

  // Payroll cost by department (from latest payroll run or estimated gross)
  const payrollCostByDept = headcountByDept.map((dept) => {
    let deptGross = 0;
    let deptNet = 0;
    if (latestPayrollRun) {
      const row = queryOne<any>(
        `SELECT SUM(p.gross) as sum_gross, SUM(p.net_salary) as sum_net
         FROM payslips p
         JOIN employees e ON p.employee_id = e.id
         WHERE p.payroll_run_id = ? AND e.department_id = ?`,
        [latestPayrollRun.id, dept.department_id]
      );
      deptGross = row?.sum_gross || 0;
      deptNet = row?.sum_net || 0;
    } else {
      // Estimate from active employee salaries
      const row = queryOne<any>(
        `SELECT SUM(basic_salary) as sum_basic FROM employees WHERE department_id = ? AND status = 'active'`,
        [dept.department_id]
      );
      deptGross = (row?.sum_basic || 0) * 1.5;
      deptNet = deptGross * 0.85; // approx
    }

    return {
      departmentId: dept.department_id,
      departmentName: dept.department_name,
      headcount: dept.headcount,
      grossCost: Math.round(deptGross * 100) / 100,
      netCost: Math.round(deptNet * 100) / 100,
    };
  });

  // Audit feed of recent actions
  const auditFeed = query<any>(
    `SELECT * FROM audit_logs ORDER BY id DESC LIMIT 15`
  );

  return {
    kpis: {
      headcount,
      attritionRate,
      payrollCostGross: Math.round(totalGross * 100) / 100,
      payrollCostNet: Math.round(totalNet * 100) / 100,
      averageSalary: averageGross,
      latestPayrollMonth: latestPayrollRun?.month || null,
      latestPayrollStatus: latestPayrollRun?.status || null,
    },
    headcountByDepartment: headcountByDept,
    payrollCostByDepartment: payrollCostByDept,
    auditFeed,
  };
}

export function getEmployeeAnalytics(employeeId: number) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const currentMonthStr = todayStr.slice(0, 7);

  // 1. Hours worked this week (vs 40h target)
  // Calculate Monday of current week
  const dayOfWeek = today.getDay(); // 0 is Sunday
  const distanceToMonday = (dayOfWeek + 6) % 7; // Monday = 0, Sunday = 6
  const monday = new Date(today);
  monday.setDate(today.getDate() - distanceToMonday);
  const mondayStr = monday.toISOString().slice(0, 10);

  const weekHoursRow = queryOne<{ total: number }>(
    `SELECT SUM(work_hours) as total
     FROM attendance
     WHERE employee_id = ? AND date >= ? AND date <= ?`,
    [employeeId, mondayStr, todayStr]
  );
  const hoursWorkedThisWeek = Math.round((weekHoursRow?.total || 0) * 10) / 10;

  // 2. Late count this month
  const lateRow = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM attendance
     WHERE employee_id = ? AND status = 'late' AND date LIKE ?`,
    [employeeId, `${currentMonthStr}-%`]
  );
  const lateCountThisMonth = lateRow?.count || 0;

  // 3. Leave balance per type
  const leaveTypes = query<any>('SELECT * FROM leave_types ORDER BY id ASC');
  const balances = leaveTypes.map((lt) => {
    const usedRow = queryOne<{ total: number }>(
      `SELECT SUM(days_count) as total FROM leave_requests
       WHERE employee_id = ? AND leave_type_id = ? AND status = 'approved'`,
      [employeeId, lt.id]
    );
    const pendingRow = queryOne<{ total: number }>(
      `SELECT SUM(days_count) as total FROM leave_requests
       WHERE employee_id = ? AND leave_type_id = ? AND status = 'pending'`,
      [employeeId, lt.id]
    );
    const used = usedRow?.total || 0;
    const pending = pendingRow?.total || 0;
    const remaining = Math.max(0, lt.quota_days - used);

    return {
      id: lt.id,
      name: lt.name,
      quota: lt.quota_days,
      used,
      pending,
      remaining,
    };
  });

  // 4. Last payslip amount
  const lastPayslip = queryOne<any>(
    `SELECT p.*, pr.status as run_status
     FROM payslips p
     JOIN payroll_runs pr ON p.payroll_run_id = pr.id
     WHERE p.employee_id = ? AND pr.status = 'finalized'
     ORDER BY p.month DESC LIMIT 1`,
    [employeeId]
  );

  // 5. Announcements
  const announcements = query<any>(
    `SELECT * FROM announcements ORDER BY id DESC LIMIT 5`
  );

  return {
    hoursWorkedThisWeek,
    weeklyTargetHours: 40,
    lateCountThisMonth,
    leaveBalances: balances,
    lastPayslip: lastPayslip || null,
    announcements,
  };
}

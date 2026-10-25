import { Router, Response } from 'express';
import { query, queryOne, run, transaction } from '../db/database';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/authMiddleware';
import { logAudit } from '../services/auditService';
import { createNotification } from '../services/notificationService';

export const attendanceRouter = Router();

// Helper to get time in minutes from HH:MM string
function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
}

// Helper to get ISO date string (YYYY-MM-DD) from a Date object
function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to determine day of week name
function getDayName(d: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[d.getDay()];
}

function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// ================= 1. EMPLOYEE CHECK-IN =================
// The SERVER sets the timestamp (never trust the browser clock)
// One record per employee per day — a second check-in on the same day must return HTTP 409
attendanceRouter.post('/check-in', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!user.employeeId) {
      res.status(400).json({ error: 'No employee record associated with this account.' });
      return;
    }

    const employeeId = user.employeeId;
    const now = new Date();
    const today = getLocalDateString(now);

    // 2. Check if attendance record already exists for today
    const existing = queryOne<any>(
      `SELECT * FROM attendance WHERE employee_id = ? AND date = ?`,
      [employeeId, today]
    );

    if (existing) {
      // Return HTTP 409 Conflict as explicitly required!
      res.status(409).json({
        error: 'Attendance record already exists for today. Second check-in is not allowed.',
        checkInTime: existing.check_in,
        status: existing.status,
      });
      return;
    }

    // Retrieve company settings for shift start, grace period, and office geofence
    const company = queryOne<any>('SELECT * FROM companies LIMIT 1');
    const officeStart = company?.office_start || '09:00';
    const graceMins = Number(company?.grace_period_mins ?? 15);

    const { source, faceDescriptor, location } = req.body || {};

    let distanceMeters: number | null = null;
    let faceVerified = 0;
    let faceDescriptorStr: string | null = null;
    let locLat: number | null = null;
    let locLng: number | null = null;
    let locAccuracy: number | null = null;

    if (source === 'camera') {
      // Check face descriptor: exactly ONE face descriptor array
      if (!faceDescriptor || !Array.isArray(faceDescriptor) || faceDescriptor.length < 32) {
        res.status(400).json({
          error: 'Face verification failed: Missing or invalid face descriptor. Exactly one face must be detected.',
        });
        return;
      }

      // Check geolocation presence
      if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
        res.status(400).json({
          error: 'Location verification failed: Geolocation coordinates (lat, lng) are required for camera check-in.',
        });
        return;
      }

      const lat = Number(location.lat);
      const lng = Number(location.lng);
      const accuracy = typeof location.accuracy === 'number' ? location.accuracy : 0;

      locLat = lat;
      locLng = lng;
      locAccuracy = accuracy;

      // Accuracy check: accuracy > 100m ho to reject
      if (accuracy > 100) {
        res.status(400).json({
          error: `GPS accuracy too low (${Math.round(accuracy)}m). Accuracy must be 100m or better for verified check-in.`,
          accuracy,
        });
        return;
      }

      // Server Haversine formula calculation against office location
      const officeLat = Number(company?.office_lat ?? 24.8607);
      const officeLng = Number(company?.office_lng ?? 67.0011);
      const maxRadius = Number(company?.geofence_radius_meters ?? 150);
      const geofenceEnabled = company?.geofence_enabled !== 0;

      distanceMeters = calculateHaversineDistance(lat, lng, officeLat, officeLng);

      // Distance > radius (e.g. 150m) ho to reject
      if (geofenceEnabled && distanceMeters > maxRadius) {
        res.status(400).json({
          error: `Geofence validation failed: You are ${distanceMeters}m away from the office. Check-in is only permitted within ${maxRadius}m.`,
          distanceMeters,
          maxRadius,
          officeLat,
          officeLng,
        });
        return;
      }

      faceVerified = 1;
      faceDescriptorStr = JSON.stringify(faceDescriptor.slice(0, 32)); // Store compact mathematical vector
    }

    const startMinutes = parseTimeToMinutes(officeStart);
    const cutoffMinutes = startMinutes + graceMins; // e.g. 09:00 + 15 min = 09:15

    const checkInMinutes = now.getHours() * 60 + now.getMinutes();

    // 3. Status rule: late = check-in after office_start + grace (e.g. 09:15)
    const isLate = checkInMinutes > cutoffMinutes;
    const initialStatus = isLate ? 'late' : 'present';

    const checkInIso = now.toISOString();
    const result = run(
      `INSERT INTO attendance (
        employee_id, date, check_in, work_hours, status, source,
        location_lat, location_lng, location_accuracy, distance_meters,
        face_verified, face_descriptor, created_at, updated_at
      ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        employeeId,
        today,
        checkInIso,
        initialStatus,
        source === 'camera' ? 'camera' : 'web',
        locLat,
        locLng,
        locAccuracy,
        distanceMeters,
        faceVerified,
        faceDescriptorStr,
        checkInIso,
        checkInIso,
      ]
    );

    logAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: source === 'camera' ? 'CAMERA_FACE_CHECK_IN' : 'ATTENDANCE_CHECK_IN',
      entity: 'attendance',
      entityId: result.lastInsertRowid,
      details: {
        employeeId,
        date: today,
        checkIn: checkInIso,
        status: initialStatus,
        isLate,
        source: source === 'camera' ? 'camera' : 'web',
        distanceMeters,
        faceVerified,
      },
      ipAddress: req.ip,
    });

    const record = queryOne('SELECT * FROM attendance WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({
      success: true,
      message: source === 'camera'
        ? `Camera & Geofence verified! (${distanceMeters !== null ? distanceMeters + 'm from office' : 'Office'}). Marked ${isLate ? 'Late' : 'Present'}.`
        : isLate
        ? 'Checked in (marked Late after grace window).'
        : 'Checked in successfully on time!',
      attendance: record,
      distanceMeters,
      faceVerified: !!faceVerified,
      source: source === 'camera' ? 'camera' : 'web',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ================= 2. EMPLOYEE CHECK-OUT =================
attendanceRouter.post('/check-out', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!user.employeeId) {
      res.status(400).json({ error: 'No employee record associated with this account.' });
      return;
    }

    const employeeId = user.employeeId;
    const now = new Date();
    const today = getLocalDateString(now);

    const record = queryOne<any>(
      `SELECT * FROM attendance WHERE employee_id = ? AND date = ?`,
      [employeeId, today]
    );

    if (!record) {
      res.status(400).json({ error: 'You have not checked in today yet.' });
      return;
    }

    if (record.check_out) {
      res.status(400).json({ error: 'You have already checked out for today.' });
      return;
    }

    const { source, faceDescriptor, location } = req.body || {};

    const company = queryOne<any>('SELECT * FROM companies LIMIT 1');
    let outDistance: number | null = null;
    let outLat: number | null = null;
    let outLng: number | null = null;

    if (source === 'camera' && typeof location?.lat === 'number' && typeof location?.lng === 'number') {
      const lat = Number(location.lat);
      const lng = Number(location.lng);
      outLat = lat;
      outLng = lng;
      const officeLat = Number(company?.office_lat ?? 24.8607);
      const officeLng = Number(company?.office_lng ?? 67.0011);
      outDistance = calculateHaversineDistance(lat, lng, officeLat, officeLng);
    }

    const checkInTime = new Date(record.check_in);
    const checkOutTime = now;
    const checkOutIso = checkOutTime.toISOString();

    // Calculate duration in hours
    const durationMs = checkOutTime.getTime() - checkInTime.getTime();
    const workHours = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100;

    // 3. Status rules:
    // half_day = worked under 5 hours
    // late = check-in after grace period and >= 5 hours
    // present = on-time check-in and >= 5 hours
    let finalStatus = record.status;
    if (workHours < 5) {
      finalStatus = 'half_day';
    } else if (record.status === 'late') {
      finalStatus = 'late';
    } else {
      finalStatus = 'present';
    }

    run(
      `UPDATE attendance
       SET check_out = ?, work_hours = ?, status = ?, updated_at = ?
       WHERE id = ?`,
      [checkOutIso, workHours, finalStatus, checkOutIso, record.id]
    );

    logAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'ATTENDANCE_CHECK_OUT',
      entity: 'attendance',
      entityId: record.id,
      details: {
        employeeId,
        date: today,
        checkOut: checkOutIso,
        workHours,
        status: finalStatus,
      },
      ipAddress: req.ip,
    });

    const updated = queryOne('SELECT * FROM attendance WHERE id = ?', [record.id]);
    res.json({
      success: true,
      message: `Checked out successfully! Total worked: ${workHours} hrs.`,
      attendance: updated,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ================= 3. GET TODAY'S ATTENDANCE STATUS FOR LOGGED-IN EMPLOYEE =================
attendanceRouter.get('/today', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!user.employeeId) {
      res.json({ checkedIn: false, checkedOut: false, record: null });
      return;
    }

    const today = getLocalDateString(new Date());
    const record = queryOne<any>(
      `SELECT * FROM attendance WHERE employee_id = ? AND date = ?`,
      [user.employeeId, today]
    );

    res.json({
      date: today,
      checkedIn: !!record,
      checkedOut: !!record?.check_out,
      record: record || null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ================= 4. EMPLOYEE MONTHLY CALENDAR VIEW =================
// Own records only, monthly, color-coded status
attendanceRouter.get('/my-monthly', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!user.employeeId) {
      res.status(400).json({ error: 'No employee record associated with this account.' });
      return;
    }

    const employeeId = user.employeeId;
    const monthParam = (req.query.month as string) || getLocalDateString(new Date()).slice(0, 7); // e.g. "2026-10"

    const company = queryOne<any>('SELECT * FROM companies LIMIT 1');
    const weekendDays = (company?.weekend_days || 'Saturday,Sunday').split(',').map((d: string) => d.trim().toLowerCase());

    // 1. Fetch attendance records for this month
    const records = query<any>(
      `SELECT * FROM attendance
       WHERE employee_id = ? AND date LIKE ?
       ORDER BY date ASC`,
      [employeeId, `${monthParam}-%`]
    );

    // 2. Fetch approved leaves for this employee in this month
    const approvedLeaves = query<any>(
      `SELECT lr.*, lt.name as leave_type_name
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.employee_id = ? AND lr.status = 'approved'
         AND (lr.start_date LIKE ? OR lr.end_date LIKE ? OR (lr.start_date <= ? AND lr.end_date >= ?))`,
      [employeeId, `${monthParam}-%`, `${monthParam}-%`, `${monthParam}-01`, `${monthParam}-31`]
    );

    // 3. Fetch public holidays for this month
    const holidays = query<any>(
      `SELECT * FROM public_holidays WHERE date LIKE ?`,
      [`${monthParam}-%`]
    );

    // Map records by date for fast lookup
    const recordMap = new Map<string, any>();
    for (const r of records) {
      // Check for missing checkout on past days
      const recordDate = r.date;
      const today = getLocalDateString(new Date());
      let resolvedStatus = r.status;
      if (recordDate < today && r.check_in && !r.check_out) {
        resolvedStatus = 'missing_checkout';
      }
      recordMap.set(recordDate, { ...r, status: resolvedStatus });
    }

    const holidaysMap = new Map<string, string>();
    for (const h of holidays) {
      holidaysMap.set(h.date, h.name);
    }

    // Generate full calendar days for the month
    const parts = monthParam.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = getLocalDateString(new Date());

    const calendarDays = [];
    let summaryCounts = {
      present: 0,
      late: 0,
      half_day: 0,
      missing_checkout: 0,
      on_leave: 0,
      absent: 0,
      weekend: 0,
      holiday: 0,
      total_work_hours: 0,
    };

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayDate = new Date(year, month - 1, day);
      const dayName = getDayName(dayDate).toLowerCase();
      const isWeekend = weekendDays.includes(dayName);
      const holidayName = holidaysMap.get(dateStr);

      const attendanceRecord = recordMap.get(dateStr);

      let dayStatus = 'none';
      let leaveInfo = null;

      if (attendanceRecord) {
        dayStatus = attendanceRecord.status;
        if (dayStatus === 'on_time') dayStatus = 'present';
        if (dayStatus === 'present') summaryCounts.present++;
        if (dayStatus === 'late') summaryCounts.late++;
        if (dayStatus === 'half_day') summaryCounts.half_day++;
        if (dayStatus === 'missing_checkout') summaryCounts.missing_checkout++;
        summaryCounts.total_work_hours += attendanceRecord.work_hours || 0;
      } else {
        // Check if approved leave exists
        const matchingLeave = approvedLeaves.find(
          (l) => l.start_date <= dateStr && l.end_date >= dateStr
        );

        if (matchingLeave) {
          dayStatus = 'on_leave';
          leaveInfo = matchingLeave.leave_type_name;
          summaryCounts.on_leave++;
        } else if (holidayName) {
          dayStatus = 'holiday';
          summaryCounts.holiday++;
        } else if (isWeekend) {
          dayStatus = 'weekend';
          summaryCounts.weekend++;
        } else if (dateStr < today) {
          // 3. Status rule: absent = past working day with no record and no approved leave
          dayStatus = 'absent';
          summaryCounts.absent++;
        }
      }

      calendarDays.push({
        date: dateStr,
        dayNumber: day,
        dayOfWeek: getDayName(dayDate),
        isWeekend,
        holidayName: holidayName || null,
        status: dayStatus,
        checkIn: attendanceRecord?.check_in || null,
        checkOut: attendanceRecord?.check_out || null,
        workHours: attendanceRecord?.work_hours || 0,
        leaveInfo,
      });
    }

    res.json({
      month: monthParam,
      summary: summaryCounts,
      days: calendarDays,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ================= 5. HR DAILY BOARD =================
// HR: daily board — all employees, check-in time, status, filter by date and department
attendanceRouter.get('/daily-board', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetDate = (req.query.date as string) || getLocalDateString(new Date());
    const departmentId = req.query.department_id as string;

    const company = queryOne<any>('SELECT * FROM companies LIMIT 1');
    const weekendDays = (company?.weekend_days || 'Saturday,Sunday').split(',').map((d: string) => d.trim().toLowerCase());

    const targetDateObj = new Date(targetDate + 'T12:00:00Z');
    const isWeekend = weekendDays.includes(getDayName(targetDateObj).toLowerCase());
    const holiday = queryOne<any>('SELECT * FROM public_holidays WHERE date = ?', [targetDate]);

    // Query active employees
    let empSql = `
      SELECT e.id, e.code, e.name, e.email, e.department_id, e.designation, d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.status = 'active'
    `;
    const empParams: any[] = [];
    if (departmentId) {
      empSql += ` AND e.department_id = ?`;
      empParams.push(Number(departmentId));
    }
    empSql += ` ORDER BY e.name ASC`;
    const employees = query<any>(empSql, empParams);

    // Query attendance for this date
    const attendanceList = query<any>(
      `SELECT * FROM attendance WHERE date = ?`,
      [targetDate]
    );
    const attMap = new Map<number, any>();
    for (const a of attendanceList) {
      attMap.set(a.employee_id, a);
    }

    // Query approved leaves covering this date
    const leavesList = query<any>(
      `SELECT lr.*, lt.name as leave_type_name
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.status = 'approved' AND lr.start_date <= ? AND lr.end_date >= ?`,
      [targetDate, targetDate]
    );
    const leaveMap = new Map<number, any>();
    for (const l of leavesList) {
      leaveMap.set(l.employee_id, l);
    }

    const todayStr = getLocalDateString(new Date());

    const board = employees.map((emp) => {
      const att = attMap.get(emp.id);
      const leave = leaveMap.get(emp.id);

      let status = 'absent';
      let checkIn = null;
      let checkOut = null;
      let workHours = 0;
      let leaveType = null;

      if (att) {
        checkIn = att.check_in;
        checkOut = att.check_out;
        workHours = att.work_hours || 0;
        status = att.status;

        // Check if missing checkout on past date
        if (targetDate < todayStr && checkIn && !checkOut) {
          status = 'missing_checkout';
        }
      } else if (leave) {
        status = 'on_leave';
        leaveType = leave.leave_type_name;
      } else if (holiday) {
        status = 'holiday';
      } else if (isWeekend) {
        status = 'weekend';
      } else if (targetDate > todayStr) {
        status = 'upcoming';
      } else {
        status = 'absent';
      }

      return {
        employeeId: emp.id,
        code: emp.code,
        name: emp.name,
        email: emp.email,
        departmentId: emp.department_id,
        departmentName: emp.department_name || 'General Staff',
        designation: emp.designation,
        checkIn,
        checkOut,
        workHours,
        status,
        leaveType,
      };
    });

    res.json({
      date: targetDate,
      isWeekend,
      holiday: holiday ? holiday.name : null,
      employees: board,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ================= 6. HR TODAY SUMMARY =================
// HR dashboard shows today's summary: present / late / on leave / absent
attendanceRouter.get('/today-summary', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const today = getLocalDateString(new Date());
    const company = queryOne<any>('SELECT * FROM companies LIMIT 1');
    const weekendDays = (company?.weekend_days || 'Saturday,Sunday').split(',').map((d: string) => d.trim().toLowerCase());

    const todayObj = new Date();
    const isWeekend = weekendDays.includes(getDayName(todayObj).toLowerCase());
    const holiday = queryOne<any>('SELECT * FROM public_holidays WHERE date = ?', [today]);

    // Active employees
    const activeEmployees = query<any>('SELECT id FROM employees WHERE status = "active"');
    const totalEmployees = activeEmployees.length;

    // Today's attendance records
    const attendanceRecords = query<any>('SELECT * FROM attendance WHERE date = ?', [today]);
    const checkedInEmpIds = new Set(attendanceRecords.map((a) => a.employee_id));

    let presentCount = 0;
    let lateCount = 0;
    for (const a of attendanceRecords) {
      presentCount++;
      if (a.status === 'late') {
        lateCount++;
      }
    }

    // Approved leaves covering today
    const leavesToday = query<any>(
      `SELECT employee_id FROM leave_requests
       WHERE status = 'approved' AND start_date <= ? AND end_date >= ?`,
      [today, today]
    );
    const onLeaveEmpIds = new Set(leavesToday.map((l) => l.employee_id));
    const onLeaveCount = onLeaveEmpIds.size;

    // Absent = active employees with no record and no approved leave
    let absentCount = 0;
    if (!isWeekend && !holiday) {
      for (const emp of activeEmployees) {
        if (!checkedInEmpIds.has(emp.id) && !onLeaveEmpIds.has(emp.id)) {
          absentCount++;
        }
      }
    }

    res.json({
      date: today,
      isWeekend,
      holiday: holiday ? holiday.name : null,
      totalEmployees,
      present: presentCount,
      late: lateCount,
      onLeave: onLeaveCount,
      absent: absentCount,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ================= 7. ATTENDANCE CORRECTIONS =================
// Employee can request an attendance correction with a reason; HR approves or rejects it from an inbox

// Request attendance correction
attendanceRouter.post('/corrections', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { target_date, check_in_time, check_out_time, reason, employee_id } = req.body;

    let targetEmpId: number;
    if (user.role === 'employee') {
      if (!user.employeeId) {
        res.status(400).json({ error: 'No employee record associated with this account.' });
        return;
      }
      targetEmpId = user.employeeId;
    } else {
      targetEmpId = Number(employee_id || user.employeeId);
    }

    if (!target_date || !check_in_time || !reason || !reason.trim()) {
      res.status(400).json({ error: 'Target date, check-in time, and reason are required.' });
      return;
    }

    const now = new Date().toISOString();
    const result = run(
      `INSERT INTO attendance_corrections (employee_id, date, check_in, check_out, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [
        targetEmpId,
        target_date.trim(),
        check_in_time.trim(),
        check_out_time ? check_out_time.trim() : null,
        reason.trim(),
        now,
      ]
    );

    logAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'ATTENDANCE_CORRECTION_REQUESTED',
      entity: 'attendance_correction',
      entityId: result.lastInsertRowid,
      details: {
        employeeId: targetEmpId,
        date: target_date,
        checkIn: check_in_time,
        checkOut: check_out_time,
        reason: reason.trim(),
      },
      ipAddress: req.ip,
    });

    const created = queryOne('SELECT * FROM attendance_corrections WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({
      success: true,
      message: 'Attendance correction request submitted for HR review.',
      correction: created,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List attendance corrections
attendanceRouter.get('/corrections', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const statusFilter = req.query.status as string;

    if (user.role === 'employee') {
      let sql = `
        SELECT ac.*, e.name as employee_name, e.code as employee_code, u.name as reviewer_name
        FROM attendance_corrections ac
        JOIN employees e ON ac.employee_id = e.id
        LEFT JOIN users u ON ac.reviewed_by = u.id
        WHERE ac.employee_id = ?
      `;
      const params: any[] = [user.employeeId];
      if (statusFilter) {
        sql += ` AND ac.status = ?`;
        params.push(statusFilter);
      }
      sql += ` ORDER BY ac.id DESC`;
      const list = query<any>(sql, params);
      res.json(list);
      return;
    }

    // HR and Admin can see all corrections
    let sql = `
      SELECT ac.*, e.name as employee_name, e.code as employee_code, d.name as department_name, u.name as reviewer_name
      FROM attendance_corrections ac
      JOIN employees e ON ac.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON ac.reviewed_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (statusFilter) {
      sql += ` AND ac.status = ?`;
      params.push(statusFilter);
    }
    sql += ` ORDER BY ac.id DESC`;

    const list = query<any>(sql, params);
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// HR approves or rejects attendance correction
attendanceRouter.put('/corrections/:id/status', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const correctionId = Number(req.params.id);
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      res.status(400).json({ error: 'Status must be approved or rejected.' });
      return;
    }

    const correction = queryOne<any>('SELECT * FROM attendance_corrections WHERE id = ?', [correctionId]);
    if (!correction) {
      res.status(404).json({ error: 'Correction request not found.' });
      return;
    }

    const now = new Date().toISOString();

    transaction(() => {
      // 1. Update correction status
      run(
        `UPDATE attendance_corrections
         SET status = ?, reviewed_by = ?, reviewed_at = ?
         WHERE id = ?`,
        [status, req.user!.id, now, correctionId]
      );

      // 2. If approved, apply the correction to attendance table
      if (status === 'approved') {
        const company = queryOne<any>('SELECT * FROM companies LIMIT 1');
        const officeStart = company?.office_start || '09:00';
        const graceMins = Number(company?.grace_period_mins ?? 15);
        const cutoffMinutes = parseTimeToMinutes(officeStart) + graceMins;

        // Parse check-in time string
        // Could be HH:mm or ISO format
        let checkInIso = correction.check_in;
        let checkInMinutes = 0;
        if (checkInIso.includes('T')) {
          const d = new Date(checkInIso);
          checkInMinutes = d.getHours() * 60 + d.getMinutes();
        } else if (checkInIso.includes(':')) {
          checkInMinutes = parseTimeToMinutes(checkInIso);
          checkInIso = `${correction.date}T${correction.check_in}:00.000Z`;
        }

        let checkOutIso = correction.check_out || null;
        let workHours = 0;

        if (checkOutIso) {
          if (!checkOutIso.includes('T') && checkOutIso.includes(':')) {
            checkOutIso = `${correction.date}T${correction.check_out}:00.000Z`;
          }
          const cin = new Date(checkInIso);
          const cout = new Date(checkOutIso);
          const durMs = cout.getTime() - cin.getTime();
          if (durMs > 0) {
            workHours = Math.round((durMs / (1000 * 60 * 60)) * 100) / 100;
          }
        }

        const isLate = checkInMinutes > cutoffMinutes;
        let resolvedStatus = 'on_time';
        if (workHours > 0 && workHours < 5) {
          resolvedStatus = 'half_day';
        } else if (isLate) {
          resolvedStatus = 'late';
        } else {
          resolvedStatus = 'on_time';
        }

        // Upsert attendance record
        const existingAtt = queryOne<any>(
          `SELECT id FROM attendance WHERE employee_id = ? AND date = ?`,
          [correction.employee_id, correction.date]
        );

        if (existingAtt) {
          run(
            `UPDATE attendance
             SET check_in = ?, check_out = ?, work_hours = ?, status = ?, notes = 'Adjusted via correction request', updated_at = ?
             WHERE id = ?`,
            [checkInIso, checkOutIso, workHours, resolvedStatus, now, existingAtt.id]
          );
        } else {
          run(
            `INSERT INTO attendance (employee_id, date, check_in, check_out, work_hours, status, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'Created via approved correction', ?, ?)`,
            [correction.employee_id, correction.date, checkInIso, checkOutIso, workHours, resolvedStatus, now, now]
          );
        }
      }

      logAudit({
        actorId: req.user!.id,
        actorName: req.user!.name,
        actorRole: req.user!.role,
        action: `ATTENDANCE_CORRECTION_${status.toUpperCase()}`,
        entity: 'attendance_correction',
        entityId: correctionId,
        details: {
          employeeId: correction.employee_id,
          date: correction.date,
          status,
        },
        ipAddress: req.ip,
      });

      // Send in-app notification to employee
      const targetEmp = queryOne<any>('SELECT user_id FROM employees WHERE id = ?', [correction.employee_id]);
      if (targetEmp?.user_id) {
        createNotification({
          userId: targetEmp.user_id,
          title: `Attendance Correction ${status.charAt(0).toUpperCase() + status.slice(1)}`,
          message: `Your correction request for ${correction.date} has been ${status}.`,
          type: 'correction',
          link: '/attendance',
        });
      }
    });

    const updated = queryOne<any>(
      `SELECT ac.*, e.name as employee_name, u.name as reviewer_name
       FROM attendance_corrections ac
       JOIN employees e ON ac.employee_id = e.id
       LEFT JOIN users u ON ac.reviewed_by = u.id
       WHERE ac.id = ?`,
      [correctionId]
    );

    res.json({
      success: true,
      message: `Correction request ${status}.`,
      correction: updated,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

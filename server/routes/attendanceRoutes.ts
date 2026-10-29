import { Router, Response } from 'express';
import { query, queryOne, run, transaction } from '../db/database';
import { authenticate, requireRole, AuthenticatedRequest } from '../middleware/authMiddleware';
import { logAudit } from '../services/auditService';
import { createNotification } from '../services/notificationService';
import { haversineMeters } from '../services/geoService';

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
      res.status(409).json({
        error: 'Attendance record already exists for today. Second check-in is not allowed.',
        checkInTime: existing.check_in,
        status: existing.status,
      });
      return;
    }

    // Retrieve company settings for shift start, grace period, and office location
    const compId = user.companyId || 1;
    const company = queryOne<any>('SELECT * FROM companies WHERE id = ?', [compId]) || queryOne<any>('SELECT * FROM companies LIMIT 1');
    const officeStart = company?.office_start || '09:00';
    const graceMins = Number(company?.grace_period_mins ?? 15);

    const officeLat = company?.office_lat !== null && company?.office_lat !== undefined ? Number(company.office_lat) : null;
    const officeLng = company?.office_lng !== null && company?.office_lng !== undefined ? Number(company.office_lng) : null;
    const officeRadius = Number(company?.office_radius ?? company?.geofence_radius_meters ?? 150);
    const hasOfficeLocation = officeLat !== null && officeLng !== null && !isNaN(officeLat) && !isNaN(officeLng);

    const body = req.body || {};
    const source = body.source === 'camera' ? 'camera' : 'web';
    const faceDescriptor = body.faceDescriptor;

    // Accept lat, lng, accuracy from top-level body or nested body.location
    let inputLat: number | null = body.lat !== undefined ? Number(body.lat) : (body.location?.lat !== undefined ? Number(body.location.lat) : null);
    let inputLng: number | null = body.lng !== undefined ? Number(body.lng) : (body.location?.lng !== undefined ? Number(body.location.lng) : null);
    let inputAccuracy: number | null = body.accuracy !== undefined ? Number(body.accuracy) : (body.location?.accuracy !== undefined ? Number(body.location.accuracy) : null);

    let distanceMeters: number | null = null;
    let faceVerified = 0;
    let faceDescriptorStr: string | null = null;

    if (source === 'camera') {
      if (!faceDescriptor || !Array.isArray(faceDescriptor) || faceDescriptor.length < 32) {
        res.status(400).json({
          error: 'Face verification failed: Missing or invalid face descriptor. Exactly one face must be detected.',
        });
        return;
      }

      // Camera check-in requires location
      if (inputLat === null || inputLng === null || isNaN(inputLat) || isNaN(inputLng)) {
        res.status(403).json({
          error: 'Location coordinates (lat, lng) are required for camera check-in.',
        });
        return;
      }

      faceVerified = 1;
      faceDescriptorStr = JSON.stringify(Array.from(faceDescriptor));
    }

    // Location enforcement rules
    if (hasOfficeLocation) {
      // If office location is set, verify location
      if (inputLat === null || inputLng === null || isNaN(inputLat) || isNaN(inputLng)) {
        res.status(403).json({
          error: 'Location permission chahiye attendance ke liye. Browser settings se allow karein.',
        });
        return;
      }

      // Rule a: accuracy > 100m -> reject HTTP 403
      if (inputAccuracy !== null && !isNaN(inputAccuracy) && inputAccuracy > 100) {
        res.status(403).json({
          error: `GPS accuracy too low (${Math.round(inputAccuracy)}m). Try again outdoors.`,
          accuracy: inputAccuracy,
        });
        return;
      }

      // Rule b: haversine distance > radius -> reject HTTP 403
      distanceMeters = haversineMeters(inputLat, inputLng, officeLat!, officeLng!);
      if (distanceMeters > officeRadius) {
        res.status(403).json({
          error: `You are ${distanceMeters}m away from office. Allowed radius: ${officeRadius}m.`,
          distanceMeters,
          allowedRadius: officeRadius,
          officeLat,
          officeLng,
        });
        return;
      }
    } else {
      // Office location not set: if coordinates are passed, calculate distance if feasible
      if (inputAccuracy !== null && !isNaN(inputAccuracy) && inputAccuracy > 100) {
        res.status(403).json({
          error: `GPS accuracy too low (${Math.round(inputAccuracy)}m). Try again outdoors.`,
          accuracy: inputAccuracy,
        });
        return;
      }
    }

    const startMinutes = parseTimeToMinutes(officeStart);
    const cutoffMinutes = startMinutes + graceMins;
    const checkInMinutes = now.getHours() * 60 + now.getMinutes();

    const isLate = checkInMinutes > cutoffMinutes;
    const initialStatus = isLate ? 'late' : 'present';

    const checkInIso = now.toISOString();
    const result = run(
      `INSERT INTO attendance (
        employee_id, date, check_in, work_hours, status, source,
        location_lat, location_lng, location_accuracy, distance_meters,
        checkin_lat, checkin_lng, checkin_accuracy,
        face_verified, face_descriptor, company_id, created_at, updated_at
      ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        employeeId,
        today,
        checkInIso,
        initialStatus,
        source,
        inputLat,
        inputLng,
        inputAccuracy,
        distanceMeters,
        inputLat,
        inputLng,
        inputAccuracy,
        faceVerified,
        faceDescriptorStr,
        compId,
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
        source,
        distanceMeters,
        accuracy: inputAccuracy,
        faceVerified,
      },
      ipAddress: req.ip,
    });

    const record = queryOne('SELECT * FROM attendance WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({
      success: true,
      message: distanceMeters !== null
        ? `Checked in successfully! (${distanceMeters}m from office). Marked ${isLate ? 'Late' : 'Present'}.`
        : isLate
        ? 'Checked in (marked Late after grace window).'
        : 'Checked in successfully on time!',
      attendance: record,
      distanceMeters,
      faceVerified: !!faceVerified,
      source,
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

    const body = req.body || {};
    const source = body.source === 'camera' ? 'camera' : 'web';
    const checkoutFaceDescriptor = body.faceDescriptor;
    let checkoutDescriptorStr: string | null = null;
    let faceVerified = record.face_verified || 0;

    // Face Vector Matching on Check-Out (Must match check-in vector)
    if (source === 'camera' || (record.face_descriptor && record.face_descriptor.length > 10)) {
      if (!checkoutFaceDescriptor || !Array.isArray(checkoutFaceDescriptor) || checkoutFaceDescriptor.length < 32) {
        res.status(400).json({
          error: 'Face verification required for check-out. Exactly one face must be detected in the camera frame.',
        });
        return;
      }

      if (record.face_descriptor) {
        try {
          const checkinVector = JSON.parse(record.face_descriptor);
          // Calculate Euclidean distance between check-in vector and checkout vector
          let sum = 0;
          const len = Math.min(checkinVector.length, checkoutFaceDescriptor.length);
          for (let i = 0; i < len; i++) {
            const diff = checkinVector[i] - checkoutFaceDescriptor[i];
            sum += diff * diff;
          }
          const distance = Math.sqrt(sum);
          const threshold = 0.55;

          if (distance > threshold) {
            res.status(403).json({
              error: `Face mismatch! Your checkout face does not match your check-in face vector (distance: ${distance.toFixed(2)}, allowed threshold: ${threshold}). Check-out denied.`,
              distance,
              threshold,
            });
            return;
          }

          faceVerified = 1;
          checkoutDescriptorStr = JSON.stringify(Array.from(checkoutFaceDescriptor));
        } catch (err: any) {
          console.error('Vector comparison error:', err);
        }
      } else {
        faceVerified = 1;
        checkoutDescriptorStr = JSON.stringify(Array.from(checkoutFaceDescriptor));
      }
    }

    let inputLat: number | null = body.lat !== undefined ? Number(body.lat) : (body.location?.lat !== undefined ? Number(body.location.lat) : null);
    let inputLng: number | null = body.lng !== undefined ? Number(body.lng) : (body.location?.lng !== undefined ? Number(body.location.lng) : null);
    let inputAccuracy: number | null = body.accuracy !== undefined ? Number(body.accuracy) : (body.location?.accuracy !== undefined ? Number(body.location.accuracy) : null);

    const compId = user.companyId || 1;
    const company = queryOne<any>('SELECT * FROM companies WHERE id = ?', [compId]) || queryOne<any>('SELECT * FROM companies LIMIT 1');
    const officeLat = company?.office_lat !== null && company?.office_lat !== undefined ? Number(company.office_lat) : null;
    const officeLng = company?.office_lng !== null && company?.office_lng !== undefined ? Number(company.office_lng) : null;
    const officeRadius = Number(company?.office_radius ?? company?.geofence_radius_meters ?? 150);
    const hasOfficeLocation = officeLat !== null && officeLng !== null && !isNaN(officeLat) && !isNaN(officeLng);

    let outDistance: number | null = null;
    if (inputLat !== null && inputLng !== null && !isNaN(inputLat) && !isNaN(inputLng)) {
      if (inputAccuracy !== null && !isNaN(inputAccuracy) && inputAccuracy > 100) {
        res.status(403).json({
          error: `GPS accuracy too low (${Math.round(inputAccuracy)}m). Try again outdoors.`,
          accuracy: inputAccuracy,
        });
        return;
      }

      if (hasOfficeLocation) {
        outDistance = haversineMeters(inputLat, inputLng, officeLat!, officeLng!);
        if (outDistance > officeRadius) {
          res.status(403).json({
            error: `You are ${outDistance}m away from office. Allowed radius: ${officeRadius}m.`,
            distanceMeters: outDistance,
            allowedRadius: officeRadius,
          });
          return;
        }
      }
    }

    const checkInTime = new Date(record.check_in);
    const checkOutTime = now;
    const checkOutIso = checkOutTime.toISOString();

    const durationMs = checkOutTime.getTime() - checkInTime.getTime();
    const workHours = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100;

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
       SET check_out = ?, work_hours = ?, status = ?,
           checkout_lat = ?, checkout_lng = ?, checkout_accuracy = ?, checkout_distance_meters = ?,
           checkout_face_descriptor = ?, face_verified = ?,
           updated_at = ?
       WHERE id = ?`,
      [checkOutIso, workHours, finalStatus, inputLat, inputLng, inputAccuracy, outDistance, checkoutDescriptorStr, faceVerified, checkOutIso, record.id]
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
        source,
        distanceMeters: outDistance,
      },
      ipAddress: req.ip,
    });

    const updated = queryOne('SELECT * FROM attendance WHERE id = ?', [record.id]);
    res.json({
      success: true,
      message: `Checked out successfully! Total worked: ${workHours} hrs.${outDistance !== null ? ` (${outDistance}m from office)` : ''}`,
      attendance: updated,
      distanceMeters: outDistance,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ================= 3. GET TODAY'S ATTENDANCE STATUS FOR LOGGED-IN EMPLOYEE =================
const handleGetTodayAttendance = (req: AuthenticatedRequest, res: Response) => {
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
};

attendanceRouter.get('/today', authenticate, handleGetTodayAttendance);
attendanceRouter.get('/my-today', authenticate, handleGetTodayAttendance);

// ================= 4. EMPLOYEE MONTHLY CALENDAR VIEW =================
// Own records only, monthly, color-coded status
const handleGetMonthlyAttendance = (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!user.employeeId) {
      res.status(400).json({ error: 'No employee record associated with this account.' });
      return;
    }

    const employeeId = user.employeeId;
    const monthParam = (req.query.month as string) || getLocalDateString(new Date()).slice(0, 7); // e.g. "2026-10"

    const compId = user.companyId || 1;
    const company = queryOne<any>('SELECT * FROM companies WHERE id = ?', [compId]) || queryOne<any>('SELECT * FROM companies LIMIT 1');
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
};

attendanceRouter.get('/my-monthly', authenticate, handleGetMonthlyAttendance);
attendanceRouter.get('/my-month', authenticate, handleGetMonthlyAttendance);

// ================= 5. HR DAILY BOARD =================
// HR: daily board — all employees, check-in time, status, filter by date and department
attendanceRouter.get('/daily-board', authenticate, requireRole('admin', 'hr'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetDate = (req.query.date as string) || getLocalDateString(new Date());
    const departmentId = req.query.department_id as string;

    const compId = req.user?.companyId || 1;
    const company = queryOne<any>('SELECT * FROM companies WHERE id = ?', [compId]) || queryOne<any>('SELECT * FROM companies LIMIT 1');
    const weekendDays = (company?.weekend_days || 'Saturday,Sunday').split(',').map((d: string) => d.trim().toLowerCase());

    const targetDateObj = new Date(targetDate + 'T12:00:00Z');
    const isWeekend = weekendDays.includes(getDayName(targetDateObj).toLowerCase());
    const holiday = queryOne<any>(
      'SELECT * FROM public_holidays WHERE date = ? AND (company_id = ? OR company_id IS NULL)',
      [targetDate, compId]
    );

    // Query active employees for this organization
    let empSql = `
      SELECT e.id, e.code, e.name, e.email, e.department_id, e.designation, d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.status = 'active' AND (e.company_id = ? OR e.company_id IS NULL)
    `;
    const empParams: any[] = [compId];
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
        checkIn,
        checkOut,
        workHours,
        status,
        leaveType,
        distanceMeters: att ? (att.distance_meters ?? null) : null,
        checkinLat: att ? (att.checkin_lat ?? att.location_lat ?? null) : null,
        checkinLng: att ? (att.checkin_lng ?? att.location_lng ?? null) : null,
        checkinAccuracy: att ? (att.checkin_accuracy ?? att.location_accuracy ?? null) : null,
        source: att ? att.source : null,
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

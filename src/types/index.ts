export type UserRole = 'admin' | 'hr' | 'employee';

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  mustChangePassword: boolean;
  employeeId?: number | null;
  employeeCode?: string | null;
  departmentName?: string | null;
  departmentId?: number | null;
  joinDate?: string | null;
  basicSalary?: number | null;
  phone?: string | null;
  designation?: string | null;
  status?: string;
  createdAt?: string;
}

export interface Company {
  id: number;
  name: string;
  office_start: string;
  grace_period_mins: number;
  weekend_days: string;
  office_lat?: number;
  office_lng?: number;
  office_radius?: number;
  geofence_radius_meters?: number;
  geofence_enabled?: number;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: number;
  name: string;
  description?: string | null;
  employee_count?: number;
  created_at: string;
}

export interface LeaveType {
  id: number;
  name: string;
  quota_days: number;
  description?: string | null;
  created_at: string;
}

export interface PublicHoliday {
  id: number;
  name: string;
  date: string;
  description?: string | null;
  created_at: string;
}

export interface Employee {
  id: number;
  user_id: number;
  code: string;
  name: string;
  email: string;
  department_id: number;
  department_name?: string;
  join_date: string;
  basic_salary: number;
  phone?: string | null;
  designation?: string | null;
  status: string;
  role?: string;
  must_change_password?: number;
  created_at: string;
  updated_at: string;
}

export interface LeaveBalance {
  id: number;
  name: string;
  quota: number;
  used: number;
  pending: number;
  remaining: number;
}

export interface LeaveRequest {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_code?: string;
  department_name?: string;
  leave_type_id: number;
  leave_type_name?: string;
  quota_days?: number;
  start_date: string;
  end_date: string;
  days_count: number;
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewed_by?: number | null;
  reviewer_name?: string | null;
  reviewed_at?: string | null;
  admin_comment?: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_id?: number | null;
  actor_name?: string | null;
  actor_role?: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  details?: string | null;
  ip_address?: string | null;
  created_at: string;
}

export interface AttendanceRecord {
  id: number;
  employee_id: number;
  date: string;
  check_in: string;
  check_out?: string | null;
  work_hours: number;
  status: string;
  notes?: string | null;
  source?: 'web' | 'camera' | string;
  location_lat?: number | null;
  location_lng?: number | null;
  location_accuracy?: number | null;
  distance_meters?: number | null;
  checkin_lat?: number | null;
  checkin_lng?: number | null;
  checkin_accuracy?: number | null;
  checkout_lat?: number | null;
  checkout_lng?: number | null;
  checkout_accuracy?: number | null;
  checkout_distance_meters?: number | null;
  face_verified?: number;
  created_at: string;
  updated_at: string;
}

export interface AttendanceCalendarDay {
  date: string;
  dayNumber: number;
  dayOfWeek: string;
  isWeekend: boolean;
  holidayName: string | null;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  workHours: number;
  leaveInfo?: string | null;
}

export interface AttendanceCorrection {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_code?: string;
  department_name?: string;
  date: string;
  check_in: string;
  check_out?: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: number | null;
  reviewer_name?: string | null;
  created_at: string;
}

export interface TodayAttendanceSummary {
  date: string;
  totalEmployees: number;
  present: number;
  late: number;
  onLeave: number;
  absent: number;
  isWeekend: boolean;
  holiday: string | null;
}

export interface DailyBoardEmployee {
  employeeId: number;
  code: string;
  name: string;
  email: string;
  departmentId: number;
  departmentName: string;
  designation?: string | null;
  checkIn: string | null;
  checkOut: string | null;
  workHours: number;
  status: string;
  leaveType?: string | null;
  distanceMeters?: number | null;
  checkinLat?: number | null;
  checkinLng?: number | null;
  checkinAccuracy?: number | null;
  source?: string | null;
}

export interface PayrollRun {
  id: number;
  month: string;
  status: 'draft' | 'finalized';
  created_by?: number | null;
  finalized_by?: number | null;
  creator_name?: string | null;
  finalizer_name?: string | null;
  total_gross: number;
  total_net: number;
  employee_count: number;
  created_at: string;
  finalized_at?: string | null;
}

export interface Payslip {
  id: number;
  payroll_run_id: number;
  employee_id: number;
  employee_name?: string;
  employee_code?: string;
  department_name?: string;
  designation?: string | null;
  email?: string;
  company_name?: string;
  month: string;
  basic_salary: number;
  hra: number;
  medical: number;
  allowances: number;
  gross: number;
  working_days: number;
  attended_days: number;
  absent_days: number;
  unpaid_leave_days: number;
  half_days: number;
  prorate_factor: number;
  per_day_rate: number;
  absent_deduction: number;
  unpaid_leave_deduction: number;
  half_day_deduction: number;
  total_deductions: number;
  taxable_gross: number;
  annual_gross: number;
  annual_tax: number;
  monthly_tax: number;
  net_salary: number;
  net_pay?: number;
  status: 'draft' | 'finalized';
  created_at: string;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  author_id?: number | null;
  author_name: string;
  author_role: string;
  created_at: string;
}

export interface InAppNotification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: string;
  link?: string | null;
  is_read: number;
  created_at: string;
}

export interface HrAnalyticsData {
  kpis: {
    headcount: number;
    presentToday: number;
    onLeaveToday: number;
    lateToday: number;
    pendingApprovals: number;
  };
  attendanceTrend: Array<{
    date: string;
    rate: number;
    present: number;
    late: number;
    missing_checkout: number;
    half_day: number;
    on_leave: number;
    expected: number;
  }>;
  absenteeismByDepartment: Array<{
    departmentId: number;
    departmentName: string;
    absentDays: number;
    expectedWorkingDays: number;
    absenteeismRate: number;
  }>;
  leaveUtilization: Array<{
    departmentId: number;
    departmentName: string;
    leaveTypeId: number;
    leaveTypeName: string;
    quotaDays: number;
    totalQuota: number;
    approvedDays: number;
    utilizationRate: number;
  }>;
  topLateComers: Array<{
    employee_id: number;
    employee_name: string;
    employee_code: string;
    department_name: string;
    designation?: string | null;
    late_count: number;
  }>;
}

export interface AdminAnalyticsData {
  kpis: {
    headcount: number;
    attritionRate: number;
    payrollCostGross: number;
    payrollCostNet: number;
    averageSalary: number;
    latestPayrollMonth: string | null;
    latestPayrollStatus: string | null;
  };
  headcountByDepartment: Array<{
    department_id: number;
    department_name: string;
    headcount: number;
  }>;
  payrollCostByDepartment: Array<{
    departmentId: number;
    departmentName: string;
    headcount: number;
    grossCost: number;
    netCost: number;
  }>;
  auditFeed: AuditLog[];
}

export interface EmployeeAnalyticsData {
  hoursWorkedThisWeek: number;
  weeklyTargetHours: number;
  lateCountThisMonth: number;
  leaveBalances: LeaveBalance[];
  lastPayslip: Payslip | null;
  announcements: Announcement[];
}

export interface SmartLeaveForm {
  leave_type_id: number;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  reason: string;
}



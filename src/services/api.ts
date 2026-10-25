import {
  Company, Department, Employee, LeaveBalance, LeaveRequest, LeaveType, PublicHoliday, AuditLog, User,
  AttendanceRecord, AttendanceCalendarDay, AttendanceCorrection, TodayAttendanceSummary, DailyBoardEmployee,
  PayrollRun, Payslip, Announcement, InAppNotification, HrAnalyticsData, AdminAnalyticsData, EmployeeAnalyticsData, SmartLeaveForm
} from '../types';

const TOKEN_KEY = 'hcm_lite_jwt_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error: any = new Error(data.error || `HTTP error ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return data as T;
}

export const api = {
  // Setup
  getSetupStatus: () => request<{ initialized: boolean }>('/api/setup/status'),
  initializeSetup: (data: {
    companyName: string;
    officeStart: string;
    gracePeriodMins: number;
    weekendDays: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  }) => request<{ success: boolean; message: string }>('/api/setup/initialize', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Auth
  login: (email: string, password: string) => request<{ token: string; user: User; company: Company }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),
  getMe: () => request<{ user: User; company: Company }>('/api/auth/me'),
  changePassword: (data: { currentPassword?: string; newPassword: string }) => request<{ success: boolean; token: string; message: string }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Company Settings
  getCompany: () => request<Company>('/api/company'),
  updateCompany: (data: Partial<Company>) => request<{ success: boolean; company: Company }>('/api/company', {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  // Departments
  getDepartments: () => request<Department[]>('/api/departments'),
  createDepartment: (data: { name: string; description?: string }) => request<Department>('/api/departments', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  deleteDepartment: (id: number) => request<{ success: boolean }>('/api/departments/' + id, {
    method: 'DELETE',
  }),

  // Leave Types
  getLeaveTypes: () => request<LeaveType[]>('/api/leave-types'),
  createLeaveType: (data: { name: string; quota_days: number; description?: string }) => request<LeaveType>('/api/leave-types', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateLeaveType: (id: number, data: { name?: string; quota_days?: number; description?: string }) => request<LeaveType>('/api/leave-types/' + id, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  deleteLeaveType: (id: number) => request<{ success: boolean }>('/api/leave-types/' + id, {
    method: 'DELETE',
  }),

  // Public Holidays
  getHolidays: () => request<PublicHoliday[]>('/api/holidays'),
  createHoliday: (data: { name: string; date: string; description?: string }) => request<PublicHoliday>('/api/holidays', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  deleteHoliday: (id: number) => request<{ success: boolean }>('/api/holidays/' + id, {
    method: 'DELETE',
  }),

  // Employees
  getNextEmployeeCode: () => request<{ nextCode: string }>('/api/employees/next-code'),
  getEmployees: (params?: { search?: string; department_id?: number | string }) => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.department_id) searchParams.set('department_id', String(params.department_id));
    const qs = searchParams.toString();
    return request<Employee[]>(`/api/employees${qs ? '?' + qs : ''}`);
  },
  getEmployee: (id: number) => request<Employee>(`/api/employees/${id}`),
  registerEmployee: (data: {
    code: string;
    name: string;
    email: string;
    department_id: number;
    join_date: string;
    basic_salary: number;
    phone?: string;
    designation?: string;
    custom_password?: string;
  }) => request<{ success: boolean; employee: Employee; temporaryPassword: string; message: string }>('/api/employees', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateEmployee: (id: number, data: Partial<Employee>) => request<Employee>(`/api/employees/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  // Leaves
  getLeaves: (employeeId?: number) => {
    const qs = employeeId ? `?employee_id=${employeeId}` : '';
    return request<{ requests: LeaveRequest[]; balances?: LeaveBalance[] }>(`/api/leaves${qs}`);
  },
  submitLeave: (data: {
    leave_type_id: number;
    start_date: string;
    end_date: string;
    days_count: number;
    reason?: string;
    employee_id?: number;
  }) => request<LeaveRequest>('/api/leaves', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateLeaveStatus: (id: number, status: 'approved' | 'rejected' | 'pending') => request<LeaveRequest>(`/api/leaves/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  }),

  // Audit Logs
  getAuditLogs: (params?: { entity?: string; action?: string; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.entity) sp.set('entity', params.entity);
    if (params?.action) sp.set('action', params.action);
    if (params?.limit) sp.set('limit', String(params.limit));
    const qs = sp.toString();
    return request<AuditLog[]>(`/api/audit-logs${qs ? '?' + qs : ''}`);
  },

  // Attendance Module
  checkIn: (data?: {
    source?: 'web' | 'camera';
    faceDescriptor?: number[];
    location?: { lat: number; lng: number; accuracy: number };
  }) => request<{
    success: boolean;
    message: string;
    attendance: AttendanceRecord;
    distanceMeters?: number;
    faceVerified?: boolean;
    source?: string;
  }>('/api/attendance/check-in', {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  }),
  checkOut: (data?: {
    source?: 'web' | 'camera';
    faceDescriptor?: number[];
    location?: { lat: number; lng: number; accuracy: number };
  }) => request<{ success: boolean; message: string; attendance: AttendanceRecord }>('/api/attendance/check-out', {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  }),
  getTodayAttendance: () => request<{ date: string; checkedIn: boolean; checkedOut: boolean; record: AttendanceRecord | null }>('/api/attendance/today'),
  getMyMonthlyAttendance: (month?: string) => {
    const qs = month ? `?month=${month}` : '';
    return request<{ month: string; summary: any; days: AttendanceCalendarDay[] }>(`/api/attendance/my-monthly${qs}`);
  },
  getDailyBoard: (date?: string, departmentId?: number | string) => {
    const sp = new URLSearchParams();
    if (date) sp.set('date', date);
    if (departmentId) sp.set('department_id', String(departmentId));
    const qs = sp.toString();
    return request<{ date: string; isWeekend: boolean; holiday: string | null; employees: DailyBoardEmployee[] }>(`/api/attendance/daily-board${qs ? '?' + qs : ''}`);
  },
  getTodaySummary: () => request<TodayAttendanceSummary>('/api/attendance/today-summary'),
  requestAttendanceCorrection: (data: { target_date: string; check_in_time: string; check_out_time?: string; reason: string; employee_id?: number }) => request<{ success: boolean; message: string; correction: AttendanceCorrection }>('/api/attendance/corrections', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  getAttendanceCorrections: (status?: string) => {
    const qs = status ? `?status=${status}` : '';
    return request<AttendanceCorrection[]>(`/api/attendance/corrections${qs}`);
  },
  updateCorrectionStatus: (id: number, status: 'approved' | 'rejected') => request<{ success: boolean; message: string; correction: AttendanceCorrection }>(`/api/attendance/corrections/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  }),

  // Payroll Lite (M6)
  createPayrollDraft: (month: string) => request<{ run: PayrollRun; payslips: Payslip[] }>('/api/payroll/draft', {
    method: 'POST',
    body: JSON.stringify({ month }),
  }),
  getPayrollRuns: () => request<PayrollRun[]>('/api/payroll/runs'),
  getPayrollRunDetails: (id: number) => request<{ run: PayrollRun; payslips: Payslip[] }>(`/api/payroll/runs/${id}`),
  finalizePayrollRun: (id: number) => request<{ success: boolean; message: string; run: PayrollRun }>(`/api/payroll/runs/${id}/finalize`, {
    method: 'POST',
  }),
  getMyPayslips: () => request<Payslip[]>('/api/payroll/my-payslips'),
  getPayslip: (id: number) => request<Payslip>(`/api/payroll/payslips/${id}`),

  // Dashboards & Analytics (M7)
  getHrAnalytics: (params?: { department_id?: number | string; start_date?: string; end_date?: string }) => {
    const sp = new URLSearchParams();
    if (params?.department_id) sp.set('department_id', String(params.department_id));
    if (params?.start_date) sp.set('start_date', params.start_date);
    if (params?.end_date) sp.set('end_date', params.end_date);
    const qs = sp.toString();
    return request<HrAnalyticsData>(`/api/analytics/hr${qs ? '?' + qs : ''}`);
  },
  getAdminAnalytics: (params?: { department_id?: number | string; start_date?: string; end_date?: string }) => {
    const sp = new URLSearchParams();
    if (params?.department_id) sp.set('department_id', String(params.department_id));
    if (params?.start_date) sp.set('start_date', params.start_date);
    if (params?.end_date) sp.set('end_date', params.end_date);
    const qs = sp.toString();
    return request<AdminAnalyticsData>(`/api/analytics/admin${qs ? '?' + qs : ''}`);
  },
  getEmployeeAnalytics: (employeeId?: number) => {
    const qs = employeeId ? `?employee_id=${employeeId}` : '';
    return request<EmployeeAnalyticsData>(`/api/analytics/employee${qs}`);
  },

  // Comms: Announcements & Notifications (M9)
  getAnnouncements: () => request<Announcement[]>('/api/announcements'),
  createAnnouncement: (data: { title: string; body: string }) => request<Announcement>('/api/announcements', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  deleteAnnouncement: (id: number) => request<{ success: boolean }>(`/api/announcements/${id}`, {
    method: 'DELETE',
  }),
  getNotifications: () => request<{ notifications: InAppNotification[]; unreadCount: number }>('/api/notifications'),
  getUnreadNotificationCount: () => request<{ unreadCount: number }>('/api/notifications/unread-count'),
  markNotificationRead: (id: number) => request<{ success: boolean; unreadCount: number }>(`/api/notifications/${id}/read`, {
    method: 'PUT',
  }),
  markAllNotificationsRead: () => request<{ success: boolean; unreadCount: number }>('/api/notifications/read-all', {
    method: 'PUT',
  }),

  // AI Assistant (M8)
  sendAiChat: (message: string) => request<{ reply: string; isAiGenerated: boolean; smartLeaveForm?: SmartLeaveForm | null }>('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  }),
  getAiLogs: () => request<any[]>('/api/ai/logs'),
};

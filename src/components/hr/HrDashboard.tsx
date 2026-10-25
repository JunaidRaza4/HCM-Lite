import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Umbrella, Building, ShieldAlert, Calendar, CheckCircle, CalendarDays, Inbox, DollarSign, BarChart3 } from 'lucide-react';
import { EmployeeManager } from './EmployeeManager';
import { LeaveReviewManager } from './LeaveReviewManager';
import { LeavePoliciesView } from '../common/LeavePoliciesView';
import { AuditLogTable } from '../common/AuditLogTable';
import { HrDailyAttendanceBoard } from '../attendance/HrDailyAttendanceBoard';
import { HrCorrectionInbox } from '../attendance/HrCorrectionInbox';
import { HrAttendanceSummaryCards } from '../attendance/HrAttendanceSummaryCards';
import { PayrollManager } from '../payroll/PayrollManager';
import { HrAnalyticsDashboard } from '../analytics/HrAnalyticsDashboard';
import { AnnouncementsBanner } from '../comms/AnnouncementsBanner';
import { api } from '../../services/api';

export const HrDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'daily-attendance' | 'analytics' | 'payroll' | 'corrections' | 'employees' | 'leaves' | 'policies' | 'audit'>('daily-attendance');
  const [stats, setStats] = useState({
    employeeCount: 0,
    departmentCount: 0,
    pendingLeavesCount: 0,
    pendingCorrectionsCount: 0,
  });

  const loadStats = async () => {
    try {
      const [employees, departments, leaves, corrections] = await Promise.all([
        api.getEmployees(),
        api.getDepartments(),
        api.getLeaves(),
        api.getAttendanceCorrections('pending'),
      ]);

      const pendingLeaves = leaves.requests?.filter((r) => r.status === 'pending').length || 0;

      setStats({
        employeeCount: employees.length,
        departmentCount: departments.length,
        pendingLeavesCount: pendingLeaves,
        pendingCorrectionsCount: corrections.length,
      });
    } catch (err) {
      console.error('Failed to load HR stats:', err);
    }
  };

  useEffect(() => {
    loadStats();
  }, [activeTab]);

  return (
    <div className="space-y-6">
      {/* Announcements */}
      <AnnouncementsBanner />

      {/* 6. HR Dashboard Today's Summary: present / late / on leave / absent */}
      <HrAttendanceSummaryCards />

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('daily-attendance')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'daily-attendance'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          <span>Daily Attendance</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'analytics'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Analytics & Trends</span>
        </button>

        <button
          onClick={() => setActiveTab('payroll')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'payroll'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Payroll Lite</span>
        </button>

        <button
          onClick={() => setActiveTab('corrections')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'corrections'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Inbox className="w-4 h-4" />
          <span>Correction Inbox</span>
          {stats.pendingCorrectionsCount > 0 && (
            <span className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold px-1.5 py-0.2 rounded-full text-[10px] border border-amber-200 dark:border-amber-800">
              {stats.pendingCorrectionsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('employees')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'employees'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Employees ({stats.employeeCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('leaves')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'leaves'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Umbrella className="w-4 h-4" />
          <span>Leave Approvals</span>
          {stats.pendingLeavesCount > 0 && (
            <span className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold px-1.5 py-0.2 rounded-full text-[10px] border border-amber-200 dark:border-amber-800">
              {stats.pendingLeavesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('policies')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'policies'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Policies</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'audit'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Audit Log</span>
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'daily-attendance' && <HrDailyAttendanceBoard />}
      {activeTab === 'analytics' && <HrAnalyticsDashboard />}
      {activeTab === 'payroll' && <PayrollManager />}
      {activeTab === 'corrections' && <HrCorrectionInbox />}
      {activeTab === 'employees' && <EmployeeManager />}
      {activeTab === 'leaves' && <LeaveReviewManager />}
      {activeTab === 'policies' && <LeavePoliciesView />}
      {activeTab === 'audit' && <AuditLogTable />}
    </div>
  );
};

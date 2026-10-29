import React, { useState, useEffect } from 'react';
import {
  Building, Calendar, Umbrella, Plus, Trash2, Edit3, Check, X, Clock,
  AlertCircle, MapPin, Navigation, Users, Key, ShieldCheck, UserPlus, Power, RotateCcw, Copy
} from 'lucide-react';
import { Department, LeaveType, PublicHoliday, Company } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export const AdminPoliciesManager: React.FC = () => {
  const { user: currentUser, company, updateCompanyState } = useAuth();
  const [activeTab, setActiveTab] = useState<'departments' | 'leaves' | 'holidays' | 'company' | 'users'>('departments');

  // State
  const [departments, setDepartments] = useState<Department[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // User Management State
  const [isAddingHr, setIsAddingHr] = useState(false);
  const [hrName, setHrName] = useState('');
  const [hrEmail, setHrEmail] = useState('');
  const [hrPassword, setHrPassword] = useState('');
  const [userCredsModal, setUserCredsModal] = useState<{ title: string; email: string; tempPassword: string } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // New Department Form
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');
  const [isAddingDept, setIsAddingDept] = useState(false);

  // New Leave Type Form
  const [newLeaveName, setNewLeaveName] = useState('');
  const [newLeaveQuota, setNewLeaveQuota] = useState<number>(10);
  const [newLeaveDesc, setNewLeaveDesc] = useState('');
  const [isAddingLeave, setIsAddingLeave] = useState(false);

  // New Holiday Form
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayDesc, setNewHolidayDesc] = useState('');
  const [isAddingHoliday, setIsAddingHoliday] = useState(false);

  // Edit Company State
  const [compName, setCompName] = useState(company?.name || '');
  const [compOfficeStart, setCompOfficeStart] = useState(company?.office_start || '09:00');
  const [compGrace, setCompGrace] = useState(company?.grace_period_mins || 15);
  const [compWeekends, setCompWeekends] = useState<string[]>(
    company?.weekend_days ? company.weekend_days.split(',') : ['Saturday', 'Sunday']
  );
  const [compOfficeLat, setCompOfficeLat] = useState<number>(company?.office_lat ?? 24.8607);
  const [compOfficeLng, setCompOfficeLng] = useState<number>(company?.office_lng ?? 67.0011);
  const [compGeofenceRadius, setCompGeofenceRadius] = useState<number>(company?.geofence_radius_meters ?? 150);
  const [compGeofenceEnabled, setCompGeofenceEnabled] = useState<boolean>(company?.geofence_enabled !== 0);

  useEffect(() => {
    if (company) {
      setCompName(company.name);
      setCompOfficeStart(company.office_start);
      setCompGrace(company.grace_period_mins);
      setCompWeekends(company.weekend_days ? company.weekend_days.split(',') : ['Saturday', 'Sunday']);
      if (company.office_lat !== undefined) setCompOfficeLat(company.office_lat);
      if (company.office_lng !== undefined) setCompOfficeLng(company.office_lng);
      if (company.geofence_radius_meters !== undefined) setCompGeofenceRadius(company.geofence_radius_meters);
      if (company.geofence_enabled !== undefined) setCompGeofenceEnabled(company.geofence_enabled !== 0);
    }
  }, [company]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [depts, leaves, hols, users] = await Promise.all([
        api.getDepartments(),
        api.getLeaveTypes(),
        api.getHolidays(),
        api.getUsers().catch(() => []),
      ]);
      setDepartments(depts);
      setLeaveTypes(leaves);
      setHolidays(hols);
      setUsersList(users);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load configuration data', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateHrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hrName.trim() || !hrEmail.trim()) {
      setMessage({ text: 'Name and email are required for HR account.', type: 'error' });
      return;
    }
    try {
      const res = await api.createHrUser({
        name: hrName.trim(),
        email: hrEmail.trim(),
        password: hrPassword.trim() || undefined,
      });
      setIsAddingHr(false);
      setHrName('');
      setHrEmail('');
      setHrPassword('');
      setUserCredsModal({
        title: 'HR Login Account Created',
        email: res.user.email,
        tempPassword: res.tempPassword,
      });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create HR account.', type: 'error' });
    }
  };

  const handleToggleUserStatus = async (userId: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await api.toggleUserStatus(userId, nextStatus);
      setMessage({ text: `User status set to ${nextStatus}.`, type: 'success' });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update user status.', type: 'error' });
    }
  };

  const handleResetPassword = async (userId: number, email: string) => {
    if (!confirm(`Generate a new temporary password for ${email}?`)) return;
    try {
      const res = await api.resetUserPassword(userId);
      setUserCredsModal({
        title: 'Temporary Password Generated',
        email,
        tempPassword: res.tempPassword,
      });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to reset password.', type: 'error' });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    try {
      await api.createDepartment({ name: newDeptName.trim(), description: newDeptDesc.trim() });
      setNewDeptName('');
      setNewDeptDesc('');
      setIsAddingDept(false);
      setMessage({ text: 'Department created successfully.', type: 'success' });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create department.', type: 'error' });
    }
  };

  const handleDeleteDepartment = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete the department "${name}"?`)) return;
    try {
      await api.deleteDepartment(id);
      setMessage({ text: `Department "${name}" deleted.`, type: 'success' });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to delete department.', type: 'error' });
    }
  };

  const handleCreateLeaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeaveName.trim()) return;
    try {
      await api.createLeaveType({
        name: newLeaveName.trim(),
        quota_days: Number(newLeaveQuota),
        description: newLeaveDesc.trim(),
      });
      setNewLeaveName('');
      setNewLeaveQuota(10);
      setNewLeaveDesc('');
      setIsAddingLeave(false);
      setMessage({ text: 'Leave type & yearly quota registered successfully.', type: 'success' });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create leave type.', type: 'error' });
    }
  };

  const handleDeleteLeaveType = async (id: number, name: string) => {
    if (!confirm(`Delete leave quota for "${name}"?`)) return;
    try {
      await api.deleteLeaveType(id);
      setMessage({ text: `Leave type "${name}" removed.`, type: 'success' });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to remove leave type.', type: 'error' });
    }
  };

  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayName.trim() || !newHolidayDate) return;
    try {
      await api.createHoliday({
        name: newHolidayName.trim(),
        date: newHolidayDate,
        description: newHolidayDesc.trim(),
      });
      setNewHolidayName('');
      setNewHolidayDate('');
      setNewHolidayDesc('');
      setIsAddingHoliday(false);
      setMessage({ text: 'Public holiday scheduled successfully.', type: 'success' });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to add holiday.', type: 'error' });
    }
  };

  const handleDeleteHoliday = async (id: number, name: string) => {
    if (!confirm(`Remove "${name}" from public holiday calendar?`)) return;
    try {
      await api.deleteHoliday(id);
      setMessage({ text: `Holiday "${name}" deleted.`, type: 'success' });
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to delete holiday.', type: 'error' });
    }
  };

  const [locSaving, setLocSaving] = useState(false);

  const handleSaveLocationOnly = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isNaN(compOfficeLat) || compOfficeLat < -90 || compOfficeLat > 90) {
      setMessage({ text: 'Latitude must be between -90 and 90.', type: 'error' });
      return;
    }
    if (isNaN(compOfficeLng) || compOfficeLng < -180 || compOfficeLng > 180) {
      setMessage({ text: 'Longitude must be between -180 and 180.', type: 'error' });
      return;
    }
    if (isNaN(compGeofenceRadius) || compGeofenceRadius < 50 || compGeofenceRadius > 5000) {
      setMessage({ text: 'Radius must be between 50 and 5000 meters.', type: 'error' });
      return;
    }

    setLocSaving(true);
    try {
      const res = await api.updateOfficeLocation({
        office_lat: Number(compOfficeLat),
        office_lng: Number(compOfficeLng),
        office_radius: Number(compGeofenceRadius),
      });
      updateCompanyState(res.company);
      setMessage({ text: 'Office location & radius updated successfully!', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update office location.', type: 'error' });
    } finally {
      setLocSaving(false);
    }
  };

  const handleSaveCompanyPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.updateCompany({
        name: compName,
        office_start: compOfficeStart,
        grace_period_mins: Number(compGrace),
        weekend_days: compWeekends.join(','),
        office_lat: Number(compOfficeLat),
        office_lng: Number(compOfficeLng),
        office_radius: Number(compGeofenceRadius),
        geofence_radius_meters: Number(compGeofenceRadius),
        geofence_enabled: compGeofenceEnabled ? 1 : 0,
      });
      updateCompanyState(res.company);
      setMessage({ text: 'Company attendance, geofence and office policy updated!', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update company policy.', type: 'error' });
    }
  };

  const toggleWeekend = (day: string) => {
    if (compWeekends.includes(day)) {
      setCompWeekends(compWeekends.filter((d) => d !== day));
    } else {
      setCompWeekends([...compWeekends, day]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {message && (
        <div
          className={`p-4 rounded-xl text-xs sm:text-sm flex items-center justify-between border ${
            message.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="font-medium">{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('departments')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'departments'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Departments ({departments.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('leaves')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'leaves'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <Umbrella className="w-4 h-4" />
          <span>Leave Types & Quotas ({leaveTypes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('holidays')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'holidays'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Public Holidays ({holidays.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('company')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'company'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Attendance & Policy</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'users'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>System Users & HR ({usersList.length})</span>
        </button>
      </div>

      {/* TAB 1: DEPARTMENTS */}
      {activeTab === 'departments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Company Departments</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Manage organizational structure and staff assignment units</p>
            </div>
            <button
              onClick={() => setIsAddingDept(!isAddingDept)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Department</span>
            </button>
          </div>

          {/* New department form */}
          {isAddingDept && (
            <form onSubmit={handleCreateDepartment} className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/30 p-4 rounded-xl shadow-xs space-y-3">
              <h4 className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">New Department</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="Department Name (e.g. Sales, Legal, Product)"
                  className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                />
                <input
                  type="text"
                  value={newDeptDesc}
                  onChange={(e) => setNewDeptDesc(e.target.value)}
                  placeholder="Optional description"
                  className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingDept(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
                >
                  Save Department
                </button>
              </div>
            </form>
          )}

          {/* Departments Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.length === 0 ? (
              <div className="col-span-full py-12 px-4 text-center bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl">
                <Building className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No departments created yet</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1 mb-4">
                  Define your company's organizational units (e.g. Engineering, Sales, Operations) to assign employees.
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddingDept(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create First Department</span>
                </button>
              </div>
            ) : (
              departments.map((dept) => (
              <div
                key={dept.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white text-sm">{dept.name}</span>
                    <button
                      onClick={() => handleDeleteDepartment(dept.id, dept.name)}
                      title="Delete department"
                      className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                    {dept.description || 'No description provided.'}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Assigned Employees:</span>
                  <span className="font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 px-2 py-0.5 rounded-md">
                    {dept.employee_count ?? 0} members
                  </span>
                </div>
              </div>
            )))}
          </div>
        </div>
      )}

      {/* TAB 2: LEAVE TYPES & QUOTAS */}
      {activeTab === 'leaves' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Statutory Leave Policies & Quotas</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Define annual leave categories and yearly day quotas per employee</p>
            </div>
            <button
              onClick={() => setIsAddingLeave(!isAddingLeave)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Leave Type</span>
            </button>
          </div>

          {isAddingLeave && (
            <form onSubmit={handleCreateLeaveType} className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/30 p-4 rounded-xl shadow-xs space-y-3">
              <h4 className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">New Leave Category</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  value={newLeaveName}
                  onChange={(e) => setNewLeaveName(e.target.value)}
                  placeholder="Leave Name (e.g. Parental, Study)"
                  className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                />
                <input
                  type="number"
                  min="1"
                  required
                  value={newLeaveQuota}
                  onChange={(e) => setNewLeaveQuota(Number(e.target.value))}
                  placeholder="Yearly Quota (Days)"
                  className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                />
                <input
                  type="text"
                  value={newLeaveDesc}
                  onChange={(e) => setNewLeaveDesc(e.target.value)}
                  placeholder="Policy guidelines description"
                  className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingLeave(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
                >
                  Save Leave Policy
                </button>
              </div>
            </form>
          )}

          {/* Leave Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {leaveTypes.length === 0 ? (
              <div className="col-span-full py-12 px-4 text-center bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl">
                <Umbrella className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No leave policies defined yet</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1 mb-4">
                  Define statutory leave quotas (e.g. Annual Leave, Sick Leave, Casual Leave) for your team.
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddingLeave(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create First Leave Policy</span>
                </button>
              </div>
            ) : (
              leaveTypes.map((lt) => (
              <div
                key={lt.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white text-base">{lt.name}</span>
                    <button
                      onClick={() => handleDeleteLeaveType(lt.id, lt.name)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                      title="Remove leave type"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{lt.description || 'Standard company leave entitlement.'}</p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/80 rounded-lg p-3 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Yearly Quota</span>
                  <div className="text-right">
                    <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{lt.quota_days}</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1">days / yr</span>
                  </div>
                </div>
              </div>
            )))}
          </div>
        </div>
      )}

      {/* TAB 3: PUBLIC HOLIDAYS */}
      {activeTab === 'holidays' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Public Holidays Calendar</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Official statutory holidays and non-working organizational calendar days</p>
            </div>
            <button
              onClick={() => setIsAddingHoliday(!isAddingHoliday)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Holiday</span>
            </button>
          </div>

          {isAddingHoliday && (
            <form onSubmit={handleCreateHoliday} className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/30 p-4 rounded-xl shadow-xs space-y-3">
              <h4 className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">Schedule Public Holiday</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  placeholder="Holiday Name (e.g. Christmas, Memorial Day)"
                  className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                />
                <input
                  type="date"
                  required
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                />
                <input
                  type="text"
                  value={newHolidayDesc}
                  onChange={(e) => setNewHolidayDesc(e.target.value)}
                  placeholder="Description or notes"
                  className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingHoliday(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
                >
                  Save Holiday
                </button>
              </div>
            </form>
          )}

          {/* Holiday List */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Holiday Name</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {holidays.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-slate-500">
                        No public holidays scheduled.
                      </td>
                    </tr>
                  ) : (
                    holidays.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                          {h.date}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                          {h.name}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {h.description || '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDeleteHoliday(h.id, h.name)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                            title="Delete holiday"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: COMPANY ATTENDANCE POLICY */}
      {activeTab === 'company' && (
        <form onSubmit={handleSaveCompanyPolicy} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Company Attendance & Workweek Policy</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Configure global shift start time, grace arrival window, and regular weekend rest days</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Company Name</label>
              <input
                type="text"
                required
                value={compName}
                onChange={(e) => setCompName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Office Start Time</label>
              <input
                type="time"
                required
                value={compOfficeStart}
                onChange={(e) => setCompOfficeStart(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs font-mono"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">Default work shift start (09:00)</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Grace Period (Minutes)</label>
              <input
                type="number"
                min="0"
                max="60"
                required
                value={compGrace}
                onChange={(e) => setCompGrace(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs font-mono"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">Allowed arrival threshold before late marking (15 min)</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Weekend Rest Days</label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                const isSelected = compWeekends.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWeekend(day)}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors text-center cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 6. Office Location (for attendance) Section */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700/80 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Office Location (for attendance)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Set GPS center and geofence boundary for all employee check-in validations
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!navigator.geolocation) {
                      alert('Geolocation is not supported by your browser.');
                      return;
                    }
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setCompOfficeLat(Number(pos.coords.latitude.toFixed(6)));
                        setCompOfficeLng(Number(pos.coords.longitude.toFixed(6)));
                        setMessage({ text: 'Acquired current location coordinates from browser GPS!', type: 'success' });
                      },
                      (err) => {
                        setMessage({ text: 'GPS acquisition failed: ' + err.message, type: 'error' });
                      },
                      { enableHighAccuracy: true }
                    );
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[#4F46E5] dark:text-indigo-300 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer shadow-2xs"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Use my current location</span>
                </button>

                <button
                  type="button"
                  disabled={locSaving}
                  onClick={handleSaveLocationOnly}
                  className="px-4 py-2 bg-[#4F46E5] hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {locSaving ? 'Saving...' : 'Save Location'}
                </button>
              </div>
            </div>

            {/* UI Hint as explicitly requested */}
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Hint:</strong> Admin office mein khada ho ke set kare (Stand in the office to calibrate exact GPS coordinates).
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Latitude (-90 to 90)
                </label>
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  required
                  value={compOfficeLat}
                  onChange={(e) => setCompOfficeLat(parseFloat(e.target.value))}
                  placeholder="e.g. 24.8607"
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Longitude (-180 to 180)
                </label>
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  required
                  value={compOfficeLng}
                  onChange={(e) => setCompOfficeLng(parseFloat(e.target.value))}
                  placeholder="e.g. 67.0011"
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Radius (meters, 50 to 5000)
                </label>
                <input
                  type="number"
                  min="50"
                  max="5000"
                  required
                  value={compGeofenceRadius}
                  onChange={(e) => setCompGeofenceRadius(parseInt(e.target.value, 10))}
                  placeholder="e.g. 150"
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="enableGeofenceCheck"
                checked={compGeofenceEnabled}
                onChange={(e) => setCompGeofenceEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 bg-white border-slate-300 dark:border-slate-700 focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="enableGeofenceCheck" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer font-medium">
                Enforce Geofencing (Reject attendance check-ins if distance &gt; {compGeofenceRadius}m or GPS accuracy &gt; 100m)
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-6 py-2.5 bg-[#4F46E5] hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Save All Company Policies
            </button>
          </div>
        </form>
      )}

      {/* TAB 5: SYSTEM USERS & HR LOGINS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">System User Accounts & HR Logins</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Manage login credentials, create HR managers, deactivate accounts, and reset passwords.</p>
            </div>
            <button
              onClick={() => setIsAddingHr(!isAddingHr)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>{isAddingHr ? 'Cancel' : 'Create HR Login'}</span>
            </button>
          </div>

          {/* New HR Form */}
          {isAddingHr && (
            <form onSubmit={handleCreateHrSubmit} className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-indigo-100 dark:border-indigo-950/60 space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                Register New HR Manager Account
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={hrName}
                    onChange={(e) => setHrName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Work Email *</label>
                  <input
                    type="email"
                    required
                    value={hrEmail}
                    onChange={(e) => setHrEmail(e.target.value)}
                    placeholder="hr.alex@company.com"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Password (Optional — auto-generated if blank)
                  </label>
                  <input
                    type="text"
                    value={hrPassword}
                    onChange={(e) => setHrPassword(e.target.value)}
                    placeholder="Leave blank to auto-generate"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingHr(false)}
                  className="px-3.5 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs"
                >
                  Create HR Login
                </button>
              </div>
            </form>
          )}

          {/* Users Table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Password Status</th>
                    <th className="py-3 px-4">Linked Staff</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {usersList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        {loading ? 'Loading user logins...' : 'No users found.'}
                      </td>
                    </tr>
                  ) : (
                    usersList.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>{u.name}</span>
                            {currentUser?.id === u.id && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                                (You)
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">{u.email}</div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            u.role === 'admin'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                              : u.role === 'hr'
                              ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            u.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {u.must_change_password ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                              <Key className="w-3 h-3 text-amber-600" />
                              Temporary / Must Reset
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                              <Check className="w-3 h-3 text-emerald-600" />
                              Active Password
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-slate-600 dark:text-slate-400">
                          {u.employee_code ? (
                            <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                              {u.employee_code} ({u.department_name || 'Staff'})
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">System Account</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                          <button
                            onClick={() => handleResetPassword(u.id, u.email)}
                            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md transition-colors cursor-pointer inline-flex items-center gap-1"
                            title="Generate a new temporary password"
                          >
                            <RotateCcw className="w-3 h-3 text-amber-600" />
                            <span>Reset Password</span>
                          </button>
                          {currentUser?.id !== u.id && (
                            <button
                              onClick={() => handleToggleUserStatus(u.id, u.status)}
                              className={`px-2 py-1 text-xs rounded-md transition-colors cursor-pointer inline-flex items-center gap-1 ${
                                u.status === 'active'
                                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                              }`}
                              title={u.status === 'active' ? 'Deactivate Login' : 'Re-activate Login'}
                            >
                              <Power className="w-3 h-3" />
                              <span>{u.status === 'active' ? 'Deactivate' : 'Activate'}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CREDENTIALS CONFIRMATION MODAL */}
      {userCredsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl relative text-slate-800 dark:text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{userCredsModal.title}</h3>
              </div>
              <button
                onClick={() => setUserCredsModal(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-200">
                Please copy and share this temporary password with the user. They will be forced to change it upon first login.
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Account Email:</span>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg font-mono text-xs text-slate-900 dark:text-white">
                  {userCredsModal.email}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Temporary Password:</span>
                <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 rounded-lg font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400 select-all border border-slate-200 dark:border-slate-700">
                  <span>{userCredsModal.tempPassword}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(userCredsModal.tempPassword);
                      setCopiedCreds(true);
                      setTimeout(() => setCopiedCreds(false), 2000);
                    }}
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer text-slate-600 dark:text-slate-300"
                    title="Copy password"
                  >
                    {copiedCreds ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 mt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setUserCredsModal(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

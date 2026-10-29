import React, { useState, useEffect } from 'react';
import {
  UserPlus, Search, Copy, Check, AlertCircle, Edit, ShieldAlert, Key, Filter,
  DollarSign, Calendar, Mail, Building, Phone, UserCheck, X,
  Download, Upload, Eye, FileSpreadsheet, CheckCircle2, Clock, TrendingUp, History
} from 'lucide-react';
import { Department, Employee } from '../../types';
import { api } from '../../services/api';

export const EmployeeManager: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  // Register Modal state
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [departmentId, setDepartmentId] = useState<number | ''>('');
  const [joinDate, setJoinDate] = useState(new Date().toISOString().split('T')[0]);
  const [basicSalary, setBasicSalary] = useState<number | ''>('');
  const [designation, setDesignation] = useState('');
  const [phone, setPhone] = useState('');
  const [regError, setRegError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Success credential modal
  const [createdCredentials, setCreatedCredentials] = useState<{
    employee: Employee;
    temporaryPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Edit employee modal
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // CSV Import & Export state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [dryRunReport, setDryRunReport] = useState<any | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<any | null>(null);

  // 360 Profile View state
  const [selected360EmpId, setSelected360EmpId] = useState<number | null>(null);
  const [profile360, setProfile360] = useState<any | null>(null);
  const [loading360, setLoading360] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empList, depts] = await Promise.all([
        api.getEmployees({
          search: search || undefined,
          department_id: deptFilter || undefined,
        }),
        api.getDepartments(),
      ]);
      setEmployees(empList);
      setDepartments(depts);
      if (depts.length > 0 && departmentId === '') {
        setDepartmentId(depts[0].id);
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, deptFilter]);

  const handleOpenRegister = async () => {
    setIsRegisterOpen(true);
    setRegError(null);
    try {
      const next = await api.getNextEmployeeCode();
      setCode(next.nextCode);
    } catch {
      setCode('EMP001');
    }
    if (departments.length > 0 && !departmentId) {
      setDepartmentId(departments[0].id);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);

    if (!code || !name || !email || !departmentId || !joinDate || basicSalary === '') {
      setRegError('Please provide all mandatory employee fields.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.registerEmployee({
        code: code.trim(),
        name: name.trim(),
        email: email.trim(),
        department_id: Number(departmentId),
        join_date: joinDate,
        basic_salary: Number(basicSalary),
        designation: designation ? designation.trim() : undefined,
        phone: phone ? phone.trim() : undefined,
      });

      // Show temporary credentials modal
      setCreatedCredentials({
        employee: res.employee,
        temporaryPassword: res.temporaryPassword,
      });

      // Reset form
      setIsRegisterOpen(false);
      setName('');
      setEmail('');
      setDesignation('');
      setPhone('');
      loadData();
    } catch (err: any) {
      setRegError(err.message || 'Failed to register employee.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!createdCredentials) return;
    const text = `HCM Lite Login Credentials:\nName: ${createdCredentials.employee.name}\nEmail: ${createdCredentials.employee.email}\nTemporary Password: ${createdCredentials.temporaryPassword}\nNote: You will be prompted to change your password upon first login.`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    try {
      await api.updateEmployee(editingEmployee.id, {
        name: editingEmployee.name,
        department_id: editingEmployee.department_id,
        basic_salary: editingEmployee.basic_salary,
        designation: editingEmployee.designation,
        phone: editingEmployee.phone,
        status: editingEmployee.status,
      });
      setEditingEmployee(null);
      loadData();
    } catch (err: any) {
      alert('Update failed: ' + err.message);
    }
  };

  const handleExportCsv = () => {
    const token = localStorage.getItem('token');
    fetch('/api/employees/export/csv', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hcm_employees_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(err => alert('Failed to export CSV: ' + err.message));
  };

  const handleOpen360 = async (empId: number) => {
    setSelected360EmpId(empId);
    setLoading360(true);
    setProfile360(null);
    try {
      const data = await api.getEmployee360(empId);
      setProfile360(data);
    } catch (err: any) {
      alert('Failed to load employee 360 profile: ' + err.message);
      setSelected360EmpId(null);
    } finally {
      setLoading360(false);
    }
  };

  const handleDryRun = async () => {
    if (!csvText.trim()) {
      setImportError('Please paste CSV contents or upload a .csv file first.');
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const res = await api.importEmployeesCsv({ csvText, dry_run: true });
      setDryRunReport(res);
    } catch (err: any) {
      setImportError(err.message || 'Dry-run validation failed');
    } finally {
      setImporting(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!csvText.trim()) return;
    setImporting(true);
    setImportError(null);
    try {
      const res = await api.importEmployeesCsv({ csvText, dry_run: false });
      setImportSuccess(res);
      setDryRunReport(null);
      setCsvText('');
      loadData();
    } catch (err: any) {
      setImportError(err.message || 'Failed to import employees');
    } finally {
      setImporting(false);
    }
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvText(content || '');
      setDryRunReport(null);
      setImportError(null);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5">
      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code, name, or email..."
              className="w-full pl-9 pr-3.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
            />
          </div>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium cursor-pointer shadow-xs"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            title="Download full employee roster as CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => {
              setIsImportOpen(true);
              setImportError(null);
              setDryRunReport(null);
              setImportSuccess(null);
            }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            title="Batch import employees from CSV with dry-run error check"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            <span>Import CSV</span>
          </button>

          <button
            onClick={handleOpenRegister}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Register New Employee</span>
          </button>
        </div>
      </div>

      {/* Guided Empty State when no departments exist */}
      {departments.length === 0 && !loading && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 p-4 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>No departments yet — create one first in <strong>Settings & Policies</strong> before registering employees.</span>
          </div>
        </div>
      )}

      {/* Employee List Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Employee Code</th>
                <th className="py-3 px-4">Name & Email</th>
                <th className="py-3 px-4">Department & Role</th>
                <th className="py-3 px-4">Join Date</th>
                <th className="py-3 px-4">Basic Salary</th>
                <th className="py-3 px-4">Password Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    {loading ? 'Loading employee roster...' : 'No employees registered yet. Click "Register New Employee" to get started.'}
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                      {emp.code}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-semibold text-slate-900 dark:text-white">{emp.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{emp.email}</div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-medium">
                        {emp.department_name || 'Unassigned'}
                      </span>
                      {emp.designation && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{emp.designation}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {emp.join_date}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono font-medium text-emerald-700 dark:text-emerald-400">
                      ${Number(emp.basic_salary).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {emp.must_change_password ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
                          <Key className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          Needs 1st Sign-in Change
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          Password Active
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                      <button
                        onClick={() => handleOpen360(emp.id)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                        title="View Employee 360 Profile"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingEmployee(emp)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                        title="Edit employee record"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* REGISTER EMPLOYEE MODAL */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-xl w-full p-6 shadow-2xl relative text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Register New Employee</h3>
              </div>
              <button
                onClick={() => setIsRegisterOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {regError && (
              <div className="mt-4 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 px-3.5 py-2.5 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>{regError}</span>
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Employee Code *</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. EMP001"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                  />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">Unique identifier for staff</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Legal Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Work Email Address *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane.doe@company.com"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                  />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">Used for employee login portal</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Department *</label>
                  {departments.length === 0 ? (
                    <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>No departments yet — create one first in Settings</span>
                    </div>
                  ) : (
                    <select
                      required
                      value={departmentId}
                      onChange={(e) => setDepartmentId(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                    >
                      <option value="">Select a department...</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Joining Date *</label>
                  <input
                    type="date"
                    required
                    value={joinDate}
                    onChange={(e) => setJoinDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Basic Monthly Salary ($) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={basicSalary}
                    onChange={(e) => setBasicSalary(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="5000"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Job Designation</label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Lead Software Engineer"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Phone Number (Optional)</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 019-2834"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg border border-indigo-200 dark:border-indigo-900/60 text-xs text-indigo-900 dark:text-indigo-300 space-y-1">
                <div className="font-semibold text-indigo-900 dark:text-white flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Auto-Generated Temporary Password
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                  HCM Lite will automatically create a login account and generate a one-time temporary password. The employee will be prompted to set their permanent password upon their first sign-in.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || departments.length === 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {departments.length === 0 ? 'Create Department First' : submitting ? 'Creating Employee...' : 'Register & Generate Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TEMPORARY CREDENTIALS SUCCESS DIALOG */}
      {createdCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl relative text-slate-800 dark:text-slate-100 space-y-5">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center border border-emerald-200 dark:border-emerald-500/30 mb-2">
                <Check className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Employee Onboarded!</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Account created for <span className="text-slate-900 dark:text-white font-semibold">{createdCredentials.employee.name}</span>
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/90 rounded-lg p-4 border border-slate-200 dark:border-slate-700 space-y-3 font-mono text-xs">
              <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                <span className="text-slate-500 dark:text-slate-400">Employee Code:</span>
                <span className="text-slate-900 dark:text-white font-semibold">{createdCredentials.employee.code}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                <span className="text-slate-500 dark:text-slate-400">Login Email:</span>
                <span className="text-slate-900 dark:text-white font-semibold">{createdCredentials.employee.email}</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-slate-500 dark:text-slate-400">Temporary Password:</span>
                <span className="text-amber-700 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-md text-sm">
                  {createdCredentials.temporaryPassword}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="font-semibold text-slate-900 dark:text-slate-200">First Sign-In Notice:</span> When this employee logs in for the first time, they will be prompted immediately to choose their own permanent password.
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCopyCredentials}
                className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-500" />}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Credentials'}</span>
              </button>

              <button
                type="button"
                onClick={() => setCreatedCredentials(null)}
                className="py-2 px-5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT EMPLOYEE MODAL */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl relative text-slate-800 dark:text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Edit className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Edit Employee: {editingEmployee.code}</h3>
              </div>
              <button
                onClick={() => setEditingEmployee(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateEmployee} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editingEmployee.name}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Department</label>
                  <select
                    value={editingEmployee.department_id}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, department_id: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Monthly Salary ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingEmployee.basic_salary}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, basic_salary: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Designation</label>
                  <input
                    type="text"
                    value={editingEmployee.designation || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, designation: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                  <select
                    value={editingEmployee.status}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, status: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive / On Leave</option>
                    <option value="terminated">Terminated</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV IMPORT MODAL */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl relative text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Batch Import Employees (CSV)</h3>
              </div>
              <button
                onClick={() => {
                  setIsImportOpen(false);
                  setImportSuccess(null);
                  setDryRunReport(null);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {importSuccess ? (
              <div className="mt-4 space-y-4">
                <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 p-4 rounded-xl text-xs">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{importSuccess.message}</span>
                  </div>
                  <p>All imported employee accounts have been assigned a secure temporary password and will be prompted to change it on their first login.</p>
                </div>

                {importSuccess.credentials_created && importSuccess.credentials_created.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Created Accounts & Temporary Passwords:</h4>
                    <div className="border border-slate-200 dark:border-slate-800 rounded-lg max-h-56 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          <tr>
                            <th className="py-2 px-3">Code</th>
                            <th className="py-2 px-3">Name</th>
                            <th className="py-2 px-3">Email</th>
                            <th className="py-2 px-3">Temp Password</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                          {importSuccess.credentials_created.map((c: any, i: number) => (
                            <tr key={i}>
                              <td className="py-2 px-3 font-bold text-indigo-600">{c.code}</td>
                              <td className="py-2 px-3 font-sans">{c.name}</td>
                              <td className="py-2 px-3">{c.email}</td>
                              <td className="py-2 px-3 text-amber-700 dark:text-amber-400 select-all">{c.tempPassword}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-3">
                  <button
                    onClick={() => {
                      setIsImportOpen(false);
                      setImportSuccess(null);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Upload .CSV File or Paste Contents:
                    </label>
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-medium cursor-pointer transition-colors">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Choose .CSV File</span>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={handleCsvFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <textarea
                    rows={6}
                    value={csvText}
                    onChange={(e) => {
                      setCsvText(e.target.value);
                      setDryRunReport(null);
                      setImportError(null);
                    }}
                    placeholder={`Employee Code,Full Name,Email,Department,Designation,Join Date,Basic Salary,Phone\nEMP001,John Smith,john@company.com,Engineering,Developer,2025-01-15,65000,+123456789\nEMP002,Sarah Connor,sarah@company.com,Finance,Analyst,2025-02-01,72000,+198765432`}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-[11px] focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1">
                    Headers supported: <code>Employee Code</code>, <code>Full Name</code>, <code>Email</code>, <code>Department</code>, <code>Designation</code>, <code>Join Date</code>, <code>Basic Salary</code>, <code>Phone</code>.
                  </span>
                </div>

                {importError && (
                  <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 px-3.5 py-2.5 rounded-lg text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{importError}</span>
                  </div>
                )}

                {/* Dry-run validation report */}
                {dryRunReport && (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Dry-Run Validation Report</span>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold">
                          {dryRunReport.valid_count} Valid
                        </span>
                        <span className={`px-2 py-0.5 rounded font-semibold ${dryRunReport.error_count > 0 ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                          {dryRunReport.error_count} Errors
                        </span>
                      </div>
                    </div>

                    {dryRunReport.error_count > 0 && (
                      <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-lg p-2.5 max-h-40 overflow-y-auto">
                        <div className="text-[11px] font-bold text-rose-800 dark:text-rose-300 mb-1">Errors Detected:</div>
                        <ul className="space-y-1 text-[11px] text-rose-700 dark:text-rose-200 list-disc list-inside">
                          {dryRunReport.errors.map((err: any, i: number) => (
                            <li key={i}>
                              <strong>Row {err.row}:</strong> {err.reason} {err.email ? `(${err.email})` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {dryRunReport.preview && dryRunReport.preview.length > 0 && (
                      <div>
                        <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Preview Valid Rows ({dryRunReport.preview.length} of {dryRunReport.valid_count}):</div>
                        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-x-auto">
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              <tr>
                                <th className="py-1 px-2">Code</th>
                                <th className="py-1 px-2">Name</th>
                                <th className="py-1 px-2">Email</th>
                                <th className="py-1 px-2">Department</th>
                                <th className="py-1 px-2">Salary</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                              {dryRunReport.preview.map((r: any, i: number) => (
                                <tr key={i}>
                                  <td className="py-1 px-2 font-mono font-bold text-indigo-600">{r.code}</td>
                                  <td className="py-1 px-2">{r.name}</td>
                                  <td className="py-1 px-2 font-mono text-[10px]">{r.email}</td>
                                  <td className="py-1 px-2">{r.department_name || '—'}</td>
                                  <td className="py-1 px-2 font-mono">${r.basic_salary}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={handleDryRun}
                    disabled={importing || !csvText.trim()}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {importing ? 'Checking...' : '1. Run Dry-Run Check'}
                  </button>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsImportOpen(false)}
                      className="px-3.5 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteImport}
                      disabled={importing || !csvText.trim() || (dryRunReport && dryRunReport.error_count > 0)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {importing ? 'Importing...' : '2. Execute Import'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EMPLOYEE 360 PROFILE VIEW MODAL */}
      {selected360EmpId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-4xl w-full p-6 shadow-2xl relative text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Employee 360 Profile View</h3>
              </div>
              <button
                onClick={() => setSelected360EmpId(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loading360 || !profile360 ? (
              <div className="py-16 text-center text-slate-500">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent mx-auto mb-2" />
                <p className="text-xs">Aggregating attendance, leaves, payroll & audit data...</p>
              </div>
            ) : (
              <div className="mt-4 space-y-5">
                {/* Profile Header Card */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-indigo-600 text-white font-bold text-lg flex items-center justify-center shadow-xs">
                      {profile360.employee.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-slate-900 dark:text-white">{profile360.employee.name}</h4>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                          {profile360.employee.code}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          profile360.employee.status === 'active'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                        }`}>
                          {profile360.employee.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-3 mt-1">
                        <span>{profile360.employee.designation || 'Staff'} • {profile360.employee.department_name || 'Unassigned'}</span>
                        <span>•</span>
                        <span>{profile360.employee.email}</span>
                        {profile360.employee.phone && (
                          <>
                            <span>•</span>
                            <span>{profile360.employee.phone}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>Joined: {profile360.employee.join_date}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Monthly Basic Salary</div>
                    <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      ${Number(profile360.employee.basic_salary).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* 4 Summary Stat Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                    <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Days Logged</span>
                    </div>
                    <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                      {profile360.attendance_summary.total_days}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {profile360.attendance_summary.present} Present • {profile360.attendance_summary.late} Late
                    </div>
                  </div>

                  <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                    <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                      <span>On-Time Rate</span>
                    </div>
                    <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                      {profile360.attendance_summary.total_days > 0
                        ? `${Math.round((profile360.attendance_summary.present / profile360.attendance_summary.total_days) * 100)}%`
                        : '100%'}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {profile360.attendance_summary.half_day} Half-day • {profile360.attendance_summary.absent} Absent
                    </div>
                  </div>

                  <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                    <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      <span>Remaining Leaves</span>
                    </div>
                    <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                      {profile360.leave_balances.reduce((acc: number, b: any) => acc + (b.remaining || 0), 0)} days
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Across all policy categories
                    </div>
                  </div>

                  <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                    <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                      <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                      <span>Payslips Issued</span>
                    </div>
                    <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                      {profile360.recent_payslips.length}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Last: {profile360.recent_payslips[0]?.month || 'None'}
                    </div>
                  </div>
                </div>

                {/* Leave Balances Breakdown */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">Leave Quota Balances</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {profile360.leave_balances.map((lb: any) => (
                      <div key={lb.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs">
                        <div className="flex justify-between items-center font-bold text-slate-800 dark:text-slate-200">
                          <span>{lb.name}</span>
                          <span className="text-indigo-600 dark:text-indigo-400 font-mono">{lb.remaining} left</span>
                        </div>
                        <div className="mt-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-indigo-600 h-1.5 rounded-full"
                            style={{ width: `${Math.min(100, ((lb.quota - lb.remaining) / (lb.quota || 1)) * 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                          <span>Used: {lb.used}d</span>
                          <span>Pending: {lb.pending}d</span>
                          <span>Quota: {lb.quota}d</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Attendance (Last 14 days) */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">Recent Attendance Logs</h4>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        <tr>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Check-In</th>
                          <th className="py-2 px-3">Check-Out</th>
                          <th className="py-2 px-3">Status</th>
                          <th className="py-2 px-3">Distance / Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {profile360.recent_attendance.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-4 text-center text-slate-500 text-xs">No attendance recorded yet.</td>
                          </tr>
                        ) : (
                          profile360.recent_attendance.map((a: any) => (
                            <tr key={a.id}>
                              <td className="py-2 px-3 font-mono font-medium">{a.date}</td>
                              <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">{a.check_in || '—'}</td>
                              <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">{a.check_out || '—'}</td>
                              <td className="py-2 px-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                  a.status === 'present'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : a.status === 'late'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                }`}>
                                  {a.status}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-500 text-[11px]">
                                {a.distance_meters !== null && a.distance_meters !== undefined ? `${Math.round(a.distance_meters)}m` : 'Web'} ({a.source || 'web'})
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Recent Payslips */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">Recent Payslips</h4>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        <tr>
                          <th className="py-2 px-3">Payroll Month</th>
                          <th className="py-2 px-3">Gross</th>
                          <th className="py-2 px-3">Deductions</th>
                          <th className="py-2 px-3">Net Salary</th>
                          <th className="py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                        {profile360.recent_payslips.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-4 text-center text-slate-500 text-xs font-sans">No finalized payroll runs for this employee yet.</td>
                          </tr>
                        ) : (
                          profile360.recent_payslips.map((p: any) => (
                            <tr key={p.id}>
                              <td className="py-2 px-3 font-bold text-indigo-600">{p.month}</td>
                              <td className="py-2 px-3">${Number(p.gross).toFixed(2)}</td>
                              <td className="py-2 px-3 text-rose-600">-${Number(p.total_deductions).toFixed(2)}</td>
                              <td className="py-2 px-3 font-bold text-emerald-600">${Number(p.net_salary).toFixed(2)}</td>
                              <td className="py-2 px-3 font-sans">
                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${
                                  p.status === 'finalized' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {p.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Audit Trail Timeline */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">Audit History</h4>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg max-h-36 overflow-y-auto">
                    {profile360.audit_history.length === 0 ? (
                      <div className="py-4 text-center text-slate-500 text-xs">No audit events recorded yet.</div>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px] p-2 space-y-1">
                        {profile360.audit_history.map((a: any, i: number) => (
                          <li key={i} className="flex items-center justify-between py-1">
                            <div>
                              <span className="font-semibold text-indigo-600 dark:text-indigo-400">{a.action}</span>
                              <span className="text-slate-500 ml-1.5">by {a.actor_name} ({a.actor_role})</span>
                            </div>
                            <span className="text-slate-400 font-mono text-[10px]">{new Date(a.created_at).toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => setSelected360EmpId(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                  >
                    Close Profile
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

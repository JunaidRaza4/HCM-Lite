import React, { useState, useEffect } from 'react';
import { DollarSign, Lock, Unlock, Play, CheckCircle2, AlertCircle, FileText, Search, Download, Calendar, Users, ShieldCheck, RefreshCw } from 'lucide-react';
import { PayrollRun, Payslip } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PayslipModal } from './PayslipModal';

export const PayrollManager: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
  const [isPayslipModalOpen, setIsPayslipModalOpen] = useState(false);

  // Month input for creating draft (defaults to current month YYYY-MM)
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [draftMonth, setDraftMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadRuns = async () => {
    setLoading(true);
    try {
      const data = await api.getPayrollRuns();
      setRuns(data);
      if (data.length > 0) {
        // Select first run if none selected or if current selection is not in list
        const active = selectedRun ? data.find((r) => r.id === selectedRun.id) || data[0] : data[0];
        setSelectedRun(active);
        await loadRunDetails(active.id);
      } else {
        setSelectedRun(null);
        setPayslips([]);
      }
    } catch (err: any) {
      console.error('Failed to load payroll runs:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRunDetails = async (runId: number) => {
    try {
      const details = await api.getPayrollRunDetails(runId);
      setSelectedRun(details.run);
      setPayslips(details.payslips);
    } catch (err: any) {
      console.error('Failed to load payroll run details:', err);
    }
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftMonth) return;

    setActionLoading(true);
    setNotification(null);
    try {
      const res = await api.createPayrollDraft(draftMonth);
      setNotification({
        type: 'success',
        message: `Payroll draft for ${draftMonth} generated successfully with ${res.payslips.length} employees.`,
      });
      await loadRuns();
      if (res.run) {
        setSelectedRun(res.run);
        setPayslips(res.payslips);
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to create payroll draft.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!selectedRun) return;
    if (!confirm(`Are you sure you want to FINALIZE and LOCK the payroll run for ${selectedRun.month}? Once finalized, no edits or re-runs are permitted.`)) {
      return;
    }

    setActionLoading(true);
    setNotification(null);
    try {
      const res = await api.finalizePayrollRun(selectedRun.id);
      setNotification({
        type: 'success',
        message: res.message || `Payroll run for ${selectedRun.month} has been finalized and locked! Employees have been notified.`,
      });
      await loadRuns();
      await loadRunDetails(selectedRun.id);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to finalize payroll run.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredPayslips = payslips.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.employee_name?.toLowerCase().includes(q) ||
      p.employee_code?.toLowerCase().includes(q) ||
      p.department_name?.toLowerCase().includes(q) ||
      p.designation?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {notification && (
        <div className={`p-4 rounded-xl flex items-center justify-between text-xs sm:text-sm border ${
          notification.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
            : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-500/40 text-rose-800 dark:text-rose-200'
        }`}>
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-xs font-semibold px-2 py-1 rounded-md text-slate-500 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Action Bar: Create Monthly Draft Run */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Monthly Payroll Runs (Payroll Lite)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Salary structure (Gross = 1.5× Basic, HRA 40%, Medical 10%), working day deductions (Absent, Unpaid Leave, Half Days), and tax slabs.
          </p>
        </div>

        <form onSubmit={handleCreateDraft} className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs">
            <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <input
              type="month"
              value={draftMonth}
              onChange={(e) => setDraftMonth(e.target.value)}
              className="bg-transparent text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none cursor-pointer"
              required
            />
          </div>

          <button
            type="submit"
            disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Run Monthly Draft</span>
          </button>
        </form>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Runs Sidebar List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Payroll History</span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{runs.length} runs</span>
          </div>

          {runs.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 shadow-xs">
              No payroll runs created yet. Select a month above and click "Run Monthly Draft".
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => {
                const isSelected = selectedRun?.id === r.id;
                const isFinal = r.status === 'finalized';

                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSelectedRun(r);
                      loadRunDetails(r.id);
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/60 dark:bg-slate-800 border-indigo-300 dark:border-indigo-500/60 shadow-xs ring-1 ring-indigo-500/30'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">{r.month}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1 ${
                        isFinal
                          ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                          : 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
                      }`}>
                        {isFinal ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                        {r.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>{r.employee_count} employees</span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">Net: ${Number(r.total_net).toLocaleString()}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Run Details & Payslips */}
        <div className="lg:col-span-3 space-y-4">
          {selectedRun ? (
            <>
              {/* Selected Run Header Banner */}
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">Payroll Run: {selectedRun.month}</h3>
                      <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold flex items-center gap-1 ${
                        selectedRun.status === 'finalized'
                          ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                          : 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
                      }`}>
                        {selectedRun.status === 'finalized' ? (
                          <>
                            <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            FINALIZED & LOCKED
                          </>
                        ) : (
                          <>
                            <Unlock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            DRAFT STATE
                          </>
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {selectedRun.status === 'finalized'
                        ? `Finalized by Administrator. Payslips are permanently locked and available to employees.`
                        : `Draft run created. Review deductions and tax before Admin finalization.`}
                    </p>
                  </div>

                  {/* Finalize Button (ONLY Admin can finalize!) */}
                  {selectedRun.status === 'draft' && (
                    <div>
                      {isAdmin ? (
                        <button
                          onClick={handleFinalize}
                          disabled={actionLoading}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          <span>Finalize & Lock Payroll</span>
                        </button>
                      ) : (
                        <div className="text-xs px-3 py-2 rounded-lg bg-amber-50 dark:bg-slate-800/80 border border-amber-200 dark:border-slate-700 text-amber-700 dark:text-amber-400 flex items-center gap-1.5 font-medium">
                          <Lock className="w-3.5 h-3.5 text-amber-600" />
                          <span>Admin authorization required to finalize</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* KPI Metrics for this run */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="bg-slate-50 dark:bg-slate-800/70 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block font-semibold">Headcount</span>
                    <span className="text-lg font-bold text-slate-900 dark:text-white">{selectedRun.employee_count} Staff</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/70 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block font-semibold">Total Gross</span>
                    <span className="text-lg font-bold text-indigo-700 dark:text-indigo-400">${Number(selectedRun.total_gross).toLocaleString()}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/70 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block font-semibold">Total Net Pay</span>
                    <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">${Number(selectedRun.total_net).toLocaleString()}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/70 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block font-semibold">Total Taxes & Deds</span>
                    <span className="text-lg font-bold text-rose-700 dark:text-rose-400">
                      ${Math.max(0, Number(selectedRun.total_gross) - Number(selectedRun.total_net)).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Search filter */}
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search employee by name, code, department..."
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-xs"
                  />
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{filteredPayslips.length} payslips</span>
              </div>

              {/* Payslips Table */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 uppercase text-[11px] font-semibold tracking-wider border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Employee</th>
                        <th className="px-3 py-3">Department</th>
                        <th className="px-3 py-3">Basic</th>
                        <th className="px-3 py-3">Gross</th>
                        <th className="px-3 py-3">Working/Attended</th>
                        <th className="px-3 py-3">Deductions</th>
                        <th className="px-3 py-3">Tax</th>
                        <th className="px-3 py-3">Net Salary</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredPayslips.map((ps) => (
                        <tr key={ps.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-semibold text-slate-900 dark:text-white">{ps.employee_name}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{ps.employee_code}</div>
                          </td>
                          <td className="px-3 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{ps.department_name || 'General'}</td>
                          <td className="px-3 py-3 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">${Number(ps.basic_salary).toLocaleString()}</td>
                          <td className="px-3 py-3 font-mono font-semibold text-indigo-700 dark:text-indigo-400 whitespace-nowrap">${Number(ps.gross).toLocaleString()}</td>
                          <td className="px-3 py-3 whitespace-nowrap font-mono text-xs">
                            <span className="text-slate-900 dark:text-white font-medium">{ps.attended_days}</span>
                            <span className="text-slate-500 dark:text-slate-400"> / {ps.working_days}d</span>
                            {ps.absent_days > 0 && (
                              <span className="ml-1 text-[11px] text-rose-600 dark:text-rose-400 font-semibold">({ps.absent_days} abs)</span>
                            )}
                          </td>
                          <td className="px-3 py-3 font-mono text-rose-700 dark:text-rose-400 font-medium whitespace-nowrap">
                            {ps.total_deductions > 0 ? `-$${Number(ps.total_deductions).toLocaleString()}` : '$0'}
                          </td>
                          <td className="px-3 py-3 font-mono text-amber-700 dark:text-amber-400 font-medium whitespace-nowrap">
                            {ps.monthly_tax > 0 ? `-$${Number(ps.monthly_tax).toLocaleString()}` : '$0'}
                          </td>
                          <td className="px-3 py-3 font-mono font-bold text-emerald-700 dark:text-emerald-400 text-sm whitespace-nowrap">
                            ${Number(ps.net_salary).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => {
                                setSelectedPayslip(ps);
                                setIsPayslipModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shadow-xs"
                            >
                              <FileText className="w-3.5 h-3.5 text-slate-500" />
                              <span>View / PDF</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white dark:bg-slate-900 p-12 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-slate-500 space-y-2 shadow-xs">
              <DollarSign className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-base font-semibold text-slate-900 dark:text-white">No Payroll Run Selected</div>
              <p className="text-xs max-w-sm mx-auto">
                Create a new draft payroll run using the month selector above to compute salaries and tax slabs.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Payslip Modal with PDF generation */}
      <PayslipModal
        payslip={selectedPayslip}
        isOpen={isPayslipModalOpen}
        onClose={() => {
          setIsPayslipModalOpen(false);
          setSelectedPayslip(null);
        }}
      />
    </div>
  );
};

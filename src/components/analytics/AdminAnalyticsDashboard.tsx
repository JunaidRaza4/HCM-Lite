import React, { useState, useEffect } from 'react';
import { Users, TrendingDown, DollarSign, Wallet, Building, ShieldAlert, RefreshCw, Filter } from 'lucide-react';
import { AdminAnalyticsData, Department } from '../../types';
import { api } from '../../services/api';

export const AdminAnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [analytics, depts] = await Promise.all([
        api.getAdminAnalytics({
          department_id: selectedDept ? Number(selectedDept) : undefined,
        }),
        api.getDepartments(),
      ]);
      setData(analytics);
      setDepartments(depts);
    } catch (err) {
      console.error('Failed to load admin analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDept]);

  if (!data && loading) {
    return (
      <div className="p-12 text-center text-slate-400 space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-purple-400" />
        <span className="text-sm font-medium">Computing Admin Executive Metrics & Payroll Costs...</span>
      </div>
    );
  }

  const kpis = data?.kpis || {
    headcount: 0,
    attritionRate: 0,
    payrollCostGross: 0,
    payrollCostNet: 0,
    averageSalary: 0,
    latestPayrollMonth: null,
    latestPayrollStatus: null,
  };

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Executive Scope</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs shadow-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Department:</span>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-transparent text-slate-900 dark:text-white font-medium focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-white dark:bg-slate-900">All Organization Units</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id} className="bg-white dark:bg-slate-900">{d.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={loadData}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shadow-xs"
            title="Refresh Metrics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 4 Core Executive Admin KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Headcount */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Total Headcount</span>
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{kpis.headcount}</div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Active personnel</span>
        </div>

        {/* Attrition */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Attrition Rate</span>
            <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-500/20">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-700 dark:text-rose-400 font-mono">{kpis.attritionRate}%</div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">Exits ÷ Avg Headcount × 100</span>
        </div>

        {/* Payroll Cost */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Payroll ({kpis.latestPayrollMonth || 'Latest'})</span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white font-mono">
            ${kpis.payrollCostGross.toLocaleString()} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">Gross</span>
          </div>
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold block font-mono">
            Net: ${kpis.payrollCostNet.toLocaleString()}
          </span>
        </div>

        {/* Average Salary */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Average Salary</span>
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-400 font-mono">${kpis.averageSalary.toLocaleString()}</div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">1.5 × Basic average</span>
        </div>
      </div>

      {/* Headcount by Department & Payroll Cost by Department */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Headcount by Department */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Headcount by Department
          </h3>

          <div className="space-y-3">
            {(data?.headcountByDepartment || []).map((dept) => {
              const maxCount = Math.max(1, ...data!.headcountByDepartment.map((d) => d.headcount));
              const pct = (dept.headcount / maxCount) * 100;

              return (
                <div key={dept.department_id} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{dept.department_name}</span>
                    <span className="text-indigo-700 dark:text-indigo-400 font-bold">{dept.headcount} Staff</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${pct}%` }}
                      className="bg-indigo-600 h-full rounded-full transition-all"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payroll Cost by Department */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Payroll Cost by Department (Gross & Net)
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 uppercase font-semibold text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-3 py-2.5">Department</th>
                  <th className="px-3 py-2.5">Staff</th>
                  <th className="px-3 py-2.5">Gross Cost</th>
                  <th className="px-3 py-2.5 text-right">Net Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(data?.payrollCostByDepartment || []).map((dept) => (
                  <tr key={dept.departmentId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-white">{dept.departmentName}</td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 font-mono">{dept.headcount}</td>
                    <td className="px-3 py-2.5 font-bold text-indigo-700 dark:text-indigo-400 font-mono">${dept.grossCost.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-emerald-700 dark:text-emerald-400 font-mono">${dept.netCost.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Audit Feed of Recent Actions */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          Recent Audit Feed
        </h3>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {(data?.auditFeed || []).map((log) => (
            <div key={log.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {log.action}
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">{log.actor_name || 'System'}</span>
                <span className="text-slate-500 dark:text-slate-400">({log.actor_role})</span>
                <span className="text-slate-500 dark:text-slate-400">• {log.entity} #{log.entity_id}</span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {new Date(log.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

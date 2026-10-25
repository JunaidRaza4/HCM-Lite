import React, { useEffect, useState } from 'react';
import { Building, Umbrella, Calendar, Clock, RefreshCw } from 'lucide-react';
import { Department, LeaveType, PublicHoliday } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export const LeavePoliciesView: React.FC = () => {
  const { company } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [loading, setLoading] = useState(false);
  const [subTab, setSubTab] = useState<'leaves' | 'departments' | 'holidays'>('leaves');

  const loadData = async () => {
    setLoading(true);
    try {
      const [depts, leaves, hols] = await Promise.all([
        api.getDepartments(),
        api.getLeaveTypes(),
        api.getHolidays(),
      ]);
      setDepartments(depts);
      setLeaveTypes(leaves);
      setHolidays(hols);
    } catch (err) {
      console.error('Failed to load policies:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-5">
      {/* Policy overview ribbon */}
      {company && (
        <div className="bg-gradient-to-r from-indigo-50/70 via-white to-indigo-50/40 dark:from-slate-900 dark:via-indigo-950/40 dark:to-slate-900 p-4 rounded-3xl border border-indigo-100 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-4 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 dark:bg-indigo-600/20 dark:text-indigo-400 rounded-2xl border border-indigo-100 dark:border-indigo-500/30">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">Company Shift & Attendance Schedule</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Official check-in: <span className="font-mono text-indigo-700 dark:text-indigo-300 font-semibold">{company.office_start}</span> (Grace: <span className="text-amber-700 dark:text-amber-300 font-medium">{company.grace_period_mins} min</span>) • Weekend Rest: <span className="text-emerald-700 dark:text-emerald-300 font-medium">{company.weekend_days}</span>
              </div>
            </div>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-colors cursor-pointer border border-slate-200 dark:border-slate-700 shadow-2xs"
            title="Refresh policies"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setSubTab('leaves')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            subTab === 'leaves'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white hover:bg-slate-50 dark:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Umbrella className="w-3.5 h-3.5" />
          <span>Statutory Leave Quotas ({leaveTypes.length})</span>
        </button>

        <button
          onClick={() => setSubTab('departments')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            subTab === 'departments'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white hover:bg-slate-50 dark:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          <span>Departments ({departments.length})</span>
        </button>

        <button
          onClick={() => setSubTab('holidays')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            subTab === 'holidays'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white hover:bg-slate-50 dark:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-slate-700'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Public Holidays ({holidays.length})</span>
        </button>
      </div>

      {/* LEAVES */}
      {subTab === 'leaves' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {leaveTypes.map((lt) => (
            <div
              key={lt.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-3 shadow-xs transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">{lt.name}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{lt.description || 'Company entitled leave category'}</p>
                </div>
                <div className="p-2 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 rounded-xl border border-indigo-100 dark:border-indigo-500/20">
                  <Umbrella className="w-4 h-4" />
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/50 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Yearly Quota</span>
                <div>
                  <span className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-300">{lt.quota_days}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1">Days / Year</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DEPARTMENTS */}
      {subTab === 'departments' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <div
              key={dept.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-3 shadow-xs transition-colors"
            >
              <div className="flex items-start justify-between">
                <h4 className="text-base font-bold text-slate-900 dark:text-white">{dept.name}</h4>
                <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700">
                  <Building className="w-4 h-4" />
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{dept.description || 'Active organizational team'}</p>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Active Staff:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-200">{dept.employee_count ?? 0} members</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* HOLIDAYS */}
      {subTab === 'holidays' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs transition-colors">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Calendar Date</th>
                  <th className="py-3 px-4">Public Holiday</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {holidays.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-400 dark:text-slate-500">
                      No public holidays registered.
                    </td>
                  </tr>
                ) : (
                  holidays.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-indigo-600 dark:text-indigo-300 whitespace-nowrap">
                        {h.date}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">{h.name}</td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{h.description || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

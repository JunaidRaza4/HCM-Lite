import React, { useState } from 'react';
import { Building2, Lock, Mail, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface LoginPageProps {
  initialEmail?: string;
  setupSuccessMessage?: string | null;
}

export const LoginPage: React.FC<LoginPageProps> = ({ initialEmail = '', setupSuccessMessage = null }) => {
  const { login, company } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError('Please provide both email and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.login(email.trim(), password);
      login(res.token, res.user, res.company);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-150">
      <div className="max-w-md w-full mx-auto space-y-8">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3.5 bg-indigo-50 text-indigo-600 dark:bg-indigo-600/20 dark:text-indigo-400 rounded-2xl border border-indigo-100 dark:border-indigo-500/30 mb-2 shadow-xs">
            <Building2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            {company?.name || 'HCM Lite'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">
            Human Capital Management Portal
          </p>
        </div>

        {setupSuccessMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-200 px-4 py-3 rounded-2xl text-xs sm:text-sm flex items-center gap-3 animate-in fade-in shadow-xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{setupSuccessMessage}</span>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-200 px-4 py-3 rounded-2xl text-sm flex items-center gap-3 animate-in fade-in shadow-xs">
            <div className="w-2 h-2 rounded-full bg-rose-600 dark:bg-rose-400 shrink-0" />
            <span className="flex-1 text-xs">{error}</span>
          </div>
        )}

        {/* Login Card (Pure White #FFFFFF with #E5E7EB border) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm shadow-xs transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Password
                </label>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm shadow-xs transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Login Helper with Clean Pastel Chips */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block text-center uppercase tracking-wider">
              Quick Login Helper
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setEmail('admin@company.com');
                  setPassword('admin123');
                  setError(null);
                }}
                className="p-3 bg-slate-50 hover:bg-indigo-50/50 dark:bg-slate-800/80 dark:hover:bg-slate-750 text-indigo-700 dark:text-indigo-300 rounded-2xl border border-slate-200 dark:border-slate-700 text-left transition-colors cursor-pointer shadow-xs"
              >
                <span className="font-bold block text-slate-900 dark:text-white">👑 Admin</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">admin@company.com</span>
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono font-medium">admin123</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEmail('hi@gmail.com');
                  setPassword('password123');
                  setError(null);
                }}
                className="p-3 bg-slate-50 hover:bg-emerald-50/50 dark:bg-slate-800/80 dark:hover:bg-slate-750 text-emerald-700 dark:text-emerald-300 rounded-2xl border border-slate-200 dark:border-slate-700 text-left transition-colors cursor-pointer shadow-xs"
              >
                <span className="font-bold block text-slate-900 dark:text-white">👤 Employee</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">hi@gmail.com</span>
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono font-medium">password123</span>
              </button>
            </div>
          </div>
        </div>

        {company && (
          <div className="text-center text-xs text-slate-500 dark:text-slate-400">
            Work Hours: <span className="text-slate-700 dark:text-slate-300 font-medium">{company.office_start}</span> (Grace: <span className="text-slate-700 dark:text-slate-300 font-medium">{company.grace_period_mins}m</span>) • Weekends: <span className="text-slate-700 dark:text-slate-300 font-medium">{company.weekend_days}</span>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { FileEdit, X, Clock, Calendar, AlertCircle, CheckCircle2, History, Send, Loader2 } from 'lucide-react';
import { AttendanceCorrection } from '../../types';
import { api } from '../../services/api';

interface AttendanceCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: string;
  initialCheckIn?: string;
  initialCheckOut?: string;
  onCorrectionSubmitted?: () => void;
}

export const AttendanceCorrectionModal: React.FC<AttendanceCorrectionModalProps> = ({
  isOpen,
  onClose,
  initialDate,
  initialCheckIn,
  initialCheckOut,
  onCorrectionSubmitted,
}) => {
  const [targetDate, setTargetDate] = useState(
    initialDate || new Date(Date.now() - 86400000).toISOString().split('T')[0]
  );
  const [checkInTime, setCheckInTime] = useState('09:00');
  const [checkOutTime, setCheckOutTime] = useState('17:30');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [myCorrections, setMyCorrections] = useState<AttendanceCorrection[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await api.getAttendanceCorrections();
      setMyCorrections(data);
    } catch (err) {
      console.error('Failed to load correction history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
      if (initialDate) {
        setTargetDate(initialDate);
      }
      if (initialCheckIn) {
        const t = initialCheckIn.includes('T') ? initialCheckIn.slice(11, 16) : initialCheckIn;
        setCheckInTime(t || '09:00');
      } else {
        setCheckInTime('09:00');
      }
      if (initialCheckOut) {
        const t = initialCheckOut.includes('T') ? initialCheckOut.slice(11, 16) : initialCheckOut;
        setCheckOutTime(t || '17:30');
      } else {
        setCheckOutTime('17:30');
      }
    }
  }, [isOpen, initialDate, initialCheckIn, initialCheckOut]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!targetDate || !checkInTime || !reason.trim()) {
      setError('Please provide target date, check-in time, and a clear reason.');
      return;
    }

    setSubmitting(true);
    try {
      await api.requestAttendanceCorrection({
        target_date: targetDate,
        check_in_time: checkInTime,
        check_out_time: checkOutTime || undefined,
        reason: reason.trim(),
      });

      setSuccess(true);
      fetchHistory();
      if (onCorrectionSubmitted) onCorrectionSubmitted();

      setTimeout(() => {
        setSuccess(false);
        setReason('');
      }, 1800);
    } catch (err: any) {
      setError(err.message || 'Failed to submit correction request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 dark:bg-indigo-600/20 dark:text-indigo-400 rounded-xl border border-indigo-100 dark:border-indigo-500/30">
              <FileEdit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Attendance Correction Request</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Submit missing punches or time adjustments for HR approval
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-200 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Correction request submitted! HR will review it in the inbox.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Target Date *</label>
              <input
                type="date"
                required
                max={new Date().toISOString().split('T')[0]}
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Actual Check-In *</label>
              <input
                type="time"
                required
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Actual Check-Out</label>
              <input
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 shadow-2xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Reason for Adjustment *</label>
            <textarea
              required
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Forgot to punch in due to early morning client call; offsite on customer meeting..."
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Correction Request</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Previous Correction History */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <History className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>My Submitted Correction History</span>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto max-h-48">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Requested In / Out</th>
                    <th className="py-2.5 px-3">Reason</th>
                    <th className="py-2.5 px-3 text-right">HR Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {myCorrections.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400 text-[11px]">
                        No past correction requests submitted.
                      </td>
                    </tr>
                  ) : (
                    myCorrections.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-mono text-[11px] text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                          {c.date}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {c.check_in.slice(11, 16) || c.check_in} → {c.check_out ? c.check_out.slice(11, 16) || c.check_out : '—'}
                        </td>
                        <td className="py-2 px-3 max-w-xs truncate text-slate-600 dark:text-slate-300">
                          {c.reason}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          {c.status === 'approved' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30">
                              Approved
                            </span>
                          )}
                          {c.status === 'rejected' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30">
                              Rejected
                            </span>
                          )}
                          {c.status === 'pending' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30">
                              Pending Review
                            </span>
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
      </div>
    </div>
  );
};

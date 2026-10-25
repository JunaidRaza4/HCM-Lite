import React, { useState, useEffect } from 'react';
import {
  LogIn,
  LogOut,
  Clock,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Timer,
  FileEdit,
  Sparkles,
  ShieldAlert,
  Loader2,
  Camera,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { AttendanceRecord, Company } from '../../types';
import { api } from '../../services/api';
import { AttendanceCorrectionModal } from './AttendanceCorrectionModal';
import { CameraAttendanceModal } from './CameraAttendanceModal';

interface AttendancePunchCardProps {
  company: Company | null;
  onAttendanceUpdated?: () => void;
}

export const AttendancePunchCard: React.FC<AttendancePunchCardProps> = ({
  company,
  onAttendanceUpdated,
}) => {
  const [loading, setLoading] = useState(false);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkedOut, setCheckedOut] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'warning' | 'conflict';
  } | null>(null);

  // Live clock
  const [currentTime, setCurrentTime] = useState(new Date());

  // Elapsed time for active shift
  const [elapsedDuration, setElapsedDuration] = useState<string>('');

  // Modals
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'check-in' | 'check-out'>('check-in');

  const fetchTodayStatus = async () => {
    try {
      const data = await api.getTodayAttendance();
      setCheckedIn(data.checkedIn);
      setCheckedOut(data.checkedOut);
      setTodayRecord(data.record);
    } catch (err) {
      console.error('Failed to fetch today attendance:', err);
    }
  };

  useEffect(() => {
    fetchTodayStatus();

    // Clock ticker every second
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Update active shift duration ticker
  useEffect(() => {
    if (checkedIn && !checkedOut && todayRecord?.check_in) {
      const updateElapsed = () => {
        const inTime = new Date(todayRecord.check_in).getTime();
        const nowTime = new Date().getTime();
        const diffMs = Math.max(0, nowTime - inTime);
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
        setElapsedDuration(
          `${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
        );
      };

      updateElapsed();
      const interval = setInterval(updateElapsed, 1000);
      return () => clearInterval(interval);
    }
  }, [checkedIn, checkedOut, todayRecord]);

  const handleStandardCheckIn = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await api.checkIn();
      setCheckedIn(true);
      setCheckedOut(false);
      setTodayRecord(res.attendance);

      const status = res.attendance.status;
      if (status === 'late') {
        setMessage({
          text: 'Checked in successfully! Marked as "Late" (arrived after 09:15 cutoff).',
          type: 'warning',
        });
      } else {
        setMessage({
          text: 'Checked in successfully on time! Status marked as "Present".',
          type: 'success',
        });
      }

      if (onAttendanceUpdated) onAttendanceUpdated();
    } catch (err: any) {
      const is409 = err?.status === 409 || err?.message?.toLowerCase().includes('already exists');
      setMessage({
        text: err.message || (is409 ? 'HTTP 409: Attendance already recorded today.' : 'Check-in failed.'),
        type: is409 ? 'conflict' : 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStandardCheckOut = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await api.checkOut();
      setCheckedOut(true);
      setTodayRecord(res.attendance);

      const hours = res.attendance.work_hours || 0;
      const status = res.attendance.status;

      let detailMsg = `Checked out successfully! Total worked: ${hours} hrs.`;
      if (status === 'half_day') {
        detailMsg += ' Status marked as "Half Day" (worked under 5 hours).';
      } else if (status === 'late') {
        detailMsg += ' Status marked as "Late".';
      } else {
        detailMsg += ' Status marked as "Present".';
      }

      setMessage({
        text: detailMsg,
        type: status === 'half_day' ? 'warning' : 'success',
      });

      if (onAttendanceUpdated) onAttendanceUpdated();
    } catch (err: any) {
      setMessage({ text: err.message || 'Check-out failed.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const openCameraModal = (mode: 'check-in' | 'check-out') => {
    setCameraMode(mode);
    setIsCameraModalOpen(true);
  };

  const handleCameraSuccess = (record: AttendanceRecord, distanceMeters?: number) => {
    setIsCameraModalOpen(false);
    if (cameraMode === 'check-in') {
      setCheckedIn(true);
      setCheckedOut(false);
      setTodayRecord(record);
      setMessage({
        text: `Camera verification & geofence passed (${distanceMeters !== undefined ? distanceMeters + 'm from office' : 'Office'}). Checked in successfully as ${record.status === 'late' ? 'Late' : 'Present'}!`,
        type: record.status === 'late' ? 'warning' : 'success',
      });
    } else {
      setCheckedOut(true);
      setTodayRecord(record);
      setMessage({
        text: `Camera check-out recorded! Total duration: ${record.work_hours} hrs. Status: ${record.status}.`,
        type: record.status === 'half_day' ? 'warning' : 'success',
      });
    }

    if (onAttendanceUpdated) onAttendanceUpdated();
  };

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const officeStart = company?.office_start || '09:00';
  const graceMins = Number(company?.grace_period_mins ?? 15);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'on_time':
      case 'present':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Present
          </span>
        );
      case 'late':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            Late Arrival
          </span>
        );
      case 'half_day':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/40">
            <Timer className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            Half Day (&lt;5 hrs)
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6 relative overflow-hidden transition-colors">
      {/* Background subtle tint */}
      <div className="absolute -right-20 -top-20 w-64 h-64 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 dark:bg-indigo-600/20 dark:text-indigo-400 rounded-2xl border border-indigo-100 dark:border-indigo-500/30">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 dark:text-white text-lg">Self-Service Time Clock</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30">
                Server-Authoritative
              </span>
              {todayRecord?.source === 'camera' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Face & Geofence Verified</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Shift: <span className="text-slate-800 dark:text-slate-200 font-mono font-medium">{officeStart} AM</span> • Late Cutoff: <span className="text-amber-700 dark:text-amber-300 font-mono font-medium">09:15 AM</span> (+{graceMins}m grace) • Geofence: &le; {company?.geofence_radius_meters || 150}m
            </p>
          </div>
        </div>

        {/* Live digital clock */}
        <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-950 px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="text-right">
            <div className="text-base font-mono font-bold text-slate-900 dark:text-white tracking-wider">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {currentTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          {todayRecord && getStatusBadge(todayRecord.status)}
        </div>
      </div>

      {/* Feedback Alert Message */}
      {message && (
        <div
          className={`px-4 py-3 rounded-2xl text-xs sm:text-sm flex items-start gap-3 border shadow-xs relative z-10 animate-in fade-in ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-700/80'
              : message.type === 'warning'
              ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700/80'
              : message.type === 'conflict'
              ? 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-600 shadow-rose-500/10'
              : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-800'
          }`}
        >
          {message.type === 'conflict' ? (
            <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          ) : message.type === 'error' ? (
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          ) : message.type === 'warning' ? (
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          )}
          <div className="flex-1">
            <span className="font-semibold block">
              {message.type === 'conflict' ? 'Duplicate Attendance Blocked (HTTP 409 Conflict)' : ''}
            </span>
            <span>{message.text}</span>
          </div>
        </div>
      )}

      {/* Main Shift Status & Prominent Dynamic Punch Actions */}
      <div className="bg-slate-50 dark:bg-slate-950/70 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 relative z-10 space-y-6">
        {/* State 1: NOT CHECKED IN YET */}
        {!checkedIn && (
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6 py-2">
            <div className="space-y-1.5 text-center lg:text-left">
              <span className="text-xs uppercase tracking-wider font-semibold text-emerald-600 dark:text-emerald-400 flex items-center justify-center lg:justify-start gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Ready for Shift Check-In</span>
              </span>
              <h4 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                Punch In for Today
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-lg">
                Choose <span className="text-indigo-600 dark:text-emerald-300 font-semibold">Camera Face Check-In</span> with AI liveness and GPS verification, or use the standard one-click web check-in. Check-in after 09:15 AM is marked <span className="text-amber-700 dark:text-amber-400 font-semibold">Late</span>.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
              {/* Primary: Camera Face Check-In */}
              <button
                type="button"
                onClick={() => openCameraModal('check-in')}
                disabled={loading}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-bold text-white text-sm sm:text-base flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <Camera className="w-5 h-5 text-indigo-100" />
                <span>CAMERA FACE CHECK-IN</span>
              </button>

              {/* Secondary: Standard Web Check-In */}
              <button
                type="button"
                onClick={handleStandardCheckIn}
                disabled={loading}
                className="w-full sm:w-auto px-5 py-3.5 rounded-xl font-semibold text-slate-700 dark:text-slate-200 text-xs sm:text-sm flex items-center justify-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                    <span>Punching...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span>Quick Web Punch</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* State 2: CHECKED IN, ACTIVE SHIFT (Awaiting Check-Out) */}
        {checkedIn && !checkedOut && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-800/90 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">Check-In Time</span>
                <span className="text-xl font-mono font-bold text-slate-900 dark:text-white">
                  {formatTime(todayRecord?.check_in)}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                  Arrival: {todayRecord?.status === 'late' ? 'Marked Late' : 'On Time'}
                </span>
              </div>

              <div className="bg-white dark:bg-slate-800/90 p-4 rounded-xl border border-indigo-200 dark:border-indigo-500/40 shadow-2xs">
                <span className="text-xs text-indigo-700 dark:text-indigo-300 font-medium block">Current Shift Timer</span>
                <span className="text-xl font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {elapsedDuration || 'Calculating...'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                  Target: 8.0 hrs full shift
                </span>
              </div>

              <div className="bg-white dark:bg-slate-800/90 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">Punched Via</span>
                <span className="text-base font-semibold text-slate-900 dark:text-slate-200 block">
                  {todayRecord?.source === 'camera' ? 'Camera (Face AI)' : 'Web Portal'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 truncate">
                  {todayRecord?.distance_meters !== null && todayRecord?.distance_meters !== undefined
                    ? `${todayRecord.distance_meters}m from office`
                    : 'Standard verified'}
                </span>
              </div>

              <div className="bg-white dark:bg-slate-800/90 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">Shift Status Rule</span>
                <span className="text-base font-semibold text-slate-900 dark:text-slate-200 block">
                  &lt; 5h = Half Day
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                  &ge; 5h = Full Day {todayRecord?.status === 'late' ? '(Late)' : '(Present)'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Shift in progress</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Record your checkout time when your working day ends to compute duration.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => openCameraModal('check-out')}
                  disabled={loading}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-white text-xs sm:text-sm flex items-center justify-center gap-2.5 bg-indigo-600 hover:bg-indigo-700 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Camera className="w-4 h-4 text-indigo-100" />
                  <span>CAMERA CHECK-OUT</span>
                </button>

                <button
                  type="button"
                  onClick={handleStandardCheckOut}
                  disabled={loading}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl font-semibold text-slate-700 dark:text-slate-300 text-xs flex items-center justify-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 border border-slate-300 dark:border-slate-700 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                  ) : (
                    <LogOut className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  )}
                  <span>Quick Check-Out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* State 3: CHECKED OUT (Shift Completed for Today) */}
        {checkedIn && checkedOut && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 p-4 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-xl">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                    Daily Shift Completed
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Both check-in and check-out have been verified and saved to the database.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCorrectionOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-indigo-700 dark:text-indigo-300 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer shadow-2xs"
              >
                <FileEdit className="w-3.5 h-3.5" />
                <span>Request Correction</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center sm:text-left">
              <div className="bg-white dark:bg-slate-800/70 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-2xs">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Check-In</span>
                <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                  {formatTime(todayRecord?.check_in)}
                </span>
              </div>

              <div className="bg-white dark:bg-slate-800/70 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-2xs">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Check-Out</span>
                <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                  {formatTime(todayRecord?.check_out)}
                </span>
              </div>

              <div className="bg-white dark:bg-slate-800/70 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-2xs">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Total Work Hours</span>
                <span className="text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {todayRecord?.work_hours ?? 0} hrs
                </span>
              </div>

              <div className="bg-white dark:bg-slate-800/70 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-2xs">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Punch Method</span>
                <div className="mt-0.5 text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1 justify-center sm:justify-start">
                  {todayRecord?.source === 'camera' ? (
                    <>
                      <Camera className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Camera (Face)</span>
                    </>
                  ) : (
                    <span>Web Portal</span>
                  )}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800/70 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-2xs">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Final Status</span>
                <div className="mt-0.5">
                  {todayRecord?.status === 'present' && (
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Present (Full Day)</span>
                  )}
                  {todayRecord?.status === 'late' && (
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Late Arrival</span>
                  )}
                  {todayRecord?.status === 'half_day' && (
                    <span className="text-xs font-bold text-purple-600 dark:text-purple-400">Half Day (&lt;5h)</span>
                  )}
                </div>
              </div>
            </div>

            {/* Inactive Button state showing finished shift */}
            <div className="pt-2 flex justify-center">
              <div className="w-full py-3.5 px-6 rounded-2xl font-semibold text-slate-600 dark:text-slate-400 text-xs sm:text-sm flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Shift Complete • No further punches needed for today</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Camera Attendance Modal */}
      <CameraAttendanceModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        company={company}
        mode={cameraMode}
        onSuccess={handleCameraSuccess}
        onFallbackToWeb={() => {
          setIsCameraModalOpen(false);
          if (cameraMode === 'check-in') {
            handleStandardCheckIn();
          } else {
            handleStandardCheckOut();
          }
        }}
      />

      {/* Attendance Correction Modal */}
      <AttendanceCorrectionModal
        isOpen={isCorrectionOpen}
        onClose={() => setIsCorrectionOpen(false)}
        initialDate={todayRecord?.date || undefined}
        initialCheckIn={todayRecord?.check_in || undefined}
        initialCheckOut={todayRecord?.check_out || undefined}
        onCorrectionSubmitted={() => {
          fetchTodayStatus();
          if (onAttendanceUpdated) onAttendanceUpdated();
        }}
      />
    </div>
  );
};

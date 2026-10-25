import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  FileEdit,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Timer,
  RefreshCw,
  Info,
  CalendarCheck,
  Briefcase,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { AttendanceCalendarDay } from '../../types';
import { api } from '../../services/api';
import { AttendanceCorrectionModal } from './AttendanceCorrectionModal';

export const AttendanceCalendar: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState<AttendanceCalendarDay[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<AttendanceCalendarDay | null>(null);

  // Correction modal state
  const [correctionTarget, setCorrectionTarget] = useState<{
    date: string;
    checkIn?: string;
    checkOut?: string;
  } | null>(null);
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);

  const monthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  const loadMonthData = async () => {
    setLoading(true);
    try {
      const data = await api.getMyMonthlyAttendance(monthStr);
      setCalendarDays(data.days);
      setSummary(data.summary || {});

      // If a day was selected, update its reference in the new list, or default to today
      const todayStr = new Date().toISOString().split('T')[0];
      const match = data.days.find((d: AttendanceCalendarDay) =>
        selectedDay ? d.date === selectedDay.date : d.date === todayStr
      );
      if (match) {
        setSelectedDay(match);
      } else if (data.days.length > 0) {
        setSelectedDay(data.days[0]);
      }
    } catch (err) {
      console.error('Failed to load monthly attendance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonthData();
  }, [monthStr]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleOpenCorrection = (day?: AttendanceCalendarDay) => {
    if (day) {
      setCorrectionTarget({
        date: day.date,
        checkIn: day.checkIn || undefined,
        checkOut: day.checkOut || undefined,
      });
    } else {
      setCorrectionTarget(null);
    }
    setIsCorrectionOpen(true);
  };

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Status color codes as explicitly required:
  // present = green, late = amber, absent = red, on_leave = blue, weekend = gray, missing_checkout = orange
  const getStatusStyling = (status: string) => {
    switch (status) {
      case 'on_time':
      case 'present':
        return {
          pill: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40',
          dot: 'bg-emerald-500 dark:bg-emerald-400 shadow-xs shadow-emerald-500/50',
          tileBg: 'bg-emerald-50/50 hover:bg-emerald-50/90 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-800/40',
          label: 'Present',
          textClass: 'text-emerald-700 dark:text-emerald-400',
        };
      case 'late':
        return {
          pill: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40',
          dot: 'bg-amber-500 dark:bg-amber-400 shadow-xs shadow-amber-500/50',
          tileBg: 'bg-amber-50/50 hover:bg-amber-50/90 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 border-amber-200/80 dark:border-amber-800/40',
          label: 'Late',
          textClass: 'text-amber-700 dark:text-amber-400',
        };
      case 'absent':
        return {
          pill: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40',
          dot: 'bg-rose-500 dark:bg-rose-400 shadow-xs shadow-rose-500/50',
          tileBg: 'bg-rose-50/50 hover:bg-rose-50/90 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 border-rose-200/80 dark:border-rose-800/40',
          label: 'Absent',
          textClass: 'text-rose-700 dark:text-rose-400',
        };
      case 'on_leave':
        return {
          pill: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40',
          dot: 'bg-blue-500 dark:bg-blue-400 shadow-xs shadow-blue-500/50',
          tileBg: 'bg-blue-50/50 hover:bg-blue-50/90 dark:bg-blue-950/20 dark:hover:bg-blue-950/40 border-blue-200/80 dark:border-blue-800/40',
          label: 'On Leave',
          textClass: 'text-blue-700 dark:text-blue-400',
        };
      case 'weekend':
        return {
          pill: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/80 dark:text-slate-400 dark:border-slate-700/60',
          dot: 'bg-slate-400 dark:bg-slate-500',
          tileBg: 'bg-slate-50/80 hover:bg-slate-100/70 dark:bg-slate-900/40 dark:hover:bg-slate-900/60 border-slate-200/70 dark:border-slate-800/50',
          label: 'Weekend',
          textClass: 'text-slate-600 dark:text-slate-400',
        };
      case 'missing_checkout':
        return {
          pill: 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/40',
          dot: 'bg-orange-500 dark:bg-orange-400 shadow-xs shadow-orange-500/50',
          tileBg: 'bg-orange-50/50 hover:bg-orange-50/90 dark:bg-orange-950/20 dark:hover:bg-orange-950/40 border-orange-200/80 dark:border-orange-800/40',
          label: 'Missing Out',
          textClass: 'text-orange-700 dark:text-orange-400',
        };
      case 'half_day':
        return {
          pill: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/40',
          dot: 'bg-purple-500 dark:bg-purple-400',
          tileBg: 'bg-purple-50/50 hover:bg-purple-50/90 dark:bg-purple-950/20 dark:hover:bg-purple-950/40 border-purple-200/80 dark:border-purple-800/40',
          label: 'Half Day',
          textClass: 'text-purple-700 dark:text-purple-400',
        };
      case 'holiday':
        return {
          pill: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/40',
          dot: 'bg-indigo-500 dark:bg-indigo-400',
          tileBg: 'bg-indigo-50/50 hover:bg-indigo-50/90 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/40 border-indigo-200/80 dark:border-indigo-800/40',
          label: 'Holiday',
          textClass: 'text-indigo-700 dark:text-indigo-400',
        };
      default:
        return {
          pill: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700/40',
          dot: 'bg-slate-300 dark:bg-slate-600',
          tileBg: 'bg-white hover:bg-slate-50 dark:bg-slate-900/40 dark:hover:bg-slate-900/60 border-slate-200 dark:border-slate-800/50',
          label: 'Upcoming',
          textClass: 'text-slate-500',
        };
    }
  };

  const formatTimeString = (iso?: string | null) => {
    if (!iso) return 'Not recorded';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  // Find day of week for the 1st of month to compute leading empty cells (0 = Sunday, 1 = Monday, etc.)
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-5">
      {/* Top Header & Month Navigation */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 dark:bg-indigo-600/20 dark:text-indigo-400 rounded-2xl border border-indigo-100 dark:border-indigo-500/30">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">Monthly Attendance Calendar</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click any date to inspect in/out timestamps or request a correction
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-1 shadow-2xs">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap min-w-[120px] text-center">
              {monthName}
            </div>
            <button
              onClick={handleNextMonth}
              className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={loadMonthData}
            disabled={loading}
            className="p-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-colors cursor-pointer shadow-2xs"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => handleOpenCorrection(selectedDay || undefined)}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap"
          >
            <FileEdit className="w-4 h-4" />
            <span>Request Correction</span>
          </button>
        </div>
      </div>

      {/* Color Code Legend & Summary Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2.5 text-xs">
        <div className="bg-white dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-emerald-500/20 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span>Present</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
          </div>
          <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {summary.present || 0}
          </span>
          <span className="text-[10px] text-emerald-700 dark:text-emerald-400/80">Green</span>
        </div>

        <div className="bg-white dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-amber-500/20 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span>Late</span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 dark:bg-amber-400" />
          </div>
          <span className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
            {summary.late || 0}
          </span>
          <span className="text-[10px] text-amber-700 dark:text-amber-400/80">Amber</span>
        </div>

        <div className="bg-white dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-rose-500/20 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span>Absent</span>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 dark:bg-rose-400" />
          </div>
          <span className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
            {summary.absent || 0}
          </span>
          <span className="text-[10px] text-rose-700 dark:text-rose-400/80">Red</span>
        </div>

        <div className="bg-white dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-blue-500/20 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span>On Leave</span>
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 dark:bg-blue-400" />
          </div>
          <span className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
            {summary.on_leave || 0}
          </span>
          <span className="text-[10px] text-blue-700 dark:text-blue-400/80">Blue</span>
        </div>

        <div className="bg-white dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-orange-500/20 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span>Missing Out</span>
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 dark:bg-orange-400" />
          </div>
          <span className="text-xl font-bold font-mono text-orange-600 dark:text-orange-400 mt-1">
            {summary.missing_checkout || 0}
          </span>
          <span className="text-[10px] text-orange-700 dark:text-orange-400/80">Orange</span>
        </div>

        <div className="bg-white dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span>Weekend</span>
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-500" />
          </div>
          <span className="text-xl font-bold font-mono text-slate-800 dark:text-slate-300 mt-1">
            {summary.weekend || 0}
          </span>
          <span className="text-[10px] text-slate-500">Gray</span>
        </div>

        <div className="bg-white dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-indigo-500/20 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span>Total Worked</span>
            <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <span className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-300 mt-1">
            {summary.total_work_hours || 0}h
          </span>
          <span className="text-[10px] text-indigo-700 dark:text-indigo-400/80">Cumulative</span>
        </div>
      </div>

      {/* Selected Day Details Inspector Card (Dates pe click karne se us din ka detail dikhe) */}
      {selectedDay && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-indigo-200 dark:border-indigo-500/40 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 dark:bg-indigo-600/20 dark:text-indigo-400 rounded-2xl border border-indigo-100 dark:border-indigo-500/30">
                <CalendarCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold block">
                  Selected Day Inspector
                </span>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  {new Date(selectedDay.date + 'T00:00:00').toLocaleDateString(undefined, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                  {selectedDay.date === todayStr && (
                    <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30">
                      Today
                    </span>
                  )}
                </h4>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                  getStatusStyling(selectedDay.status).pill
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${getStatusStyling(selectedDay.status).dot}`} />
                {getStatusStyling(selectedDay.status).label}
              </span>

              <button
                type="button"
                onClick={() => handleOpenCorrection(selectedDay)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <FileEdit className="w-3.5 h-3.5" />
                <span>Request Correction</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-2xs">
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Check-In Time</span>
              <span className="text-sm font-mono font-bold text-slate-900 dark:text-white mt-0.5 block">
                {formatTimeString(selectedDay.checkIn)}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-2xs">
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Check-Out Time</span>
              <span className="text-sm font-mono font-bold text-slate-900 dark:text-white mt-0.5 block">
                {formatTimeString(selectedDay.checkOut)}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-2xs">
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Work Duration</span>
              <span className="text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 block">
                {selectedDay.workHours > 0 ? `${selectedDay.workHours} hrs` : '0.0 hrs'}
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-2xs">
              <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Notes & Policy</span>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5 block truncate">
                {selectedDay.leaveInfo
                  ? `Leave: ${selectedDay.leaveInfo}`
                  : selectedDay.holidayName
                  ? `Holiday: ${selectedDay.holidayName}`
                  : selectedDay.status === 'missing_checkout'
                  ? 'Check-out missing on past day'
                  : selectedDay.status === 'late'
                  ? 'Arrival after 09:15 cutoff'
                  : selectedDay.status === 'half_day'
                  ? 'Shift under 5.0 hours'
                  : selectedDay.isWeekend
                  ? 'Official Weekend'
                  : 'Standard working day'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Grid Container */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3 transition-colors">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1.5 text-center font-bold text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider pb-3 border-b border-slate-200 dark:border-slate-700/60">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Loading skeleton */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
            <p className="text-xs text-slate-500 dark:text-slate-400">Loading attendance records...</p>
          </div>
        ) : (
          /* Days grid */
          <div className="grid grid-cols-7 gap-2">
            {/* Leading empty slots for previous month overflow */}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="min-h-[92px] bg-slate-50 dark:bg-slate-900/20 rounded-2xl border border-slate-100 dark:border-slate-800/30 opacity-40"
              />
            ))}

            {/* Days of current month */}
            {calendarDays.map((d) => {
              const styling = getStatusStyling(d.status);
              const isToday = d.date === todayStr;
              const isSelected = selectedDay?.date === d.date;

              return (
                <div
                  key={d.date}
                  onClick={() => setSelectedDay(d)}
                  className={`min-h-[92px] p-2.5 rounded-2xl border flex flex-col justify-between transition-all cursor-pointer relative group ${styling.tileBg} ${
                    isSelected
                      ? 'ring-2 ring-indigo-500 border-indigo-500 shadow-xs'
                      : isToday
                      ? 'border-indigo-400 ring-1 ring-indigo-400/40 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700/60 hover:border-slate-400 dark:hover:border-slate-500'
                  }`}
                >
                  {/* Tile Top: Day number & Color status dot */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold font-mono ${
                        isToday
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : isSelected
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {d.dayNumber}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${styling.dot}`} />
                  </div>

                  {/* Tile Middle: Status badge & time info */}
                  <div className="my-1 space-y-0.5">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border leading-tight ${styling.pill}`}
                    >
                      {styling.label}
                    </span>

                    {d.checkIn && (
                      <div className="text-[10px] font-mono text-slate-600 dark:text-slate-300">
                        {d.checkIn.includes('T') ? d.checkIn.slice(11, 16) : d.checkIn}
                        {d.checkOut && ` - ${d.checkOut.includes('T') ? d.checkOut.slice(11, 16) : d.checkOut}`}
                      </div>
                    )}

                    {d.workHours > 0 && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        {d.workHours}h
                      </div>
                    )}

                    {d.holidayName && (
                      <div className="text-[10px] text-indigo-700 dark:text-indigo-300 font-semibold truncate">
                        {d.holidayName}
                      </div>
                    )}

                    {d.leaveInfo && (
                      <div className="text-[10px] text-blue-700 dark:text-blue-300 font-semibold truncate">
                        {d.leaveInfo}
                      </div>
                    )}
                  </div>

                  {/* Tile Bottom: Action hint */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 dark:border-slate-800/60">
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
                      View
                    </span>

                    {/* Correction shortcut for past days */}
                    {d.date < todayStr && !d.isWeekend && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenCorrection(d);
                        }}
                        className="text-[9px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-0.5 cursor-pointer font-medium"
                        title="Request Correction"
                      >
                        <FileEdit className="w-2.5 h-2.5" />
                        <span>Fix</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Attendance Correction Modal */}
      <AttendanceCorrectionModal
        isOpen={isCorrectionOpen}
        onClose={() => setIsCorrectionOpen(false)}
        initialDate={correctionTarget?.date}
        initialCheckIn={correctionTarget?.checkIn}
        initialCheckOut={correctionTarget?.checkOut}
        onCorrectionSubmitted={loadMonthData}
      />
    </div>
  );
};

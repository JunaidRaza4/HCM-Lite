import React, { useState, useEffect } from 'react';
import {
  Building2,
  LogOut,
  KeyRound,
  Clock,
  Calendar,
  Shield,
  Users,
  User as UserIcon,
  Bell,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ChangePasswordModal } from './ChangePasswordModal';
import { InAppNotification } from '../types';
import { api } from '../services/api';

export const Navbar: React.FC = () => {
  const { user, company, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [showNotifications, setShowNotifications] = useState(false);

  const loadNotifications = async () => {
    if (!user) return;
    try {
      const res = await api.getNotifications();
      setNotifications(res?.notifications || []);
      setUnreadCount(res?.unreadCount || 0);
    } catch (err: any) {
      // Gracefully handle background polling network hiccups
      if (err?.status === 401) {
        logout();
      }
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000); // 30s poll
    return () => clearInterval(interval);
  }, [user]);

  const handleMarkSingleRead = async (id: number) => {
    try {
      const res = await api.markNotificationRead(id);
      setUnreadCount(res.unreadCount);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    } catch (err) {
      console.error(err);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
            <Shield className="w-3 h-3 text-slate-700 dark:text-slate-300" />
            ADMIN
          </span>
        );
      case 'hr':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
            <Users className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            HR MANAGER
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800">
            <UserIcon className="w-3 h-3 text-teal-600 dark:text-teal-400" />
            EMPLOYEE
          </span>
        );
    }
  };

  return (
    <>
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 text-slate-800 dark:text-slate-100 shadow-xs transition-colors duration-150">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Brand & Company info */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-600/30">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white tracking-tight text-base sm:text-lg">
                      {company?.name || 'HCM Lite'}
                    </span>
                    <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] uppercase font-mono tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-indigo-300 border border-slate-200 dark:border-slate-700 rounded font-semibold">
                      Enterprise
                    </span>
                  </div>
                  {company && (
                    <div className="hidden md:flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        Shift: {company.office_start} (Grace: {company.grace_period_mins}m)
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        Rest: {company.weekend_days}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Role, Profile, Theme Toggle & Actions */}
            <div className="flex items-center gap-3 sm:gap-4">
              {user && (
                <>
                  <div className="hidden sm:block">
                    {getRoleBadge(user.role)}
                  </div>

                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">
                      {user.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {user.email}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-1 relative">
                    {/* Theme Toggle Button */}
                    <button
                      type="button"
                      onClick={toggleTheme}
                      title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
                      className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                    >
                      {theme === 'dark' ? (
                        <Sun className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Moon className="w-4 h-4 text-slate-600" />
                      )}
                    </button>

                    {/* Bell Icon with unread badge */}
                    <div className="relative">
                      <button
                        onClick={() => {
                          setShowNotifications(!showNotifications);
                          if (!showNotifications) loadNotifications();
                        }}
                        title="Notifications"
                        className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer relative"
                      >
                        <Bell className="w-4 h-4" />
                        {unreadCount > 0 && (
                          <span className="absolute -top-1 -right-1 bg-rose-600 text-white font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </button>

                      {/* Notifications Dropdown */}
                      {showNotifications && (
                        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 overflow-hidden text-xs animate-in fade-in">
                          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Bell className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              Notifications
                              {unreadCount > 0 && (
                                <span className="text-[10px] bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 font-bold px-1.5 py-0.2 rounded-full">
                                  {unreadCount} unread
                                </span>
                              )}
                            </span>
                            {unreadCount > 0 && (
                              <button
                                onClick={handleMarkAllRead}
                                className="text-[10px] text-emerald-700 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
                              >
                                Mark all as read
                              </button>
                            )}
                          </div>

                          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                            {notifications.length === 0 ? (
                              <div className="p-6 text-center text-slate-500 dark:text-slate-400 text-xs">
                                No notifications yet.
                              </div>
                            ) : (
                              notifications.map((n) => (
                                <div
                                  key={n.id}
                                  onClick={() => handleMarkSingleRead(n.id)}
                                  className={`p-3 transition-colors cursor-pointer flex items-start gap-2.5 ${
                                    n.is_read
                                      ? 'bg-white hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-800/40 text-slate-500 dark:text-slate-400'
                                      : 'bg-indigo-50/40 hover:bg-indigo-50/70 dark:bg-slate-800/70 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                                  }`}
                                >
                                  <div className="mt-0.5 shrink-0">
                                    {n.type === 'leave' && <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                                    {n.type === 'correction' && <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
                                    {n.type === 'payslip' && <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                                    {!['leave', 'correction', 'payslip'].includes(n.type) && <Bell className="w-4 h-4 text-slate-500" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <span className={`font-semibold ${n.is_read ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                                        {n.title}
                                      </span>
                                      {!n.is_read && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0" />
                                      )}
                                    </div>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                                      {n.message}
                                    </p>
                                    <span className="text-[9px] text-slate-400 font-mono mt-1 block">
                                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setShowPasswordModal(true)}
                      title="Change Password"
                      className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                      onClick={logout}
                      title="Log Out"
                      className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {showPasswordModal && (
        <ChangePasswordModal
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
          isFirstSignIn={false}
        />
      )}
    </>
  );
};

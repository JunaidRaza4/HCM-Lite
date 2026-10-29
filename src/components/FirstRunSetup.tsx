import React, { useState, useMemo } from 'react';
import {
  Building2,
  User,
  Mail,
  Lock,
  ArrowRight,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Clock,
  Calendar,
  ChevronDown,
  ChevronUp,
  MapPin,
  HelpCircle,
  Compass,
  CheckCircle2,
  Users,
  Briefcase,
  BadgeDollarSign,
  KeyRound,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface FirstRunSetupProps {
  initialEmail?: string;
  onSetupSuccess?: (adminEmail: string) => void;
  onCancelToLogin?: () => void;
}

const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>_\-+=~/\[\]]).{8,}$/;

const DEFAULT_SECURITY_QUESTIONS = [
  'What was the brand or model of your first mobile phone?',
  'In what city was your first job or high school located?',
  'What was the name of your first childhood best friend?',
  'What was the make and model of your first car or bike?',
  'What is the maiden name of your mother?',
];

export const FirstRunSetup: React.FC<FirstRunSetupProps> = ({
  initialEmail = '',
  onSetupSuccess,
  onCancelToLogin,
}) => {
  const { login } = useAuth();

  // Wizard Step: 1 = Company & Admin, 2 = Department & HR/Employee
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // Step 1: Company & Root Admin State
  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState(initialEmail);
  const [adminPassword, setAdminPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState(DEFAULT_SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState('');

  // Office Location & Geofence
  const [officeLat, setOfficeLat] = useState<string>('');
  const [officeLng, setOfficeLng] = useState<string>('');
  const [officeRadius, setOfficeRadius] = useState<number>(150);
  const [locating, setLocating] = useState<boolean>(false);
  const [locationSuccess, setLocationSuccess] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Optional Shift & Weekends
  const [showOfficeSettings, setShowOfficeSettings] = useState(false);
  const [officeStart, setOfficeStart] = useState('09:00');
  const [gracePeriodMins, setGracePeriodMins] = useState(15);
  const [weekendDays, setWeekendDays] = useState<string[]>(['Saturday', 'Sunday']);

  // Created Company & Admin ID from Step 1
  const [createdCompanyId, setCreatedCompanyId] = useState<number | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [createdUserObj, setCreatedUserObj] = useState<any>(null);
  const [createdCompanyObj, setCreatedCompanyObj] = useState<any>(null);

  // Step 2: Initial Department & Initial HR / Employee State
  const [departmentName, setDepartmentName] = useState('Operations');
  const [hrName, setHrName] = useState('');
  const [hrEmail, setHrEmail] = useState('');
  const [hrRole, setHrRole] = useState<'hr' | 'employee'>('hr');
  const [employeeCode, setEmployeeCode] = useState('EMP001');
  const [designation, setDesignation] = useState('HR Lead');
  const [basicSalary, setBasicSalary] = useState<number | string>(75000);
  const [hrPassword, setHrPassword] = useState('Welcome@123');

  // Loading & Error States
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Password Strength calculation
  const passwordStrength = useMemo(() => {
    if (!adminPassword) return { score: 0, label: '', color: 'bg-slate-200' };
    if (adminPassword.length < 8) return { score: 1, label: 'Too short (min 8 chars)', color: 'bg-rose-500' };

    let score = 1;
    if (/[A-Z]/.test(adminPassword) && /[a-z]/.test(adminPassword)) score++;
    if (/[0-9]/.test(adminPassword)) score++;
    if (/[!@#$%^&*(),.?":{}|<>_\-+=~/\[\]]/.test(adminPassword)) score++;

    if (score <= 2) return { score: 2, label: 'Weak', color: 'bg-rose-500' };
    if (score === 3) return { score: 3, label: 'Moderate', color: 'bg-amber-500' };
    return { score: 4, label: 'Strong & Secure', color: 'bg-emerald-600' };
  }, [adminPassword]);

  const isPasswordStrong = useMemo(() => {
    return STRONG_PASSWORD_REGEX.test(adminPassword);
  }, [adminPassword]);

  const toggleWeekend = (day: string) => {
    if (weekendDays.includes(day)) {
      setWeekendDays(weekendDays.filter((d) => d !== day));
    } else {
      setWeekendDays([...weekendDays, day]);
    }
  };

  // GPS Auto-detect location
  const handleDetectCurrentLocation = () => {
    setLocationError(null);
    setLocationSuccess(null);

    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setOfficeLat(lat.toString());
        setOfficeLng(lng.toString());
        setLocationSuccess(`Current GPS captured: ${lat}, ${lng} (±${Math.round(pos.coords.accuracy)}m)`);
      },
      (err) => {
        setLocating(false);
        let msg = 'Could not acquire GPS position. ';
        if (err.code === err.PERMISSION_DENIED) {
          msg += 'Permission denied by user.';
        } else if (err.code === err.TIMEOUT) {
          msg += 'Request timed out.';
        } else {
          msg += err.message;
        }
        setLocationError(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const validateStep1 = (): boolean => {
    const errors: Record<string, string> = {};
    if (!companyName.trim()) {
      errors.companyName = 'Company name is required';
    }
    if (!adminName.trim()) {
      errors.adminName = 'Your name is required';
    }
    if (!adminEmail.trim()) {
      errors.adminEmail = 'Admin email is required';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(adminEmail.trim())) {
        errors.adminEmail = 'Please enter a valid email address';
      }
    }

    if (!adminPassword) {
      errors.adminPassword = 'Password is required';
    } else if (!isPasswordStrong) {
      errors.adminPassword =
        'Use strong password: minimum 8 characters, including uppercase, lowercase, number, and special character.';
    }

    if (!securityAnswer.trim()) {
      errors.securityAnswer = 'Please provide an answer to your security question for recovery.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Step 1: Create Organization & Admin
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!validateStep1()) {
      return;
    }

    setLoading(true);
    try {
      const parsedLat = officeLat !== '' ? parseFloat(officeLat) : undefined;
      const parsedLng = officeLng !== '' ? parseFloat(officeLng) : undefined;

      const res = await api.submitSetup({
        companyName: companyName.trim(),
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword,
        officeStart,
        gracePeriodMins: Number(gracePeriodMins),
        weekendDays: weekendDays.join(','),
        officeLat: !isNaN(parsedLat as number) ? parsedLat : undefined,
        officeLng: !isNaN(parsedLng as number) ? parsedLng : undefined,
        officeRadius: Number(officeRadius) || 150,
        securityQuestion: securityQuestion.trim(),
        securityAnswer: securityAnswer.trim(),
      });

      setCreatedCompanyId(res.companyId || (res.company as any)?.id || 1);
      setSessionToken(res.token || '');
      setCreatedUserObj(res.user);
      setCreatedCompanyObj(res.company);

      // Move to Step 2
      setCurrentStep(2);
    } catch (err: any) {
      if (err.field) {
        setFieldErrors((prev) => ({ ...prev, [err.field]: err.message }));
      } else {
        setGeneralError(err.message || 'Setup initialization failed. Please check inputs and retry.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Submit Step 2: Setup Initial Team & Department
  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    setLoading(true);
    try {
      if (createdCompanyId) {
        await api.submitStep2Team({
          companyId: createdCompanyId,
          departmentName: departmentName.trim(),
          hrName: hrName.trim() || undefined,
          hrEmail: hrEmail.trim() || undefined,
          hrPassword: hrPassword.trim() || undefined,
          hrRole,
          employeeCode: employeeCode.trim() || undefined,
          designation: designation.trim() || undefined,
          basicSalary: basicSalary ? Number(basicSalary) : undefined,
        });
      }

      // Complete setup and launch final dashboard
      if (sessionToken && createdUserObj && createdCompanyObj) {
        login(sessionToken, createdUserObj, createdCompanyObj);
      }

      if (onSetupSuccess) {
        onSetupSuccess(adminEmail.trim());
      }
    } catch (err: any) {
      console.warn('Step 2 submission note:', err);
      // Still log in the admin if step 1 succeeded
      if (sessionToken && createdUserObj && createdCompanyObj) {
        login(sessionToken, createdUserObj, createdCompanyObj);
      }
    } finally {
      setLoading(false);
    }
  };

  // Skip Step 2 directly to final interface
  const handleSkipStep2 = () => {
    if (sessionToken && createdUserObj && createdCompanyObj) {
      login(sessionToken, createdUserObj, createdCompanyObj);
    }
    if (onSetupSuccess) {
      onSetupSuccess(adminEmail.trim());
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 transition-colors duration-150">
      <div className="max-w-xl w-full mx-auto space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 rounded-2xl border border-emerald-200 dark:border-emerald-800 mb-1 shadow-xs">
            <Building2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            {currentStep === 1 ? 'Configure New Company' : `Setup Initial Team — ${companyName}`}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">
            {currentStep === 1
              ? 'New organization setup. Configure company profile, office geofence & root admin credentials.'
              : 'Add your primary department and register your initial HR Manager or Employee.'}
          </p>

          {/* Clean Stepper Indicator */}
          <div className="pt-2 flex items-center justify-center gap-3 text-xs">
            <div
              className={`flex items-center gap-1.5 font-semibold px-3 py-1 rounded-full border transition-colors ${
                currentStep === 1
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700'
                  : 'bg-white text-slate-500 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                1
              </span>
              <span>Organization & Admin</span>
            </div>

            <span className="text-slate-300 dark:text-slate-700">→</span>

            <div
              className={`flex items-center gap-1.5 font-semibold px-3 py-1 rounded-full border transition-colors ${
                currentStep === 2
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700'
                  : 'bg-white text-slate-500 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full text-white flex items-center justify-center text-[10px] ${
                  currentStep === 2 ? 'bg-emerald-600' : 'bg-slate-400'
                }`}
              >
                2
              </span>
              <span>Department & Team</span>
            </div>
          </div>
        </div>

        {/* Global Error Banner */}
        {generalError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-200 px-4 py-3 rounded-2xl text-xs sm:text-sm flex items-start gap-3 animate-in fade-in shadow-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block">{generalError}</span>
            </div>
          </div>
        )}

        {/* ================= STEP 1: COMPANY & ADMIN FORM ================= */}
        {currentStep === 1 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs space-y-5">
            <form onSubmit={handleStep1Submit} className="space-y-4">
              {/* Field 1: Company Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Company Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => {
                      setCompanyName(e.target.value);
                      if (fieldErrors.companyName) setFieldErrors({ ...fieldErrors, companyName: '' });
                    }}
                    placeholder="e.g. Saylani Innovations Ltd"
                    className={`w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-xs transition-colors ${
                      fieldErrors.companyName
                        ? 'border-rose-300 focus:border-rose-500'
                        : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500'
                    }`}
                  />
                </div>
                {fieldErrors.companyName && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                    {fieldErrors.companyName}
                  </p>
                )}
              </div>

              {/* Admin Profile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Admin Full Name <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={adminName}
                      onChange={(e) => {
                        setAdminName(e.target.value);
                        if (fieldErrors.adminName) setFieldErrors({ ...fieldErrors, adminName: '' });
                      }}
                      placeholder="e.g. Muhammad Raza"
                      className={`w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-xs transition-colors ${
                        fieldErrors.adminName
                          ? 'border-rose-300 focus:border-rose-500'
                          : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500'
                      }`}
                    />
                  </div>
                  {fieldErrors.adminName && (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                      {fieldErrors.adminName}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Admin Email Address <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => {
                        setAdminEmail(e.target.value);
                        if (fieldErrors.adminEmail) setFieldErrors({ ...fieldErrors, adminEmail: '' });
                      }}
                      placeholder="admin@saylani.org"
                      className={`w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-xs transition-colors ${
                        fieldErrors.adminEmail
                          ? 'border-rose-300 focus:border-rose-500'
                          : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500'
                      }`}
                    />
                  </div>
                  {fieldErrors.adminEmail && (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                      {fieldErrors.adminEmail}
                    </p>
                  )}
                </div>
              </div>

              {/* Admin Password & Strong Password Enforcement */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Password <span className="text-rose-500">*</span>
                  </label>
                  {passwordStrength.label && (
                    <span
                      className={`text-[11px] font-semibold ${
                        isPasswordStrong ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-500'
                      }`}
                    >
                      {passwordStrength.label}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    value={adminPassword}
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      if (fieldErrors.adminPassword) setFieldErrors({ ...fieldErrors, adminPassword: '' });
                    }}
                    placeholder="••••••••••••"
                    className={`w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-xs transition-colors ${
                      fieldErrors.adminPassword
                        ? 'border-rose-300 focus:border-rose-500'
                        : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500'
                    }`}
                  />
                </div>

                {/* Password strength bar */}
                {adminPassword.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1 flex-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                        style={{ width: `${(passwordStrength.score / 4) * 100}%` }}
                      />
                    </div>
                    {!isPasswordStrong && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                        ⚠️ Use strong password: minimum 8 characters, including uppercase, lowercase, number, and special character.
                      </p>
                    )}
                  </div>
                )}

                {fieldErrors.adminPassword && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                    {fieldErrors.adminPassword}
                  </p>
                )}
              </div>

              {/* Personal Security Question & Answer (For Password Recovery) */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                  <HelpCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Personal Security Question (For Password Recovery)</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Agr aap kabhi password bhol jayein, to is sawaal ka sahi jawab de kar foran password reset kar sakte hain.
                </p>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Select Security Question
                  </label>
                  <select
                    value={securityQuestion}
                    onChange={(e) => setSecurityQuestion(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {DEFAULT_SECURITY_QUESTIONS.map((q, idx) => (
                      <option key={idx} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Your Answer <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={securityAnswer}
                    onChange={(e) => {
                      setSecurityAnswer(e.target.value);
                      if (fieldErrors.securityAnswer) setFieldErrors({ ...fieldErrors, securityAnswer: '' });
                    }}
                    placeholder="e.g. Nokia 3310, Samsung Galaxy S2, etc."
                    className={`w-full px-3 py-2 bg-white dark:bg-slate-900 border rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      fieldErrors.securityAnswer ? 'border-rose-400' : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                  {fieldErrors.securityAnswer && (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                      {fieldErrors.securityAnswer}
                    </p>
                  )}
                </div>
              </div>

              {/* Office Location & Geofence (With "Detect Current Location" Button) */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                    <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Office Geofence Location</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDetectCurrentLocation}
                    disabled={locating}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {locating ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Detecting GPS...</span>
                      </>
                    ) : (
                      <>
                        <Compass className="w-3 h-3" />
                        <span>📍 Detect Current Location</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Attendance check-in/out par office geofence enforce hoga. Current location detect karein ya manually latitude/longitude set karein.
                </p>

                {locationSuccess && (
                  <div className="flex items-center gap-2 p-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-[11px] text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                    <span>{locationSuccess}</span>
                  </div>
                )}

                {locationError && (
                  <div className="flex items-center gap-2 p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-[11px] text-rose-700 dark:text-rose-300">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                    <span>{locationError}</span>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Latitude
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      placeholder="24.8607"
                      value={officeLat}
                      onChange={(e) => setOfficeLat(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Longitude
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      placeholder="67.0011"
                      value={officeLng}
                      onChange={(e) => setOfficeLng(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Radius (meters)
                    </label>
                    <input
                      type="number"
                      min="50"
                      max="5000"
                      value={officeRadius}
                      onChange={(e) => setOfficeRadius(Number(e.target.value))}
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Optional Office Settings Toggle */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowOfficeSettings(!showOfficeSettings)}
                  className="w-full flex items-center justify-between py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 transition-colors cursor-pointer"
                >
                  <span>Optional Working Hours & Policy Settings</span>
                  {showOfficeSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showOfficeSettings && (
                  <div className="mt-3 space-y-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 animate-in fade-in">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          <Clock className="w-3 h-3 text-emerald-600" />
                          Office Start Time
                        </label>
                        <input
                          type="time"
                          value={officeStart}
                          onChange={(e) => setOfficeStart(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          Grace (mins)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="60"
                          value={gracePeriodMins}
                          onChange={(e) => setGracePeriodMins(Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        <Calendar className="w-3 h-3 text-emerald-600" />
                        Weekend Days
                      </label>
                      <div className="grid grid-cols-7 gap-1">
                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                          const isSelected = weekendDays.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => toggleWeekend(day)}
                              className={`py-1 text-[10px] font-semibold rounded-md border text-center transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {day.slice(0, 2)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating Company...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue to Step 2: Setup Team & Department</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {onCancelToLogin && (
                  <button
                    type="button"
                    onClick={onCancelToLogin}
                    className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer text-center"
                  >
                    Already have an account? Sign in to existing company
                  </button>
                )}
              </div>
            </form>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Root Admin account with full organizational control</span>
            </div>
          </div>
        )}

        {/* ================= STEP 2: DEPARTMENT & HR/EMPLOYEE FORM ================= */}
        {currentStep === 2 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs space-y-5 animate-in fade-in">
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-emerald-900 dark:text-emerald-200 block">
                  Company "{companyName}" Created!
                </span>
                <span className="text-emerald-700 dark:text-emerald-300">
                  Now set up your initial department and register your first HR Manager or Employee.
                </span>
              </div>
            </div>

            <form onSubmit={handleStep2Submit} className="space-y-4">
              {/* Section A: First Department */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                  <Briefcase className="w-4 h-4 text-emerald-600" />
                  <span>Primary Department Name</span>
                </label>
                <input
                  type="text"
                  required
                  value={departmentName}
                  onChange={(e) => setDepartmentName(e.target.value)}
                  placeholder="e.g. Operations, Engineering, Human Resources"
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-xs"
                />
              </div>

              {/* Section B: First HR / Employee Member */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                    <Users className="w-4 h-4 text-emerald-600" />
                    <span>First Team Member / HR Setup</span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium">
                    (Auto-creates login credentials)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Member Full Name
                    </label>
                    <input
                      type="text"
                      value={hrName}
                      onChange={(e) => setHrName(e.target.value)}
                      placeholder="e.g. Sarah Ahmed"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Member Email
                    </label>
                    <input
                      type="email"
                      value={hrEmail}
                      onChange={(e) => setHrEmail(e.target.value)}
                      placeholder="e.g. hr@yourcompany.com"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Role
                    </label>
                    <select
                      value={hrRole}
                      onChange={(e) => setHrRole(e.target.value as any)}
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                    >
                      <option value="hr">HR Manager</option>
                      <option value="employee">Employee</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Employee Code
                    </label>
                    <input
                      type="text"
                      value={employeeCode}
                      onChange={(e) => setEmployeeCode(e.target.value)}
                      placeholder="EMP001"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Basic Salary (PKR)
                    </label>
                    <input
                      type="number"
                      value={basicSalary}
                      onChange={(e) => setBasicSalary(e.target.value)}
                      placeholder="75000"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Designation
                    </label>
                    <input
                      type="text"
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      placeholder="HR Lead"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Initial Temporary Password
                    </label>
                    <input
                      type="text"
                      value={hrPassword}
                      onChange={(e) => setHrPassword(e.target.value)}
                      placeholder="Welcome@123"
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Submit / Skip buttons */}
              <div className="pt-3 space-y-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving Team & Launching Dashboard...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Complete Setup & Launch Dashboard</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Organization Settings</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSkipStep2}
                    className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
                  >
                    Skip & Launch Dashboard directly
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

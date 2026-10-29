import React, { useState, useMemo } from 'react';
import {
  Building2,
  Lock,
  Mail,
  ArrowRight,
  Loader2,
  CheckCircle2,
  KeyRound,
  X,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Sparkles,
  PlusCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FirstRunSetup } from './FirstRunSetup';

interface LoginPageProps {
  initialEmail?: string;
  setupSuccessMessage?: string | null;
}

const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>_\-+=~/\[\]]).{8,}$/;

export const LoginPage: React.FC<LoginPageProps> = ({ initialEmail = '', setupSuccessMessage = null }) => {
  const { login, company, isSetupComplete } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual or automatic switch to Setup for new company
  const [isSettingUpNewCompany, setIsSettingUpNewCompany] = useState(false);
  const [setupInitialEmail, setSetupInitialEmail] = useState('');
  const [newEmailNotice, setNewEmailNotice] = useState<string | null>(null);

  // Forgot Password Modal State
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<'identifier' | 'question' | 'success'>('identifier');
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryAccount, setRecoveryAccount] = useState<{ email: string; name: string } | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  // Password strength validation
  const isNewPasswordStrong = useMemo(() => {
    return STRONG_PASSWORD_REGEX.test(newPassword);
  }, [newPassword]);

  // If first-run detected from backend, or user explicitly setting up new company
  if (!isSetupComplete || isSettingUpNewCompany) {
    return (
      <FirstRunSetup
        initialEmail={setupInitialEmail || email}
        onSetupSuccess={(adminEmail) => {
          setIsSettingUpNewCompany(false);
          setEmail(adminEmail);
        }}
        onCancelToLogin={() => setIsSettingUpNewCompany(false)}
      />
    );
  }

  // Handle Sign In submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNewEmailNotice(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please provide an email address.');
      return;
    }

    setLoading(true);
    try {
      // 1. First verify if email exists in system
      const check = await api.checkEmail(cleanEmail);

      if (!check.exists) {
        // NEW EMAIL DETECTED!
        // DO NOT show "email galat hai" - seamlessly open setup for new company!
        setLoading(false);
        setSetupInitialEmail(cleanEmail);
        setIsSettingUpNewCompany(true);
        return;
      }

      // 2. Email exists: verify password
      if (!password) {
        setLoading(false);
        setError('Please enter your password to sign in to your company.');
        return;
      }

      const res = await api.login(cleanEmail, password);
      login(res.token, res.user, res.company);
    } catch (err: any) {
      if (err.notFound || err.status === 404) {
        // Fallback for new email detected via login endpoint
        setSetupInitialEmail(cleanEmail);
        setIsSettingUpNewCompany(true);
      } else {
        setError(err.message || 'Incorrect password. Please verify and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForgot = () => {
    setIsForgotOpen(true);
    setForgotStep('identifier');
    setRecoveryError(null);
    setRecoveryIdentifier(email || '');
    setSecurityAnswer('');
    setNewPassword('');
    setConfirmPassword('');
    setRecoveryAccount(null);
  };

  // Step 1: Fetch security question
  const handleFetchSecurityQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    if (!recoveryIdentifier.trim()) {
      setRecoveryError('Please enter your registered email or employee code.');
      return;
    }

    setRecoveryLoading(true);
    try {
      const res = await api.getSecurityQuestion(recoveryIdentifier.trim());
      setSecurityQuestion(res.question);
      setRecoveryAccount({ email: res.email, name: res.name });
      setForgotStep('question');
    } catch (err: any) {
      setRecoveryError(err.message || 'Could not find account matching that identifier.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  // Step 2: Verify answer and set new strong password
  const handleVerifyAnswerAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);

    if (!securityAnswer.trim()) {
      setRecoveryError('Please enter your answer to the security question.');
      return;
    }

    if (!isNewPasswordStrong) {
      setRecoveryError(
        'Use strong password: minimum 8 characters, including uppercase, lowercase, number, and special character.'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setRecoveryError('Passwords do not match. Please re-type identical passwords.');
      return;
    }

    setRecoveryLoading(true);
    try {
      await api.verifySecurityAnswerAndReset({
        identifier: recoveryIdentifier.trim(),
        security_answer: securityAnswer.trim(),
        new_password: newPassword,
      });

      setForgotStep('success');
    } catch (err: any) {
      setRecoveryError(err.message || 'Verification failed. Please check your answer and try again.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleAutoFillAndLogin = () => {
    if (recoveryAccount) {
      setEmail(recoveryAccount.email);
      setPassword(newPassword);
    }
    setIsForgotOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-150">
      <div className="max-w-md w-full mx-auto space-y-7">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 rounded-2xl border border-emerald-200 dark:border-emerald-800 mb-1 shadow-xs">
            <Building2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            {company?.name || 'HCM Lite'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">
            Human Capital Management & Workforce Portal
          </p>
        </div>

        {setupSuccessMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-200 px-4 py-3 rounded-2xl text-xs sm:text-sm flex items-center gap-3 animate-in fade-in shadow-xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{setupSuccessMessage}</span>
          </div>
        )}

        {newEmailNotice && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-200 px-4 py-3 rounded-2xl text-xs sm:text-sm flex items-center gap-3 animate-in fade-in shadow-xs">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{newEmailNotice}</span>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-200 px-4 py-3 rounded-2xl text-xs sm:text-sm flex items-center gap-3 animate-in fade-in shadow-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Login Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm shadow-xs transition-colors"
                />
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                Naya email likhne par direct nayi company setup open hogi.
              </span>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleOpenForgot}
                  className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm shadow-xs transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Account...</span>
                </>
              ) : (
                <>
                  <span>Sign In / Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* New Company Direct Setup Action */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-center space-y-2">
            <button
              type="button"
              onClick={() => {
                setSetupInitialEmail(email || '');
                setIsSettingUpNewCompany(true);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 hover:underline cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Set up a brand new company</span>
            </button>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Each email configures its own dedicated organization with isolated employees and settings.
            </p>
          </div>
        </div>
      </div>

      {/* Forgot Password Security Question Modal */}
      {isForgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-slate-800 dark:text-slate-100 overflow-hidden space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 rounded-xl">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Password Recovery
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Security Question & Strong Password Reset
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsForgotOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {recoveryError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/60 dark:border-rose-800 dark:text-rose-200 p-3 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span className="flex-1">{recoveryError}</span>
              </div>
            )}

            {/* Step 1: Account Identifier */}
            {forgotStep === 'identifier' && (
              <form onSubmit={handleFetchSecurityQuestion} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Your Registered Email or Employee Code
                  </label>
                  <input
                    type="text"
                    required
                    value={recoveryIdentifier}
                    onChange={(e) => setRecoveryIdentifier(e.target.value)}
                    placeholder="e.g. employee@company.com or EMP001"
                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                  />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                    Apna registered email ya Employee Code likhein ta kay aapka personal security question fetch ho sake.
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsForgotOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={recoveryLoading}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {recoveryLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Locating Account...</span>
                      </>
                    ) : (
                      <>
                        <span>Next: Security Question</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: Answer Security Question & Enter Strong Password */}
            {forgotStep === 'question' && (
              <form onSubmit={handleVerifyAnswerAndReset} className="space-y-4 animate-in fade-in">
                {recoveryAccount && (
                  <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-xl text-xs text-emerald-950 dark:text-emerald-200">
                    <span className="font-semibold">Account:</span> {recoveryAccount.name} ({recoveryAccount.email})
                  </div>
                )}

                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                    <HelpCircle className="w-4 h-4 text-emerald-600" />
                    <span>Your Security Question:</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                    {securityQuestion}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Your Security Answer <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    placeholder="Enter the answer you set during registration"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    New Password <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                  />
                  {newPassword.length > 0 && !isNewPasswordStrong && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium mt-1">
                      ⚠️ Use strong password: minimum 8 characters, including uppercase, lowercase, number, and special character.
                    </p>
                  )}
                  {newPassword.length > 0 && isNewPasswordStrong && (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Strong password accepted.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Confirm New Password <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
                  />
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={() => setForgotStep('identifier')}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium cursor-pointer"
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    disabled={recoveryLoading || !isNewPasswordStrong}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {recoveryLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying & Resetting...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Verify Answer & Reset</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Success Screen with One-Click Auto-Fill */}
            {forgotStep === 'success' && (
              <div className="space-y-4 animate-in fade-in">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-200">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>Password Reset Successfully!</span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 text-xs">
                    Aapka security answer verify ho chuka hai aur naya strong password set ho gaya hai. Ab aap seedha sign in kar sakte hain.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAutoFillAndLogin}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Auto-Fill Credentials & Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

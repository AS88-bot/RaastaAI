import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../types/civic';

interface AuthPageProps {
  onNavigate: (path: string) => void;
  redirectTo?: string;
}

export function AuthPage({ onNavigate, redirectTo = '/dashboard' }: AuthPageProps) {
  const {
    user,
    authError,
    clearAuthError,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resendVerification,
    refreshVerificationStatus,
  } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [city, setCity] = useState('Hyderabad');
  const [preferredLanguage, setPreferredLanguage] = useState<SupportedLanguage>('en');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (user && user.emailVerified) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="bg-white border border-[#E5E3DC] rounded-xl p-8 text-center space-y-4">
          <CheckCircle2 className="w-10 h-10 text-[#15803D] mx-auto" aria-hidden="true" />
          <h1 className="font-display text-2xl font-bold text-[#1A1D1B]">
            Signed in as {user.displayName || user.email}
          </h1>
          <p className="text-sm text-[#4F5651]">
            Your citizen account is active and ready to submit or verify civic reports.
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate(redirectTo)}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] cursor-pointer"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/report')}
              className="px-5 py-2.5 text-sm font-semibold text-[#1A1D1B] border border-[#E5E3DC] rounded-lg hover:bg-[#F3F1EC] cursor-pointer"
            >
              Report an Issue
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (user && !user.emailVerified) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="bg-white border border-[#E5E3DC] rounded-xl p-8 space-y-4">
          <div className="flex items-center gap-3 text-[#B45309]">
            <MailCheck className="w-6 h-6 shrink-0" aria-hidden="true" />
            <h1 className="font-display text-xl font-bold text-[#1A1D1B]">
              Verify your email to submit reports
            </h1>
          </div>
          <p className="text-sm text-[#4F5651] leading-relaxed">
            A verification email was sent to <span className="font-semibold">{user.email}</span>.
            Please verify your address and reload this page, or sign in with Google for instant
            verification.
          </p>
          {notice && (
            <p className="text-xs font-medium text-[#15803D] bg-[#ECFDF5] border border-[#A7F3D0] rounded-lg p-3">
              {notice}
            </p>
          )}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={async () => {
                await resendVerification();
                setNotice('Verification link sent. Please check your inbox.');
              }}
              className="px-4 py-2.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] cursor-pointer"
            >
              Resend Verification Email
            </button>
            <button
              type="button"
              onClick={async () => {
                const verified = await refreshVerificationStatus();
                if (verified) {
                  onNavigate(redirectTo);
                } else {
                  setNotice('Email is not verified yet. Please click the verification link in your inbox and try again.');
                }
              }}
              className="px-4 py-2.5 text-sm font-semibold text-[#1A1D1B] border border-[#E5E3DC] rounded-lg hover:bg-[#F3F1EC] cursor-pointer"
            >
              I Have Verified — Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleGoogle = async () => {
    setSubmitting(true);
    setNotice(null);
    try {
      await signInWithGoogle();
      onNavigate(redirectTo);
    } catch {
      // error captured in AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();
    setNotice(null);

    if (!email.trim() || !password) return;
    if (mode === 'signup' && password.length < 6) {
      setNotice('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
        onNavigate(redirectTo);
      } else {
        await signUpWithEmail({
          name: name.trim() || email.split('@')[0],
          email,
          password,
          city: city.trim() || 'Hyderabad',
          preferredLanguage,
        });
        setNotice('Account created. Check your inbox to verify your email.');
      }
    } catch {
      // handled by authError
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 sm:py-16">
      <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 sm:p-8 space-y-6">
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#1A1D1B]">
            {mode === 'signin' ? 'Sign in to RaastaAI' : 'Create your citizen account'}
          </h1>
          <p className="text-sm text-[#4F5651]">
            Submit street issue reports, verify neighborhood hazards, and follow progress.
          </p>
        </div>

        {/* Google Sign-In Primary */}
        <button
          type="button"
          disabled={submitting}
          onClick={handleGoogle}
          className="w-full inline-flex items-center justify-center gap-3 px-4 py-3 text-sm font-semibold text-[#1A1D1B] bg-[#F8F7F4] border border-[#D4D1C7] rounded-lg hover:bg-[#EFECE5] transition-colors min-h-[44px] disabled:opacity-60 cursor-pointer"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-[#E5E3DC]" />
          <span className="shrink mx-3 text-xs text-[#717873]">or use email</span>
          <div className="flex-grow border-t border-[#E5E3DC]" />
        </div>

        {/* Segmented Switch */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-[#F3F1EC] rounded-lg">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              clearAuthError();
              setNotice(null);
            }}
            className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'signin' ? 'bg-white text-[#1A1D1B] shadow-xs' : 'text-[#4F5651]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              clearAuthError();
              setNotice(null);
            }}
            className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'signup' ? 'bg-white text-[#1A1D1B] shadow-xs' : 'text-[#4F5651]'
            }`}
          >
            Create Account
          </button>
        </div>

        {authError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B]"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{authError}</span>
          </div>
        )}

        {notice && (
          <div className="p-3.5 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#14452F]">
            {notice}
          </div>
        )}

        <form onSubmit={handleEmailSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-name" className="block text-xs font-semibold text-[#1A1D1B] mb-1.5">
                Full Name
              </label>
              <input
                id="auth-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ananya Reddy"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D4D1C7] rounded-lg focus:border-[#14452F] focus:outline-none"
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs font-semibold text-[#1A1D1B] mb-1.5">
              Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="citizen@example.com"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D4D1C7] rounded-lg focus:border-[#14452F] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-semibold text-[#1A1D1B] mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white border border-[#D4D1C7] rounded-lg focus:border-[#14452F] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#717873] hover:text-[#1A1D1B] cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode === 'signup' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="auth-city"
                  className="block text-xs font-semibold text-[#1A1D1B] mb-1.5"
                >
                  Primary City
                </label>
                <input
                  id="auth-city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#D4D1C7] rounded-lg focus:border-[#14452F] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="auth-lang"
                  className="block text-xs font-semibold text-[#1A1D1B] mb-1.5"
                >
                  Language
                </label>
                <select
                  id="auth-lang"
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value as SupportedLanguage)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#D4D1C7] rounded-lg focus:border-[#14452F] focus:outline-none"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] transition-colors min-h-[44px] disabled:opacity-60 cursor-pointer"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            <span>{mode === 'signin' ? 'Sign In' : 'Create Account'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}

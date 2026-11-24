import { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import type { AdminRole } from '../../types/store';
import {
  getAdminAuthStatusLocal,
  loginAdminLocal,
  setupInitialAdminLocal,
} from '../../db/localApiBridge';

export interface AdminSessionUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
}

interface AdminLoginProps {
  onAuthenticated: (token: string, admin: AdminSessionUser) => void;
  onBackToStorefront: () => void;
}

export function AdminLogin({ onAuthenticated, onBackToStorefront }: AdminLoginProps) {
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [needsInitialSetup, setNeedsInitialSetup] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    getAdminAuthStatusLocal()
      .then((data) => {
        if (!active) return;
        setNeedsInitialSetup(Boolean(data.needsInitialSetup));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setCheckingStatus(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = needsInitialSetup
        ? await setupInitialAdminLocal({
            name: name.trim(),
            email: email.trim(),
            password,
          })
        : await loginAdminLocal(email.trim(), password);
      onAuthenticated(result.token, result.admin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to authenticate.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6EE] flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <button
          type="button"
          onClick={onBackToStorefront}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4A5D3F] hover:text-[#1C3B2B] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Storefront</span>
        </button>

        <div className="p-8 rounded-2xl bg-[#FDFBF7] border border-[#232620]/12 shadow-sm space-y-6">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-[#1C3B2B] text-[#FAF6EE] flex items-center justify-center">
              {needsInitialSetup ? <UserPlus className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C5A059]">
              Aurelia Botanica Operations
            </p>
            <h1 className="font-display text-3xl font-semibold text-[#232620]">
              {needsInitialSetup ? 'Initial Super Admin Setup' : 'Administrator Sign In'}
            </h1>
            <p className="text-xs text-[#5C6156] leading-relaxed">
              {needsInitialSetup
                ? 'Provision your first Super Admin account stored in local IndexedDB to unlock catalog, inventory, orders, 3D Studio, and AI management.'
                : 'Sign in with your administrator email and password. Sessions persist across reloads in Chrome Local Storage.'}
            </p>
          </div>

          {checkingStatus ? (
            <div className="py-8 text-center text-xs text-[#5C6156]">Checking server configuration…</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {needsInitialSetup && (
                <div>
                  <label className="block text-xs font-medium text-[#232620] mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Store Founder"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm focus:outline-2 focus:outline-[#1C3B2B]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#232620] mb-1">Admin Email</label>
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@aureliabotanica.pk"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm focus:outline-2 focus:outline-[#1C3B2B]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#232620] mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={needsInitialSetup ? 8 : 4}
                  autoComplete={needsInitialSetup ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={needsInitialSetup ? 'Minimum 8 characters' : 'Enter administrator password'}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm focus:outline-2 focus:outline-[#1C3B2B]"
                />
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">{error}</div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-lg bg-[#1C3B2B] hover:bg-[#142C20] disabled:opacity-60 text-[#FAF6EE] text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
              >
                <KeyRound className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Verifying…'
                    : needsInitialSetup
                    ? 'Create Super Admin & Enter'
                    : 'Sign In to Admin Panel'}
                </span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

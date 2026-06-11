/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AuthView — Login / Register page for Lumina.
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, Lock, User, Eye, EyeOff, LogIn, UserPlus, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { BhuvionaWordmark } from '../common/BhuvionaLogo';

interface AuthViewProps {
  onSkip?: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onSkip }) => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, displayName || 'Learner');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-violet-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <BhuvionaWordmark variant="dark" size="lg" showTagline />
          <p className="text-sm text-on-surface-variant font-medium mt-1 text-center">
            {mode === 'login' ? 'Welcome back! Sign in to continue.' : 'Create your account to get started.'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-[32px] border border-surface-container shadow-lg p-8">
          {/* Mode toggle */}
          <div className="flex bg-surface-container-low rounded-2xl p-1 mb-6">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                mode === 'login' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'
              }`}
            >
              <LogIn size={16} /> Sign In
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                mode === 'register' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'
              }`}
            >
              <UserPlus size={16} /> Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Display Name (register only) */}
            {mode === 'register' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1.5">
                  Display Name
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="w-full pl-11 pr-4 py-3.5 bg-surface-container-low border border-surface-container rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>
              </motion.div>
            )}

            {/* Email */}
            <div>
              <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full pl-11 pr-4 py-3.5 bg-surface-container-low border border-surface-container rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  className="w-full pl-11 pr-12 py-3.5 bg-surface-container-low border border-surface-container rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface-variant transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-rose-600 font-medium bg-rose-50 border border-rose-100 rounded-xl px-4 py-3"
              >
                {error}
              </motion.p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-primary hover:brightness-110 active:scale-[0.98] text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Skip / Guest */}
          {onSkip && (
            <button
              onClick={onSkip}
              className="w-full mt-4 py-3 text-on-surface-variant hover:text-on-surface font-medium text-sm transition-colors"
            >
              Continue as guest (limited features)
            </button>
          )}
        </div>

        <p className="text-center text-[10px] text-on-surface-variant/60 font-medium mt-6">
          By signing in you agree to Lumina's terms. View our privacy policy in Settings &gt; Privacy.
        </p>
      </motion.div>
    </div>
  );
};

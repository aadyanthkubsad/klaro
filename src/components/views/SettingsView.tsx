/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { UserCircle, Palette, Bell, Shield, ChevronRight, Edit3, CheckCircle, ChevronDown, Video, ListMusic, Sparkles, Crown, Zap, Mail, Lock, User, Eye, EyeOff, LogIn, UserPlus, ArrowRight, Save, X, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TopBar } from '../common/TopBar';
import { PlanType, PlanLimits, UsageCounters } from '../../types';
import { AuthUser, useAuth } from '../../contexts/AuthContext';
import { useTheme, BrandColor, FontChoice } from '../../contexts/ThemeContext';
import { isOwner } from '../../services/billingService';

const PROFILE_KEY = 'lumina:user-profile';
const PROFILE_PIC_KEY = 'lumina:profile-picture';

interface UserProfile {
  fullName: string;
  email: string;
  classLevel: string;
  stream: string;
  learningTrack: string;
}

function loadProfile(user: AuthUser | null): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return {
        fullName: user?.displayName || saved.fullName || '',
        email: user?.email || saved.email || '',
        classLevel: saved.classLevel || 'Class 10',
        stream: saved.stream || '',
        learningTrack: saved.learningTrack || 'CBSE',
      };
    }
  } catch { /* ignore */ }
  return {
    fullName: user?.displayName || '',
    email: user?.email || '',
    classLevel: 'Class 10',
    stream: '',
    learningTrack: 'CBSE',
  };
}

export function getProfilePicture(): string | null {
  try { return localStorage.getItem(PROFILE_PIC_KEY); } catch { return null; }
}

function setProfilePicture(dataUrl: string | null): void {
  try {
    if (dataUrl) localStorage.setItem(PROFILE_PIC_KEY, dataUrl);
    else localStorage.removeItem(PROFILE_PIC_KEY);
    window.dispatchEvent(new Event('lumina:profile-pic-change'));
  } catch { /* ignore */ }
}

function saveProfile(profile: UserProfile) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* ignore */ }
}

interface SettingsViewProps {
  planType?: PlanType;
  changePlan?: (p: PlanType) => void;
  kitsUsedToday?: number;
  dailyLimit?: number;
  setView?: (v: string) => void;
  usageCounters?: UsageCounters;
  planLimits?: PlanLimits;
  user?: AuthUser | null;
}

export const SettingsView = ({ planType = 'free', changePlan, kitsUsedToday = 0, dailyLimit = 3, setView, usageCounters, planLimits, user }: SettingsViewProps) => {
  const { login, register, logout } = useAuth();
  const { darkMode, setDarkMode, brandColor, setBrandColor, font, setFont } = useTheme();

  const [activeSection, setActiveSection] = useState('account');
  const [autoplay, setAutoplay] = useState(true);

  // Auth form state (for inline login/register when not signed in)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Edit profile state
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile(user || null));
  const [editDraft, setEditDraft] = useState<UserProfile>(profile);
  const [profilePic, setProfilePicState] = useState<string | null>(() => getProfilePicture());
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleProfilePicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Resize to 200x200 to keep localStorage small
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 200;
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        const resized = canvas.toDataURL('image/jpeg', 0.85);
        setProfilePicture(resized);
        setProfilePicState(resized);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset input
  };

  const removeProfilePic = () => {
    setProfilePicture(null);
    setProfilePicState(null);
  };

  useEffect(() => {
    const p = loadProfile(user || null);
    setProfile(p);
    setEditDraft(p);
  }, [user]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    try {
      if (authMode === 'login') {
        await login(authEmail, authPassword);
      } else {
        await register(authEmail, authPassword, authName || 'Learner');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSaveProfile = () => {
    saveProfile(editDraft);
    setProfile(editDraft);
    setEditing(false);
  };

  const sections = [
    { id: 'account', label: 'Account', icon: UserCircle },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'privacy', label: 'Privacy', icon: Shield },
  ];

  const brandColors: { name: string; value: BrandColor; hex: string }[] = [
    { name: 'Blue', value: 'blue', hex: '#6366F1' },
    { name: 'Teal', value: 'teal', hex: '#14B8A6' },
    { name: 'Purple', value: 'purple', hex: '#8B5CF6' },
    { name: 'Red', value: 'red', hex: '#EF4444' },
    { name: 'Orange', value: 'orange', hex: '#F97316' },
    { name: 'Violet', value: 'violet', hex: '#A78BFA' },
  ];

  const fontOptions: { label: string; value: FontChoice }[] = [
    { label: 'Lexend (Default)', value: 'lexend' },
    { label: 'Inter', value: 'inter' },
    { label: 'Poppins', value: 'poppins' },
    { label: 'System Default', value: 'system' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <TopBar title="Settings" subtitle="Manage your account preferences and customize your learning experience." />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white border border-surface-container rounded-3xl overflow-hidden p-3 card-shadow">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all group ${
                  activeSection === section.id
                    ? 'bg-primary text-white shadow-md'
                    : 'hover:bg-surface-container-low text-on-surface-variant'
                }`}
              >
                <div className="flex items-center gap-4">
                  <section.icon size={20} className={activeSection === section.id ? 'text-white' : 'group-hover:text-primary'} />
                  <span className="text-sm font-bold">{section.label}</span>
                </div>
                <ChevronRight size={16} className={activeSection === section.id ? 'text-white/70' : 'text-on-surface-variant/30'} />
              </button>
            ))}
          </div>
        </div>

        {/* Setting Content Panels */}
        <div className="lg:col-span-9 space-y-6">
          {/* Current Plan */}
          <div className="bg-white border border-surface-container rounded-[32px] p-6 card-shadow">
            <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  Your plan
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    planType === 'pro'  ? 'bg-amber-100 text-amber-800' :
                    planType === 'plus' ? 'bg-indigo-100 text-indigo-800' :
                                          'bg-surface-container text-on-surface-variant'
                  }`}>
                    {planType === 'pro' && <Crown size={11} />}
                    {planType === 'plus' && <Zap size={11} />}
                    {planType === 'free' && <Sparkles size={11} />}
                    {planType === 'pro' ? 'Exam Pro' : planType === 'plus' ? 'Student Plus' : 'Free'}
                  </span>
                </h3>
                <p className="text-xs text-on-surface-variant font-medium mt-1">
                  {planType === 'pro'
                    ? 'Exam Pro — ₹499/mo. 50 kits/day, monthly planner, mastery tracking, written answer feedback.'
                    : planType === 'plus'
                    ? 'Plus — ₹249/mo. 20 kits/day, PDF downloads, weak-topic retests, 5 YouTube Recall/month.'
                    : `Free plan: ${kitsUsedToday}/${dailyLimit} kits used today.`}
                </p>
              </div>
              <button
                onClick={() => setView?.('offers')}
                className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:brightness-110"
              >
                See plans
              </button>
            </div>
          </div>

          {/* Usage counters card */}
          {usageCounters && planLimits && (
            <div className="bg-white border border-surface-container rounded-[32px] p-6 card-shadow">
              <h3 className="text-lg font-bold mb-4">{isOwner() ? 'Usage — Unlimited Access' : 'Usage today'}</h3>
              {isOwner() ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {['Kits', 'Quizzes', 'YouTube Recall', 'PDFs', 'Written answers', 'Flashcard sets'].map(label => (
                    <div key={label} className="bg-emerald-50 rounded-xl p-3 border border-emerald-200">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">{label}</p>
                      <p className="text-lg font-black text-emerald-600 mt-1">Unlimited</p>
                      <div className="w-full h-1 bg-emerald-200 rounded-full mt-1.5">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: '100%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { label: 'Kits', used: usageCounters.kitsGeneratedToday, limit: planLimits.dailyKitsLimit },
                    { label: 'Quizzes', used: usageCounters.quizzesTakenToday, limit: planLimits.dailyQuizLimit },
                    { label: 'YouTube Recall', used: usageCounters.youtubeRecallUsedThisMonth, limit: planLimits.monthlyYoutubeRecallLimit },
                    { label: 'PDFs', used: usageCounters.pdfDownloadsToday, limit: planLimits.dailyPdfDownloadsLimit },
                    { label: 'Written answers', used: usageCounters.writtenAnswersEvaluatedToday, limit: planLimits.dailyWrittenAnswersLimit },
                    { label: 'Flashcard sets', used: usageCounters.flashcardSetsGeneratedToday, limit: planLimits.dailyFlashcardSetsLimit },
                  ].map(item => {
                    const pct = item.limit > 0 ? Math.min((item.used / item.limit) * 100, 100) : 0;
                    return (
                      <div key={item.label} className="bg-surface-container-low rounded-xl p-3 border border-surface-container">
                        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{item.label}</p>
                        <p className="text-lg font-black text-on-surface mt-1">
                          {item.limit === 0 ? <span className="text-sm text-gray-400">N/A</span> : <>{item.used}<span className="text-sm text-on-surface-variant">/{item.limit}</span></>}
                        </p>
                        {item.limit > 0 && (
                          <div className="w-full h-1 bg-surface-container rounded-full mt-1.5">
                            <div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── ACCOUNT SECTION ──────────────────────────────────────────── */}
          {activeSection === 'account' && (
            <>
              {/* Guest mode banner */}
              {!user && (
                <div className="bg-amber-50 border border-amber-200 rounded-[32px] p-5 flex items-start gap-4">
                  <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-amber-900">Guest Mode</p>
                    <p className="text-xs text-amber-700 mt-0.5">Progress is saved locally on this device. Sign in or create an account to sync across devices.</p>
                  </div>
                </div>
              )}

              {/* Login/Register card (when not signed in) */}
              {!user && (
                <div className="bg-white border border-surface-container rounded-[32px] p-8 card-shadow">
                  <h3 className="text-xl font-bold mb-6">Sign In or Create Account</h3>

                  <div className="flex bg-surface-container-low rounded-2xl p-1 mb-6 max-w-sm">
                    <button
                      onClick={() => { setAuthMode('login'); setAuthError(''); }}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                        authMode === 'login' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'
                      }`}
                    >
                      <LogIn size={16} /> Sign In
                    </button>
                    <button
                      onClick={() => { setAuthMode('register'); setAuthError(''); }}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                        authMode === 'register' ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'
                      }`}
                    >
                      <UserPlus size={16} /> Register
                    </button>
                  </div>

                  <form onSubmit={handleAuth} className="space-y-4 max-w-sm">
                    {authMode === 'register' && (
                      <div>
                        <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1.5">Display Name</label>
                        <div className="relative">
                          <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
                          <input type="text" value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Your name"
                            className="w-full pl-11 pr-4 py-3.5 bg-surface-container-low border border-surface-container rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1.5">Email</label>
                      <div className="relative">
                        <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
                        <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="you@example.com" required
                          className="w-full pl-11 pr-4 py-3.5 bg-surface-container-low border border-surface-container rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1.5">Password</label>
                      <div className="relative">
                        <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
                        <input type={showPassword ? 'text' : 'password'} value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                          placeholder={authMode === 'register' ? 'At least 8 characters' : 'Your password'} required minLength={authMode === 'register' ? 8 : undefined}
                          className="w-full pl-11 pr-12 py-3.5 bg-surface-container-low border border-surface-container rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface-variant">
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    {authError && (
                      <p className="text-sm text-rose-600 font-medium bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">{authError}</p>
                    )}
                    <button type="submit" disabled={authSubmitting}
                      className="w-full py-4 bg-primary hover:brightness-110 active:scale-[0.98] text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                      {authSubmitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                        <>{authMode === 'login' ? 'Sign In' : 'Create Account'}<ArrowRight size={16} /></>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* Account Information (when signed in) */}
              {user && (
                <div className="bg-white border border-surface-container rounded-[32px] p-8 card-shadow">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-bold">Account Information</h3>
                    {!editing ? (
                      <button onClick={() => { setEditDraft(profile); setEditing(true); }} className="flex items-center gap-2 text-primary font-bold text-sm">
                        <Edit3 size={16} /> Edit
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEditing(false)} className="flex items-center gap-2 text-on-surface-variant font-bold text-sm hover:text-on-surface">
                          <X size={16} /> Cancel
                        </button>
                        <button onClick={handleSaveProfile} className="flex items-center gap-2 bg-primary text-white font-bold text-sm px-4 py-2 rounded-xl hover:brightness-110">
                          <Save size={16} /> Save
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col md:flex-row items-start gap-8">
                    <div className="relative group">
                      <div className="w-24 h-24 rounded-3xl overflow-hidden border-4 border-white shadow-xl bg-primary/10 flex items-center justify-center">
                        {profilePic ? (
                          <img src={profilePic} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-3xl font-black text-primary">{(profile.fullName || user.displayName || 'L')[0].toUpperCase()}</span>
                        )}
                      </div>
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfilePicUpload} />
                      <div className="flex gap-1 mt-2">
                        <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-bold text-primary hover:underline">
                          {profilePic ? 'Change' : 'Add Photo'}
                        </button>
                        {profilePic && (
                          <button onClick={removeProfilePic} className="text-[10px] font-bold text-red-500 hover:underline ml-2">
                            Remove
                          </button>
                        )}
                      </div>
                    </div>

                    <AnimatePresence mode="wait">
                      {!editing ? (
                        <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 flex-1">
                          <div>
                            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] block mb-1.5">Full Name</label>
                            <p className="font-bold text-on-surface">{profile.fullName || user.displayName}</p>
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] block mb-1.5">Email Address</label>
                            <p className="font-bold text-on-surface">{profile.email || user.email}</p>
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] block mb-1.5">Class / Grade</label>
                            <p className="font-bold text-on-surface">{profile.classLevel}</p>
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] block mb-1.5">Stream</label>
                            <p className="font-bold text-on-surface">{profile.stream || 'N/A'}</p>
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] block mb-1.5">Learning Track</label>
                            <div className="inline-flex px-3 py-1 bg-primary/10 text-primary rounded-lg font-bold text-[11px] uppercase tracking-wider mt-1">
                              {profile.learningTrack} {profile.classLevel}
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] block mb-1.5">Membership</label>
                            <p className="font-bold text-on-surface">{planType === 'pro' ? 'Exam Pro' : planType === 'plus' ? 'Student Plus' : 'Free Plan'}</p>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 flex-1">
                          <div>
                            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] block mb-1.5">Full Name</label>
                            <input type="text" value={editDraft.fullName} onChange={e => setEditDraft(d => ({ ...d, fullName: e.target.value }))}
                              className="w-full px-4 py-3 bg-surface-container-low border border-surface-container rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] block mb-1.5">Email Address</label>
                            <input type="email" value={editDraft.email} onChange={e => setEditDraft(d => ({ ...d, email: e.target.value }))}
                              className="w-full px-4 py-3 bg-surface-container-low border border-surface-container rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] block mb-1.5">Class / Grade</label>
                            <select value={editDraft.classLevel} onChange={e => setEditDraft(d => ({ ...d, classLevel: e.target.value, stream: e.target.value === 'Class 10' ? '' : d.stream }))}
                              className="w-full px-4 py-3 bg-surface-container-low border border-surface-container rounded-xl text-sm font-bold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                              <option value="Class 10">Class 10</option>
                              <option value="Class 11">Class 11</option>
                              <option value="Class 12">Class 12</option>
                            </select>
                          </div>
                          {(editDraft.classLevel === 'Class 11' || editDraft.classLevel === 'Class 12') && (
                            <div>
                              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] block mb-1.5">Stream</label>
                              <select value={editDraft.stream} onChange={e => setEditDraft(d => ({ ...d, stream: e.target.value }))}
                                className="w-full px-4 py-3 bg-surface-container-low border border-surface-container rounded-xl text-sm font-bold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                                <option value="">Select stream</option>
                                <option value="Science">Science</option>
                                <option value="Commerce">Commerce</option>
                              </select>
                            </div>
                          )}
                          <div>
                            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] block mb-1.5">Learning Track</label>
                            <select value={editDraft.learningTrack} onChange={e => setEditDraft(d => ({ ...d, learningTrack: e.target.value }))}
                              className="w-full px-4 py-3 bg-surface-container-low border border-surface-container rounded-xl text-sm font-bold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                              <option value="CBSE">CBSE</option>
                              <option value="JEE">JEE</option>
                              <option value="NEET">NEET</option>
                            </select>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Sign out */}
                  <div className="mt-8 pt-6 border-t border-surface-container flex items-center justify-between">
                    <button onClick={() => { logout(); }} className="text-sm text-rose-600 font-bold hover:text-rose-700 transition-colors">
                      Sign Out
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm('This will permanently delete your account and all data. This cannot be undone. Are you sure?')) return;
                        try {
                          const token = localStorage.getItem('lumina:auth-token');
                          const res = await fetch('/api/account', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
                          if (res.ok) { logout(); alert('Account deleted.'); }
                          else alert('Failed to delete account. Please try again.');
                        } catch { alert('Network error. Please try again.'); }
                      }}
                      className="text-xs text-on-surface-variant/50 hover:text-rose-600 transition-colors"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── APPEARANCE SECTION ───────────────────────────────────────── */}
          {activeSection === 'appearance' && (
            <div className="bg-white border border-surface-container rounded-[32px] p-8 card-shadow">
              <h3 className="text-xl font-bold mb-8">Appearance</h3>

              <div className="space-y-8">
                {/* Dark Mode */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-on-surface">Dark Mode</h4>
                    <p className="text-xs text-on-surface-variant font-medium">Switch between light and dark themes</p>
                  </div>
                  <button
                    onClick={() => setDarkMode(!darkMode)}
                    className={`w-12 h-6 rounded-full transition-all relative ${darkMode ? 'bg-primary' : 'bg-surface-container-high'}`}
                  >
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all ${darkMode ? 'translate-x-6' : ''}`} />
                  </button>
                </div>

                {/* Brand Color */}
                <div>
                  <h4 className="font-bold text-on-surface mb-2">Primary Brand Color</h4>
                  <p className="text-xs text-on-surface-variant mb-6 font-medium">Customize the interface accent colors</p>
                  <div className="flex flex-wrap gap-4">
                    {brandColors.map((c) => (
                      <button
                        key={c.name}
                        onClick={() => setBrandColor(c.value)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${brandColor === c.value ? 'ring-4 ring-offset-2 scale-110 shadow-lg' : 'hover:scale-105'}`}
                        style={{ backgroundColor: c.hex, ...(brandColor === c.value ? { ringColor: c.hex } : {}) }}
                        title={c.name}
                      >
                        {brandColor === c.value && <CheckCircle size={18} className="text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Typography */}
                <div>
                  <h4 className="font-bold text-on-surface mb-2">Typography Style</h4>
                  <p className="text-xs text-on-surface-variant mb-4 font-medium">Choose the font for your reading experience</p>
                  <div className="relative max-w-xs">
                    <select
                      value={font}
                      onChange={e => setFont(e.target.value as FontChoice)}
                      className="w-full bg-surface-container-low border border-surface-container rounded-xl px-5 py-3 text-sm font-bold appearance-none cursor-pointer focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      {fontOptions.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" size={16} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── PRIVACY SECTION ─────────────────────────────────────────── */}
          {activeSection === 'privacy' && (
            <div className="bg-white border border-surface-container rounded-[32px] p-8 card-shadow space-y-6">
              <h3 className="text-xl font-bold">Privacy & Legal</h3>
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-surface-container-low">
                  <h4 className="font-bold text-on-surface mb-2">Data We Collect</h4>
                  <ul className="text-sm text-on-surface-variant space-y-1 list-disc list-inside">
                    <li>Email address (for account login and password recovery)</li>
                    <li>Study activity (chapters opened, quizzes taken, notes generated)</li>
                    <li>Learning preferences (VARK type, class, stream, subjects)</li>
                  </ul>
                </div>
                <div className="p-4 rounded-2xl bg-surface-container-low">
                  <h4 className="font-bold text-on-surface mb-2">How We Use It</h4>
                  <p className="text-sm text-on-surface-variant">Your data stays on our servers and is used solely to personalise your learning experience — adaptive quizzes, progress tracking, and AI-generated study material. We do not sell or share your data with third parties.</p>
                </div>
                <div className="p-4 rounded-2xl bg-surface-container-low">
                  <h4 className="font-bold text-on-surface mb-2">Your Rights (DPDP Act 2023)</h4>
                  <ul className="text-sm text-on-surface-variant space-y-1 list-disc list-inside">
                    <li>Right to access your personal data</li>
                    <li>Right to correction of inaccurate data</li>
                    <li>Right to erasure — delete your account and all associated data</li>
                    <li>Right to grievance redressal</li>
                  </ul>
                </div>
                <div className="p-4 rounded-2xl bg-surface-container-low">
                  <h4 className="font-bold text-on-surface mb-2">Third-Party Services</h4>
                  <ul className="text-sm text-on-surface-variant space-y-1 list-disc list-inside">
                    <li><strong>Google Gemini AI</strong> — generates study notes, quizzes, and flashcards. Prompts contain chapter topics only, never your personal data.</li>
                    <li><strong>Sarvam AI</strong> — Hindi text-to-speech for audio study mode. Only chapter text is sent.</li>
                    <li><strong>Razorpay</strong> — payment processing for Plus/Pro plans. We never store card details.</li>
                  </ul>
                </div>
                <div className="p-4 rounded-2xl bg-surface-container-low">
                  <h4 className="font-bold text-on-surface mb-2">Contact</h4>
                  <p className="text-sm text-on-surface-variant">For data requests, corrections, or deletion: <strong>prashanth.kubsad@gmail.com</strong></p>
                </div>
              </div>
            </div>
          )}

          {/* Learning Preferences */}
          <div className="bg-white border border-surface-container rounded-[32px] p-8 card-shadow">
            <h3 className="text-xl font-bold mb-8">Learning Preferences</h3>

            <div className="space-y-6">
              {[
                { id: 'autoplay', label: 'Auto-play Videos', desc: 'Begin videos automatically when opening a lesson', icon: Video, active: autoplay, setter: setAutoplay },
                { id: 'captions', label: 'Default Captions', desc: 'Show subtitles for all video content', icon: ListMusic, active: false, setter: () => {} },
              ].map((pref) => (
                <div key={pref.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 rounded-2xl bg-primary/5 text-primary flex items-center justify-center shrink-0">
                      <pref.icon size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-on-surface">{pref.label}</h4>
                      <p className="text-xs text-on-surface-variant font-medium">{pref.desc}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => pref.setter(!pref.active)}
                    className={`w-12 h-6 rounded-full transition-all relative ${pref.active ? 'bg-primary' : 'bg-surface-container-high'}`}
                  >
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all ${pref.active ? 'translate-x-6' : ''}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * OffersView — Upgrade Plan page.
 *
 * Three-card freemium layout: Free / Student Plus / Exam Pro.
 * "Best for exam prep" badge on Pro. Monthly ↔ Yearly toggle.
 * No real payment gateway yet — clicking a paid CTA flips planType via
 * changePlan() so the rest of the app can be previewed.
 */

import React, { useState } from 'react';
import {
  Check, Sparkles, Zap, Star, Shield, Calendar, Headphones, Download,
  Layers, BarChart3, BookOpen, Brain, Lock, Crown,
} from 'lucide-react';
import { motion } from 'motion/react';
import { PlanType } from '../../types';

interface OffersViewProps {
  setView?: (v: string) => void;
  planType: PlanType;
  changePlan: (p: PlanType) => void;
}

// ─── pricing data ────────────────────────────────────────────────────────────

interface PriceCard {
  id: PlanType;
  name: string;
  tagline: string;
  monthly: number;
  yearly: number;
  badge?: string;
  highlight?: boolean;
  features: { icon: any; label: string; }[];
  cta: { label: string; subtle?: boolean };
}

const PLANS: PriceCard[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Try Klaro and build a study habit',
    monthly: 0,
    yearly: 0,
    features: [
      { icon: BookOpen, label: '3 revision kits per day' },
      { icon: Check, label: 'Basic summary & 5-question quiz' },
      { icon: Check, label: 'Basic flashcards' },
      { icon: Check, label: 'Mistakes notebook' },
      { icon: Check, label: 'Daily tasks (free forever)' },
      { icon: Check, label: 'Basic visual mind map' },
      { icon: Check, label: 'Save up to 10 items in Library' },
    ],
    cta: { label: 'Start Free', subtle: true },
  },
  {
    id: 'plus',
    name: 'Student Plus',
    tagline: 'For regular weekly revisers',
    monthly: 99,
    yearly: 499,
    features: [
      { icon: Layers,     label: '20 revision kits per day' },
      { icon: Sparkles,   label: 'Unlimited flashcards' },
      { icon: Download,   label: 'Save kits as PDF' },
      { icon: Headphones, label: 'Audio summaries' },
      { icon: BookOpen,   label: 'Mistake slideshow review' },
      { icon: BarChart3,  label: 'Weak-topic retest' },
      { icon: Check,      label: 'Unlimited library saves' },
    ],
    cta: { label: 'Upgrade to Plus' },
  },
  {
    id: 'pro',
    name: 'Exam Pro',
    tagline: 'For serious exam preparation',
    monthly: 199,
    yearly: 999,
    badge: 'Best for exam prep',
    highlight: true,
    features: [
      { icon: Zap,       label: 'Unlimited revision kits' },
      { icon: Calendar,  label: 'Monthly Revision Planner' },
      { icon: BarChart3, label: 'Spaced repetition calendar' },
      { icon: Brain,     label: 'Advanced score & mastery tracking' },
      { icon: Star,      label: 'Premium 3D models' },
      { icon: Sparkles,  label: 'Animated explainers (coming soon)' },
      { icon: Headphones, label: 'MP3 download' },
      { icon: Zap,       label: 'Priority AI generation' },
    ],
    cta: { label: 'Upgrade to Exam Pro' },
  },
];

// ─── component ───────────────────────────────────────────────────────────────

export const OffersView = ({ setView, planType, changePlan }: OffersViewProps) => {
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('yearly');

  const handleCta = (id: PlanType) => {
    if (id === planType) {
      setView?.('dashboard');
      return;
    }
    if (id === 'free') {
      changePlan('free');
      setView?.('dashboard');
      return;
    }
    // No real billing yet — flip the demo plan flag so the rest of the app
    // can be previewed. A real implementation would call Razorpay/Stripe here.
    changePlan(id);
    setView?.('dashboard');
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto pb-20 space-y-10">
      {/* Heading */}
      <div className="text-center space-y-3">
        <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
          Plans &amp; Pricing
        </span>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-on-surface">
          Pick the plan that fits how you study
        </h1>
        <p className="text-on-surface-variant font-medium max-w-xl mx-auto">
          Free has everything to build a study habit. Plus unlocks exports and audio. Pro powers full exam prep with a monthly planner and mastery tracking.
        </p>
      </div>

      {/* Monthly / Yearly toggle */}
      <div className="flex items-center justify-center">
        <div className="inline-flex bg-surface-container rounded-full p-1 border border-surface-container-high">
          <button
            onClick={() => setCycle('monthly')}
            className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
              cycle === 'monthly' ? 'bg-white text-on-surface shadow-sm' : 'text-on-surface-variant'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setCycle('yearly')}
            className={`px-6 py-2 rounded-full text-sm font-bold transition-all relative ${
              cycle === 'yearly' ? 'bg-white text-on-surface shadow-sm' : 'text-on-surface-variant'
            }`}
          >
            Yearly
            <span className="absolute -top-2 -right-3 px-2 py-0.5 bg-emerald-500 text-white rounded-full text-[9px] font-black uppercase tracking-widest">
              Save 58%
            </span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((p) => {
          const price = cycle === 'monthly' ? p.monthly : p.yearly;
          const perMonth = cycle === 'yearly' && p.yearly > 0 ? Math.round(p.yearly / 12) : null;
          const isCurrent = planType === p.id;
          return (
            <div
              key={p.id}
              className={`relative rounded-[32px] p-7 border-2 flex flex-col transition-all ${
                p.highlight
                  ? 'bg-navy-dark text-white border-primary shadow-xl scale-[1.02]'
                  : 'bg-white text-on-surface border-surface-container-high shadow-sm'
              }`}
            >
              {p.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-white rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 whitespace-nowrap">
                  <Crown size={12} /> {p.badge}
                </div>
              )}

              <div className="flex items-center justify-between mb-1">
                <h3 className="text-2xl font-black">{p.name}</h3>
                {isCurrent && (
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${p.highlight ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                    Current
                  </span>
                )}
              </div>
              <p className={`text-sm font-medium mb-6 ${p.highlight ? 'text-white/70' : 'text-on-surface-variant'}`}>
                {p.tagline}
              </p>

              <div className="mb-6">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-black">₹{price}</span>
                  {price > 0 && (
                    <span className={`text-sm font-bold ${p.highlight ? 'text-white/60' : 'text-on-surface-variant'}`}>
                      / {cycle === 'monthly' ? 'month' : 'year'}
                    </span>
                  )}
                </div>
                {perMonth !== null && (
                  <p className={`text-xs font-bold mt-1 ${p.highlight ? 'text-white/60' : 'text-on-surface-variant'}`}>
                    Effectively ₹{perMonth}/month
                  </p>
                )}
                {price === 0 && (
                  <p className={`text-xs font-bold mt-1 ${p.highlight ? 'text-white/60' : 'text-on-surface-variant'}`}>
                    Free forever
                  </p>
                )}
              </div>

              <ul className="space-y-3 mb-8 flex-grow">
                {p.features.map((f, i) => {
                  const Icon = f.icon;
                  return (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className={`mt-0.5 shrink-0 ${p.highlight ? 'text-primary' : 'text-primary'}`}>
                        <Icon size={14} />
                      </span>
                      <span className={`leading-snug ${p.highlight ? 'text-white/90' : 'text-on-surface'}`}>
                        {f.label}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <button
                onClick={() => handleCta(p.id)}
                disabled={isCurrent}
                className={`w-full py-3 rounded-2xl text-sm font-black uppercase tracking-widest transition-all ${
                  isCurrent
                    ? 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                    : p.highlight
                    ? 'bg-primary text-white hover:brightness-110 shadow-lg'
                    : p.cta.subtle
                    ? 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                    : 'bg-navy-dark text-white hover:bg-primary'
                }`}
              >
                {isCurrent ? 'Current plan' : p.cta.label}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="bg-surface-container-low rounded-[24px] p-6 text-center space-y-2">
        <div className="flex items-center justify-center gap-2 text-on-surface">
          <Lock size={14} className="text-primary" />
          <span className="text-sm font-bold">Payment integration coming soon</span>
        </div>
        <p className="text-xs text-on-surface-variant max-w-lg mx-auto">
          For now, clicking Upgrade switches your plan in this demo so you can preview Plus and Pro features.
          Real UPI/Razorpay billing lands in the next release.
        </p>
      </div>

      <p className="text-center text-[11px] text-on-surface-variant/60">
        Cancel anytime. Yearly plans get a 7-day refund window. Prices include GST.
      </p>
    </motion.div>
  );
};

export default OffersView;

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * OffersView — Upgrade Plan page.
 *
 * Three-card pricing layout: Free / Plus / Exam Pro.
 * Monthly / Yearly toggle. Usage counters below the cards.
 * Paid CTAs create a Razorpay order server-side and open the
 * checkout modal. On success the plan is verified and updated.
 *
 * Pricing:
 *   Free     — ₹0
 *   Plus     — ₹249/month | ₹1,799/year
 *   Exam Pro — ₹499/month | ₹3,499/year
 */

import React, { useState } from 'react';
import {
  Check, Sparkles, Zap, Star, Crown, Lock,
  BookOpen, Brain, Calendar, Download, BarChart3,
  Youtube, PenTool, Target, Shield, Layers,
} from 'lucide-react';
import { motion } from 'motion/react';
import { PlanType } from '../../types';
import { PRICING, getUsageCounters, getLimitsFor } from '../../services/billingService';
import { useAuth } from '../../contexts/AuthContext';

interface OffersViewProps {
  setView?: (v: string) => void;
  planType: PlanType;
  changePlan: (p: PlanType) => void;
}

// Feature icon mapping
const FEATURE_ICONS: Record<string, any> = {
  'revision kits': BookOpen,
  'quizzes': Check,
  'flashcards': Layers,
  'mistakes': Check,
  'tasks': Check,
  'library': Check,
  'pdf': Download,
  'weak-topic': Target,
  'previous-year': Check,
  'spaced': Calendar,
  'youtube': Youtube,
  'planner': Calendar,
  'analytics': BarChart3,
  'mastery': Brain,
  'forgetting': Calendar,
  'written': PenTool,
  'mock': Shield,
  'priority': Zap,
};

function getIconForFeature(label: string): any {
  const lower = label.toLowerCase();
  for (const [key, icon] of Object.entries(FEATURE_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return Check;
}

// Yearly savings calculation
function yearlySavingsPercent(monthly: number, yearly: number): number {
  if (monthly === 0) return 0;
  const fullYearly = monthly * 12;
  return Math.round(((fullYearly - yearly) / fullYearly) * 100);
}

export const OffersView = ({ setView, planType, changePlan }: OffersViewProps) => {
  const { user, authFetch, refreshUser } = useAuth();
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const counters = getUsageCounters();
  const limits = getLimitsFor(planType);

  const maxSaving = Math.max(
    ...PRICING.filter(p => p.monthlyPrice > 0)
      .map(p => yearlySavingsPercent(p.monthlyPrice, p.yearlyPrice)),
  );

  const handleCta = async (id: PlanType) => {
    if (id === planType) {
      setView?.('dashboard');
      return;
    }
    if (id === 'free') {
      changePlan('free');
      setView?.('dashboard');
      return;
    }

    // Paid plan — require login
    if (!user) {
      setView?.('auth');
      return;
    }

    // Build the plan key the backend expects, e.g. "plus-monthly"
    const planKey = `${id}-${cycle}`;
    setCheckoutLoading(id);

    try {
      const res = await authFetch('/api/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ planKey }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 503 || (data.error && data.error.includes('not configured'))) {
          setPaymentError('Razorpay payment keys are not yet configured. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your .env file and restart the server.');
        } else {
          setPaymentError(data.error || 'Could not create order. Please try again.');
        }
        setCheckoutLoading(null);
        return;
      }

      const options = {
        key: data.key,
        amount: data.order.amount,
        currency: data.order.currency,
        name: 'Lumina Learn',
        description: PRICING.find(p => p.id === id)?.name || 'Plan Upgrade',
        order_id: data.order.id,
        handler: async (response: any) => {
          try {
            const verifyRes = await authFetch('/api/payments/verify', {
              method: 'POST',
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              changePlan(verifyData.user.planType);
              await refreshUser();
              setView?.('dashboard');
            } else {
              setPaymentError('Payment verification failed. Contact support if amount was deducted.');
            }
          } catch {
            alert('Payment verification failed. Contact support if amount was deducted.');
          }
          setCheckoutLoading(null);
        },
        modal: { ondismiss: () => setCheckoutLoading(null) },
        prefill: { email: user?.email || '', name: user?.displayName || '' },
        theme: { color: '#6366f1' },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch {
      setPaymentError('Network error. Please check your connection and try again.');
      setCheckoutLoading(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto px-4 pb-20 space-y-10">
      {/* Heading */}
      <div className="text-center space-y-3 pt-4">
        <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest">
          Plans &amp; Pricing
        </span>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-on-surface">
          Pick the plan that fits how you study
        </h1>
        <p className="text-on-surface-variant font-medium max-w-xl mx-auto">
          Free gets you started. Plus powers daily revision. Exam Pro is your full exam command centre.
        </p>
      </div>

      {/* Payment error banner */}
      {paymentError && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex items-start gap-3 max-w-2xl mx-auto">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-rose-600 shrink-0 mt-0.5"><path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
          <div className="flex-1">
            <p className="text-sm font-bold text-rose-900">Payment setup needed</p>
            <p className="text-xs text-rose-700 mt-0.5">{paymentError}</p>
          </div>
          <button onClick={() => setPaymentError(null)} className="text-rose-400 hover:text-rose-600 shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}

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
              Save {maxSaving}%
            </span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PRICING.map((p) => {
          const price = cycle === 'monthly' ? p.monthlyPrice : p.yearlyPrice;
          const perMonth = cycle === 'yearly' && p.yearlyPrice > 0 ? Math.round(p.yearlyPrice / 12) : null;
          const isCurrent = planType === p.id;
          const savings = cycle === 'yearly' ? yearlySavingsPercent(p.monthlyPrice, p.yearlyPrice) : 0;
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
                  <span className="text-4xl font-black">{price === 0 ? 'Free' : `₹${price}`}</span>
                  {price > 0 && (
                    <span className={`text-sm font-bold ${p.highlight ? 'text-white/60' : 'text-on-surface-variant'}`}>
                      / {cycle === 'monthly' ? 'month' : 'year'}
                    </span>
                  )}
                </div>
                {perMonth !== null && (
                  <p className={`text-xs font-bold mt-1 ${p.highlight ? 'text-white/60' : 'text-on-surface-variant'}`}>
                    {`₹${perMonth}/month`} {savings > 0 && <span className="text-emerald-400">({savings}% off)</span>}
                  </p>
                )}
                {price === 0 && (
                  <p className={`text-xs font-bold mt-1 ${p.highlight ? 'text-white/60' : 'text-on-surface-variant'}`}>
                    Free forever
                  </p>
                )}
              </div>

              {/* "Everything in Free/Plus" note for Plus/Pro */}
              {p.id === 'plus' && (
                <p className={`text-xs font-bold mb-3 ${p.highlight ? 'text-white/50' : 'text-on-surface-variant'}`}>
                  Everything in Free, plus:
                </p>
              )}
              {p.id === 'pro' && (
                <p className={`text-xs font-bold mb-3 ${p.highlight ? 'text-white/50' : 'text-on-surface-variant'}`}>
                  Everything in Plus, plus:
                </p>
              )}

              <ul className="space-y-3 mb-8 flex-grow">
                {p.features.map((f, i) => {
                  const Icon = getIconForFeature(f);
                  return (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className={`mt-0.5 shrink-0 ${p.highlight ? 'text-primary' : 'text-primary'}`}>
                        <Icon size={14} />
                      </span>
                      <span className={`leading-snug ${p.highlight ? 'text-white/90' : 'text-on-surface'}`}>
                        {f}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <button
                onClick={() => handleCta(p.id)}
                disabled={isCurrent || checkoutLoading === p.id}
                className={`w-full py-3 rounded-2xl text-sm font-black uppercase tracking-widest transition-all ${
                  isCurrent || checkoutLoading === p.id
                    ? 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                    : p.highlight
                    ? 'bg-primary text-white hover:brightness-110 shadow-lg'
                    : p.id === 'free'
                    ? 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                    : 'bg-navy-dark text-white hover:bg-primary'
                }`}
              >
                {checkoutLoading === p.id ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                ) : (
                  isCurrent ? 'Current plan' : p.id === 'free' ? 'Start Free' : `Upgrade to ${p.name}`
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Usage counters */}
      <div className="bg-white border border-surface-container rounded-[32px] p-6 card-shadow">
        <h3 className="text-lg font-black text-on-surface mb-4">Your usage today</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[
            { label: 'Kits generated', used: counters.kitsGeneratedToday, limit: limits.dailyKitsLimit, period: 'today' },
            { label: 'Quizzes taken', used: counters.quizzesTakenToday, limit: limits.dailyQuizLimit, period: 'today' },
            { label: 'YouTube Recall', used: counters.youtubeRecallUsedThisMonth, limit: limits.monthlyYoutubeRecallLimit, period: 'this month' },
            { label: 'PDF downloads', used: counters.pdfDownloadsToday, limit: limits.dailyPdfDownloadsLimit, period: 'today' },
            { label: 'Written answers', used: counters.writtenAnswersEvaluatedToday, limit: limits.dailyWrittenAnswersLimit, period: 'today' },
          ].map((item) => {
            const pct = item.limit > 0 ? Math.min((item.used / item.limit) * 100, 100) : 0;
            const atLimit = item.limit > 0 && item.used >= item.limit;
            const notAvailable = item.limit === 0;
            return (
              <div
                key={item.label}
                className={`rounded-2xl p-4 border ${
                  notAvailable ? 'bg-gray-50 border-gray-200' :
                  atLimit ? 'bg-red-50 border-red-200' :
                  'bg-surface-container-low border-surface-container'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                  {item.label}
                </p>
                {notAvailable ? (
                  <p className="text-sm font-bold text-gray-400">Not available</p>
                ) : (
                  <>
                    <p className={`text-xl font-black ${atLimit ? 'text-red-600' : 'text-on-surface'}`}>
                      {item.used}<span className="text-sm font-bold text-on-surface-variant">/{item.limit}</span>
                    </p>
                    <div className="w-full h-1.5 bg-surface-container rounded-full mt-2">
                      <div
                        className={`h-full rounded-full transition-all ${atLimit ? 'bg-red-500' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-on-surface-variant mt-1">{item.period}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-surface-container-low rounded-[24px] p-6 text-center space-y-2">
        <div className="flex items-center justify-center gap-2 text-on-surface">
          <Lock size={14} className="text-primary" />
          <span className="text-sm font-bold">Secure payments via Razorpay</span>
        </div>
        <p className="text-xs text-on-surface-variant max-w-lg mx-auto">
          All transactions are encrypted and processed securely through Razorpay. UPI, cards, net banking, and wallets accepted.
        </p>
      </div>

      <p className="text-center text-[11px] text-on-surface-variant/60">
        Cancel anytime. Yearly plans get a 7-day refund window. All prices include GST.
      </p>
    </motion.div>
  );
};

export default OffersView;

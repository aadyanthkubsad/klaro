/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Razorpay payment integration for Lumina.
 *
 * Handles order creation and payment signature verification.
 * Uses Razorpay test mode keys from .env for development.
 *
 * Pricing (INR):
 *   Plus     — ₹249/month | ₹1,799/year
 *   Exam Pro — ₹499/month | ₹3,499/year
 */

import Razorpay from 'razorpay';
import crypto from 'crypto';
import { logger } from './logger.js';

let razorpay: Razorpay | null = null;

function getRazorpay(): Razorpay {
  if (!razorpay) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    });
  }
  return razorpay;
}

/** Plan prices in paise (1 INR = 100 paise). */
export const PLAN_PRICES: Record<string, { amount: number; currency: string; label: string }> = {
  'plus-monthly':  { amount: 24900,  currency: 'INR', label: 'Plus Monthly (₹249)' },
  'plus-yearly':   { amount: 179900, currency: 'INR', label: 'Plus Yearly (₹1,799)' },
  'pro-monthly':   { amount: 49900,  currency: 'INR', label: 'Exam Pro Monthly (₹499)' },
  'pro-yearly':    { amount: 349900, currency: 'INR', label: 'Exam Pro Yearly (₹3,499)' },
};

export async function createOrder(planKey: string, userId: string): Promise<any> {
  const price = PLAN_PRICES[planKey];
  if (!price) throw new Error(`Invalid plan: ${planKey}`);

  const order = await getRazorpay().orders.create({
    amount: price.amount,
    currency: price.currency,
    receipt: `lumina_${userId}_${Date.now()}`,
    notes: { userId, planKey },
  });

  return order;
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return expectedSignature === signature;
}

export function isRazorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

import { useState, useCallback } from 'react';
import { PaywallConfig, PlanType, PlanLimits } from '../types';
import { getLimitsFor } from '../services/billingService';

export function usePaywall(planType: PlanType) {
  const [config, setConfig] = useState<PaywallConfig | null>(null);
  const planLimits: PlanLimits = getLimitsFor(planType);

  const open = useCallback((cfg: PaywallConfig) => setConfig(cfg), []);
  const close = useCallback(() => setConfig(null), []);

  return { paywallConfig: config, openPaywall: open, closePaywall: close, planLimits };
}

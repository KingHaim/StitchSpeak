export interface ProductionChecks {
  gemini: boolean;
  openai: boolean;
  googleOAuth: boolean;
  lemonSqueezy: boolean;
  lemonSqueezyWebhook: boolean;
  credits: boolean;
  patterns: boolean;
  authSession: boolean;
  authEmail: boolean;
}

/** Revenue dependencies are first-class readiness requirements. */
export function isProductionReady(checks: ProductionChecks): boolean {
  return Object.values(checks).every(Boolean);
}

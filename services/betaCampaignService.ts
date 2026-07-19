import { apiCall } from './api';

export interface BetaApplicationInput {
  name: string;
  email: string;
  instagramHandle: string;
  audienceSize: string;
  contentFocus: string;
  patternRightsConfirmed: boolean;
  patternToTranslate: string;
  targetLanguageMarket: string;
  salesChannels: string;
  promotionPlan: string;
  testingInterest: string;
  promotionConfirmed: boolean;
  website: string;
  attribution?: BetaAttributionInput;
}

export interface BetaApplicationResponse {
  ok: true;
  applicationId: string;
  message: string;
}

export interface BetaAttributionInput {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  landingPage?: string;
  referrer?: string;
}

export function submitBetaApplication(
  input: BetaApplicationInput,
): Promise<BetaApplicationResponse> {
  return apiCall<BetaApplicationResponse>('/beta-applications', 'POST', { ...input });
}

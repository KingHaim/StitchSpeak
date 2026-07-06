import { apiCall } from './api';

export interface BetaApplicationInput {
  name: string;
  email: string;
  instagramHandle: string;
  audienceSize: string;
  contentFocus: string;
  promotionPlan: string;
  testingInterest: string;
  promotionConfirmed: boolean;
  website: string;
}

export interface BetaApplicationResponse {
  ok: true;
  applicationId: string;
  message: string;
}

export function submitBetaApplication(
  input: BetaApplicationInput,
): Promise<BetaApplicationResponse> {
  return apiCall<BetaApplicationResponse>('/beta-applications', 'POST', { ...input });
}

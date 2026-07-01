import { apiCall } from './api';

export interface BetaApplicationInput {
  name: string;
  email: string;
  sourceLanguage: string;
  targetLanguage: string;
  patternType: string;
  note: string;
  personalUseConfirmed: boolean;
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

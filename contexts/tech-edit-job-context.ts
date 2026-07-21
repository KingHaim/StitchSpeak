import { createContext, useContext } from 'react';
import type { TechEditReport, TechEditStage } from '../types';

export type TechEditJobStatus = 'running' | 'complete' | 'error';

export type TechEditJob = {
  file: File;
  fileName: string;
  startedAt: number;
  stage: TechEditStage;
  status: TechEditJobStatus;
  report?: TechEditReport;
  reportId?: string | null;
  error?: string;
  errorStatus?: number;
  errorCode?: string;
};

export type TechEditJobContextValue = {
  job: TechEditJob | null;
  startJob: (file: File) => Promise<void>;
  clearJob: () => void;
};

export const TechEditJobContext = createContext<TechEditJobContextValue | null>(null);

export function useTechEditJob(): TechEditJobContextValue {
  const ctx = useContext(TechEditJobContext);
  if (!ctx) throw new Error('useTechEditJob must be used within TechEditJobProvider');
  return ctx;
}

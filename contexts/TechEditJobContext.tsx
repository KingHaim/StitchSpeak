import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth-context';
import { useCredits } from './credit-context';
import { runTechEdit, TechEditError } from '../services/techEditService';
import {
  TechEditJobContext,
  type TechEditJob,
  type TechEditJobContextValue,
} from './tech-edit-job-context';

export const TechEditJobProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { idToken, isAuthenticated } = useAuth();
  const { applyBalance, refreshBalance } = useCredits();
  const [job, setJob] = useState<TechEditJob | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated) return;
    runningRef.current = false;
    setJob(null);
  }, [isAuthenticated]);

  const clearJob = useCallback(() => {
    if (runningRef.current) return;
    setJob(null);
  }, []);

  const startJob = useCallback(
    async (file: File) => {
      if (runningRef.current) return;

      runningRef.current = true;
      const fileName = file.name;
      setJob({
        file,
        fileName,
        startedAt: Date.now(),
        stage: 'extracting',
        status: 'running',
      });

      try {
        const result = await runTechEdit(file, idToken, {
          onStage: (stage) => {
            setJob((prev) =>
              prev && prev.status === 'running' ? { ...prev, stage } : prev,
            );
          },
        });
        if (typeof result.balance === 'number') applyBalance(result.balance);
        setJob((prev) => ({
          file,
          fileName,
          startedAt: prev?.startedAt ?? Date.now(),
          stage: 'finalizing',
          status: 'complete',
          report: result.report,
          reportId: result.reportId,
        }));
      } catch (err) {
        console.error('[tech-edit] Run failed:', err);
        void refreshBalance();
        const message =
          err instanceof Error ? err.message : 'The tech edit failed. Please try again.';
        setJob((prev) => ({
          file,
          fileName,
          startedAt: prev?.startedAt ?? Date.now(),
          stage: prev?.stage ?? 'extracting',
          status: 'error',
          error: message,
          errorStatus: err instanceof TechEditError ? err.status : undefined,
          errorCode: err instanceof TechEditError ? err.code : undefined,
        }));
        throw err;
      } finally {
        runningRef.current = false;
      }
    },
    [idToken, applyBalance, refreshBalance],
  );

  const value = useMemo<TechEditJobContextValue>(
    () => ({ job, startJob, clearJob }),
    [job, startJob, clearJob],
  );

  return (
    <TechEditJobContext.Provider value={value}>{children}</TechEditJobContext.Provider>
  );
};

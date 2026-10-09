import { describe, expect, it } from 'vitest';
import { getDeployedCommit } from '../src/services/deployedCommit';

const FULL_SHA = '85c6c11a7b3e4f90123456789abcdef012345678';

describe('getDeployedCommit', () => {
  it('prefers Railway\'s built-in RAILWAY_GIT_COMMIT_SHA and includes a short form', () => {
    expect(getDeployedCommit({
      RAILWAY_GIT_COMMIT_SHA: `  ${FULL_SHA}  `,
      GIT_COMMIT_SHA: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      SOURCE_COMMIT: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    })).toEqual({
      sha: FULL_SHA,
      short: FULL_SHA.slice(0, 7),
    });
  });

  it('falls back to GIT_COMMIT_SHA, then SOURCE_COMMIT, then unknown', () => {
    expect(getDeployedCommit({
      GIT_COMMIT_SHA: FULL_SHA,
      SOURCE_COMMIT: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    })).toEqual({ sha: FULL_SHA, short: FULL_SHA.slice(0, 7) });

    expect(getDeployedCommit({
      SOURCE_COMMIT: FULL_SHA,
    })).toEqual({ sha: FULL_SHA, short: FULL_SHA.slice(0, 7) });

    expect(getDeployedCommit({})).toEqual({ sha: 'unknown', short: 'unknown' });
  });

  it('does not expose non-SHA env values or secrets', () => {
    expect(getDeployedCommit({
      RAILWAY_GIT_COMMIT_SHA: 'sk-live-not-a-commit',
      GIT_COMMIT_SHA: 'password=super-secret',
      SOURCE_COMMIT: 'GEMINI_API_KEY=abc',
    })).toEqual({ sha: 'unknown', short: 'unknown' });
  });
});

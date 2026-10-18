export interface DeployedCommit {
  sha: string;
  short: string;
}

const UNKNOWN: DeployedCommit = { sha: 'unknown', short: 'unknown' };

/** Git SHA-1 is 40 hex chars; SHA-256 is 64. Short form is the first 7. */
const COMMIT_SHA = /^[0-9a-f]{7,64}$/i;
const SHORT_LENGTH = 7;

/**
 * Public deploy identity for health checks. Reads Railway's built-in
 * `RAILWAY_GIT_COMMIT_SHA`, then generic `GIT_COMMIT_SHA` / `SOURCE_COMMIT`
 * fallbacks. Rejects anything that is not a hex SHA so other env values
 * and secrets never leak into the public response.
 */
export function getDeployedCommit(
  env: NodeJS.ProcessEnv = process.env,
): DeployedCommit {
  const raw =
    env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
    env.GIT_COMMIT_SHA?.trim() ||
    env.SOURCE_COMMIT?.trim() ||
    '';
  if (!COMMIT_SHA.test(raw)) return UNKNOWN;
  const sha = raw.toLowerCase();
  return { sha, short: sha.slice(0, SHORT_LENGTH) };
}

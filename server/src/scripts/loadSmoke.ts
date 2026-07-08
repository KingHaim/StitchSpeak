import { performance } from 'node:perf_hooks';

const baseUrl = (process.env.LOAD_TEST_URL || 'http://127.0.0.1:3101').replace(/\/$/, '');
const totalRequests = Number.parseInt(process.env.LOAD_TEST_REQUESTS || '1000', 10);
const concurrency = Number.parseInt(process.env.LOAD_TEST_CONCURRENCY || '25', 10);
const maxP95Ms = Number.parseInt(process.env.LOAD_TEST_MAX_P95_MS || '250', 10);
const minRequestsPerSecond = Number.parseInt(process.env.LOAD_TEST_MIN_RPS || '100', 10);

if (![totalRequests, concurrency, maxP95Ms, minRequestsPerSecond].every(Number.isFinite)) {
  throw new Error('Load-test settings must be finite numbers.');
}
if (totalRequests < 1 || concurrency < 1 || concurrency > totalRequests) {
  throw new Error('Load-test request and concurrency settings are invalid.');
}

const scenarios = [
  { path: '/health', expectedStatus: 200 },
  { path: '/health', expectedStatus: 200 },
  { path: '/health', expectedStatus: 200 },
  { path: '/health', expectedStatus: 200 },
  { path: '/api/auth/session', expectedStatus: 401 },
];

const latencies: number[] = [];
const failures: Array<{ path: string; status?: number; error?: string }> = [];
let nextRequest = 0;

async function worker(): Promise<void> {
  while (nextRequest < totalRequests) {
    const index = nextRequest++;
    const scenario = scenarios[index % scenarios.length];
    const startedAt = performance.now();
    try {
      const response = await fetch(`${baseUrl}${scenario.path}`, {
        signal: AbortSignal.timeout(2_000),
        headers: { 'User-Agent': 'StitchSpeak-CI-Load-Smoke/1.0' },
      });
      await response.arrayBuffer();
      if (response.status !== scenario.expectedStatus) {
        failures.push({ path: scenario.path, status: response.status });
      }
    } catch (error) {
      failures.push({
        path: scenario.path,
        error: error instanceof Error ? error.message : 'Unknown request error',
      });
    } finally {
      latencies.push(performance.now() - startedAt);
    }
  }
}

const startedAt = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const durationMs = performance.now() - startedAt;
latencies.sort((a, b) => a - b);
const percentile = (value: number) => latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * value) - 1)];
const result = {
  totalRequests,
  concurrency,
  failures: failures.length,
  durationMs: Math.round(durationMs),
  requestsPerSecond: Math.round((totalRequests / durationMs) * 1000),
  p50Ms: Math.round(percentile(0.5)),
  p95Ms: Math.round(percentile(0.95)),
  p99Ms: Math.round(percentile(0.99)),
};

console.log(JSON.stringify(result));
if (failures.length > 0) {
  console.error(JSON.stringify({ sampleFailures: failures.slice(0, 10) }));
  process.exitCode = 1;
} else if (result.p95Ms > maxP95Ms) {
  console.error(`p95 ${result.p95Ms}ms exceeded the ${maxP95Ms}ms smoke-test limit.`);
  process.exitCode = 1;
} else if (result.requestsPerSecond < minRequestsPerSecond) {
  console.error(`Throughput ${result.requestsPerSecond} req/s fell below ${minRequestsPerSecond} req/s.`);
  process.exitCode = 1;
}

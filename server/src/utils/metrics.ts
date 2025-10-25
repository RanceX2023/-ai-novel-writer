import { Logger } from 'pino';

interface MetricRecord {
  count: number;
  errorCount: number;
  totalDurationMs: number;
}

const metrics = new Map<string, MetricRecord>();

let loggerRef: Logger | null = null;
let flushTimer: NodeJS.Timeout | null = null;

const DEFAULT_INTERVAL_MS = Number(process.env.METRIC_FLUSH_INTERVAL_MS ?? 60_000);

function toSnapshot([key, record]: [string, MetricRecord]) {
  const averageDurationMs = record.count > 0 ? record.totalDurationMs / record.count : 0;
  const errorRate = record.count > 0 ? record.errorCount / record.count : 0;
  return {
    key,
    count: record.count,
    averageDurationMs: Number(averageDurationMs.toFixed(2)),
    errorRate: Number(errorRate.toFixed(3)),
  };
}

function flushMetrics(): void {
  if (!loggerRef || metrics.size === 0) {
    return;
  }
  const snapshot = Array.from(metrics.entries()).map(toSnapshot);
  loggerRef.info({ metrics: snapshot }, 'request-metrics');
  metrics.clear();
}

export function initialiseMetrics(logger: Logger, intervalMs: number = DEFAULT_INTERVAL_MS): void {
  loggerRef = logger;

  if (process.env.NODE_ENV === 'test') {
    return;
  }

  if (intervalMs <= 0 || flushTimer) {
    return;
  }

  flushTimer = setInterval(flushMetrics, intervalMs);
  flushTimer.unref?.();
}

export function recordRequestMetric(key: string, durationMs: number, errored: boolean): void {
  const record = metrics.get(key) ?? { count: 0, errorCount: 0, totalDurationMs: 0 };
  record.count += 1;
  record.totalDurationMs += durationMs;
  if (errored) {
    record.errorCount += 1;
  }
  metrics.set(key, record);
}

export function stopMetricsTimer(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flushMetrics();
}

export function flushPendingMetrics(): void {
  flushMetrics();
}

export function getMetricsSnapshot(): Array<ReturnType<typeof toSnapshot>> {
  return Array.from(metrics.entries()).map(toSnapshot);
}

export function resetMetrics(): void {
  metrics.clear();
}

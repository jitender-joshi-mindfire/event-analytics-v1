import { apiFetch, type FetchResult } from "./client.js";
import type {
  Bucket,
  FunnelResponse,
  LatencyResponse,
  RetentionResponse,
  SessionsResponse,
  TimeseriesResponse,
  TopMetric,
  TopResponse,
} from "./types.js";

export function fetchTimeseries(params: {
  from: string;
  to: string;
  bucket: Bucket;
  eventType?: string;
}): Promise<FetchResult<TimeseriesResponse>> {
  return apiFetch<TimeseriesResponse>("/v1/metrics/timeseries", {
    from: params.from,
    to: params.to,
    bucket: params.bucket,
    event_type: params.eventType,
  });
}

export function fetchFunnel(params: {
  from: string;
  to: string;
  steps: string;
  window?: string;
}): Promise<FetchResult<FunnelResponse>> {
  return apiFetch<FunnelResponse>("/v1/metrics/funnel", {
    from: params.from,
    to: params.to,
    steps: params.steps,
    window: params.window,
  });
}

export function fetchRetention(params: {
  from: string;
  to: string;
  maxWeeks: number;
}): Promise<FetchResult<RetentionResponse>> {
  return apiFetch<RetentionResponse>("/v1/metrics/retention", {
    from: params.from,
    to: params.to,
    max_weeks: params.maxWeeks,
  });
}

export function fetchTop(params: {
  from: string;
  to: string;
  dimension: string;
  groupBy?: string;
  metric: TopMetric;
  n: number;
  cursor?: string;
  limit?: number;
}): Promise<FetchResult<TopResponse>> {
  return apiFetch<TopResponse>("/v1/metrics/top", {
    from: params.from,
    to: params.to,
    dimension: params.dimension,
    group_by: params.groupBy,
    metric: params.metric,
    n: params.n,
    cursor: params.cursor,
    limit: params.limit,
  });
}

export function fetchLatency(params: {
  from: string;
  to: string;
  field?: string;
  eventType?: string;
}): Promise<FetchResult<LatencyResponse>> {
  return apiFetch<LatencyResponse>("/v1/metrics/latency", {
    from: params.from,
    to: params.to,
    field: params.field,
    event_type: params.eventType,
  });
}

export function fetchSessions(params: {
  from: string;
  to: string;
  gapMinutes?: number;
  userId?: string;
  cursor?: string;
  limit?: number;
}): Promise<FetchResult<SessionsResponse>> {
  return apiFetch<SessionsResponse>("/v1/sessions/active", {
    from: params.from,
    to: params.to,
    gap_minutes: params.gapMinutes,
    user_id: params.userId,
    cursor: params.cursor,
    limit: params.limit,
  });
}

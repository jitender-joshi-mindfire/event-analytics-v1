export interface ProblemFieldError {
  field: string;
  message: string;
}

export interface Problem {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: ProblemFieldError[];
}

export type Bucket = "hour" | "day" | "week";

export interface TimeseriesPoint {
  ts: string;
  count: number;
}

export interface TimeseriesResponse {
  bucket: Bucket;
  series: TimeseriesPoint[];
}

export interface FunnelStep {
  step: string;
  users: number;
  conversion_from_prev: number;
}

export interface FunnelResponse {
  window: string;
  steps: FunnelStep[];
}

export interface RetentionCohort {
  cohort_week: string;
  size: number;
  retention: number[];
}

export interface RetentionResponse {
  cohorts: RetentionCohort[];
}

export type TopMetric = "count" | "sum_amount" | "unique_users";

export interface TopRow {
  group: string | null;
  entity: string;
  rank: number;
  value: number;
}

export interface TopResponse {
  rows: TopRow[];
  next_cursor: string | null;
}

export interface LatencyResponse {
  field: string;
  count: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface Session {
  user_id: string;
  started_at: string;
  ended_at: string;
  events: number;
  duration_seconds: number;
}

export interface SessionsResponse {
  sessions: Session[];
  next_cursor: string | null;
}

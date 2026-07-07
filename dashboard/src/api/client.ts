import type { Problem } from "./types.js";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.title);
    this.name = "ApiError";
    this.problem = problem;
  }
}

export interface FetchResult<T> {
  data: T;
  latencyMs: number;
}

export type QueryParams = Record<string, string | number | undefined>;

function buildUrl(path: string, params: QueryParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  }
  const qs = query.toString();
  return `${API_BASE_URL}${path}${qs ? `?${qs}` : ""}`;
}

// Measures wall-clock time for the fetch itself (network + server), which is
// what the dashboard displays per widget — a real, user-observed number
// rather than a server-reported one.
export async function apiFetch<T>(path: string, params: QueryParams = {}): Promise<FetchResult<T>> {
  const url = buildUrl(path, params);
  const start = performance.now();
  const response = await fetch(url);
  const latencyMs = performance.now() - start;
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    throw new ApiError(body as Problem);
  }

  return { data: body as T, latencyMs };
}

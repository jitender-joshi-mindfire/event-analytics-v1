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

const PROBLEM_BASE_URI = "https://errors.event-analytics.local";

export class HttpProblemError extends Error {
  readonly status: number;
  readonly type: string;
  readonly detail: string | undefined;
  readonly problemErrors: ProblemFieldError[] | undefined;

  constructor(status: number, title: string, opts?: { type?: string; detail?: string; errors?: ProblemFieldError[] }) {
    super(title);
    this.name = "HttpProblemError";
    this.status = status;
    this.type = opts?.type ?? `${PROBLEM_BASE_URI}/${status}`;
    this.detail = opts?.detail;
    this.problemErrors = opts?.errors;
  }

  toProblem(instance: string): Problem {
    return {
      type: this.type,
      title: this.message,
      status: this.status,
      detail: this.detail,
      instance,
      errors: this.problemErrors,
    };
  }
}

export function badRequest(detail: string, errors?: ProblemFieldError[]): HttpProblemError {
  return new HttpProblemError(400, "Invalid request parameters", { detail, errors });
}

export function payloadTooLarge(detail: string): HttpProblemError {
  return new HttpProblemError(413, "Batch too large", { detail });
}

export function serviceUnavailable(detail: string): HttpProblemError {
  return new HttpProblemError(503, "Service not ready", { detail });
}

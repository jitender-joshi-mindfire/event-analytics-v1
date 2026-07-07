import type { ReactNode } from "react";
import { ApiError } from "../api/client.js";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.problem.detail ?? error.problem.title;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

interface WidgetFrameProps {
  title: string;
  isLoading: boolean;
  error: unknown;
  latencyMs?: number;
  isEmpty?: boolean;
  controls?: ReactNode;
  children: ReactNode;
}

// Every widget renders through here so loading/empty/error states and the
// latency badge stay consistent, and so one widget's fetch never blocks
// another's — each WidgetFrame only reflects its own query's status.
export function WidgetFrame({
  title,
  isLoading,
  error,
  latencyMs,
  isEmpty,
  controls,
  children,
}: WidgetFrameProps): React.ReactElement {
  return (
    <section className="widget">
      <div className="widget-header">
        <h2>{title}</h2>
        {latencyMs !== undefined && !isLoading && !error && (
          <span className="latency-badge">loaded in {Math.round(latencyMs)}ms</span>
        )}
      </div>
      {controls && <div className="widget-controls">{controls}</div>}
      <div className="widget-body">
        {isLoading && <p className="widget-status">Loading…</p>}
        {!isLoading && Boolean(error) && (
          <p className="widget-status widget-status-error">{errorMessage(error)}</p>
        )}
        {!isLoading && !error && isEmpty && <p className="widget-status">No data for this range.</p>}
        {!isLoading && !error && !isEmpty && children}
      </div>
    </section>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WidgetFrame } from "../components/WidgetFrame.js";
import { fetchRetention } from "../api/endpoints.js";

interface RetentionWidgetProps {
  from: string;
  to: string;
}

// Direct API call, server-side Redis-cached (120s TTL) — the heaviest of the
// three cached aggregates (touches close to a full per-user event scan for
// wide cohort windows), so the cache matters most here.
export function RetentionWidget({ from, to }: RetentionWidgetProps): React.ReactElement {
  const [maxWeeks, setMaxWeeks] = useState(8);

  const query = useQuery({
    queryKey: ["retention", from, to, maxWeeks],
    queryFn: () => fetchRetention({ from, to, maxWeeks }),
    staleTime: 120_000,
  });

  const cohorts = query.data?.data.cohorts ?? [];

  return (
    <WidgetFrame
      title="Retention"
      isLoading={query.isPending}
      error={query.error}
      latencyMs={query.data?.latencyMs}
      isEmpty={cohorts.length === 0}
      controls={
        <label className="control">
          max_weeks
          <input
            type="number"
            min={1}
            max={26}
            value={maxWeeks}
            onChange={(e) => setMaxWeeks(Number(e.target.value))}
          />
        </label>
      }
    >
      <div style={{ overflowX: "auto" }}>
        <div
          className="heatmap"
          style={{ gridTemplateColumns: `90px repeat(${maxWeeks + 1}, 44px)` }}
        >
          <div />
          {Array.from({ length: maxWeeks + 1 }, (_, w) => (
            <div key={w} className="heatmap-row-label" style={{ justifyContent: "center" }}>
              w{w}
            </div>
          ))}
          {cohorts.map((cohort) => (
            <div key={cohort.cohort_week} style={{ display: "contents" }}>
              <div className="heatmap-row-label">
                {cohort.cohort_week} ({cohort.size})
              </div>
              {cohort.retention.map((fraction, w) => (
                <div
                  key={w}
                  className="heatmap-cell"
                  style={{ background: `rgba(37, 99, 235, ${Math.max(fraction, 0.04)})` }}
                  title={`${cohort.cohort_week} week ${w}: ${(fraction * 100).toFixed(1)}%`}
                >
                  {Math.round(fraction * 100)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </WidgetFrame>
  );
}

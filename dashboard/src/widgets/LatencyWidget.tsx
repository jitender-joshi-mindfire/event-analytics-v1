import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WidgetFrame } from "../components/WidgetFrame.js";
import { fetchLatency } from "../api/endpoints.js";

interface LatencyWidgetProps {
  from: string;
  to: string;
}

// Direct API call — not server-cached (only timeseries/funnel/retention are),
// backed by the occurred_at index and consistently well under its 400ms
// target, so caching would trade freshness for latency it doesn't need.
export function LatencyWidget({ from, to }: LatencyWidgetProps): React.ReactElement {
  const [field, setField] = useState("latency_ms");
  const [eventType, setEventType] = useState("");

  const query = useQuery({
    queryKey: ["latency", from, to, field, eventType],
    queryFn: () => fetchLatency({ from, to, field, eventType: eventType || undefined }),
    staleTime: 30_000,
  });

  const data = query.data?.data;

  return (
    <WidgetFrame
      title="Latency percentiles"
      isLoading={query.isPending}
      error={query.error}
      latencyMs={query.data?.latencyMs}
      isEmpty={data !== undefined && data.count === 0}
      controls={
        <>
          <label className="control">
            field
            <input type="text" value={field} onChange={(e) => setField(e.target.value)} />
          </label>
          <label className="control">
            event_type (optional)
            <input type="text" value={eventType} onChange={(e) => setEventType(e.target.value)} />
          </label>
        </>
      }
    >
      {data && (
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          {(["p50", "p90", "p95", "p99"] as const).map((key) => (
            <div key={key}>
              <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>{key}</div>
              <div style={{ fontSize: "1.3rem" }}>{data[key].toFixed(1)}</div>
            </div>
          ))}
          <div>
            <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>samples</div>
            <div style={{ fontSize: "1.3rem" }}>{data.count.toLocaleString()}</div>
          </div>
        </div>
      )}
    </WidgetFrame>
  );
}

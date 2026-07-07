import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WidgetFrame } from "../components/WidgetFrame.js";
import { fetchFunnel } from "../api/endpoints.js";

interface FunnelWidgetProps {
  from: string;
  to: string;
}

const DEFAULT_STEPS = "signup,view_page,add_to_cart,purchase";

// Direct API call, server-side Redis-cached (120s TTL) — funnels are
// expensive (a CTE chain per step) so a longer TTL trades a bit more
// staleness for fewer recomputations than timeseries gets.
export function FunnelWidget({ from, to }: FunnelWidgetProps): React.ReactElement {
  const [steps, setSteps] = useState(DEFAULT_STEPS);
  const [window, setWindowParam] = useState("P7D");

  const query = useQuery({
    queryKey: ["funnel", from, to, steps, window],
    queryFn: () => fetchFunnel({ from, to, steps, window }),
    staleTime: 120_000,
  });

  const funnelSteps = query.data?.data.steps ?? [];
  const maxUsers = funnelSteps[0]?.users ?? 0;

  return (
    <WidgetFrame
      title="Funnel"
      isLoading={query.isPending}
      error={query.error}
      latencyMs={query.data?.latencyMs}
      isEmpty={funnelSteps.length === 0}
      controls={
        <>
          <label className="control">
            steps (comma-separated)
            <input type="text" value={steps} onChange={(e) => setSteps(e.target.value)} />
          </label>
          <label className="control">
            window (ISO-8601 duration)
            <input type="text" value={window} onChange={(e) => setWindowParam(e.target.value)} />
          </label>
        </>
      }
    >
      <div>
        {funnelSteps.map((s) => (
          <div key={s.step} style={{ marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
              <span>{s.step}</span>
              <span>
                {s.users.toLocaleString()} ({(s.conversion_from_prev * 100).toFixed(1)}%)
              </span>
            </div>
            <div style={{ background: "rgba(120,120,128,0.15)", borderRadius: 4, height: 10 }}>
              <div
                style={{
                  width: `${maxUsers === 0 ? 0 : (s.users / maxUsers) * 100}%`,
                  background: "#2563eb",
                  height: "100%",
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </WidgetFrame>
  );
}

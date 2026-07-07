import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { WidgetFrame } from "../components/WidgetFrame.js";
import { fetchTimeseries } from "../api/endpoints.js";
import type { Bucket } from "../api/types.js";

interface TimeseriesWidgetProps {
  from: string;
  to: string;
  bucket: Bucket;
}

// Direct API call, server-side Redis-cached (60s TTL, keyed on params + the
// events version counter). A client-side staleTime matching that TTL avoids
// re-hitting the network for a widget that just re-rendered with the same
// params, without the dashboard needing its own cache layer.
export function TimeseriesWidget({ from, to, bucket }: TimeseriesWidgetProps): React.ReactElement {
  const [eventType, setEventType] = useState("");

  const query = useQuery({
    queryKey: ["timeseries", from, to, bucket, eventType],
    queryFn: () => fetchTimeseries({ from, to, bucket, eventType: eventType || undefined }),
    staleTime: 60_000,
  });

  const series = query.data?.data.series ?? [];

  return (
    <WidgetFrame
      title="Timeseries"
      isLoading={query.isPending}
      error={query.error}
      latencyMs={query.data?.latencyMs}
      isEmpty={series.length === 0}
      controls={
        <label className="control">
          event_type (optional)
          <input
            type="text"
            placeholder="e.g. purchase"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          />
        </label>
      }
    >
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={series}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="ts" tickFormatter={(ts: string) => ts.slice(5, 16)} fontSize={11} />
          <YAxis fontSize={11} allowDecimals={false} />
          <Tooltip labelFormatter={(label) => String(label)} />
          <Line type="monotone" dataKey="count" stroke="#2563eb" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </WidgetFrame>
  );
}

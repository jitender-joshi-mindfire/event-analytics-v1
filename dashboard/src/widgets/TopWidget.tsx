import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WidgetFrame } from "../components/WidgetFrame.js";
import { fetchTop } from "../api/endpoints.js";
import type { TopMetric } from "../api/types.js";

interface TopWidgetProps {
  from: string;
  to: string;
}

const PAGE_SIZE = 10;

// Direct API call — top isn't server-cached (only timeseries/funnel/retention
// are, per the caching requirement), but it's backed by the
// (event_type, occurred_at) and payload GIN indexes and comes in well under
// 300ms, so a client cache would add complexity for little benefit. Cursor
// pagination means each page is a genuinely different query; "Prev" replays
// an earlier cursor from a client-side stack rather than the API supporting
// backward pagination itself.
export function TopWidget({ from, to }: TopWidgetProps): React.ReactElement {
  const [dimension, setDimension] = useState("page");
  const [groupBy, setGroupBy] = useState("");
  const [metric, setMetric] = useState<TopMetric>("count");
  const [n, setN] = useState(10);
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setCursorStack([undefined]);
    setPageIndex(0);
  }, [from, to, dimension, groupBy, metric, n]);

  const cursor = cursorStack[pageIndex];

  const query = useQuery({
    queryKey: ["top", from, to, dimension, groupBy, metric, n, cursor],
    queryFn: () => fetchTop({ from, to, dimension, groupBy: groupBy || undefined, metric, n, cursor, limit: PAGE_SIZE }),
    staleTime: 30_000,
  });

  const rows = query.data?.data.rows ?? [];
  const nextCursor = query.data?.data.next_cursor ?? null;

  const goNext = (): void => {
    if (!nextCursor) return;
    setCursorStack((prev) => [...prev.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((i) => i + 1);
  };
  const goPrev = (): void => setPageIndex((i) => Math.max(0, i - 1));

  return (
    <WidgetFrame
      title="Top-N"
      isLoading={query.isPending}
      error={query.error}
      latencyMs={query.data?.latencyMs}
      isEmpty={rows.length === 0}
      controls={
        <>
          <label className="control">
            dimension
            <input type="text" value={dimension} onChange={(e) => setDimension(e.target.value)} />
          </label>
          <label className="control">
            group_by (optional)
            <input type="text" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} />
          </label>
          <label className="control">
            metric
            <select value={metric} onChange={(e) => setMetric(e.target.value as TopMetric)}>
              <option value="count">count</option>
              <option value="sum_amount">sum_amount</option>
              <option value="unique_users">unique_users</option>
            </select>
          </label>
          <label className="control">
            n
            <input type="number" min={1} max={100} value={n} onChange={(e) => setN(Number(e.target.value))} />
          </label>
        </>
      }
    >
      <table>
        <thead>
          <tr>
            <th>rank</th>
            {groupBy && <th>group</th>}
            <th>entity</th>
            <th>value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.group ?? ""}:${row.entity}:${row.rank}`}>
              <td>{row.rank}</td>
              {groupBy && <td>{row.group}</td>}
              <td>{row.entity}</td>
              <td>{row.value.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pagination">
        <button type="button" onClick={goPrev} disabled={pageIndex === 0}>
          Prev
        </button>
        <button type="button" onClick={goNext} disabled={!nextCursor}>
          Next
        </button>
      </div>
    </WidgetFrame>
  );
}

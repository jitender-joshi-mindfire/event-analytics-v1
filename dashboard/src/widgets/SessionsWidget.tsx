import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WidgetFrame } from "../components/WidgetFrame.js";
import { fetchSessions } from "../api/endpoints.js";

interface SessionsWidgetProps {
  from: string;
  to: string;
}

const PAGE_SIZE = 10;

// Direct API call, no caching — session boundaries are operational/live data
// and cursor pages aren't meaningfully cacheable across requests the way a
// fixed aggregate is.
export function SessionsWidget({ from, to }: SessionsWidgetProps): React.ReactElement {
  const [gapMinutes, setGapMinutes] = useState(30);
  const [userId, setUserId] = useState("");
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setCursorStack([undefined]);
    setPageIndex(0);
  }, [from, to, gapMinutes, userId]);

  const cursor = cursorStack[pageIndex];

  const query = useQuery({
    queryKey: ["sessions", from, to, gapMinutes, userId, cursor],
    queryFn: () => fetchSessions({ from, to, gapMinutes, userId: userId || undefined, cursor, limit: PAGE_SIZE }),
    staleTime: 30_000,
  });

  const sessions = query.data?.data.sessions ?? [];
  const nextCursor = query.data?.data.next_cursor ?? null;

  const goNext = (): void => {
    if (!nextCursor) return;
    setCursorStack((prev) => [...prev.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((i) => i + 1);
  };
  const goPrev = (): void => setPageIndex((i) => Math.max(0, i - 1));

  return (
    <WidgetFrame
      title="Active sessions"
      isLoading={query.isPending}
      error={query.error}
      latencyMs={query.data?.latencyMs}
      isEmpty={sessions.length === 0}
      controls={
        <>
          <label className="control">
            gap_minutes
            <input
              type="number"
              min={1}
              max={240}
              value={gapMinutes}
              onChange={(e) => setGapMinutes(Number(e.target.value))}
            />
          </label>
          <label className="control">
            user_id (optional)
            <input type="text" value={userId} onChange={(e) => setUserId(e.target.value)} />
          </label>
        </>
      }
    >
      <table>
        <thead>
          <tr>
            <th>user_id</th>
            <th>started_at</th>
            <th>ended_at</th>
            <th>events</th>
            <th>duration (s)</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={`${s.user_id}:${s.started_at}`}>
              <td>{s.user_id}</td>
              <td>{s.started_at}</td>
              <td>{s.ended_at}</td>
              <td>{s.events}</td>
              <td>{s.duration_seconds}</td>
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

import { useState } from "react";
import type { Bucket } from "./api/types.js";
import { toApiDateTime, toInputValue } from "./dateUtils.js";
import { TimeseriesWidget } from "./widgets/TimeseriesWidget.js";
import { FunnelWidget } from "./widgets/FunnelWidget.js";
import { RetentionWidget } from "./widgets/RetentionWidget.js";
import { TopWidget } from "./widgets/TopWidget.js";
import { LatencyWidget } from "./widgets/LatencyWidget.js";
import { SessionsWidget } from "./widgets/SessionsWidget.js";

const DEFAULT_FROM = "2026-02-01T00:00:00Z";
const DEFAULT_TO = "2026-02-08T00:00:00Z";

export function App(): React.ReactElement {
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [bucket, setBucket] = useState<Bucket>("hour");

  return (
    <div className="app">
      <header className="app-header">
        <h1>Event Analytics Dashboard</h1>
        <p>All times UTC. Shared date range drives every widget below; bucket only affects the timeseries chart.</p>
      </header>

      <div className="controls-bar">
        <label className="control">
          from (UTC)
          <input
            type="datetime-local"
            value={toInputValue(from)}
            onChange={(e) => setFrom(toApiDateTime(e.target.value))}
          />
        </label>
        <label className="control">
          to (UTC)
          <input type="datetime-local" value={toInputValue(to)} onChange={(e) => setTo(toApiDateTime(e.target.value))} />
        </label>
        <label className="control">
          bucket
          <select value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)}>
            <option value="hour">hour</option>
            <option value="day">day</option>
            <option value="week">week</option>
          </select>
        </label>
      </div>

      <div className="widget-grid">
        <TimeseriesWidget from={from} to={to} bucket={bucket} />
        <FunnelWidget from={from} to={to} />
        <RetentionWidget from={from} to={to} />
        <TopWidget from={from} to={to} />
        <LatencyWidget from={from} to={to} />
        <SessionsWidget from={from} to={to} />
      </div>
    </div>
  );
}

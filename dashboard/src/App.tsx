import { useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

interface HealthResponse {
  status: "ready" | "degraded";
  checks: { postgres: "up" | "down"; redis: "up" | "down" };
}

export function App(): React.ReactElement {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE_URL}/v1/health`)
      .then((res) => res.json() as Promise<HealthResponse>)
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to reach API");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Event Analytics Dashboard</h1>
      <p>Metrics widgets land here in Phase 4.</p>
      <section>
        <h2>API health</h2>
        {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
        {!error && !health && <p>Checking...</p>}
        {health && (
          <ul>
            <li>status: {health.status}</li>
            <li>postgres: {health.checks.postgres}</li>
            <li>redis: {health.checks.redis}</li>
          </ul>
        )}
      </section>
    </main>
  );
}

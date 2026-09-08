'use strict';

/**
 * observability/metrics.js
 *
 * Lightweight in-memory counters for the metric names identified in
 * ARCHITECTURE_PLAN_STAGE2.md section 12. Deliberately NOT wired to
 * Prometheus (prom-client is listed OPTIONAL LATER) — there is no
 * Prometheus/Grafana stack to scrape yet, so adding that dependency now
 * would be exactly the "technology for technology's sake" the audit
 * brief asks to avoid. The counter names/shape below are what a future
 * `/metrics` endpoint would expose; today they're readable via
 * `getSnapshot()` and periodically logged.
 */

const counters = {
  telemetry_messages_received: 0,
  telemetry_messages_rejected: 0,
  telemetry_duplicates: 0,
  command_success_total: 0,
  command_failure_total: 0,
  irrigation_events_total: 0,
  cors_rejections_total: 0,
};

function increment(name, by = 1) {
  if (!(name in counters)) {
    counters[name] = 0;
  }
  counters[name] += by;
}

function getSnapshot() {
  return { ...counters };
}

function reset() {
  Object.keys(counters).forEach((key) => {
    counters[key] = 0;
  });
}

module.exports = { increment, getSnapshot, reset };

'use strict';

/**
 * ai/external/experiments/experimentLog.js
 *
 * Lightweight, file-based experiment tracking (spec: "avoid
 * introducing heavyweight experiment infrastructure"). Appends one
 * JSON line per experiment to experiments/log.jsonl — no database, no
 * external service. Each record captures exactly what section 27
 * asked for: hypothesis, dataset, features, target, split, model,
 * parameters, metrics, conclusion — enough for someone else to
 * understand and reproduce the run without re-reading code.
 */

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, 'log.jsonl');

function logExperiment(entry) {
  const record = {
    loggedAt: new Date().toISOString(),
    hypothesis: entry.hypothesis,
    datasetId: entry.datasetId,
    features: entry.features,
    target: entry.target,
    split: entry.split,
    model: entry.model,
    parameters: entry.parameters,
    metrics: entry.metrics,
    conclusion: entry.conclusion,
  };
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(record)}\n`);
  return record;
}

function readExperimentLog() {
  if (!fs.existsSync(LOG_PATH)) return [];
  return fs
    .readFileSync(LOG_PATH, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

module.exports = { logExperiment, readExperimentLog, LOG_PATH };

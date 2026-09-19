'use strict';

/**
 * ai/models/modelRegistry.js
 *
 * Lightweight, file-based model versioning (spec section 9 — not a
 * full MLOps platform). Each trained model is one JSON file under
 * ai/models/artifacts/, named <target>.v<N>.json, plus a
 * <target>.latest.json pointer file. No database table, no external
 * registry service — appropriate for this MVP's scale.
 */

const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = path.join(__dirname, 'artifacts');

function ensureDir() {
  if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

function nextVersion(target) {
  ensureDir();
  const prefix = `${target}.v`;
  const existing = fs
    .readdirSync(ARTIFACTS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .map((f) => Number(f.slice(prefix.length, -'.json'.length)))
    .filter((n) => Number.isFinite(n));
  return existing.length ? Math.max(...existing) + 1 : 1;
}

/**
 * Status lifecycle (spec: "never automatically mark a model active
 * merely because training succeeded"): every save starts as
 * 'candidate' — promotion to 'validated' or 'active' only happens
 * through an explicit promoteModel() call, never as a save() default.
 */
const STATUS = Object.freeze({ CANDIDATE: 'candidate', VALIDATED: 'validated', ACTIVE: 'active', RETIRED: 'retired' });
const ALLOWED_TRANSITIONS = {
  candidate: ['validated', 'retired'],
  validated: ['active', 'retired'],
  active: ['retired'],
  retired: [],
};

/**
 * @param {object} artifact
 * @param {string} artifact.target - e.g. 'irrigation_need_next_3h'
 * @param {string} artifact.modelType - e.g. 'logistic_regression'
 * @param {string} artifact.featureVersion
 * @param {string} artifact.dataSource - 'synthetic-dev' | 'real' | 'external' (MUST be honest)
 * @param {string[]} [artifact.datasetIds] - dataset registry id(s) used for training/evaluation
 * @param {string} [artifact.evaluationMethod] - e.g. 'chronological-split', 'cross-dataset'
 * @param {object} artifact.datasetRange - { from, to, sampleCount }
 * @param {object} artifact.metrics - evaluation output
 * @param {object} artifact.baselineMetrics - baseline comparison
 * @param {object} artifact.modelParams - whatever the trainer needs to predict again
 * @param {string} [artifact.status] - always starts 'candidate' unless explicitly overridden by a caller that has already run its own approval step
 */
function saveModel(artifact) {
  ensureDir();
  const version = nextVersion(artifact.target);
  const record = {
    modelName: `${artifact.target}-${artifact.modelType}`,
    version,
    trainingTimestamp: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    featureVersion: artifact.featureVersion,
    dataSource: artifact.dataSource,
    datasetIds: artifact.datasetIds || (artifact.dataSource ? [artifact.target] : []),
    evaluationMethod: artifact.evaluationMethod || 'chronological-split',
    datasetRange: artifact.datasetRange,
    trainingSampleCount: artifact.datasetRange ? artifact.datasetRange.sampleCount : null,
    metrics: artifact.metrics,
    baselineMetrics: artifact.baselineMetrics,
    modelType: artifact.modelType,
    target: artifact.target,
    hyperparameters: artifact.modelParams
      ? { epochs: artifact.modelParams.epochs, learningRate: artifact.modelParams.learningRate, l2: artifact.modelParams.l2 }
      : null,
    status: artifact.status || STATUS.CANDIDATE,
    modelParams: artifact.modelParams,
  };

  const fileName = `${artifact.target}.v${version}.json`;
  const filePath = path.join(ARTIFACTS_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2));

  const latestPath = path.join(ARTIFACTS_DIR, `${artifact.target}.latest.json`);
  fs.writeFileSync(latestPath, JSON.stringify(record, null, 2));

  return record;
}

function loadLatestModel(target) {
  const latestPath = path.join(ARTIFACTS_DIR, `${target}.latest.json`);
  if (!fs.existsSync(latestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function listModelVersions(target) {
  ensureDir();
  const prefix = `${target}.v`;
  return fs
    .readdirSync(ARTIFACTS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .map((f) => {
      const record = JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, f), 'utf8'));
      return { version: record.version, trainingTimestamp: record.trainingTimestamp, status: record.status, dataSource: record.dataSource };
    })
    .sort((a, b) => a.version - b.version);
}


/**
 * Explicit promotion — the ONLY way a model's status can advance.
 * Enforces the lifecycle (candidate -> validated -> active, any ->
 * retired) and refuses an invalid jump (e.g. candidate -> active
 * directly) rather than silently allowing it.
 */
function promoteModel(target, version, newStatus) {
  ensureDir();
  const fileName = `${target}.v${version}.json`;
  const filePath = path.join(ARTIFACTS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`No such model: ${target} v${version}`);
  }
  const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const allowed = ALLOWED_TRANSITIONS[record.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid status transition for ${target} v${version}: "${record.status}" -> "${newStatus}". Allowed from "${record.status}": ${allowed.join(', ') || '(none — terminal state)'}.`);
  }
  record.status = newStatus;
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2));

  const latestPath = path.join(ARTIFACTS_DIR, `${target}.latest.json`);
  if (fs.existsSync(latestPath)) {
    const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    if (latest.version === record.version) {
      fs.writeFileSync(latestPath, JSON.stringify(record, null, 2));
    }
  }
  return record;
}

module.exports = { saveModel, loadLatestModel, listModelVersions, promoteModel, STATUS, ARTIFACTS_DIR };

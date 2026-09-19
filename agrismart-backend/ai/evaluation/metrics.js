'use strict';

/**
 * ai/evaluation/metrics.js
 *
 * Classification metrics only meaningful for this problem type (spec
 * section 7 — "do not report meaningless metrics", so no MAPE/R² here,
 * this is a binary classifier). Every function takes plain arrays of
 * 0/1 (or probabilities for AUC) — no framework dependency.
 */

function confusionMatrix(yTrue, yPred) {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  for (let i = 0; i < yTrue.length; i += 1) {
    if (yTrue[i] === 1 && yPred[i] === 1) tp += 1;
    else if (yTrue[i] === 0 && yPred[i] === 0) tn += 1;
    else if (yTrue[i] === 0 && yPred[i] === 1) fp += 1;
    else if (yTrue[i] === 1 && yPred[i] === 0) fn += 1;
  }
  return { tp, tn, fp, fn };
}

function precisionRecallF1(yTrue, yPred) {
  const { tp, fp, fn } = confusionMatrix(yTrue, yPred);
  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  const f1 = precision === null || recall === null || precision + recall === 0
    ? null
    : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

function accuracy(yTrue, yPred) {
  if (yTrue.length === 0) return null;
  let correct = 0;
  for (let i = 0; i < yTrue.length; i += 1) if (yTrue[i] === yPred[i]) correct += 1;
  return correct / yTrue.length;
}

/**
 * ROC-AUC via the Mann-Whitney U statistic (rank-based) — exact for
 * small-to-medium datasets, no external library needed. Returns null
 * when there is only one class present (AUC is undefined then, not 0
 * or 1 — never fabricate a value).
 */
function rocAuc(yTrue, yScore) {
  const positives = [];
  const negatives = [];
  for (let i = 0; i < yTrue.length; i += 1) {
    (yTrue[i] === 1 ? positives : negatives).push(yScore[i]);
  }
  if (positives.length === 0 || negatives.length === 0) return null;

  const ranked = yScore
    .map((score, i) => ({ score, label: yTrue[i] }))
    .sort((a, b) => a.score - b.score);

  let rank = 1;
  let i = 0;
  let sumRanksPositive = 0;
  while (i < ranked.length) {
    let j = i;
    while (j + 1 < ranked.length && ranked[j + 1].score === ranked[i].score) j += 1;
    const avgRank = (rank + (rank + (j - i))) / 2;
    for (let k = i; k <= j; k += 1) {
      if (ranked[k].label === 1) sumRanksPositive += avgRank;
    }
    rank += j - i + 1;
    i = j + 1;
  }

  const nPos = positives.length;
  const nNeg = negatives.length;
  const auc = (sumRanksPositive - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
  return Math.round(auc * 10000) / 10000;
}

function evaluateBinaryClassifier(yTrue, yPred, yScore) {
  return {
    n: yTrue.length,
    confusionMatrix: confusionMatrix(yTrue, yPred),
    accuracy: accuracy(yTrue, yPred),
    ...precisionRecallF1(yTrue, yPred),
    rocAuc: yScore ? rocAuc(yTrue, yScore) : null,
    averagePrecision: yScore ? averagePrecision(yTrue, yScore) : null,
  };
}

/**
 * Average precision (area under the precision-recall curve, computed
 * exactly via the step-function/rank method — no external library).
 * More informative than ROC-AUC on a rare-event/imbalanced problem
 * (spec: "PR-AUC where appropriate" — appropriate here because a
 * positive class under ~5% of examples can still look deceptively
 * good on ROC-AUC alone). Returns null when there are no positives.
 */
function averagePrecision(yTrue, yScore) {
  const n = yTrue.length;
  if (n === 0) return null;
  const totalPositives = yTrue.reduce((a, b) => a + b, 0);
  if (totalPositives === 0) return null;

  const ranked = yScore
    .map((score, i) => ({ score, label: yTrue[i] }))
    .sort((a, b) => b.score - a.score); // descending by score

  let tp = 0;
  let fp = 0;
  let sumPrecisionAtRelevant = 0;
  for (const { label } of ranked) {
    if (label === 1) {
      tp += 1;
      sumPrecisionAtRelevant += tp / (tp + fp);
    } else {
      fp += 1;
    }
  }
  return Math.round((sumPrecisionAtRelevant / totalPositives) * 10000) / 10000;
}

module.exports = { confusionMatrix, precisionRecallF1, accuracy, rocAuc, averagePrecision, evaluateBinaryClassifier };

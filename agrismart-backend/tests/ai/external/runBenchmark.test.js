'use strict';

const { runBenchmarkForDataset } = require('../../../ai/external/benchmark/runBenchmark');

describe('ai/external/benchmark/runBenchmark (honesty gating)', () => {
  test('a tiny fixture dataset reports INSUFFICIENT_DATA rather than a fabricated benchmark result', () => {
    const result = runBenchmarkForDataset('scan-network-fixture');
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.resultsAreTransferable).toBe(false);
  });

  test('a dataset with enough examples (synthetic-dev) runs to completion but is still marked non-transferable, because provenance.ingested is false', () => {
    const result = runBenchmarkForDataset('agrismart-synthetic-dev');
    expect(result.status).toBe('COMPLETED');
    expect(result.resultsAreTransferable).toBe(false);
    expect(result.transferabilityNote).toMatch(/ingested=false/);
    expect(result.metrics.model).toBeDefined();
  });

  test('throws a clear error for an unknown dataset id rather than silently returning empty results', () => {
    expect(() => runBenchmarkForDataset('does-not-exist')).toThrow(/Unknown dataset id/);
  });
});

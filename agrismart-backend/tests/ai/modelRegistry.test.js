'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('ai/models/modelRegistry', () => {
  let tmpDir;
  let modelRegistry;

  beforeEach(() => {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agrismart-ai-test-'));
    jest.doMock('path', () => {
      const actual = jest.requireActual('path');
      return { ...actual, join: (...args) => (args[args.length - 1] === 'artifacts' ? tmpDir : actual.join(...args)) };
    });
    modelRegistry = require('../../ai/models/modelRegistry');
  });

  afterEach(() => {
    jest.dontMock('path');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('save then load round-trips metadata including dataSource honesty flag', () => {
    const record = modelRegistry.saveModel({
      target: 'irrigation_need_next_3h',
      modelType: 'logistic_regression',
      featureVersion: 'v1',
      dataSource: 'synthetic-dev',
      datasetRange: { from: new Date(), to: new Date(), sampleCount: 10 },
      metrics: { f1: 0.5 },
      baselineMetrics: {},
      modelParams: { weights: [1], bias: 0, imputationMeans: [0], standardizeMean: [0], standardizeStd: [1] },
    });
    expect(record.version).toBe(1);
    expect(record.status).toBe('candidate'); // lifecycle updated: every save starts 'candidate', promoted only via promoteModel()

    const loaded = modelRegistry.loadLatestModel('irrigation_need_next_3h');
    expect(loaded.dataSource).toBe('synthetic-dev');
    expect(loaded.version).toBe(1);
  });

  test('version increments on subsequent saves for the same target', () => {
    const save = () =>
      modelRegistry.saveModel({
        target: 't',
        modelType: 'logistic_regression',
        featureVersion: 'v1',
        dataSource: 'synthetic-dev',
        datasetRange: { from: new Date(), to: new Date(), sampleCount: 1 },
        metrics: {},
        baselineMetrics: {},
        modelParams: {},
      });
    save();
    const second = save();
    expect(second.version).toBe(2);
    expect(modelRegistry.listModelVersions('t').length).toBe(2);
  });


  test('promoteModel enforces the candidate -> validated -> active -> retired lifecycle', () => {
    const record = modelRegistry.saveModel({
      target: 'lifecycle-test',
      modelType: 'logistic_regression',
      featureVersion: 'v1',
      dataSource: 'real',
      datasetRange: { from: new Date(), to: new Date(), sampleCount: 100 },
      metrics: {},
      baselineMetrics: {},
      modelParams: {},
    });
    expect(record.status).toBe('candidate');

    const validated = modelRegistry.promoteModel('lifecycle-test', record.version, 'validated');
    expect(validated.status).toBe('validated');

    const active = modelRegistry.promoteModel('lifecycle-test', record.version, 'active');
    expect(active.status).toBe('active');

    expect(() => modelRegistry.promoteModel('lifecycle-test', record.version, 'validated')).toThrow(/Invalid status transition/);

    const retired = modelRegistry.promoteModel('lifecycle-test', record.version, 'retired');
    expect(retired.status).toBe('retired');
  });

  test('promoteModel refuses skipping candidate straight to active', () => {
    const record = modelRegistry.saveModel({
      target: 'lifecycle-skip-test',
      modelType: 'logistic_regression',
      featureVersion: 'v1',
      dataSource: 'real',
      datasetRange: { from: new Date(), to: new Date(), sampleCount: 100 },
      metrics: {},
      baselineMetrics: {},
      modelParams: {},
    });
    expect(() => modelRegistry.promoteModel('lifecycle-skip-test', record.version, 'active')).toThrow(/Invalid status transition/);
  });

  test('loadLatestModel returns null for an unknown target rather than throwing', () => {
    expect(modelRegistry.loadLatestModel('nonexistent-target')).toBeNull();
  });
});

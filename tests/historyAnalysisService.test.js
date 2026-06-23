import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import HistoryAnalysisService from '../src/HistoryAnalysisService.js';

function makeTx(categoryId, categoryName) {
    return {
        attributes: {
            transactions: [{
                category_id: categoryId,
                category_name: categoryName,
            }]
        }
    };
}

function makeUncategorizedTx() {
    return {
        attributes: {
            transactions: [{
                category_id: null,
                category_name: null,
            }]
        }
    };
}

test('hist-1-dominance-clear-winner: >80% threshold returns dominant category with confidence', async (t) => {
    const svc = new HistoryAnalysisService();
    // 9 Groceries + 1 Restaurants = 10 tx, Groceries = 90% > 80%
    const transactions = [
        ...Array(9).fill(null).map(() => makeTx('1', 'Groceries')),
        makeTx('2', 'Restaurants'),
    ];

    const result = svc.analyzeAccountHistory(transactions);

    assert.strictEqual(result.dominantCategory, 'Groceries');
    assert.strictEqual(result.dominance, 0.9);
    assert.strictEqual(result.confidence, 0.9);
    assert.strictEqual(result.categorizedCount, 10);
    assert.strictEqual(result.insufficientData, undefined);
    assert.strictEqual(result.belowThreshold, undefined);
    assert.deepStrictEqual(result.categoryCounts, { Groceries: 9, Restaurants: 1 });
});

test('hist-2-below-threshold: 60% dominance returns belowThreshold flag', async (t) => {
    const svc = new HistoryAnalysisService();
    // 6 Groceries + 4 Restaurants = 10 tx, Groceries = 60% < 80%
    const transactions = [
        ...Array(6).fill(null).map(() => makeTx('1', 'Groceries')),
        ...Array(4).fill(null).map(() => makeTx('2', 'Restaurants')),
    ];

    const result = svc.analyzeAccountHistory(transactions);

    assert.strictEqual(result.dominantCategory, 'Groceries');
    assert.strictEqual(result.dominance, 0.6);
    assert.strictEqual(result.categorizedCount, 10);
    assert.strictEqual(result.belowThreshold, true);
    assert.strictEqual(result.confidence, undefined);
});

test('hist-3-insufficient-data: < 10 transactions returns insufficientData flag', async (t) => {
    const svc = new HistoryAnalysisService();
    // Only 5 categorized transactions (< 10 minimum)
    const transactions = Array(5).fill(null).map(() => makeTx('1', 'Groceries'));

    const result = svc.analyzeAccountHistory(transactions);

    assert.strictEqual(result.dominantCategory, null);
    assert.strictEqual(result.dominance, 0);
    assert.strictEqual(result.categorizedCount, 5);
    assert.strictEqual(result.insufficientData, true);
});

test('hist-4-empty-list: empty transaction list returns insufficientData', async (t) => {
    const svc = new HistoryAnalysisService();

    const result = svc.analyzeAccountHistory([]);

    assert.strictEqual(result.dominantCategory, null);
    assert.strictEqual(result.dominance, 0);
    assert.strictEqual(result.categorizedCount, 0);
    assert.strictEqual(result.insufficientData, true);
});

test('hist-5-configurable-threshold: data/dominance-config.json overrides defaults', async (t) => {
    // Import resetDataDir to clear cached state
    const { resetDataDir } = await import('../src/storage.js');
    
    // Create a temp data dir with custom config
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hist-test-'));
    const origDataDir = process.env.DATA_DIR;
    
    // Reset storage state and set new DATA_DIR
    resetDataDir();
    process.env.DATA_DIR = tmpDir;

    // Write config with lower threshold (0.50) and lower minTx (5)
    await fs.writeFile(
        path.join(tmpDir, 'dominance-config.json'),
        JSON.stringify({ dominanceThreshold: 0.50, minTransactionCount: 5 })
    );

    const svc = new HistoryAnalysisService();

    // Wait for async config load
    await new Promise(resolve => setTimeout(resolve, 100));

    assert.strictEqual(svc.getThreshold(), 0.50);
    assert.strictEqual(svc.getMinTransactionCount(), 5);

    // 3 Groceries + 2 Restaurants = 5 tx, Groceries = 60% > 50% threshold
    const transactions = [
        ...Array(3).fill(null).map(() => makeTx('1', 'Groceries')),
        ...Array(2).fill(null).map(() => makeTx('2', 'Restaurants')),
    ];

    const result = svc.analyzeAccountHistory(transactions);

    assert.strictEqual(result.dominantCategory, 'Groceries');
    assert.strictEqual(result.dominance, 0.6);
    assert.strictEqual(result.confidence, 0.6);

    // Cleanup
    process.env.DATA_DIR = origDataDir;
    resetDataDir();
    await fs.rm(tmpDir, { recursive: true, force: true });
});

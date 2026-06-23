import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import PendingReviewService from '../src/PendingReviewService.js';
import { resetDataDir } from '../src/storage.js';

async function setupTmpDir() {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'queue-test-'));
    resetDataDir();
    process.env.DATA_DIR = tmpDir;
    return tmpDir;
}

async function cleanupTmpDir(tmpDir) {
    resetDataDir();
    process.env.DATA_DIR = '';
    try {
        await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (err) {
        // Ignore cleanup errors
    }
}

test('queue-1-add-review: addReview adds review to queue', async (t) => {
    const tmpDir = await setupTmpDir();
    const svc = new PendingReviewService();
    await new Promise(resolve => setTimeout(resolve, 50));

    const review = {
        id: 'review-1',
        transactionId: 'tx-123',
        status: 'pending',
        recommendation: {
            preferredCategory: 'Groceries',
            historyConfidence: 0.9,
            aiCategory: 'Restaurants',
            aiConfidence: 0.6,
        }
    };

    const result = await svc.addReview(review);

    assert.strictEqual(result.id, 'review-1');
    assert.strictEqual(result.transactionId, 'tx-123');
    assert.strictEqual(result.status, 'pending');

    const pending = svc.getPendingReviews();
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].id, 'review-1');

    await cleanupTmpDir(tmpDir);
});

test('queue-2-get-pending-reviews: getPendingReviews returns only pending items', async (t) => {
    const tmpDir = await setupTmpDir();
    const svc = new PendingReviewService();
    await new Promise(resolve => setTimeout(resolve, 50));

    await svc.addReview({
        id: 'review-1',
        transactionId: 'tx-1',
        status: 'pending',
        recommendation: { preferredCategory: 'Groceries' }
    });

    await svc.addReview({
        id: 'review-2',
        transactionId: 'tx-2',
        status: 'pending',
        recommendation: { preferredCategory: 'Restaurants' }
    });

    const pending = svc.getPendingReviews();
    assert.strictEqual(pending.length, 2);
    // unshift prepends, so review-2 is first (most recent)
    assert.strictEqual(pending[0].id, 'review-2');
    assert.strictEqual(pending[1].id, 'review-1');

    await cleanupTmpDir(tmpDir);
});

test('queue-3-accept-review: acceptReview marks as accepted and applies category', async (t) => {
    const tmpDir = await setupTmpDir();
    const svc = new PendingReviewService();
    await new Promise(resolve => setTimeout(resolve, 50));

    await svc.addReview({
        id: 'review-1',
        transactionId: 'tx-1',
        status: 'pending',
        recommendation: { preferredCategory: 'Groceries' }
    });

    const accepted = await svc.acceptReview('review-1', 'Groceries');

    assert.strictEqual(accepted.status, 'accepted');
    assert.strictEqual(accepted.resolvedChoice, 'Groceries');
    assert.strictEqual(accepted.resolvedBy, 'operator');
    assert.ok(accepted.resolvedAt);

    const pending = svc.getPendingReviews();
    assert.strictEqual(pending.length, 0);

    const all = svc.getAllReviews();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].status, 'accepted');

    await cleanupTmpDir(tmpDir);
});

test('queue-4-reject-review: rejectReview marks as rejected and removes from pending', async (t) => {
    const tmpDir = await setupTmpDir();
    const svc = new PendingReviewService();
    await new Promise(resolve => setTimeout(resolve, 50));

    await svc.addReview({
        id: 'review-1',
        transactionId: 'tx-1',
        status: 'pending',
        recommendation: { preferredCategory: 'Groceries' }
    });

    const rejected = await svc.rejectReview('review-1');

    assert.strictEqual(rejected.status, 'rejected');
    assert.strictEqual(rejected.resolvedChoice, null);
    assert.strictEqual(rejected.resolvedBy, 'operator');
    assert.ok(rejected.resolvedAt);

    const pending = svc.getPendingReviews();
    assert.strictEqual(pending.length, 0);

    const all = svc.getAllReviews();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].status, 'rejected');

    await cleanupTmpDir(tmpDir);
});

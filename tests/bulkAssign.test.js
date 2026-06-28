import { test } from 'node:test';
import assert from 'node:assert/strict';
import AccountCategoryMappingService from '../src/AccountCategoryMappingService.js';
import { dataFile } from '../src/storage.js';
import fs from 'fs/promises';

const mappingsPath = dataFile('account-category-mappings.json');

/**
 * Create a fresh service for each test, seeded with the given data (or empty).
 * Must await `loadMappings()` because the constructor fires it async without awaiting.
 */
async function makeService(seed = []) {
  await fs.writeFile(mappingsPath, JSON.stringify(seed));
  const svc = new AccountCategoryMappingService();
  await svc.loadMappings(); // re-ensure in-memory state reflects seed
  return svc;
}

async function readMappings() {
  try {
    return JSON.parse(await fs.readFile(mappingsPath, 'utf8'));
  } catch {
    return [];
  }
}

// Save original state once at module load and restore it after each test.
const originalMappings = await readMappings();

async function restoreOriginal() {
  await fs.writeFile(mappingsPath, JSON.stringify(originalMappings));
}

// Test 1: Happy path - create, update, skip in a single bulk operation
test('bulkAssign-happy: creates new mappings, updates existing, skips same category (single save)', async () => {
  const service = await makeService([
    {
      id: 'existing-100',
      accountId: '100',
      accountName: 'Old Account 100',
      accountType: 'expense',
      targetCategory: 'Groceries',
      enabled: true,
      created: '2024-01-01T00:00:00.000Z'
    }
  ]);

  const items = [
    { accountId: '100', accountName: 'New Account 100', targetCategory: 'Entertainment' }, // update
    { accountId: '200', accountName: 'Account 200', targetCategory: 'Dining' },              // create
    { accountId: '300', accountName: 'Account 300', targetCategory: 'Travel', accountType: 'expense' } // create
  ];

  let saveCount = 0;
  const originalSave = service.saveMappings.bind(service);
  service.saveMappings = async function () {
    saveCount++;
    return originalSave();
  };

  const result = await service.bulkAssign(items);

  assert.strictEqual(result.created.length, 2, 'should create 2 new mappings');
  assert.strictEqual(result.updated.length, 1, 'should update 1 existing mapping');
  assert.strictEqual(result.skipped.length, 0, 'nothing skipped');
  assert.strictEqual(result.errors.length, 0, 'no errors');
  assert.strictEqual(saveCount, 1, 'saveMappings called exactly once (DEC-0023 single coalesced save)');

  const all = service.getAllMappings();
  const updated = all.find(m => m.accountId === '100');
  assert.strictEqual(updated.targetCategory, 'Entertainment', 'category updated');
  assert.strictEqual(updated.accountName, 'Old Account 100', 'accountName preserved (not re-named)');
  assert.ok(updated.created, 'preserved created timestamp');
  assert.ok(updated.updated, 'set updated timestamp');

  await restoreOriginal();
});

// Test 2: Duplicate-skip - idempotency when same category already set
test('bulkAssign-duplicate-skip: skips items where category already matches (idempotent)', async () => {
  const service = await makeService([
    {
      id: 'existing-1',
      accountId: '100',
      accountName: 'Account 100',
      accountType: 'expense',
      targetCategory: 'Groceries',
      enabled: true,
      created: '2024-01-01T00:00:00.000Z'
    }
  ]);

  const items = [
    { accountId: '100', accountName: 'Account 100', targetCategory: 'Groceries' }, // skip (same)
    { accountId: '200', accountName: 'Account 200', targetCategory: 'Dining' }      // create
  ];

  const result = await service.bulkAssign(items);

  assert.strictEqual(result.created.length, 1, 'created 1 new');
  assert.strictEqual(result.updated.length, 0, 'updated 0');
  assert.strictEqual(result.skipped.length, 1, 'skipped 1 (same category)');
  assert.strictEqual(result.skipped[0].accountId, '100', 'skipped account 100');

  await restoreOriginal();
});

// Test 3: Upsert semantics - update when category differs
test('bulkAssign-upsert: updates mapping when category differs, creates when account missing', async () => {
  const service = await makeService([
    {
      id: 'existing-1',
      accountId: '100',
      accountName: 'Account 100',
      accountType: 'expense',
      targetCategory: 'Groceries',
      enabled: true,
      created: '2024-01-01T00:00:00.000Z'
    }
  ]);

  const items = [
    { accountId: '100', accountName: 'Account 100 Updated', targetCategory: 'Travel' } // upsert: different category
  ];

  const result = await service.bulkAssign(items);

  assert.strictEqual(result.updated.length, 1, 'updated 1');
  assert.strictEqual(result.created.length, 0, 'created 0');
  assert.strictEqual(result.skipped.length, 0, 'skipped 0');

  const updated = service.getAllMappings().find(m => m.accountId === '100');
  assert.strictEqual(updated.targetCategory, 'Travel', 'targetCategory changed');
  assert.strictEqual(updated.accountName, 'Account 100', 'accountName preserved (not re-named)');

  await restoreOriginal();
});

// Test 4: Unknown category behavior - per DEC-0023 no validation against Firefly categories
test('bulkAssign-unknown-category: accepts any category string (no Firefly validation per DEC-0023)', async () => {
  const service = await makeService([]);

  const items = [
    { accountId: '1', accountName: 'Account 1', targetCategory: 'MONEY-PIT-OF-DOOM' },
    { accountId: '2', accountName: 'Account 2', targetCategory: 'Random Category XYZ' },
    { accountId: '3', accountName: 'Account 3', targetCategory: 'not-a-real-category-99' }
  ];

  const result = await service.bulkAssign(items);

  assert.strictEqual(result.created.length, 3, 'all 3 created despite unknown categories');
  assert.strictEqual(result.errors.length, 0, 'no errors');

  const all = service.getAllMappings();
  assert.strictEqual(all.length, 3, 'persisted 3');
  assert.ok(all.find(m => m.targetCategory === 'MONEY-PIT-OF-DOOM'));
  assert.ok(all.find(m => m.targetCategory === 'Random Category XYZ'));

  await restoreOriginal();
});

// Test 5: Partial failure - validation errors mixed with successes
test('bulkAssign-partial-failure: skips invalid items, processes valid ones, still saves', async () => {
  const service = await makeService([]);

  let saveCount = 0;
  const originalSave = service.saveMappings.bind(service);
  service.saveMappings = async function () {
    saveCount++;
    return originalSave();
  };

  const items = [
    { accountId: '1', accountName: 'Good One', targetCategory: 'Groceries' },
    { accountId: '', accountName: 'Missing ID', targetCategory: 'Dining' },
    { accountId: '2', accountName: 'Good Two', targetCategory: 'Travel' },
    { accountId: '3', accountName: '', targetCategory: 'Entertainment' },
    { accountId: '4', accountName: 'Valid', targetCategory: '' }
  ];

  const result = await service.bulkAssign(items);

  assert.strictEqual(result.created.length, 2, 'created 2 valid');
  assert.strictEqual(result.errors.length, 3, '3 validation errors');
  assert.strictEqual(saveCount, 1, 'still saves once despite errors (DEC-0023)');

  const all = service.getAllMappings();
  assert.strictEqual(all.length, 2, 'only 2 mappings persisted');
  assert.ok(all.find(m => m.accountId === '1'));
  assert.ok(all.find(m => m.accountId === '2'));

  await restoreOriginal();
});

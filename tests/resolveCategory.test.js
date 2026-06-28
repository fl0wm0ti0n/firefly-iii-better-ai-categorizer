import { test } from 'node:test';
import assert from 'node:assert/strict';
import App from '../src/App.js';
import { makeCategoriesMap } from './fixtures/categories.js';
import { makeWithdrawalTx } from './fixtures/transactions.js';
import {
    makeAccountMappingStub,
    makeAutoCatStub,
    makePassthroughWordMapping,
    makeNoHintCategoryMapping,
    makeCategoryMappingStub,
} from './fixtures/stubs.js';

function assertCategory(caseId, result, expectedCategory) {
    assert.strictEqual(
        result.category,
        expectedCategory,
        `${caseId}: expected category "${expectedCategory}", got "${result.category}"`
    );
}

test('case-1-account-wins', async (t) => {
    const caseId = 'case-1-account-wins';
    const categories = makeCategoriesMap();
    const tx = makeWithdrawalTx();
    const classify = t.mock.fn(async () => ({
        category: 'Restaurants',
        prompt: 'p',
        response: 'r',
    }));
    const app = App.createForTest({
        accountCategoryMappingService: makeAccountMappingStub({ category: 'Groceries' }),
        autoCategorizationService: makeAutoCatStub({ category: 'Travel & Foreign' }),
        openAi: { classify },
        wordMapping: makePassthroughWordMapping(),
        categoryMappingService: makeNoHintCategoryMapping(),
    });

    const result = await app.resolveCategoryForTest(tx, categories);

    assertCategory(caseId, result, 'Groceries');
    assert.strictEqual(
        result.autoRule,
        'account_category_mapping',
        `${caseId}: expected autoRule "account_category_mapping", got "${result.autoRule}"`
    );
});

test('case-2-auto-cat-wins', async (t) => {
    const caseId = 'case-2-auto-cat-wins';
    const categories = makeCategoriesMap();
    const tx = makeWithdrawalTx({ foreignAmount: 10 });
    const classify = t.mock.fn(async () => ({
        category: 'Restaurants',
        prompt: 'p',
        response: 'r',
    }));
    const app = App.createForTest({
        accountCategoryMappingService: makeAccountMappingStub({ category: null }),
        autoCategorizationService: makeAutoCatStub({ category: 'Travel & Foreign' }),
        openAi: { classify },
        wordMapping: makePassthroughWordMapping(),
        categoryMappingService: makeNoHintCategoryMapping(),
    });

    const result = await app.resolveCategoryForTest(tx, categories);

    assertCategory(caseId, result, 'Travel & Foreign');
    assert.strictEqual(
        classify.mock.callCount(),
        0,
        `${caseId}: expected classify not to be called, callCount=${classify.mock.callCount()}`
    );
});

test('case-3-ai-wins', async (t) => {
    const caseId = 'case-3-ai-wins';
    const categories = makeCategoriesMap();
    const tx = makeWithdrawalTx({
        description: 'REWE SAGT DANKE',
        destinationName: 'REWE',
    });
    const classify = t.mock.fn(async () => ({
        category: 'Restaurants',
        prompt: 'p',
        response: 'r',
    }));
    const app = App.createForTest({
        accountCategoryMappingService: makeAccountMappingStub({ category: null }),
        autoCategorizationService: makeAutoCatStub({ category: null }),
        openAi: { classify },
        wordMapping: makePassthroughWordMapping(),
        categoryMappingService: makeNoHintCategoryMapping(),
    });

    const result = await app.resolveCategoryForTest(tx, categories);

    assertCategory(caseId, result, 'Restaurants');
    assert.strictEqual(
        classify.mock.callCount(),
        1,
        `${caseId}: expected classify called once, callCount=${classify.mock.callCount()}`
    );
    const [categoryNames, destinationName, description, transactionType] = classify.mock.calls[0].arguments;
    assert.ok(Array.isArray(categoryNames), `${caseId}: expected categoryNames array`);
    assert.strictEqual(destinationName, 'REWE', `${caseId}: expected destination "REWE", got "${destinationName}"`);
    assert.strictEqual(
        description,
        'REWE SAGT DANKE',
        `${caseId}: expected description "REWE SAGT DANKE", got "${description}"`
    );
    assert.strictEqual(transactionType, 'withdrawal', `${caseId}: expected type "withdrawal", got "${transactionType}"`);
});

test('case-4-account-beats-ai', async (t) => {
    const caseId = 'case-4-account-beats-ai';
    const categories = makeCategoriesMap();
    const tx = makeWithdrawalTx();
    const classify = t.mock.fn(async () => ({
        category: 'Restaurants',
        prompt: 'p',
        response: 'r',
    }));
    const app = App.createForTest({
        accountCategoryMappingService: makeAccountMappingStub({ category: 'Groceries' }),
        autoCategorizationService: makeAutoCatStub({ category: null }),
        openAi: { classify },
        wordMapping: makePassthroughWordMapping(),
        categoryMappingService: makeNoHintCategoryMapping(),
    });

    const result = await app.resolveCategoryForTest(tx, categories);

    assertCategory(caseId, result, 'Groceries');
    assert.strictEqual(
        classify.mock.callCount(),
        0,
        `${caseId}: expected classify not to be called, callCount=${classify.mock.callCount()}`
    );
});

test('case-5-direct-assign-match', async (t) => {
    const caseId = 'case-5-direct-assign-match';
    const categories = makeCategoriesMap();
    const tx = makeWithdrawalTx({
        description: 'INTERSPAR 2361 K4',
        destinationName: 'INTERSPAR',
    });
    const classify = t.mock.fn(async () => ({
        category: 'Restaurants',
        prompt: 'p',
        response: 'r',
    }));
    const app = App.createForTest({
        accountCategoryMappingService: makeAccountMappingStub({ category: null }),
        autoCategorizationService: makeAutoCatStub({ category: null }),
        openAi: { classify },
        wordMapping: makePassthroughWordMapping(),
        categoryMappingService: makeCategoryMappingStub({
            directAssignment: {
                assigned: true,
                category: 'Groceries',
                mappingName: 'Supermarkets',
                matchedKeyword: 'interspar',
                reason: 'Direct-assign from mapping "Supermarkets" via keyword "interspar" → Groceries',
            },
            aiHint: null,
        }),
    });

    const result = await app.resolveCategoryForTest(tx, categories);

    assertCategory(caseId, result, 'Groceries');
    assert.strictEqual(
        result.autoRule,
        'category_mapping_direct',
        `${caseId}: expected autoRule "category_mapping_direct", got "${result.autoRule}"`
    );
    assert.strictEqual(
        classify.mock.callCount(),
        0,
        `${caseId}: expected OpenAI not to be called, callCount=${classify.mock.callCount()}`
    );
});

test('case-6-direct-assign-miss', async (t) => {
    const caseId = 'case-6-direct-assign-miss';
    const categories = makeCategoriesMap();
    const tx = makeWithdrawalTx({
        description: 'RANDOM STORE',
        destinationName: 'RANDOM',
    });
    const classify = t.mock.fn(async () => ({
        category: 'Restaurants',
        prompt: 'p',
        response: 'r',
    }));
    const app = App.createForTest({
        accountCategoryMappingService: makeAccountMappingStub({ category: null }),
        autoCategorizationService: makeAutoCatStub({ category: null }),
        openAi: { classify },
        wordMapping: makePassthroughWordMapping(),
        categoryMappingService: makeCategoryMappingStub({
            directAssignment: { assigned: false },
            aiHint: null,
        }),
    });

    const result = await app.resolveCategoryForTest(tx, categories);

    assertCategory(caseId, result, 'Restaurants');
    assert.notStrictEqual(
        result.autoRule,
        'category_mapping_direct',
        `${caseId}: expected autoRule NOT to be "category_mapping_direct", got "${result.autoRule}"`
    );
    assert.strictEqual(
        classify.mock.callCount(),
        1,
        `${caseId}: expected classify called once, callCount=${classify.mock.callCount()}`
    );
});

test('case-7-mixed', async (t) => {
    const caseId = 'case-7-mixed';
    const categories = makeCategoriesMap();

    const classify = t.mock.fn(async () => ({
        category: 'Restaurants',
        prompt: 'p',
        response: 'r',
    }));

    // First transaction: matches direct-assign mapping
    const directAssignApp = App.createForTest({
        accountCategoryMappingService: makeAccountMappingStub({ category: null }),
        autoCategorizationService: makeAutoCatStub({ category: null }),
        openAi: { classify },
        wordMapping: makePassthroughWordMapping(),
        categoryMappingService: makeCategoryMappingStub({
            directAssignment: {
                assigned: true,
                category: 'Groceries',
                mappingName: 'Supermarkets',
                matchedKeyword: 'rewe',
                reason: 'Direct-assign from mapping "Supermarkets" via keyword "rewe" → Groceries',
            },
            aiHint: null,
        }),
    });

    const txDirect = makeWithdrawalTx({
        description: 'REWE SAGT DANKE',
        destinationName: 'REWE',
    });
    const resultDirect = await directAssignApp.resolveCategoryForTest(txDirect, categories);

    assertCategory(caseId + '-direct', resultDirect, 'Groceries');
    assert.strictEqual(
        resultDirect.autoRule,
        'category_mapping_direct',
        `${caseId}-direct: expected autoRule "category_mapping_direct", got "${resultDirect.autoRule}"`
    );

    // Second transaction: matches AI-hint mapping (not direct-assign)
    const aiHintApp = App.createForTest({
        accountCategoryMappingService: makeAccountMappingStub({ category: null }),
        autoCategorizationService: makeAutoCatStub({ category: null }),
        openAi: { classify },
        wordMapping: makePassthroughWordMapping(),
        categoryMappingService: makeCategoryMappingStub({
            directAssignment: { assigned: false },
            aiHint: {
                descriptionHint: 'billa',
                suggestedCategory: 'Groceries',
                mappingName: 'Grocery Stores',
                matchedKeyword: 'billa',
                reason: 'Keyword hint "billa" from mapping "Grocery Stores" (suggested: Groceries)',
            },
        }),
    });

    const txAiHint = makeWithdrawalTx({
        description: 'BILLA FILIALE 123',
        destinationName: 'BILLA',
    });
    const resultAiHint = await aiHintApp.resolveCategoryForTest(txAiHint, categories);

    // AI-hint path: OpenAI should still be called with the modified description
    assert.strictEqual(
        classify.mock.callCount(),
        1,
        `${caseId}-aihint: expected classify called once, callCount=${classify.mock.callCount()}`
    );
    const [, , description] = classify.mock.calls[0].arguments;
    assert.strictEqual(
        description,
        'billa',
        `${caseId}-aihint: expected modified description "billa", got "${description}"`
    );
});

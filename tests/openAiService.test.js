import { test } from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import OpenAiService from '../src/OpenAiService.js';

test('oai-1-schema-enum: schema includes all categories + UNKNOWN with strict:true', async (t) => {
    let capturedRequest;
    const mockCreate = t.mock.fn(async (request) => {
        capturedRequest = request;
        return {
            choices: [{ message: { content: '{"category":"Groceries"}' } }]
        };
    });

    const svc = OpenAiService.createForTest({
        client: { chat: { completions: { create: mockCreate } } }
    });

    const categories = ['Groceries', 'Restaurants', 'Travel'];
    await svc.classify(categories, 'REWE', 'groceries', 'withdrawal');

    assert.ok(capturedRequest, 'request should be captured');
    assert.strictEqual(capturedRequest.response_format.type, 'json_schema');
    assert.strictEqual(capturedRequest.response_format.json_schema.strict, true);
    const schema = capturedRequest.response_format.json_schema.schema;
    assert.strictEqual(schema.type, 'object');
    assert.ok(Array.isArray(schema.properties.category.enum));
    const expectedEnum = ['Groceries', 'Restaurants', 'Travel', 'UNKNOWN'];
    assert.deepStrictEqual(schema.properties.category.enum, expectedEnum);
    assert.deepStrictEqual(schema.required, ['category', 'confidence']);
    assert.strictEqual(schema.additionalProperties, false);
});

test('oai-2-valid-category: valid category returns { category, prompt, response }', async (t) => {
    const mockCreate = t.mock.fn(async () => ({
        choices: [{ message: { content: '{"category":"Groceries"}' } }]
    }));

    const svc = OpenAiService.createForTest({
        client: { chat: { completions: { create: mockCreate } } }
    });

    const categories = ['Groceries', 'Restaurants'];
    const result = await svc.classify(categories, 'REWE', 'groceries', 'withdrawal');

    assert.strictEqual(result.category, 'Groceries');
    assert.strictEqual(result.response, 'Groceries');
    assert.ok(typeof result.prompt === 'string');
    assert.ok(result.prompt.length > 0);
});

test('oai-3-unknown-null: UNKNOWN response maps to { category: null, response: "UNKNOWN", prompt }', async (t) => {
    const mockCreate = t.mock.fn(async () => ({
        choices: [{ message: { content: '{"category":"UNKNOWN"}' } }]
    }));

    const svc = OpenAiService.createForTest({
        client: { chat: { completions: { create: mockCreate } } }
    });

    const categories = ['Groceries', 'Restaurants'];
    const result = await svc.classify(categories, 'Random Store', 'misc', 'withdrawal');

    assert.strictEqual(result.category, null);
    assert.strictEqual(result.response, 'UNKNOWN');
    assert.ok(typeof result.prompt === 'string');
});

test('oai-4-refusal: refusal maps to { category: null, response: refusal, prompt }', async (t) => {
    const refusalText = 'I cannot categorize this transaction';
    const mockCreate = t.mock.fn(async () => ({
        choices: [{ message: { content: null, refusal: refusalText } }]
    }));

    const svc = OpenAiService.createForTest({
        client: { chat: { completions: { create: mockCreate } } }
    });

    const categories = ['Groceries', 'Restaurants'];
    const result = await svc.classify(categories, 'Store', 'purchase', 'withdrawal');

    assert.strictEqual(result.category, null);
    assert.strictEqual(result.response, refusalText);
    assert.ok(typeof result.prompt === 'string');
});

test('oai-5-429-exception: 429 APIError sets error.code = 429 for retryWithBackoff', async (t) => {
    const apiError = new OpenAI.APIError(
        429,
        { message: 'Rate limit exceeded', type: 'rate_limit_exceeded' },
        'Rate limit exceeded',
        {}
    );

    const mockCreate = t.mock.fn(async () => {
        throw apiError;
    });

    const svc = OpenAiService.createForTest({
        client: { chat: { completions: { create: mockCreate } } }
    });

    const categories = ['Groceries'];
    await assert.rejects(
        async () => svc.classify(categories, 'Store', 'purchase', 'withdrawal'),
        (err) => {
            assert.strictEqual(err.code, 429, `expected error.code === 429, got ${err.code}`);
            return true;
        }
    );
});

export function makeOpenAiStub({ category = 'Restaurants', prompt = 'p', response = 'r' } = {}) {
    return {
        classify: async () => ({ category, prompt, response }),
    };
}

export function makeAccountMappingStub({
    category,
    accountId = '42',
    accountName = 'Checking',
} = {}) {
    return {
        categorizeTransaction: () => category ? {
            category,
            reason: 'test account mapping',
            autoRule: 'account_category_mapping',
            mappingName: 'test-mapping',
            accountName,
            accountId,
        } : null,
    };
}

export function makeAutoCatStub({ category = 'Travel & Foreign' } = {}) {
    return {
        autoCategorize: () => category ? {
            category,
            reason: 'test auto-cat',
            autoRule: 'foreign_flag',
        } : null,
    };
}

export function makePassthroughWordMapping() {
    return { applyMappings: (text) => text };
}

export function makeNoHintCategoryMapping() {
    return { getAiHint: () => null };
}

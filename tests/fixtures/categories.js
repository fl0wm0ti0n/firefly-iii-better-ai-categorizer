export function makeCategoriesMap(overrides = new Map()) {
    const base = new Map([
        ['Groceries', '1'],
        ['Travel & Foreign', '2'],
        ['Restaurants', '3'],
        ['Utilities', '4'],
    ]);
    for (const [k, v] of overrides) base.set(k, v);
    return base;
}

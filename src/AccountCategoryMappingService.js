import fs from 'fs/promises';
import { ensureDataDir, dataFile } from './storage.js';
import { v4 as uuid } from 'uuid';

/**
 * Account → Category mappings.
 *
 * Purpose:
 * - Hard 1:1 rule: every transaction to or from a configured account gets the target category.
 * - Bypasses AI, keyword hints, and auto-categorization when matched.
 *
 * Notes:
 * - Matching prefers account IDs (source_id/destination_id) when available.
 * - Falls back to case-insensitive name matching (source_name/destination_name).
 */
export default class AccountCategoryMappingService {
    #CONFIG_FILE = dataFile('account-category-mappings.json');
    #mappings = [];

    constructor() {
        this.loadMappings().catch(err => {
            // Constructor doesn't wait for loadMappings to complete
            // Error already handled inside loadMappings()
        });
    }

    async loadMappings() {
        try {
            await ensureDataDir();
            const data = await fs.readFile(this.#CONFIG_FILE, 'utf8');
            this.#mappings = JSON.parse(data);
            console.info(`🏷️ Loaded ${this.#mappings.length} account→category mappings`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.info('🏷️ No account→category mappings file found, starting empty');
                this.#mappings = [];
                await this.saveMappings();
            } else {
                console.error('Error loading account→category mappings:', error);
                this.#mappings = [];
            }
        }
    }

    async saveMappings() {
        await ensureDataDir();
        await fs.writeFile(this.#CONFIG_FILE, JSON.stringify(this.#mappings, null, 2));
    }

    getAllMappings() {
        return [...this.#mappings];
    }

    validateMapping(mappingData) {
        const errors = [];
        if (!mappingData) errors.push('Mapping data is required');
        const accountId = mappingData?.accountId;
        const accountName = String(mappingData?.accountName || '').trim();
        const targetCategory = String(mappingData?.targetCategory || '').trim();

        if (!accountId || String(accountId).trim().length === 0) errors.push('Account is required');
        if (!accountName) errors.push('Account name is required');
        if (!targetCategory) errors.push('Target category is required');

        return { isValid: errors.length === 0, errors };
    }

    addMapping(mappingData) {
        const mapping = {
            id: uuid(),
            name: mappingData.name || `${mappingData.accountName} → ${mappingData.targetCategory}`,
            accountId: String(mappingData.accountId),
            accountName: String(mappingData.accountName || ''),
            accountType: String(mappingData.accountType || ''),
            targetCategory: String(mappingData.targetCategory || ''),
            enabled: mappingData.enabled !== false,
            created: new Date().toISOString()
        };
        this.#mappings.push(mapping);
        this.saveMappings();
        console.info(`➕ Added account→category mapping: "${mapping.accountName}" → "${mapping.targetCategory}"`);
        return mapping;
    }

    updateMapping(id, updates) {
        const index = this.#mappings.findIndex(m => m.id === id);
        if (index === -1) throw new Error('Mapping not found');

        const current = this.#mappings[index];
        const next = {
            ...current,
            ...updates,
            accountId: updates.accountId != null ? String(updates.accountId) : current.accountId,
            accountName: updates.accountName != null ? String(updates.accountName) : current.accountName,
            accountType: updates.accountType != null ? String(updates.accountType) : current.accountType,
            targetCategory: updates.targetCategory != null ? String(updates.targetCategory) : current.targetCategory,
            updated: new Date().toISOString()
        };
        if (!next.name) next.name = `${next.accountName} → ${next.targetCategory}`;
        this.#mappings[index] = next;
        this.saveMappings();
        console.info(`✏️ Updated account→category mapping: "${next.name}"`);
        return next;
    }

    removeMapping(id) {
        const index = this.#mappings.findIndex(m => m.id === id);
        if (index === -1) return false;
        const mapping = this.#mappings[index];
        this.#mappings.splice(index, 1);
        this.saveMappings();
        console.info(`🗑️ Removed account→category mapping: "${mapping.name}"`);
        return true;
    }

    toggleMapping(id, enabled) {
        const mapping = this.#mappings.find(m => m.id === id);
        if (!mapping) throw new Error('Mapping not found');
        mapping.enabled = Boolean(enabled);
        mapping.updated = new Date().toISOString();
        this.saveMappings();
        return mapping;
    }

    /**
     * Bulk assign a category to multiple accounts (upsert semantics).
     * For each item: if accountId already mapped with same category → skip;
     * if mapped with different category → update; if not mapped → create.
     * Single coalesced save after all items processed.
     * Field whitelist prevents injection. NO category validation against Firefly.
     *
     * @param {Array<{accountId:string, accountName:string, accountType?:string, targetCategory:string}>} items
     * @returns {{created:string[], updated:string[], skipped:string[], errors:string[]}}
     */
    async bulkAssign(items) {
        const ALLOWED_FIELDS = new Set(['accountId', 'accountName', 'accountType', 'targetCategory']);
        const created = [];
        const updated = [];
        const skipped = [];
        const errors = [];

        if (!Array.isArray(items)) {
            return { created, updated, skipped, errors: ['items must be an array'] };
        }

        for (let i = 0; i < items.length; i++) {
            const raw = items[i] || {};
            try {
                // Apply field whitelist
                const sanitized = {};
                for (const key of Object.keys(raw)) {
                    if (ALLOWED_FIELDS.has(key)) sanitized[key] = raw[key];
                }

                const accountId = String(sanitized.accountId ?? '').trim();
                const accountName = String(sanitized.accountName ?? '').trim();
                const accountType = String(sanitized.accountType ?? '').trim();
                const targetCategory = String(sanitized.targetCategory ?? '').trim();

                if (!accountId) {
                    errors.push(`items[${i}]: accountId is required`);
                    continue;
                }
                if (!accountName) {
                    errors.push(`items[${i}]: accountName is required`);
                    continue;
                }
                if (!targetCategory) {
                    errors.push(`items[${i}]: targetCategory is required`);
                    continue;
                }

                const existingIdx = this.#mappings.findIndex(m => String(m.accountId) === accountId);

                if (existingIdx !== -1) {
                    const existing = this.#mappings[existingIdx];
                    if (existing.targetCategory === targetCategory) {
                        skipped.push({ accountId, existingMappingId: existing.id, reason: 'same category' });
                    } else {
                        const next = {
                            ...existing,
                            targetCategory,
                            name: `${accountName} → ${targetCategory}`,
                            updated: new Date().toISOString()
                        };
                        this.#mappings[existingIdx] = next;
                        updated.push({ accountId, existingMappingId: existing.id, previousCategory: existing.targetCategory });
                    }
                } else {
                    const newMapping = {
                        id: uuid(),
                        name: `${accountName} → ${targetCategory}`,
                        accountId,
                        accountName,
                        accountType,
                        targetCategory,
                        enabled: true,
                        created: new Date().toISOString()
                    };
                    this.#mappings.push(newMapping);
                    created.push({ accountId, newMappingId: newMapping.id });
                }
            } catch (err) {
                errors.push(`items[${i}]: ${err.message}`);
            }
        }

        // Single coalesced save after bulk loop
        if (created.length > 0 || updated.length > 0) {
            try {
                await this.saveMappings();
            } catch (err) {
                errors.push(`save failed: ${err.message}`);
            }
        }

        console.info(`📦 bulkAssign summary: ${created.length} created, ${updated.length} updated, ${skipped.length} skipped, ${errors.length} errors`);
        return { created, updated, skipped, errors };
    }

    /**
     * Match a transaction to an account→category mapping.
     *
     * @param {object} transaction Firefly transaction object (or lookalike with attributes.transactions[0])
     * @returns {object|null} match info
     */
    categorizeTransaction(transaction) {
        const firstTx = transaction?.attributes?.transactions?.[0];
        if (!firstTx) return null;

        const srcId = firstTx.source_id != null ? String(firstTx.source_id) : null;
        const dstId = firstTx.destination_id != null ? String(firstTx.destination_id) : null;
        const srcName = String(firstTx.source_name || '').trim().toLowerCase();
        const dstName = String(firstTx.destination_name || '').trim().toLowerCase();

        for (const mapping of this.#mappings) {
            if (!mapping?.enabled) continue;
            const mId = String(mapping.accountId || '');
            const mName = String(mapping.accountName || '').trim().toLowerCase();
            if (!mId && !mName) continue;

            const matchedById = (srcId && srcId === mId) || (dstId && dstId === mId);
            const matchedByName = (mName && (srcName === mName || dstName === mName));

            if (matchedById || matchedByName) {
                const side = matchedById
                    ? (srcId === mId ? 'source_id' : 'destination_id')
                    : (srcName === mName ? 'source_name' : 'destination_name');
                return {
                    category: mapping.targetCategory,
                    reason: `Matched account "${mapping.accountName}" via ${side}`,
                    autoRule: 'account_category_mapping',
                    mappingName: mapping.name,
                    accountName: mapping.accountName,
                    accountId: mapping.accountId
                };
            }
        }
        return null;
    }
}



import fs from 'fs/promises';
import { ensureDataDir, dataFile } from './storage.js';
import { v4 as uuid } from 'uuid';

export default class CategoryMappingService {
    #CONFIG_FILE = dataFile('category-mappings.json');
    #mappings = [];
    #MAPPING_FIELDS = new Set(['name', 'targetCategory', 'keywords', 'enabled', 'directAssign']);

    constructor() {
        this.loadMappings();
    }

    async loadMappings() {
        try {
            await ensureDataDir();
            const data = await fs.readFile(this.#CONFIG_FILE, 'utf8');
            this.#mappings = JSON.parse(data);
            console.info(`🗂️ Loaded ${this.#mappings.length} category mappings`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.info('🗂️ No category mappings file found, starting with defaults');
                this.#createDefaultMappings();
            } else {
                console.error('Error loading category mappings:', error);
                this.#mappings = [];
            }
        }
    }

    #createDefaultMappings() {
        // Create some useful default mappings
        this.#mappings = [
            {
                id: uuid(),
                name: "Supermarkets & Groceries",
                targetCategory: "Groceries",
                keywords: ["rewe", "spar", "hofer", "billa", "merkur", "interspar", "lidl", "aldi"],
                enabled: true,
                created: new Date().toISOString()
            },
            {
                id: uuid(),
                name: "Gas Stations",
                targetCategory: "Transportation",
                keywords: ["shell", "bp", "esso", "omv", "jet", "total", "tankstelle"],
                enabled: true,
                created: new Date().toISOString()
            },
            {
                id: uuid(),
                name: "Medical & Health",
                targetCategory: "Healthcare",
                keywords: ["apotheke", "arzt", "zahnarzt", "krankenhaus", "pharmacy", "hospital", "doctor"],
                enabled: true,
                created: new Date().toISOString()
            }
        ];
        this.saveMappings();
    }

    async saveMappings() {
        try {
            await ensureDataDir();
            await fs.writeFile(this.#CONFIG_FILE, JSON.stringify(this.#mappings, null, 2));
            console.info(`💾 Saved ${this.#mappings.length} category mappings`);
        } catch (error) {
            console.error('Error saving category mappings:', error);
            throw error;
        }
    }

    /**
     * Build searchable text from a transaction (description + counterparty names).
     */
    #getTransactionSearchText(firstTx) {
        return [
            firstTx.description,
            firstTx.destination_name,
            firstTx.source_name,
        ].filter(Boolean).join(' ').toLowerCase();
    }

    /**
     * Loose keyword match — substring or overlapping tokens (keywords need not appear verbatim).
     */
    #looselyMatchesKeyword(keyword, searchText) {
        const k = String(keyword || '').toLowerCase().trim();
        if (!k || !searchText) return false;
        if (searchText.includes(k)) return true;

        const textWords = searchText.split(/\s+/).filter(w => w.length >= 2);
        const keyWords = k.split(/\s+/).filter(w => w.length >= 2);
        for (const kw of keyWords) {
            if (textWords.some(w => w.includes(kw) || kw.includes(w) || w.startsWith(kw) || kw.startsWith(w))) {
                return true;
            }
        }
        return false;
    }

    /**
     * AI hint from keyword mappings: replaces transaction description for OpenAI when a rule matches loosely.
     * Does not assign a category directly.
     *
     * @param {Object} transaction Firefly transaction object
     * @returns {Object|null} { descriptionHint, suggestedCategory, mappingName, matchedKeyword, reason }
     */
    getAiHint(transaction) {
        const firstTx = transaction?.attributes?.transactions?.[0];
        if (!firstTx) return null;

        const searchText = this.#getTransactionSearchText(firstTx);

        for (const mapping of this.#mappings) {
            if (!mapping.enabled) continue;

            for (const keyword of mapping.keywords) {
                if (!this.#looselyMatchesKeyword(keyword, searchText)) continue;

                const descriptionHint = String(keyword).trim() || mapping.name;
                return {
                    descriptionHint,
                    suggestedCategory: mapping.targetCategory,
                    mappingName: mapping.name,
                    matchedKeyword: keyword,
                    reason: `Keyword hint "${descriptionHint}" from mapping "${mapping.name}" (suggested: ${mapping.targetCategory})`,
                };
            }
        }

        return null;
    }

    /**
     * Direct-assign from keyword mappings: when an enabled mapping has directAssign=true
     * and the transaction loosely matches a keyword, return the target category immediately.
     * US-0007: bypasses AI classification when matched.
     *
     * @param {Object} transaction Firefly transaction object
     * @returns {Object} { assigned, category?, mappingName?, matchedKeyword?, reason? }
     */
    getDirectAssignment(transaction) {
        const firstTx = transaction?.attributes?.transactions?.[0];
        if (!firstTx) return { assigned: false };

        const searchText = this.#getTransactionSearchText(firstTx);

        for (const mapping of this.#mappings) {
            if (!mapping.enabled) continue;
            if (!mapping.directAssign) continue;

            for (const keyword of mapping.keywords) {
                if (!this.#looselyMatchesKeyword(keyword, searchText)) continue;
                return {
                    assigned: true,
                    category: mapping.targetCategory,
                    mappingName: mapping.name,
                    matchedKeyword: keyword,
                    reason: `Direct-assign from mapping "${mapping.name}" via keyword "${keyword}" → ${mapping.targetCategory}`,
                };
            }
        }
        return { assigned: false };
    }

    addMapping(mappingData) {
        const clean = this.#stripFields(mappingData);
        const mapping = {
            id: uuid(),
            name: clean.name || 'New Mapping',
            targetCategory: clean.targetCategory || '',
            keywords: this.#parseKeywords(clean.keywords || ''),
            enabled: clean.enabled !== false,
            directAssign: Boolean(clean.directAssign ?? false),
            created: new Date().toISOString()
        };

        this.#mappings.push(mapping);
        this.saveMappings();
        console.info(`➕ Added category mapping: "${mapping.name}" → "${mapping.targetCategory}"`);
        return mapping;
    }

    updateMapping(id, updates) {
        const index = this.#mappings.findIndex(m => m.id === id);
        if (index === -1) {
            throw new Error('Mapping not found');
        }

        const clean = this.#stripFields(updates);
        const mapping = { ...this.#mappings[index], ...clean };
        
        // Parse keywords if updated
        if ('keywords' in clean) {
            mapping.keywords = this.#parseKeywords(clean.keywords);
        }
        // Coerce directAssign to boolean when present
        if ('directAssign' in clean) {
            mapping.directAssign = Boolean(clean.directAssign);
        }
        
        mapping.updated = new Date().toISOString();
        this.#mappings[index] = mapping;
        
        this.saveMappings();
        console.info(`✏️ Updated category mapping: "${mapping.name}"`);
        return mapping;
    }

    removeMapping(id) {
        const index = this.#mappings.findIndex(m => m.id === id);
        if (index === -1) {
            return false;
        }

        const mapping = this.#mappings[index];
        this.#mappings.splice(index, 1);
        this.saveMappings();
        console.info(`🗑️ Removed category mapping: "${mapping.name}"`);
        return true;
    }

    toggleMapping(id, enabled) {
        const mapping = this.#mappings.find(m => m.id === id);
        if (!mapping) {
            throw new Error('Mapping not found');
        }

        mapping.enabled = enabled;
        mapping.updated = new Date().toISOString();
        this.saveMappings();
        console.info(`${enabled ? '✅' : '❌'} ${enabled ? 'Enabled' : 'Disabled'} category mapping: "${mapping.name}"`);
        return mapping;
    }

    getAllMappings() {
        return [...this.#mappings];
    }

    getMappingById(id) {
        return this.#mappings.find(m => m.id === id);
    }

    #parseKeywords(keywordString) {
        if (typeof keywordString !== 'string') {
            return [];
        }
        
        return keywordString
            .split(',')
            .map(k => k.trim())
            .filter(k => k.length > 0);
    }

    #stripFields(raw) {
        const out = {};
        for (const k of this.#MAPPING_FIELDS) {
            if (k in raw) out[k] = raw[k];
        }
        return out;
    }

    #formatKeywords(keywords) {
        return Array.isArray(keywords) ? keywords.join(', ') : '';
    }

    getStats() {
        const total = this.#mappings.length;
        const enabled = this.#mappings.filter(m => m.enabled).length;
        const totalKeywords = this.#mappings.reduce((sum, m) => sum + m.keywords.length, 0);
        
        return {
            totalMappings: total,
            enabledMappings: enabled,
            totalKeywords: totalKeywords
        };
    }

    // Helper method for UI - formats keywords as comma-separated string
    formatMappingForUI(mapping) {
        return {
            ...mapping,
            keywordsString: this.#formatKeywords(mapping.keywords)
        };
    }

    // Validate mapping data
    validateMapping(mappingData) {
        const errors = [];
        
        if (!mappingData.name || mappingData.name.trim().length === 0) {
            errors.push('Name is required');
        }
        
        if (!mappingData.targetCategory || mappingData.targetCategory.trim().length === 0) {
            errors.push('Target category is required');
        }
        
        if (!mappingData.keywords || mappingData.keywords.trim().length === 0) {
            errors.push('Keywords are required');
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }
} 
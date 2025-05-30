import fs from 'fs/promises';
import { v4 as uuid } from 'uuid';

export default class CategoryMappingService {
    #CONFIG_FILE = 'category-mappings.json';
    #mappings = [];

    constructor() {
        this.loadMappings();
    }

    async loadMappings() {
        try {
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
            await fs.writeFile(this.#CONFIG_FILE, JSON.stringify(this.#mappings, null, 2));
            console.info(`💾 Saved ${this.#mappings.length} category mappings`);
        } catch (error) {
            console.error('Error saving category mappings:', error);
            throw error;
        }
    }

    /**
     * Check if a transaction should be auto-categorized based on category mappings
     * @param {Object} transaction - Firefly transaction object
     * @returns {Object|null} - { category, reason, mapping } if matched, null otherwise
     */
    categorizeTransaction(transaction) {
        const firstTx = transaction.attributes?.transactions?.[0];
        if (!firstTx) {
            return null;
        }

        const description = (firstTx.description || '').toLowerCase();
        const destinationName = (firstTx.destination_name || '').toLowerCase();
        const combinedText = `${description} ${destinationName}`;

        // Check all enabled mappings
        for (const mapping of this.#mappings) {
            if (!mapping.enabled) continue;

            for (const keyword of mapping.keywords) {
                const normalizedKeyword = keyword.toLowerCase().trim();
                if (normalizedKeyword && combinedText.includes(normalizedKeyword)) {
                    return {
                        category: mapping.targetCategory,
                        reason: `Matched "${keyword}" in mapping "${mapping.name}"`,
                        autoRule: 'category_mapping',
                        mappingName: mapping.name,
                        matchedKeyword: keyword
                    };
                }
            }
        }

        return null;
    }

    addMapping(mappingData) {
        const mapping = {
            id: uuid(),
            name: mappingData.name || 'New Mapping',
            targetCategory: mappingData.targetCategory || '',
            keywords: this.#parseKeywords(mappingData.keywords || ''),
            enabled: mappingData.enabled !== false,
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

        const mapping = { ...this.#mappings[index], ...updates };
        
        // Parse keywords if updated
        if (updates.keywords !== undefined) {
            mapping.keywords = this.#parseKeywords(updates.keywords);
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
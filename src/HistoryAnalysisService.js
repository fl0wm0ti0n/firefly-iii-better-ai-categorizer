import fs from 'fs/promises';
import { dataFile, ensureDataDir } from './storage.js';

export default class HistoryAnalysisService {
    #dominanceThreshold = 0.80;
    #minTransactionCount = 10;
    #configFile;

    constructor() {
        this.#loadConfig();
    }

    async #loadConfig() {
        try {
            await ensureDataDir();
            this.#configFile = dataFile('dominance-config.json');
            const data = await fs.readFile(this.#configFile, 'utf8');
            const config = JSON.parse(data);
            if (typeof config.dominanceThreshold === 'number' && config.dominanceThreshold > 0 && config.dominanceThreshold <= 1) {
                this.#dominanceThreshold = config.dominanceThreshold;
            }
            if (typeof config.minTransactionCount === 'number' && config.minTransactionCount > 0) {
                this.#minTransactionCount = config.minTransactionCount;
            }
            console.info(`📊 History analysis config loaded: threshold=${this.#dominanceThreshold}, minTx=${this.#minTransactionCount}`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.info('📊 No dominance config found, using defaults (threshold=0.80, minTx=10)');
            } else {
                console.error('Error loading dominance config:', error);
            }
        }
    }

    analyzeAccountHistory(transactions) {
        const categorized = transactions.filter(tx => {
            const firstTx = tx.attributes?.transactions?.[0];
            return firstTx?.category_id && firstTx.category_id !== null && firstTx.category_id !== '';
        });

        if (categorized.length < this.#minTransactionCount) {
            return {
                dominantCategory: null,
                dominance: 0,
                categorizedCount: categorized.length,
                insufficientData: true,
            };
        }

        const counts = new Map();
        for (const tx of categorized) {
            const firstTx = tx.attributes.transactions[0];
            const catName = firstTx.category_name;
            counts.set(catName, (counts.get(catName) || 0) + 1);
        }

        let dominantCategory = null;
        let maxCount = 0;
        for (const [catName, count] of counts.entries()) {
            if (count > maxCount) {
                maxCount = count;
                dominantCategory = catName;
            }
        }

        const dominance = maxCount / categorized.length;

        if (dominance < this.#dominanceThreshold) {
            return {
                dominantCategory,
                dominance,
                categorizedCount: categorized.length,
                belowThreshold: true,
            };
        }

        return {
            dominantCategory,
            dominance,
            confidence: dominance,
            categorizedCount: categorized.length,
            categoryCounts: Object.fromEntries(counts),
        };
    }

    getThreshold() {
        return this.#dominanceThreshold;
    }

    getMinTransactionCount() {
        return this.#minTransactionCount;
    }
}

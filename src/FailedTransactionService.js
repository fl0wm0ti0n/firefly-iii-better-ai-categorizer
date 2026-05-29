import fs from 'fs/promises';
import { ensureDataDir, dataFile } from './storage.js';

export default class FailedTransactionService {
    #FAILED_TRANSACTIONS_FILE = dataFile('failed-transactions.json');
    #failedTransactions = [];

    constructor() {
        this.loadFailedTransactions();
    }

    async loadFailedTransactions() {
        try {
            await ensureDataDir();
            const data = await fs.readFile(this.#FAILED_TRANSACTIONS_FILE, 'utf8');
            this.#failedTransactions = JSON.parse(data);
            console.info(`📋 Loaded ${this.#failedTransactions.length} failed transactions`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.info('📋 No failed transactions file found, starting empty');
                this.#failedTransactions = [];
            } else {
                console.error('Error loading failed transactions:', error);
                this.#failedTransactions = [];
            }
        }
    }

    async saveFailedTransactions() {
        try {
            await ensureDataDir();
            await fs.writeFile(this.#FAILED_TRANSACTIONS_FILE, JSON.stringify(this.#failedTransactions, null, 2));
            console.info(`💾 Saved ${this.#failedTransactions.length} failed transactions`);
        } catch (error) {
            console.error('Error saving failed transactions:', error);
            throw error;
        }
    }

    #mergeFailedFields(existing, incoming) {
        const pick = (next, prev) => (next != null && next !== '' ? next : prev);
        return {
            ...existing,
            description: pick(incoming.description, existing.description) || '',
            destinationName: pick(incoming.destinationName, existing.destinationName) || '',
            sourceName: pick(incoming.sourceName, existing.sourceName) || '',
            amount: pick(incoming.amount, existing.amount),
            currencyCode: pick(incoming.currencyCode, existing.currencyCode),
            foreignAmount: pick(incoming.foreignAmount, existing.foreignAmount),
            foreignCurrencyCode: pick(incoming.foreignCurrencyCode, existing.foreignCurrencyCode),
            transactionDate: pick(incoming.transactionDate, existing.transactionDate),
            transactionType: pick(incoming.transactionType, existing.transactionType),
            categoryName: pick(incoming.categoryName, existing.categoryName),
            transactionId: pick(incoming.transactionId, existing.transactionId),
            prompt: pick(incoming.prompt, existing.prompt) || '',
            response: pick(incoming.response, existing.response) || '',
            created: existing.created || incoming.created,
        };
    }

    addFailedTransaction(transaction) {
        const failedTransaction = {
            id: transaction.id || `failed-${Date.now()}`,
            description: transaction.description || '',
            destinationName: transaction.destinationName || '',
            sourceName: transaction.sourceName || '',
            amount: transaction.amount ?? null,
            currencyCode: transaction.currencyCode || null,
            foreignAmount: transaction.foreignAmount ?? null,
            foreignCurrencyCode: transaction.foreignCurrencyCode || null,
            transactionDate: transaction.transactionDate || null,
            transactionType: transaction.transactionType || null,
            categoryName: transaction.categoryName || null,
            created: transaction.created || new Date().toISOString(),
            prompt: transaction.prompt || '',
            response: transaction.response || '',
            transactionId: transaction.transactionId || null,
        };

        const existingIndex = this.#failedTransactions.findIndex(ft =>
            ft.description === failedTransaction.description &&
            ft.destinationName === failedTransaction.destinationName
        );

        if (existingIndex !== -1) {
            this.#failedTransactions[existingIndex] = this.#mergeFailedFields(
                this.#failedTransactions[existingIndex],
                failedTransaction
            );
            this.saveFailedTransactions();
            console.info(`❌ Updated failed transaction: "${failedTransaction.description}"`);
            return;
        }

        this.#failedTransactions.unshift(failedTransaction);

        if (this.#failedTransactions.length > 100) {
            this.#failedTransactions = this.#failedTransactions.slice(0, 100);
        }

        this.saveFailedTransactions();
        console.info(`❌ Added failed transaction: "${failedTransaction.description}"`);
    }

    removeFailedTransaction(id) {
        const initialLength = this.#failedTransactions.length;
        this.#failedTransactions = this.#failedTransactions.filter(ft => ft.id !== id);
        
        if (this.#failedTransactions.length < initialLength) {
            this.saveFailedTransactions();
            console.info(`🗑️ Removed failed transaction: ${id}`);
            return true;
        }
        
        return false;
    }

    removeFailedTransactionByProperties(description, destinationName) {
        const initialLength = this.#failedTransactions.length;
        this.#failedTransactions = this.#failedTransactions.filter(ft => 
            !(ft.description === description && ft.destinationName === destinationName)
        );
        
        if (this.#failedTransactions.length < initialLength) {
            this.saveFailedTransactions();
            console.info(`✅ Removed ${initialLength - this.#failedTransactions.length} failed transaction(s) for: "${description}" → "${destinationName}"`);
            return true;
        }
        
        return false;
    }

    removeFailedTransactionByFireflyId(transactionId) {
        const initialLength = this.#failedTransactions.length;
        this.#failedTransactions = this.#failedTransactions.filter(ft => ft.transactionId !== transactionId);
        
        if (this.#failedTransactions.length < initialLength) {
            this.saveFailedTransactions();
            console.info(`✅ Removed ${initialLength - this.#failedTransactions.length} failed transaction(s) for Firefly ID: ${transactionId}`);
            return true;
        }
        
        return false;
    }

    clearOldFailedTransactions(daysOld = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        
        const initialLength = this.#failedTransactions.length;
        this.#failedTransactions = this.#failedTransactions.filter(ft => 
            new Date(ft.created) > cutoffDate
        );
        
        if (this.#failedTransactions.length < initialLength) {
            this.saveFailedTransactions();
            console.info(`🧹 Cleared ${initialLength - this.#failedTransactions.length} old failed transactions`);
        }
    }

    cleanupFailedTransactions() {
        // Clear transactions older than 7 days
        const initialLength = this.#failedTransactions.length;
        this.clearOldFailedTransactions(7);
        
        // Also remove duplicates
        const uniqueTransactions = [];
        const seen = new Set();
        
        for (const ft of this.#failedTransactions) {
            const key = `${ft.description}||${ft.destinationName}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueTransactions.push(ft);
            }
        }
        
        this.#failedTransactions = uniqueTransactions;
        
        if (this.#failedTransactions.length < initialLength) {
            this.saveFailedTransactions();
            console.info(`🧹 Cleanup complete: ${initialLength - this.#failedTransactions.length} entries removed`);
            return true;
        }
        
        return false;
    }

    patchFailedTransaction(id, updates) {
        const index = this.#failedTransactions.findIndex(ft => ft.id === id);
        if (index === -1) return null;
        this.#failedTransactions[index] = {
            ...this.#failedTransactions[index],
            ...updates,
        };
        this.saveFailedTransactions();
        return this.#failedTransactions[index];
    }

    getAllFailedTransactions() {
        // Return most recent first
        return [...this.#failedTransactions];
    }

    getFailedTransactionCount() {
        return this.#failedTransactions.length;
    }
} 
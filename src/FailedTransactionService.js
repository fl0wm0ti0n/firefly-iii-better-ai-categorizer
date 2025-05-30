import fs from 'fs/promises';

export default class FailedTransactionService {
    #FAILED_TRANSACTIONS_FILE = 'failed-transactions.json';
    #failedTransactions = [];

    constructor() {
        this.loadFailedTransactions();
    }

    async loadFailedTransactions() {
        try {
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
            await fs.writeFile(this.#FAILED_TRANSACTIONS_FILE, JSON.stringify(this.#failedTransactions, null, 2));
            console.info(`💾 Saved ${this.#failedTransactions.length} failed transactions`);
        } catch (error) {
            console.error('Error saving failed transactions:', error);
            throw error;
        }
    }

    addFailedTransaction(transaction) {
        const failedTransaction = {
            id: transaction.id || `failed-${Date.now()}`,
            description: transaction.description || '',
            destinationName: transaction.destinationName || '',
            created: transaction.created || new Date().toISOString(),
            prompt: transaction.prompt || '',
            response: transaction.response || '',
            transactionId: transaction.transactionId || null
        };

        // Avoid duplicates based on description and destinationName
        const exists = this.#failedTransactions.some(ft => 
            ft.description === failedTransaction.description && 
            ft.destinationName === failedTransaction.destinationName
        );

        if (!exists) {
            this.#failedTransactions.unshift(failedTransaction); // Add to beginning
            
            // Keep only the last 100 failed transactions
            if (this.#failedTransactions.length > 100) {
                this.#failedTransactions = this.#failedTransactions.slice(0, 100);
            }
            
            this.saveFailedTransactions();
            console.info(`❌ Added failed transaction: "${failedTransaction.description}"`);
        }
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

    getAllFailedTransactions() {
        // Return most recent first
        return [...this.#failedTransactions];
    }

    getFailedTransactionCount() {
        return this.#failedTransactions.length;
    }
} 
import {getConfigVariable} from "./util.js";

export default class FireflyService {
    #BASE_URL;
    #PERSONAL_TOKEN;

    constructor() {
        this.#BASE_URL = getConfigVariable("FIREFLY_URL")
        if (this.#BASE_URL.slice(-1) === "/") {
            this.#BASE_URL = this.#BASE_URL.substring(0, this.#BASE_URL.length - 1)
        }

        this.#PERSONAL_TOKEN = getConfigVariable("FIREFLY_PERSONAL_TOKEN")
    }

    async getCategories() {
        const response = await fetch(`${this.#BASE_URL}/api/v1/categories`, {
            headers: {
                Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
            }
        });

        if (!response.ok) {
            throw new FireflyException(response.status, response, await response.text())
        }

        const data = await response.json();

        const categories = new Map();
        data.data.forEach(category => {
            categories.set(category.attributes.name, category.id);
        });

        return categories;
    }

    async setCategory(transactionId, transactions, categoryId) {
        // Skip actual API call for test transactions
        if (transactionId.toString().startsWith('test-')) {
            console.info(`🧪 TEST MODE: Would update transaction ${transactionId} with category ID ${categoryId}`);
            console.info(`🧪 TEST MODE: Transaction data:`, JSON.stringify(transactions, null, 2));
            return;
        }

        const tag = getConfigVariable("FIREFLY_TAG", "AI categorized");

        const body = {
            apply_rules: true,
            fire_webhooks: true,
            transactions: [],
        }

        transactions.forEach(transaction => {
            let tags = transaction.tags;
            if (!tags) {
                tags = [];
            }
            tags.push(tag);

            body.transactions.push({
                transaction_journal_id: transaction.transaction_journal_id,
                category_id: categoryId,
                tags: tags,
            });
        })

        const response = await fetch(`${this.#BASE_URL}/api/v1/transactions/${transactionId}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new FireflyException(response.status, response, await response.text())
        }

        await response.json();
        console.info("Transaction updated")
    }

    async getAllUncategorizedTransactions() {
        const transactions = [];
        
        // Fetch both withdrawals and deposits
        const withdrawals = await this.#getUncategorizedByType('withdrawal');
        const deposits = await this.#getUncategorizedByType('deposit');
        
        transactions.push(...withdrawals, ...deposits);
        return transactions;
    }

    async #getUncategorizedByType(transactionType) {
        const transactions = [];
        let page = 1;
        const limit = 50;

        while (true) {
            try {
                const response = await fetch(`${this.#BASE_URL}/api/v1/transactions?type=${transactionType}&limit=${limit}&page=${page}`, {
                    headers: {
                        Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`Firefly API Error (${response.status}):`, errorText);
                    
                    if (response.status === 401) {
                        throw new FireflyException(response.status, response, "Authentication failed. Please check your FIREFLY_PERSONAL_TOKEN.");
                    } else if (response.status === 404) {
                        throw new FireflyException(response.status, response, "API endpoint not found. Please check your FIREFLY_URL.");
                    } else {
                        throw new FireflyException(response.status, response, errorText || "Unknown API error");
                    }
                }

                let data;
                try {
                    data = await response.json();
                } catch (parseError) {
                    const responseText = await response.text();
                    console.error("Failed to parse JSON response:", responseText.substring(0, 500));
                    throw new FireflyException(500, response, "API returned invalid JSON. This usually means your FIREFLY_URL is incorrect or points to a non-API endpoint.");
                }

                // Filter for uncategorized transactions
                const uncategorizedTransactions = data.data.filter(transaction => {
                    const firstTransaction = transaction.attributes.transactions[0];
                    return firstTransaction.type === transactionType && 
                           (!firstTransaction.category_id || firstTransaction.category_id === null || firstTransaction.category_id === "");
                });

                transactions.push(...uncategorizedTransactions);

                // Check if we've reached the last page
                if (data.data.length < limit) {
                    break;
                }

                page++;
            } catch (error) {
                if (error instanceof FireflyException) {
                    throw error;
                }
                console.error("Network error while fetching transactions:", error.message);
                throw new FireflyException(0, null, `Network error: ${error.message}. Please check your FIREFLY_URL and internet connection.`);
            }
        }

        return transactions;
    }

    async getAllWithdrawalTransactions() {
        const transactions = [];
        let page = 1;
        const limit = 50;

        while (true) {
            try {
                const response = await fetch(`${this.#BASE_URL}/api/v1/transactions?type=withdrawal&limit=${limit}&page=${page}`, {
                    headers: {
                        Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`Firefly API Error (${response.status}):`, errorText);
                    
                    if (response.status === 401) {
                        throw new FireflyException(response.status, response, "Authentication failed. Please check your FIREFLY_PERSONAL_TOKEN.");
                    } else if (response.status === 404) {
                        throw new FireflyException(response.status, response, "API endpoint not found. Please check your FIREFLY_URL.");
                    } else {
                        throw new FireflyException(response.status, response, errorText || "Unknown API error");
                    }
                }

                let data;
                try {
                    data = await response.json();
                } catch (parseError) {
                    const responseText = await response.text();
                    console.error("Failed to parse JSON response:", responseText.substring(0, 500));
                    throw new FireflyException(500, response, "API returned invalid JSON. This usually means your FIREFLY_URL is incorrect or points to a non-API endpoint.");
                }

                // Filter for withdrawal transactions
                const withdrawalTransactions = data.data.filter(transaction => {
                    const firstTransaction = transaction.attributes.transactions[0];
                    return firstTransaction.type === "withdrawal";
                });

                transactions.push(...withdrawalTransactions);

                // Check if we've reached the last page
                if (data.data.length < limit) {
                    break;
                }

                page++;
            } catch (error) {
                if (error instanceof FireflyException) {
                    throw error;
                }
                console.error("Network error while fetching transactions:", error.message);
                throw new FireflyException(0, null, `Network error: ${error.message}. Please check your FIREFLY_URL and internet connection.`);
            }
        }

        return transactions;
    }

    async getAllTransactions() {
        const transactions = [];
        
        // Fetch both withdrawals and deposits
        const withdrawals = await this.#getAllTransactionsByType('withdrawal');
        const deposits = await this.#getAllTransactionsByType('deposit');
        
        transactions.push(...withdrawals, ...deposits);
        return transactions;
    }

    async #getAllTransactionsByType(transactionType) {
        const transactions = [];
        let page = 1;
        const limit = 50;

        while (true) {
            try {
                const response = await fetch(`${this.#BASE_URL}/api/v1/transactions?type=${transactionType}&limit=${limit}&page=${page}`, {
                    headers: {
                        Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`Firefly API Error (${response.status}):`, errorText);
                    
                    if (response.status === 401) {
                        throw new FireflyException(response.status, response, "Authentication failed. Please check your FIREFLY_PERSONAL_TOKEN.");
                    } else if (response.status === 404) {
                        throw new FireflyException(response.status, response, "API endpoint not found. Please check your FIREFLY_URL.");
                    } else {
                        throw new FireflyException(response.status, response, errorText || "Unknown API error");
                    }
                }

                let data;
                try {
                    data = await response.json();
                } catch (parseError) {
                    const responseText = await response.text();
                    console.error("Failed to parse JSON response:", responseText.substring(0, 500));
                    throw new FireflyException(500, response, "API returned invalid JSON. This usually means your FIREFLY_URL is incorrect or points to a non-API endpoint.");
                }

                // Filter for transactions of the specified type
                const filteredTransactions = data.data.filter(transaction => {
                    const firstTransaction = transaction.attributes.transactions[0];
                    return firstTransaction.type === transactionType;
                });

                transactions.push(...filteredTransactions);

                // Check if we've reached the last page
                if (data.data.length < limit) {
                    break;
                }

                page++;
            } catch (error) {
                if (error instanceof FireflyException) {
                    throw error;
                }
                console.error("Network error while fetching transactions:", error.message);
                throw new FireflyException(0, null, `Network error: ${error.message}. Please check your FIREFLY_URL and internet connection.`);
            }
        }

        return transactions;
    }

    async updateTransactionCategory(transactionId, categoryName) {
        try {
            // First find the category ID by name
            const categories = await this.getCategories();
            const categoryId = categories.get(categoryName);
            
            if (!categoryId) {
                throw new Error(`Category "${categoryName}" not found in Firefly III`);
            }

            // Transaction-Details abrufen um die Struktur zu bekommen
            const transactionResponse = await fetch(`${this.#BASE_URL}/api/v1/transactions/${transactionId}`, {
                headers: {
                    Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
                }
            });

            if (!transactionResponse.ok) {
                throw new FireflyException(transactionResponse.status, transactionResponse, await transactionResponse.text());
            }

            const transactionData = await transactionResponse.json();
            const transactions = transactionData.data.attributes.transactions;

            // Verwende die bestehende setCategory Methode
            await this.setCategory(transactionId, transactions, categoryId);
            
            console.info(`✅ Transaction ${transactionId} category updated to: ${categoryName}`);
            
        } catch (error) {
            console.error(`❌ Failed to update transaction ${transactionId} category:`, error.message);
            throw error;
        }
    }

    async getAllTransactionsByType(transactionType) {
        return await this.#getAllTransactionsByType(transactionType);
    }

    // Enhanced method with date filtering support using Firefly III API parameters
    async getTransactionsWithFilters({ type = 'all', dateFrom = null, dateTo = null } = {}) {
        const transactions = [];
        let page = 1;
        const limit = 50;

        // Build API URL with date parameters
        let apiUrl = `${this.#BASE_URL}/api/v1/transactions?limit=${limit}`;
        
        if (type !== 'all') {
            apiUrl += `&type=${type}`;
        }
        
        if (dateFrom) {
            apiUrl += `&start=${dateFrom}`;
        }
        
        if (dateTo) {
            apiUrl += `&end=${dateTo}`;
        }

        while (true) {
            try {
                const response = await fetch(`${apiUrl}&page=${page}`, {
                    headers: {
                        Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`Firefly API Error (${response.status}):`, errorText);
                    
                    if (response.status === 401) {
                        throw new FireflyException(response.status, response, "Authentication failed. Please check your FIREFLY_PERSONAL_TOKEN.");
                    } else if (response.status === 404) {
                        throw new FireflyException(response.status, response, "API endpoint not found. Please check your FIREFLY_URL.");
                    } else {
                        throw new FireflyException(response.status, response, errorText || "Unknown API error");
                    }
                }

                let data;
                try {
                    data = await response.json();
                } catch (parseError) {
                    const responseText = await response.text();
                    console.error("Failed to parse JSON response:", responseText.substring(0, 500));
                    throw new FireflyException(500, response, "API returned invalid JSON. This usually means your FIREFLY_URL is incorrect or points to a non-API endpoint.");
                }

                transactions.push(...data.data);

                // Check if we've reached the last page
                if (data.data.length < limit) {
                    break;
                }

                page++;
            } catch (error) {
                if (error instanceof FireflyException) {
                    throw error;
                }
                console.error("Network error while fetching transactions:", error.message);
                throw new FireflyException(0, null, `Network error: ${error.message}. Please check your FIREFLY_URL and internet connection.`);
            }
        }

        return transactions;
    }

    async removeTransactionCategory(transactionId) {
        try {
            // Skip actual API call for test transactions
            if (transactionId.toString().startsWith('test-')) {
                console.info(`🧪 TEST MODE: Would remove category from transaction ${transactionId}`);
                return;
            }

            // Transaction-Details abrufen um die Struktur zu bekommen
            const transactionResponse = await fetch(`${this.#BASE_URL}/api/v1/transactions/${transactionId}`, {
                headers: {
                    Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
                }
            });

            if (!transactionResponse.ok) {
                throw new FireflyException(transactionResponse.status, transactionResponse, await transactionResponse.text());
            }

            const transactionData = await transactionResponse.json();
            const transactions = transactionData.data.attributes.transactions;

            const tag = getConfigVariable("FIREFLY_TAG", "AI categorized");

            const body = {
                apply_rules: true,
                fire_webhooks: true,
                transactions: [],
            }

            transactions.forEach(transaction => {
                let tags = transaction.tags;
                if (!tags) {
                    tags = [];
                }
                // Add the tag if not already present
                if (!tags.includes(tag)) {
                    tags.push(tag);
                }

                body.transactions.push({
                    transaction_journal_id: transaction.transaction_journal_id,
                    category_id: null, // Remove category by setting to null
                    tags: tags,
                });
            })

            const response = await fetch(`${this.#BASE_URL}/api/v1/transactions/${transactionId}`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${this.#PERSONAL_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new FireflyException(response.status, response, await response.text())
            }

            await response.json();
            console.info(`✅ Transaction ${transactionId} category removed`);
            
        } catch (error) {
            console.error(`❌ Failed to remove category from transaction ${transactionId}:`, error.message);
            throw error;
        }
    }
}

class FireflyException extends Error {
    code;
    response;
    body;

    constructor(statusCode, response, body) {
        super(`Error while communicating with Firefly III: ${statusCode} - ${body}`);

        this.code = statusCode;
        this.response = response;
        this.body = body;
    }
}
import express from "express";
import {getConfigVariable} from "./util.js";
import FireflyService from "./FireflyService.js";
import OpenAiService from "./OpenAiService.js";
import {Server} from "socket.io";
import * as http from "http";
import Queue from "queue";
import JobList from "./JobList.js";

export default class App {
    #PORT;
    #ENABLE_UI;

    #firefly;
    #openAi;

    #server;
    #io;
    #express;

    #queue;
    #jobList;


    constructor() {
        this.#PORT = getConfigVariable("PORT", '3000');
        this.#ENABLE_UI = getConfigVariable("ENABLE_UI", 'false') === 'true';
    }

    async run() {
        this.#firefly = new FireflyService();
        this.#openAi = new OpenAiService();

        this.#queue = new Queue({
            timeout: 30 * 1000,
            concurrency: 1,
            autostart: true
        });

        this.#queue.addEventListener('start', job => console.log('Job started', job))
        this.#queue.addEventListener('success', event => console.log('Job success', event.job))
        this.#queue.addEventListener('error', event => console.error('Job error', event.job, event.err, event))
        this.#queue.addEventListener('timeout', event => console.log('Job timeout', event.job))

        this.#express = express();
        this.#server = http.createServer(this.#express)
        this.#io = new Server(this.#server)

        this.#jobList = new JobList();
        this.#jobList.on('job created', data => this.#io.emit('job created', data));
        this.#jobList.on('job updated', data => this.#io.emit('job updated', data));
        this.#jobList.on('batch job created', data => this.#io.emit('batch job created', data));
        this.#jobList.on('batch job updated', data => this.#io.emit('batch job updated', data));

        this.#express.use(express.json());

        if (this.#ENABLE_UI) {
            this.#express.use('/', express.static('public'))
        }

        this.#express.post('/webhook', this.#onWebhook.bind(this))
        this.#express.post('/api/process-uncategorized', this.#onProcessUncategorized.bind(this))
        this.#express.post('/api/process-all', this.#onProcessAll.bind(this))
        this.#express.post('/api/test-webhook', this.#onTestWebhook.bind(this))

        this.#server.listen(this.#PORT, async () => {
            console.log(`Application running on port ${this.#PORT}`);
        });

        this.#io.on('connection', socket => {
            console.log('connected');
            socket.emit('jobs', Array.from(this.#jobList.getJobs().values()));
            socket.emit('batch jobs', Array.from(this.#jobList.getBatchJobs().values()));
        })
    }

    #onWebhook(req, res) {
        try {
            console.info("Webhook triggered");
            this.#handleWebhook(req, res);
            res.send("Queued");
        } catch (e) {
            console.error(e)
            res.status(400).send(e.message);
        }
    }

    #handleWebhook(req, res) {
        // TODO: validate auth

        if (req.body?.trigger !== "STORE_TRANSACTION") {
            throw new WebhookException("trigger is not STORE_TRANSACTION. Request will not be processed");
        }

        if (req.body?.response !== "TRANSACTIONS") {
            throw new WebhookException("trigger is not TRANSACTION. Request will not be processed");
        }

        if (!req.body?.content?.id) {
            throw new WebhookException("Missing content.id");
        }

        if (req.body?.content?.transactions?.length === 0) {
            throw new WebhookException("No transactions are available in content.transactions");
        }

        if (req.body.content.transactions[0].type !== "withdrawal") {
            throw new WebhookException("content.transactions[0].type has to be 'withdrawal'. Transaction will be ignored.");
        }
        
        if (req.body.content.transactions[0].category_id !== null && req.body.content.transactions[0].category_id !== "") {
            throw new WebhookException("content.transactions[0].category_id is already set. Transaction will be ignored.");
        }

        if (!req.body.content.transactions[0].description) {
            throw new WebhookException("Missing content.transactions[0].description");
        }

        if (!req.body.content.transactions[0].destination_name) {
            throw new WebhookException("Missing content.transactions[0].destination_name");
        }

        const destinationName = req.body.content.transactions[0].destination_name;
        const description = req.body.content.transactions[0].description

        const job = this.#jobList.createJob({
            destinationName,
            description
        });

        this.#queue.push(async () => {
            this.#jobList.setJobInProgress(job.id);

            const categories = await this.#firefly.getCategories();

            const {category, prompt, response} = await this.#openAi.classify(Array.from(categories.keys()), destinationName, description)

            const newData = Object.assign({}, job.data);
            newData.category = category;
            newData.prompt = prompt;
            newData.response = response;

            this.#jobList.updateJobData(job.id, newData);

            if (category) {
                await this.#firefly.setCategory(req.body.content.id, req.body.content.transactions, categories.get(category));
            }

            this.#jobList.setJobFinished(job.id);
        });
    }

    #onProcessUncategorized(req, res) {
        try {
            console.info("Manual processing of uncategorized transactions triggered");
            this.#processUncategorizedTransactions();
            res.json({ success: true, message: "Processing started" });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    #onProcessAll(req, res) {
        try {
            console.info("Manual processing of all transactions triggered");
            this.#processAllTransactions();
            res.json({ success: true, message: "Processing started" });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    #onTestWebhook(req, res) {
        try {
            console.info("Test webhook triggered");
            
            // Create a fake webhook payload based on the request body or use defaults
            const testDescription = req.body?.description || "Test transaction - Einkauf bei Amazon";
            const testDestination = req.body?.destination_name || "Amazon.com";
            const testTransactionId = req.body?.transaction_id || "test-" + Date.now();
            
            const fakeWebhookPayload = {
                trigger: "STORE_TRANSACTION",
                response: "TRANSACTIONS",
                content: {
                    id: testTransactionId,
                    transactions: [{
                        type: "withdrawal",
                        category_id: null,
                        description: testDescription,
                        destination_name: testDestination,
                        transaction_journal_id: testTransactionId,
                        tags: []
                    }]
                }
            };
            
            // Create a fake request object
            const fakeReq = {
                body: fakeWebhookPayload
            };
            
            console.info(`🧪 Testing categorization for: "${testDescription}" → "${testDestination}"`);
            
            this.#handleWebhook(fakeReq, res);
            res.json({ 
                success: true, 
                message: "Test webhook processed successfully",
                test_data: {
                    description: testDescription,
                    destination_name: testDestination,
                    transaction_id: testTransactionId
                }
            });
        } catch (e) {
            console.error("Test webhook error:", e);
            res.status(400).json({ success: false, error: e.message });
        }
    }

    async #processUncategorizedTransactions() {
        const transactions = await this.#firefly.getAllUncategorizedTransactions();
        const categories = await this.#firefly.getCategories();
        const batchJob = this.#jobList.createBatchJob('uncategorized', transactions.length);
        
        console.info(`Found ${transactions.length} uncategorized transactions to process`);

        let processedCount = 0;
        let successCount = 0;
        let errorCount = 0;

        // Intelligente Batch-Verarbeitung mit dynamischen Delays
        const batchSize = 10; // Verarbeite 10 Transaktionen, dann pause
        const baseDelay = 1000; // 1 Sekunde zwischen Requests
        let currentDelay = baseDelay;

        for (let i = 0; i < transactions.length; i++) {
            const transaction = transactions[i];
            
            try {
                const success = await this.#processTransaction(transaction, categories, batchJob.id);
                if (success) {
                    successCount++;
                    // Successful request - reduce delay slightly
                    currentDelay = Math.max(baseDelay * 0.8, 500);
                }
            } catch (error) {
                console.error(`Error processing transaction ${transaction.id}:`, error);
                errorCount++;
                
                // Bei Rate Limit Fehlern: exponentiell längere Pausen
                if (error.code === 429) {
                    currentDelay = Math.min(currentDelay * 2, 30000); // Max 30 Sekunden
                    console.warn(`⏳ Rate limit detected, increasing delay to ${currentDelay/1000}s`);
                }
                
                this.#jobList.updateBatchJobProgress(
                    batchJob.id, 
                    { errors: 1, errorDetails: `Transaction ${transaction.id}: ${error.message}` }
                );
            }
            
            processedCount++;
            this.#jobList.updateBatchJobProgress(batchJob.id, { processed: 1 });
            
            // Adaptive Pausen basierend auf Performance
            if (processedCount % batchSize === 0) {
                console.info(`⏸️ Processed ${processedCount}/${transactions.length}, pausing ${currentDelay/1000}s...`);
                await new Promise(resolve => setTimeout(resolve, currentDelay));
            } else {
                // Kurze Pause zwischen einzelnen Requests
                await new Promise(resolve => setTimeout(resolve, Math.min(currentDelay, 2000)));
            }
        }

        this.#jobList.finishBatchJob(batchJob.id);
        console.info(`Batch processing completed. Processed: ${processedCount}, Success: ${successCount}, Errors: ${errorCount}`);
    }

    async #processAllTransactions() {
        const transactions = await this.#firefly.getAllWithdrawalTransactions();
        const categories = await this.#firefly.getCategories();
        const batchJob = this.#jobList.createBatchJob('all', transactions.length);
        
        console.info(`Found ${transactions.length} withdrawal transactions to process`);

        let processedCount = 0;
        let successCount = 0;
        let errorCount = 0;

        // Für "alle Transaktionen" - noch konservativere Limits
        const batchSize = 5; // Kleinere Batches
        const baseDelay = 2000; // 2 Sekunden zwischen Requests
        let currentDelay = baseDelay;

        for (let i = 0; i < transactions.length; i++) {
            const transaction = transactions[i];
            
            try {
                const success = await this.#processTransaction(transaction, categories, batchJob.id);
                if (success) {
                    successCount++;
                    currentDelay = Math.max(baseDelay * 0.9, 1000);
                }
            } catch (error) {
                console.error(`Error processing transaction ${transaction.id}:`, error);
                errorCount++;
                
                if (error.code === 429) {
                    currentDelay = Math.min(currentDelay * 1.5, 60000); // Max 60 Sekunden
                    console.warn(`⏳ Rate limit detected, increasing delay to ${currentDelay/1000}s`);
                }
                
                this.#jobList.updateBatchJobProgress(
                    batchJob.id, 
                    { errors: 1, errorDetails: `Transaction ${transaction.id}: ${error.message}` }
                );
            }
            
            processedCount++;
            this.#jobList.updateBatchJobProgress(batchJob.id, { processed: 1 });
            
            // Längere Pausen für "alle Transaktionen"
            if (processedCount % batchSize === 0) {
                console.info(`⏸️ Processed ${processedCount}/${transactions.length}, pausing ${currentDelay/1000}s...`);
                await new Promise(resolve => setTimeout(resolve, currentDelay));
            } else {
                await new Promise(resolve => setTimeout(resolve, Math.min(currentDelay, 3000)));
            }
        }

        this.#jobList.finishBatchJob(batchJob.id);
        console.info(`Batch processing completed. Processed: ${processedCount}, Success: ${successCount}, Errors: ${errorCount}`);
    }

    // Hilfsmethode für Retry-Logic bei Rate Limits
    async #retryWithBackoff(fn, maxRetries = 3, baseDelay = 2000) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                if (error.code === 429 && attempt < maxRetries) {
                    const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
                    console.warn(`⏳ Rate limit hit, retrying in ${delay/1000}s (attempt ${attempt}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw error; // Re-throw if not a rate limit or max retries reached
            }
        }
    }

    async #processTransaction(transaction, categories, batchJobId = null) {
        try {
            // Kategorien als Array für OpenAI und als Map für Firefly verwenden
            const categoryNames = Array.from(categories.keys());
            
            // Transaction-Daten aus der Firefly-Struktur extrahieren
            const firstTransaction = transaction.attributes.transactions[0];
            const destinationName = firstTransaction.destination_name || "(unknown destination)";
            const description = firstTransaction.description || "(no description)";
            
            const result = await this.#retryWithBackoff(async () => {
                return await this.#openAi.classify(categoryNames, destinationName, description);
            });

            if (!result || !result.category) {
                console.warn(`⚠️ Could not classify transaction ${transaction.id}: ${description}`);
                if (batchJobId) {
                    this.#jobList.updateBatchJobProgress(batchJobId, { errors: 1 });
                }
                return false;
            }

            const category = result.category;
            await this.#firefly.updateTransactionCategory(transaction.id, category);
            
            console.info(`✅ Transaction ${transaction.id} categorized as: ${category}`);
            
            if (batchJobId) {
                this.#jobList.updateBatchJobProgress(batchJobId, { success: 1 });
            }

            return true;

        } catch (error) {
            console.error(`❌ Error processing transaction ${transaction.id}:`, error.message);
            
            if (batchJobId) {
                this.#jobList.updateBatchJobProgress(batchJobId, { 
                    errors: 1,
                    errorDetails: `Transaction ${transaction.id}: ${error.message}`
                });
            }
            
            // Bei Rate Limit Fehlern die Batch-Verarbeitung pausieren
            if (error.code === 429) {
                console.error("🚨 Rate limit exceeded. Pausing batch processing for 60 seconds...");
                await new Promise(resolve => setTimeout(resolve, 60000));
            }
            
            return false;
        }
    }
}

class WebhookException extends Error {

    constructor(message) {
        super(message);
    }
}
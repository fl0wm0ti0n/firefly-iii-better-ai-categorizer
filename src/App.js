import express from "express";
import {getConfigVariable} from "./util.js";
import FireflyService from "./FireflyService.js";
import OpenAiService from "./OpenAiService.js";
import WordMappingService from "./WordMappingService.js";
import FailedTransactionService from "./FailedTransactionService.js";
import AutoCategorizationService from "./AutoCategorizationService.js";
import CategoryMappingService from "./CategoryMappingService.js";
import {Server} from "socket.io";
import * as http from "http";
import Queue from "queue";
import JobList from "./JobList.js";

export default class App {
    #PORT;
    #ENABLE_UI;

    #firefly;
    #openAi;
    #wordMapping;
    #failedTransactionService;
    #autoCategorizationService;
    #categoryMappingService;

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
        this.#wordMapping = new WordMappingService();
        this.#failedTransactionService = new FailedTransactionService();
        this.#autoCategorizationService = new AutoCategorizationService();
        this.#categoryMappingService = new CategoryMappingService();

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
        
        // Word mapping endpoints
        this.#express.get('/api/word-mappings', this.#onGetWordMappings.bind(this))
        this.#express.post('/api/word-mappings', this.#onAddWordMapping.bind(this))
        this.#express.delete('/api/word-mappings/:fromWord', this.#onDeleteWordMapping.bind(this))
        this.#express.get('/api/failed-transactions', this.#onGetFailedTransactions.bind(this))
        this.#express.delete('/api/failed-transactions/:id', this.#onDeleteFailedTransaction.bind(this))
        this.#express.post('/api/failed-transactions/cleanup', this.#onCleanupFailedTransactions.bind(this))

        // Batch job control endpoints
        this.#express.post('/api/batch-jobs/:id/pause', this.#onPauseBatchJob.bind(this))
        this.#express.post('/api/batch-jobs/:id/resume', this.#onResumeBatchJob.bind(this))
        this.#express.post('/api/batch-jobs/:id/cancel', this.#onCancelBatchJob.bind(this))

        // Auto-categorization endpoints
        this.#express.get('/api/auto-categorization/config', this.#onGetAutoCategorizationConfig.bind(this))
        this.#express.post('/api/auto-categorization/config', this.#onUpdateAutoCategorizationConfig.bind(this))
        this.#express.post('/api/auto-categorization/keywords', this.#onAddForeignKeyword.bind(this))
        this.#express.delete('/api/auto-categorization/keywords/:keyword', this.#onRemoveForeignKeyword.bind(this))

        // Category mapping endpoints
        this.#express.get('/api/category-mappings', this.#onGetCategoryMappings.bind(this))
        this.#express.post('/api/category-mappings', this.#onAddCategoryMapping.bind(this))
        this.#express.put('/api/category-mappings/:id', this.#onUpdateCategoryMapping.bind(this))
        this.#express.delete('/api/category-mappings/:id', this.#onDeleteCategoryMapping.bind(this))
        this.#express.patch('/api/category-mappings/:id/toggle', this.#onToggleCategoryMapping.bind(this))

        // Transaction management endpoints
        this.#express.get('/api/transactions/list', this.#getTransactionsList.bind(this));
        this.#express.post('/api/transactions/update-categories', this.#updateTransactionCategories.bind(this));
        this.#express.post('/api/transactions/remove-categories', this.#removeTransactionCategories.bind(this));
        this.#express.get('/api/transactions/filter', this.#filterTransactions.bind(this));

        // Health check endpoint
        this.#express.get("/", (req, res) => {
            res.send("OK");
        });

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

        if (req.body.content.transactions[0].type !== "withdrawal" && req.body.content.transactions[0].type !== "deposit") {
            throw new WebhookException("content.transactions[0].type has to be 'withdrawal' or 'deposit'. Transaction will be ignored.");
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
        const transactionType = req.body.content.transactions[0].type;

        // Check if we should skip deposits
        const autoConfig = this.#autoCategorizationService.getConfig();
        if (autoConfig.skipDeposits && transactionType === 'deposit') {
            console.info(`⏭️ Skipping deposit transaction: "${description}" (skipDeposits enabled)`);
            return; // Exit early, don't process this transaction
        }

        const job = this.#jobList.createJob({
            destinationName,
            description
        });

        this.#queue.push(async () => {
            this.#jobList.setJobInProgress(job.id);

            const categories = await this.#firefly.getCategories();

            // 1. Try category mappings first (user-defined rules)
            const fakeTransaction = {
                attributes: {
                    transactions: [{
                        description: description,
                        destination_name: destinationName,
                        currency_code: req.body.content.transactions[0].currency_code,
                        foreign_currency_code: req.body.content.transactions[0].foreign_currency_code,
                        foreign_amount: req.body.content.transactions[0].foreign_amount
                    }]
                }
            };

            const categoryResult = this.#categoryMappingService.categorizeTransaction(fakeTransaction);
            
            let category, prompt, response, autoRule;
            
            if (categoryResult && categories.has(categoryResult.category)) {
                // Category mapping matched
                category = categoryResult.category;
                prompt = `Category mapped: ${categoryResult.reason}`;
                response = `Automatically categorized as "${category}" using category mapping: ${categoryResult.mappingName}`;
                autoRule = categoryResult.autoRule;
                
                console.info(`🗂️ Category mapped: "${description}" → "${category}" (${categoryResult.reason})`);
            } else {
                // 2. Try auto-categorization (foreign/travel detection)
                const autoResult = this.#autoCategorizationService.autoCategorize(fakeTransaction);
                
                if (autoResult && categories.has(autoResult.category)) {
                    // Auto-categorized successfully
                    category = autoResult.category;
                    prompt = `Auto-categorized based on: ${autoResult.reason}`;
                    response = `Automatically categorized as "${category}" using rule: ${autoResult.autoRule}`;
                    autoRule = autoResult.autoRule;
                    
                    console.info(`🤖 Auto-categorized: "${description}" → "${category}" (${autoResult.reason})`);
                } else {
                    // 3. Fall back to AI categorization
                    
                    // Apply word mappings to improve categorization
                    const mappedDescription = this.#wordMapping.applyMappings(description);
                    const mappedDestinationName = this.#wordMapping.applyMappings(destinationName);

                    const aiResult = await this.#openAi.classify(
                        Array.from(categories.keys()), 
                        mappedDestinationName, 
                        mappedDescription,
                        transactionType
                    );
                    
                    category = aiResult.category;
                    prompt = aiResult.prompt;
                    response = aiResult.response;
                    autoRule = null;
                }
            }

            const newData = Object.assign({}, job.data);
            newData.category = category;
            newData.prompt = prompt;
            newData.response = response;
            newData.autoRule = autoRule;

            this.#jobList.updateJobData(job.id, newData);

            if (category) {
                await this.#firefly.setCategory(req.body.content.id, req.body.content.transactions, categories.get(category));
                
                // Remove from failed transactions if it was successfully categorized
                this.#failedTransactionService.removeFailedTransactionByProperties(description, destinationName);
                this.#failedTransactionService.removeFailedTransactionByFireflyId(req.body.content.id);
            }

            this.#jobList.setJobFinished(job.id);

            // If categorization failed, save to failed transactions
            if (!category) {
                this.#failedTransactionService.addFailedTransaction({
                    id: job.id,
                    description: description,
                    destinationName: destinationName,
                    created: job.created,
                    prompt: prompt || '',
                    response: response || '',
                    transactionId: req.body.content.id
                });
            }
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
            const testDescription = req.body?.description || "Test transaction - Purchase at Amazon";
            const testDestination = req.body?.destination_name || "Amazon.com";
            const testTransactionId = req.body?.transaction_id || "test-" + Date.now();
            const testType = req.body?.transaction_type || "withdrawal";
            
            const fakeWebhookPayload = {
                trigger: "STORE_TRANSACTION",
                response: "TRANSACTIONS",
                content: {
                    id: testTransactionId,
                    transactions: [{
                        type: testType,
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

    #onGetWordMappings(req, res) {
        try {
            const mappings = this.#wordMapping.getAllMappings();
            res.json({ success: true, mappings });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onAddWordMapping(req, res) {
        try {
            const { fromWord, toWord } = req.body;
            
            if (!fromWord || !toWord) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Both fromWord and toWord are required' 
                });
            }

            await this.#wordMapping.addMapping(fromWord, toWord);
            res.json({ success: true, message: 'Word mapping added successfully' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onDeleteWordMapping(req, res) {
        try {
            const { fromWord } = req.params;
            await this.#wordMapping.removeMapping(fromWord);
            res.json({ success: true, message: 'Word mapping removed successfully' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    #onGetFailedTransactions(req, res) {
        try {
            // Get persistent failed transactions
            const persistentFailedTransactions = this.#failedTransactionService.getAllFailedTransactions();
            
            // Also get recent failed jobs from memory (jobs from current session)
            const jobs = Array.from(this.#jobList.getJobs().values());
            const recentFailedJobs = jobs.filter(job => 
                job.status === 'finished' && 
                (!job.data?.category || job.data.category === null)
            );

            const recentFailedTransactions = recentFailedJobs.map(job => ({
                id: job.id,
                description: job.data?.description || '',
                destinationName: job.data?.destinationName || '',
                created: job.created,
                prompt: job.data?.prompt || '',
                response: job.data?.response || ''
            }));

            // Combine both sources, with recent ones first
            const allFailedTransactions = [...recentFailedTransactions, ...persistentFailedTransactions];

            res.json({ success: true, failedTransactions: allFailedTransactions });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    #onPauseBatchJob(req, res) {
        try {
            const { id } = req.params;
            const success = this.#jobList.pauseBatchJob(id);
            
            if (success) {
                res.json({ success: true, message: 'Batch job paused successfully' });
            } else {
                res.status(400).json({ success: false, error: 'Could not pause batch job' });
            }
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    #onResumeBatchJob(req, res) {
        try {
            const { id } = req.params;
            const success = this.#jobList.resumeBatchJob(id);
            
            if (success) {
                res.json({ success: true, message: 'Batch job resumed successfully' });
            } else {
                res.status(400).json({ success: false, error: 'Could not resume batch job' });
            }
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    #onCancelBatchJob(req, res) {
        try {
            const { id } = req.params;
            const success = this.#jobList.cancelBatchJob(id);
            
            if (success) {
                res.json({ success: true, message: 'Batch job cancelled successfully' });
            } else {
                res.status(400).json({ success: false, error: 'Could not cancel batch job' });
            }
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #processUncategorizedTransactions() {
        let transactions = await this.#firefly.getAllUncategorizedTransactions();
        
        // Filter out deposits if skipDeposits is enabled
        const autoConfig = this.#autoCategorizationService.getConfig();
        if (autoConfig.skipDeposits) {
            const originalCount = transactions.length;
            transactions = transactions.filter(transaction => {
                const firstTx = transaction.attributes.transactions[0];
                return firstTx.type !== 'deposit';
            });
            const filteredCount = originalCount - transactions.length;
            if (filteredCount > 0) {
                console.info(`⏭️ Skipped ${filteredCount} deposit transactions (skipDeposits enabled)`);
            }
        }
        
        const categories = await this.#firefly.getCategories();
        const batchJob = this.#jobList.createBatchJob('uncategorized', transactions.length);
        
        console.info(`Found ${transactions.length} uncategorized transactions to process`);

        let processedCount = 0;
        let successCount = 0;
        let errorCount = 0;

        // Intelligente Batch-Verarbeitung mit dynamischen Delays
        const batchSize = 10; // Process 10 transactions, then pause
        const baseDelay = 1000; // 1 Sekunde zwischen Requests
        let currentDelay = baseDelay;

        for (let i = 0; i < transactions.length; i++) {
            const transaction = transactions[i];
            
            // Check if batch job is paused or cancelled
            let batchJobStatus = this.#jobList.getBatchJobStatus(batchJob.id);
            if (batchJobStatus === 'cancelled') {
                console.info(`❌ Batch job ${batchJob.id} cancelled, stopping processing`);
                break;
            }
            
            while (batchJobStatus === 'paused') {
                console.info(`⏸️ Batch job ${batchJob.id} paused, waiting...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                // Re-check status after wait
                batchJobStatus = this.#jobList.getBatchJobStatus(batchJob.id);
                if (batchJobStatus !== 'paused') {
                    break;
                }
            }
            
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
                
                // For rate limit errors: exponentially longer pauses
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
        let transactions = await this.#firefly.getAllTransactions();
        
        // Filter out deposits if skipDeposits is enabled
        const autoConfig = this.#autoCategorizationService.getConfig();
        if (autoConfig.skipDeposits) {
            const originalCount = transactions.length;
            transactions = transactions.filter(transaction => {
                const firstTx = transaction.attributes.transactions[0];
                return firstTx.type !== 'deposit';
            });
            const filteredCount = originalCount - transactions.length;
            if (filteredCount > 0) {
                console.info(`⏭️ Skipped ${filteredCount} deposit transactions (skipDeposits enabled)`);
            }
        }
        
        const categories = await this.#firefly.getCategories();
        const batchJob = this.#jobList.createBatchJob('all', transactions.length);
        
        console.info(`Found ${transactions.length} transactions (withdrawals and deposits) to process`);

        let processedCount = 0;
        let successCount = 0;
        let errorCount = 0;

        // For "all transactions" - even more conservative limits
        const batchSize = 10; // Process 10 transactions, then pause
        const baseDelay = 1000; // 1 Sekunde zwischen Requests
        let currentDelay = baseDelay;

        for (let i = 0; i < transactions.length; i++) {
            const transaction = transactions[i];
            
            // Check if batch job is paused or cancelled
            let batchJobStatus = this.#jobList.getBatchJobStatus(batchJob.id);
            if (batchJobStatus === 'cancelled') {
                console.info(`❌ Batch job ${batchJob.id} cancelled, stopping processing`);
                break;
            }
            
            while (batchJobStatus === 'paused') {
                console.info(`⏸️ Batch job ${batchJob.id} paused, waiting...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                // Re-check status after wait
                batchJobStatus = this.#jobList.getBatchJobStatus(batchJob.id);
                if (batchJobStatus !== 'paused') {
                    break;
                }
            }
            
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
            
            // Longer pauses for "all transactions"
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

    // Helper method for retry logic with rate limits
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
            // Categories as array for OpenAI and as Map for Firefly
            const categoryNames = Array.from(categories.keys());
            
            // Transaction-Daten aus der Firefly-Struktur extrahieren
            const firstTransaction = transaction.attributes.transactions[0];
            const destinationName = firstTransaction.destination_name || "(unknown destination)";
            const description = firstTransaction.description || "(no description)";
            const transactionType = firstTransaction.type || "withdrawal";
            
            // 1. Try category mappings first (user-defined rules)
            const categoryResult = this.#categoryMappingService.categorizeTransaction(transaction);
            
            let result;
            let category;
            
            if (categoryResult && categories.has(categoryResult.category)) {
                // Category mapping matched
                category = categoryResult.category;
                result = {
                    category: category,
                    prompt: `Category mapped: ${categoryResult.reason}`,
                    response: `Automatically categorized as "${category}" using category mapping: ${categoryResult.mappingName}`
                };
                
                console.info(`🗂️ Category mapped batch transaction ${transaction.id}: "${description}" → "${category}" (${categoryResult.reason})`);
            } else {
                // 2. Try auto-categorization (foreign/travel detection)
                const autoResult = this.#autoCategorizationService.autoCategorize(transaction);
                
                if (autoResult && categories.has(autoResult.category)) {
                    // Auto-categorized successfully
                    category = autoResult.category;
                    result = {
                        category: category,
                        prompt: `Auto-categorized: ${autoResult.reason}`,
                        response: `Automatically categorized as "${category}" using rule: ${autoResult.autoRule}`
                    };
                    
                    console.info(`🤖 Auto-categorized batch transaction ${transaction.id}: "${description}" → "${category}" (${autoResult.reason})`);
                } else {
                    // 3. Fall back to AI categorization
                    
                    // Apply word mappings to improve categorization
                    const mappedDescription = this.#wordMapping.applyMappings(description);
                    const mappedDestinationName = this.#wordMapping.applyMappings(destinationName);
                    
                    result = await this.#retryWithBackoff(async () => {
                        return await this.#openAi.classify(categoryNames, mappedDestinationName, mappedDescription, transactionType);
                    });
                    
                    category = result?.category;
                }
            }

            if (!result || !result.category) {
                console.warn(`⚠️ Could not classify transaction ${transaction.id}: ${description}`);
                
                // Save to failed transactions
                this.#failedTransactionService.addFailedTransaction({
                    id: `batch-${transaction.id}-${Date.now()}`,
                    description: description,
                    destinationName: destinationName,
                    created: new Date().toISOString(),
                    prompt: result?.prompt || '',
                    response: result?.response || '',
                    transactionId: transaction.id
                });
                
                if (batchJobId) {
                    this.#jobList.updateBatchJobProgress(batchJobId, { errors: 1 });
                }
                return false;
            }

            await this.#firefly.updateTransactionCategory(transaction.id, category);
            
            // Remove from failed transactions if it was successfully categorized
            this.#failedTransactionService.removeFailedTransactionByProperties(description, destinationName);
            this.#failedTransactionService.removeFailedTransactionByFireflyId(transaction.id);
            
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
            
            // Pause batch processing on rate limit errors
            if (error.code === 429) {
                console.error("🚨 Rate limit exceeded. Pausing batch processing for 60 seconds...");
                await new Promise(resolve => setTimeout(resolve, 60000));
            }
            
            return false;
        }
    }

    async #onGetAutoCategorizationConfig(req, res) {
        try {
            const config = await this.#autoCategorizationService.getConfig();
            res.json({ success: true, config });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onUpdateAutoCategorizationConfig(req, res) {
        try {
            const { config } = req.body;
            await this.#autoCategorizationService.updateConfig(config);
            res.json({ success: true, message: 'Auto-categorization config updated successfully' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onAddForeignKeyword(req, res) {
        try {
            const { keyword, keywords } = req.body;
            
            if (keywords && Array.isArray(keywords)) {
                // Handle multiple keywords (new comma-separated approach)
                await this.#autoCategorizationService.setForeignKeywords(keywords);
                res.json({ success: true, message: 'Foreign keywords updated successfully' });
            } else if (keyword) {
                // Handle single keyword (legacy approach)
                await this.#autoCategorizationService.addForeignKeyword(keyword);
                res.json({ success: true, message: 'Foreign keyword added successfully' });
            } else {
                res.status(400).json({ success: false, error: 'Either keyword or keywords array is required' });
            }
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onRemoveForeignKeyword(req, res) {
        try {
            const { keyword } = req.params;
            await this.#autoCategorizationService.removeForeignKeyword(keyword);
            res.json({ success: true, message: 'Foreign keyword removed successfully' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onGetCategoryMappings(req, res) {
        try {
            const mappings = this.#categoryMappingService.getAllMappings();
            res.json({ success: true, mappings });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onAddCategoryMapping(req, res) {
        try {
            const mappingData = req.body;
            
            const validation = this.#categoryMappingService.validateMapping(mappingData);
            if (!validation.isValid) {
                return res.status(400).json({ 
                    success: false, 
                    error: validation.errors.join(', ')
                });
            }

            const mapping = this.#categoryMappingService.addMapping(mappingData);
            res.json({ success: true, message: 'Category mapping added successfully', mapping });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onUpdateCategoryMapping(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            
            const mapping = this.#categoryMappingService.updateMapping(id, updates);
            res.json({ success: true, message: 'Category mapping updated successfully', mapping });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onDeleteCategoryMapping(req, res) {
        try {
            const { id } = req.params;
            const success = this.#categoryMappingService.removeMapping(id);
            if (success) {
                res.json({ success: true, message: 'Category mapping removed successfully' });
            } else {
                res.status(404).json({ success: false, error: 'Category mapping not found' });
            }
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onToggleCategoryMapping(req, res) {
        try {
            const { id } = req.params;
            const { enabled } = req.body;
            
            const mapping = this.#categoryMappingService.toggleMapping(id, enabled);
            res.json({ success: true, message: 'Category mapping toggled successfully', mapping });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onDeleteFailedTransaction(req, res) {
        try {
            const { id } = req.params;
            const success = this.#failedTransactionService.removeFailedTransaction(id);
            if (success) {
                res.json({ success: true, message: 'Failed transaction removed successfully' });
            } else {
                res.status(404).json({ success: false, error: 'Failed transaction not found' });
            }
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onCleanupFailedTransactions(req, res) {
        try {
            const success = this.#failedTransactionService.cleanupFailedTransactions();
            if (success) {
                res.json({ success: true, message: 'Failed transactions cleaned up successfully' });
            } else {
                res.status(500).json({ success: false, error: 'Failed to clean up failed transactions' });
            }
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #getTransactionsList(req, res) {
        try {
            const { type = 'all', limit = 100, page = 1 } = req.query;
            
            // Get all transactions based on type
            let transactions = [];
            
            if (type === 'withdrawal') {
                transactions = await this.#firefly.getAllWithdrawalTransactions();
            } else if (type === 'deposit') {
                transactions = await this.#firefly.getAllTransactionsByType('deposit');
            } else if (type === 'uncategorized') {
                transactions = await this.#firefly.getAllUncategorizedTransactions();
            } else {
                transactions = await this.#firefly.getAllTransactions();
            }
            
            // Get categories for mapping
            const categories = await this.#firefly.getCategories();
            const categoryNames = Array.from(categories.keys());
            
            // Transform transactions to frontend format
            const transformedTransactions = transactions.map(transaction => {
                const firstTx = transaction.attributes.transactions[0];
                const categoryName = firstTx.category_name || null;
                
                return {
                    id: transaction.id,
                    description: firstTx.description || '',
                    destinationName: firstTx.destination_name || '(unknown)',
                    amount: parseFloat(firstTx.amount),
                    currency: firstTx.currency_code || 'EUR',
                    date: firstTx.date || transaction.attributes.updated_at || transaction.attributes.created_at,
                    type: firstTx.type,
                    category: categoryName,
                    categoryId: firstTx.category_id || null,
                    sourceId: firstTx.source_id,
                    destinationId: firstTx.destination_id,
                    transactionJournalId: firstTx.transaction_journal_id
                };
            });
            
            // Apply pagination
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + parseInt(limit);
            const paginatedTransactions = transformedTransactions.slice(startIndex, endIndex);
            
            res.json({
                success: true,
                transactions: paginatedTransactions,
                totalCount: transformedTransactions.length,
                categories: categoryNames,
                page: parseInt(page),
                limit: parseInt(limit)
            });
            
        } catch (error) {
            console.error('Error getting transactions list:', error);
            res.json({
                success: false,
                error: error.message
            });
        }
    }

    async #updateTransactionCategories(req, res) {
        try {
            const { transactionIds, categoryName } = req.body;
            
            if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
                return res.json({
                    success: false,
                    error: 'transactionIds array is required'
                });
            }
            
            if (!categoryName || categoryName.trim() === '') {
                return res.json({
                    success: false,
                    error: 'categoryName is required'
                });
            }
            
            let successCount = 0;
            let errorCount = 0;
            const errors = [];
            
            for (const transactionId of transactionIds) {
                try {
                    await this.#firefly.updateTransactionCategory(transactionId, categoryName.trim());
                    successCount++;
                } catch (error) {
                    errorCount++;
                    errors.push(`Transaction ${transactionId}: ${error.message}`);
                }
            }
            
            res.json({
                success: true,
                message: `Updated ${successCount} transactions successfully`,
                successCount,
                errorCount,
                errors: errors.length > 0 ? errors : undefined
            });
            
        } catch (error) {
            console.error('Error updating transaction categories:', error);
            res.json({
                success: false,
                error: error.message
            });
        }
    }

    async #removeTransactionCategories(req, res) {
        try {
            const { transactionIds } = req.body;
            
            if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
                return res.json({
                    success: false,
                    error: 'transactionIds array is required'
                });
            }
            
            let successCount = 0;
            let errorCount = 0;
            const errors = [];
            
            for (const transactionId of transactionIds) {
                try {
                    await this.#firefly.removeTransactionCategory(transactionId);
                    successCount++;
                } catch (error) {
                    errorCount++;
                    errors.push(`Transaction ${transactionId}: ${error.message}`);
                }
            }
            
            res.json({
                success: true,
                message: `Removed categories from ${successCount} transactions successfully`,
                successCount,
                errorCount,
                errors: errors.length > 0 ? errors : undefined
            });
            
        } catch (error) {
            console.error('Error removing transaction categories:', error);
            res.json({
                success: false,
                error: error.message
            });
        }
    }

    async #filterTransactions(req, res) {
        try {
            const { 
                searchText = '',
                type = 'all',
                hasCategory = 'all',
                categoryName = '',
                minAmount = null,
                maxAmount = null,
                dateFrom = null,
                dateTo = null,
                limit = 100
            } = req.query;
            
            // Use optimized filtering when date filters are provided
            let transactions = [];
            
            if (dateFrom || dateTo) {
                // Use Firefly III API date filtering for better performance
                const fireflyType = type === 'uncategorized' ? 'all' : type;
                transactions = await this.#firefly.getTransactionsWithFilters({
                    type: fireflyType,
                    dateFrom: dateFrom,
                    dateTo: dateTo
                });
            } else {
                // Use existing methods when no date filtering
                if (type === 'withdrawal') {
                    transactions = await this.#firefly.getAllWithdrawalTransactions();
                } else if (type === 'deposit') {
                    transactions = await this.#firefly.getAllTransactionsByType('deposit');
                } else if (type === 'uncategorized') {
                    transactions = await this.#firefly.getAllUncategorizedTransactions();
                } else {
                    transactions = await this.#firefly.getAllTransactions();
                }
            }
            
            // Transform and filter transactions
            const filteredTransactions = transactions
                .map(transaction => {
                    const firstTx = transaction.attributes.transactions[0];
                    const categoryName = firstTx.category_name || null;
                    
                    return {
                        id: transaction.id,
                        description: firstTx.description || '',
                        destinationName: firstTx.destination_name || '(unknown)',
                        amount: parseFloat(firstTx.amount),
                        currency: firstTx.currency_code || 'EUR',
                        date: firstTx.date || transaction.attributes.updated_at || transaction.attributes.created_at,
                        type: firstTx.type,
                        category: categoryName,
                        categoryId: firstTx.category_id || null,
                        sourceId: firstTx.source_id,
                        destinationId: firstTx.destination_id,
                        transactionJournalId: firstTx.transaction_journal_id
                    };
                })
                .filter(transaction => {
                    // Type filter for uncategorized when using date filters
                    if (type === 'uncategorized' && transaction.category) return false;
                    
                    // Text search filter
                    if (searchText) {
                        const searchLower = searchText.toLowerCase();
                        const matchesText = 
                            transaction.description.toLowerCase().includes(searchLower) ||
                            transaction.destinationName.toLowerCase().includes(searchLower);
                        if (!matchesText) return false;
                    }
                    
                    // Category filter
                    if (hasCategory === 'yes' && !transaction.category) return false;
                    if (hasCategory === 'no' && transaction.category) return false;
                    
                    // Specific category filter
                    if (categoryName && transaction.category !== categoryName) return false;
                    
                    // Amount filter - use absolute values for comparison
                    const absoluteAmount = Math.abs(transaction.amount);
                    if (minAmount !== null && absoluteAmount < parseFloat(minAmount)) return false;
                    if (maxAmount !== null && absoluteAmount > parseFloat(maxAmount)) return false;
                    
                    // Date filter only needed if not using API date filtering
                    if (!dateFrom && !dateTo) {
                        // No additional date filtering needed
                    } else if (!(dateFrom || dateTo)) {
                        // Additional date filtering for edge cases
                        if (dateFrom) {
                            const transactionDate = new Date(transaction.date);
                            const fromDate = new Date(dateFrom + 'T00:00:00.000Z');
                            if (transactionDate < fromDate) return false;
                        }
                        
                        if (dateTo) {
                            const transactionDate = new Date(transaction.date);
                            const toDate = new Date(dateTo + 'T23:59:59.999Z');
                            if (transactionDate > toDate) return false;
                        }
                    }
                    
                    return true;
                });
            
            // Apply limit
            const limitedTransactions = filteredTransactions.slice(0, parseInt(limit));
            
            res.json({
                success: true,
                transactions: limitedTransactions,
                totalCount: filteredTransactions.length
            });
            
        } catch (error) {
            console.error('Error filtering transactions:', error);
            res.json({
                success: false,
                error: error.message
            });
        }
    }
}

class WebhookException extends Error {

    constructor(message) {
        super(message);
    }
}
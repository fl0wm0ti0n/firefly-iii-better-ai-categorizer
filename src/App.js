import express from "express";
import {getConfigVariable} from "./util.js";
import FireflyService from "./FireflyService.js";
import OpenAiService from "./OpenAiService.js";
import WordMappingService from "./WordMappingService.js";
import FailedTransactionService from "./FailedTransactionService.js";
import AutoCategorizationService from "./AutoCategorizationService.js";
import CategoryMappingService from "./CategoryMappingService.js";
import AccountCategoryMappingService from "./AccountCategoryMappingService.js";
import TransactionExtractionService from "./TransactionExtractionService.js";
import multer from 'multer';
import {Server} from "socket.io";
import * as http from "http";
import Queue from "queue";
import JobList from "./JobList.js";
import { computeExtractionSum, computeExtractionDisplaySum, buildExtractionTotals, markSettlementLines, isSettlementLine, itemsForPreview, hiddenSettlementItems } from "./extractionSum.js";

/** Always applied to split child transactions created by the credit card splitter. */
const CREDITCARD_SPLIT_TAG = 'creditcard-split';
/** Max days after the last statement line date a settlement charge may post (batch matching). */
const STATEMENT_BILLING_MAX_DAYS_AFTER = 21;
const CREDIT_CARD_LINK_TAG_RE = /^credit-card-statement(?:-created-on-|$)/i;
/** Bumped when API behavior changes (failed-tx enrich, etc.). */
const API_VERSION = '1.1.0';

export default class App {
    #PORT;
    #ENABLE_UI;

    #firefly;
    #openAi;
    #wordMapping;
    #failedTransactionService;
    #autoCategorizationService;
    #categoryMappingService;
    #accountCategoryMappingService;
    #transactionExtractionService;

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
        this.#accountCategoryMappingService = new AccountCategoryMappingService();
        this.#transactionExtractionService = new TransactionExtractionService();

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
        const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

        if (this.#ENABLE_UI) {
        // Basic CORS for cross-origin frontends (no external dep)
        this.#express.use((req, res, next) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            if (req.method === 'OPTIONS') return res.sendStatus(204);
            next();
        });
            this.#express.use('/', (req, res, next) => {
                if (req.path === '/' || req.path === '/index.html') {
                    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                    res.setHeader('Pragma', 'no-cache');
                    res.setHeader('Expires', '0');
                }
                next();
            }, express.static('public', { etag: false, lastModified: false }))
        }

        this.#express.post('/webhook', this.#onWebhook.bind(this))
        this.#express.post('/api/process-uncategorized', this.#onProcessUncategorized.bind(this))
        this.#express.post('/api/process-all', this.#onProcessAll.bind(this))
        this.#express.post('/api/test-webhook', this.#onTestWebhook.bind(this))
        
        // Prevent caching for API responses (especially POST previews)
        this.#express.use('/api', (req, res, next) => {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Surrogate-Control', 'no-store');
            next();
        });

        // Extraction endpoints
        this.#express.post('/api/extraction/upload', upload.single('file'), this.#onExtractionUpload.bind(this))
        this.#express.post('/api/extraction/confirm', this.#onExtractionConfirm.bind(this))
        this.#express.post('/api/extraction/upload-batch', upload.array('files'), this.#onExtractionUploadBatch.bind(this))
        this.#express.post('/api/extraction/confirm-batch', this.#onExtractionConfirmBatch.bind(this))
        this.#express.get('/api/extraction/revert-preview', this.#onExtractionRevertPreview.bind(this))
        this.#express.post('/api/extraction/revert', this.#onExtractionRevert.bind(this))
        this.#express.get('/api/extraction/config', this.#onGetExtractionConfig.bind(this))
        this.#express.post('/api/extraction/config', this.#onUpdateExtractionConfig.bind(this))
        
        // Word mapping endpoints
        this.#express.get('/api/word-mappings', this.#onGetWordMappings.bind(this))
        this.#express.post('/api/word-mappings', this.#onAddWordMapping.bind(this))
        this.#express.delete('/api/word-mappings/:fromWord', this.#onDeleteWordMapping.bind(this))
        this.#express.get('/api/version', this.#onApiVersion.bind(this))
        this.#express.get('/api/failed-transactions', this.#onGetFailedTransactions.bind(this))
        this.#express.post('/api/failed-transactions/refresh', this.#onRefreshFailedTransactions.bind(this))
        this.#express.post('/api/failed-transactions/enrich', this.#onEnrichFailedTransactions.bind(this))
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
        
        // Account → category mapping endpoints
        this.#express.get('/api/account-category-mappings', this.#onGetAccountCategoryMappings.bind(this))
        this.#express.post('/api/account-category-mappings', this.#onAddAccountCategoryMapping.bind(this))
        this.#express.put('/api/account-category-mappings/:id', this.#onUpdateAccountCategoryMapping.bind(this))
        this.#express.delete('/api/account-category-mappings/:id', this.#onDeleteAccountCategoryMapping.bind(this))
        this.#express.patch('/api/account-category-mappings/:id/toggle', this.#onToggleAccountCategoryMapping.bind(this))

        // Transaction management endpoints
        this.#express.get('/api/transactions/list', this.#getTransactionsList.bind(this));
        this.#express.post('/api/transactions/update-categories', this.#updateTransactionCategories.bind(this));
        this.#express.post('/api/transactions/remove-categories', this.#removeTransactionCategories.bind(this));
        this.#express.post('/api/transactions/remove-tags', this.#removeTransactionTags.bind(this));
        this.#express.post('/api/transactions/delete', this.#deleteTransactions.bind(this));
        this.#express.get('/api/transactions/filter', this.#filterTransactions.bind(this));
        this.#express.get('/api/tags', this.#getTags.bind(this));
        this.#express.get('/api/categories', this.#getCategories.bind(this));
        this.#express.get('/api/accounts', this.#getAccounts.bind(this));

        // Duplicate management endpoints
        this.#express.get('/api/duplicates/find', this.#findDuplicates.bind(this));
        this.#express.post('/api/duplicates/delete', this.#deleteDuplicates.bind(this));

        // Health check endpoint
        this.#express.get("/", (req, res) => {
            res.send("OK");
        });

        this.#server.listen(Number(this.#PORT), '0.0.0.0', async () => {
            console.log(`Application running on port ${this.#PORT} (host 0.0.0.0)`);
        });

        this.#io.on('connection', socket => {
            console.log('connected');
            socket.emit('jobs', Array.from(this.#jobList.getJobs().values()));
            socket.emit('batch jobs', Array.from(this.#jobList.getBatchJobs().values()));
        })
    }
    async #getTags(req, res) {
        try {
            const tags = await this.#firefly.getTags();
            res.json({ success: true, tags });
        } catch (error) {
            console.error('Error getting tags:', error);
            res.json({ success: false, error: error.message });
        }
    }

    async #getCategories(req, res) {
        try {
            const categoriesMap = await this.#firefly.getCategories();
            const categories = Array.from(categoriesMap.keys());
            res.json({ success: true, categories });
        } catch (error) {
            console.error('Error getting categories:', error);
            res.json({ success: false, error: error.message });
        }
    }

    async #getAccounts(req, res) {
        try {
            const types = ['expense', 'revenue'];
            const lists = await Promise.all(types.map(t => this.#firefly.listAccountsBasicByType(t)));
            const accounts = lists.flat().sort((a, b) => {
                const ta = String(a.type || '').localeCompare(String(b.type || ''));
                if (ta !== 0) return ta;
                return String(a.name || '').localeCompare(String(b.name || ''));
            });
            res.json({ success: true, accounts });
        } catch (error) {
            console.error('Error getting accounts:', error);
            res.json({ success: false, error: error.message });
        }
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

        const tx0 = req.body.content.transactions[0];
        const job = this.#jobList.createJob({
            destinationName,
            description,
            sourceName: tx0.source_name || '',
            amount: tx0.amount != null ? String(tx0.amount) : null,
            currencyCode: tx0.currency_code || null,
            foreignAmount: tx0.foreign_amount != null ? String(tx0.foreign_amount) : null,
            foreignCurrencyCode: tx0.foreign_currency_code || null,
            transactionDate: tx0.date || null,
            transactionType: tx0.type || null,
            categoryName: tx0.category_name || null,
            transactionId: req.body.content.id,
        });

        this.#queue.push(async () => {
            this.#jobList.setJobInProgress(job.id);

            const categories = await this.#firefly.getCategories();
            const tx0 = req.body.content.transactions[0];
            const fakeTransaction = {
                attributes: {
                    transactions: [{
                        type: transactionType,
                        description,
                        destination_name: destinationName,
                        source_name: tx0.source_name,
                        source_id: tx0.source_id,
                        destination_id: tx0.destination_id,
                        currency_code: tx0.currency_code,
                        foreign_currency_code: tx0.foreign_currency_code,
                        foreign_amount: tx0.foreign_amount,
                    }],
                },
            };

            const { category, prompt, response, autoRule } = await this.#resolveCategory(fakeTransaction, categories);
            if (category && autoRule === 'account_category_mapping') {
                console.info(`🏷️ Account mapped: "${description}" → "${category}"`);
            } else if (category && autoRule === 'category_mapping_hint') {
                console.info(`🔍 AI categorized with keyword hint: "${description}" → "${category}"`);
            } else if (category) {
                console.info(`✅ Categorized: "${description}" → "${category}"`);
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
                this.#failedTransactionService.addFailedTransaction(
                    this.#buildFailedTransactionRecord(tx0, {
                        id: job.id,
                        created: job.created,
                        prompt: prompt || '',
                        response: response || '',
                        transactionId: req.body.content.id,
                    })
                );
            }
        });
    }

    #onProcessUncategorized(req, res) {
        try {
            console.info("Manual processing of uncategorized transactions triggered");
            this.#processUncategorizedTransactions().catch(err => {
                console.error("processUncategorizedTransactions failed:", err);
            });
            res.json({ success: true, message: "Processing started" });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    #onProcessAll(req, res) {
        try {
            console.info("Manual processing of all transactions triggered");
            this.#processAllTransactions().catch(err => {
                console.error("processAllTransactions failed:", err);
            });
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

    #failedTxRichness(ft) {
        let score = 0;
        if (ft?.transactionId) score += 8;
        if (this.#failedTxHasValidAmount(ft)) score += 4;
        if (ft?.transactionDate) score += 2;
        if (ft?.currencyCode) score += 1;
        return score;
    }

    #failedTxDedupeKey(ft) {
        if (ft?.transactionId) return `id:${ft.transactionId}`;
        return `text:${ft.description || ''}||${ft.destinationName || ''}`;
    }

    #collectFailedTransactionsForApi() {
        const persistentFailedTransactions = this.#failedTransactionService.getAllFailedTransactions();
        const jobs = Array.from(this.#jobList.getJobs().values());
        const recentFailedJobs = jobs.filter(job =>
            job.status === 'finished' &&
            (!job.data?.category || job.data.category === null)
        );

        const recentFailedTransactions = recentFailedJobs.map(job => ({
            id: job.id,
            description: job.data?.description || '',
            destinationName: job.data?.destinationName || '',
            sourceName: job.data?.sourceName || '',
            amount: job.data?.amount ?? null,
            currencyCode: job.data?.currencyCode || null,
            foreignAmount: job.data?.foreignAmount ?? null,
            foreignCurrencyCode: job.data?.foreignCurrencyCode || null,
            transactionDate: job.data?.transactionDate || null,
            transactionType: job.data?.transactionType || null,
            categoryName: job.data?.categoryName || null,
            transactionId: job.data?.transactionId || null,
            created: job.created,
            prompt: job.data?.prompt || '',
            response: job.data?.response || '',
        }));

        const merged = new Map();
        for (const ft of [...recentFailedTransactions, ...persistentFailedTransactions]) {
            const key = this.#failedTxDedupeKey(ft);
            const existing = merged.get(key);
            if (!existing || this.#failedTxRichness(ft) > this.#failedTxRichness(existing)) {
                merged.set(key, ft);
            }
        }

        return Array.from(merged.values()).sort(
            (a, b) => new Date(b.created || 0) - new Date(a.created || 0)
        );
    }

    #persistEnrichedFailedTransaction(enriched) {
        const patch = {
            transactionId: enriched.transactionId,
            sourceName: enriched.sourceName,
            amount: enriched.amount,
            currencyCode: enriched.currencyCode,
            foreignAmount: enriched.foreignAmount,
            foreignCurrencyCode: enriched.foreignCurrencyCode,
            transactionDate: enriched.transactionDate,
            transactionType: enriched.transactionType,
            categoryName: enriched.categoryName,
        };

        const persisted = this.#failedTransactionService.getAllFailedTransactions()
            .some(p => p.id === enriched.id);
        if (persisted) {
            this.#failedTransactionService.patchFailedTransaction(enriched.id, patch);
        }

        const job = this.#jobList.getJobs().get(enriched.id);
        if (job?.data) {
            this.#jobList.updateJobData(enriched.id, { ...job.data, ...patch });
        }
    }

    #failedTxNeedsEnrich(ft) {
        return !ft?.transactionDate || !this.#failedTxHasValidAmount(ft) || !ft?.currencyCode;
    }

    #onApiVersion(req, res) {
        res.json({
            success: true,
            apiVersion: API_VERSION,
            capabilities: { failedTransactionEnrich: true },
        });
    }

    #failedTxEnrichSnapshot(ft) {
        return JSON.stringify({
            transactionId: ft?.transactionId != null ? String(ft.transactionId) : null,
            amount: ft?.amount ?? null,
            currencyCode: ft?.currencyCode ?? null,
            transactionDate: ft?.transactionDate ?? null,
        });
    }

    async #runFailedTransactionsEnrich(limit = 50) {
        const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
        const all = this.#collectFailedTransactionsForApi();
        const needsEnrich = all.filter(ft => this.#failedTxNeedsEnrich(ft));
        const batch = needsEnrich.slice(0, cap);
        let enriched = 0;
        let staleResolved = 0;
        let notFound = 0;
        let unchanged = 0;

        console.info(`📋 Enriching ${batch.length}/${needsEnrich.length} failed transactions from Firefly…`);

        for (const ft of batch) {
            const before = this.#failedTxEnrichSnapshot(ft);
            const { record, status } = await this.#enrichFailedTransactionFromFirefly(ft);
            const after = this.#failedTxEnrichSnapshot(record);

            if (status === 'updated') enriched++;
            else if (status === 'stale_resolved') staleResolved++;
            else if (status === 'not_found' || status === 'error') notFound++;
            else if (before === after) unchanged++;
            else if (!this.#failedTxNeedsEnrich(record)) enriched++;
            else unchanged++;
        }

        const stillNeed = this.#collectFailedTransactionsForApi().filter(ft => this.#failedTxNeedsEnrich(ft)).length;

        return {
            processed: batch.length,
            enriched,
            staleResolved,
            notFound,
            unchanged,
            remaining: stillNeed,
            needsTotal: needsEnrich.length,
        };
    }

    async #runFailedTransactionsEnrichPasses(limit = 100, maxPasses = 8) {
        const totals = {
            passes: 0,
            processed: 0,
            enriched: 0,
            staleResolved: 0,
            notFound: 0,
            unchanged: 0,
            remaining: 0,
            needsTotal: 0,
        };

        for (let pass = 0; pass < maxPasses; pass++) {
            const stats = await this.#runFailedTransactionsEnrich(limit);
            totals.passes++;
            totals.processed += stats.processed;
            totals.enriched += stats.enriched;
            totals.staleResolved += stats.staleResolved;
            totals.notFound += stats.notFound;
            totals.unchanged += stats.unchanged;
            totals.remaining = stats.remaining;
            totals.needsTotal = stats.needsTotal;

            const progress = stats.enriched + stats.staleResolved;
            if (stats.remaining === 0 || progress === 0) {
                break;
            }
        }

        return totals;
    }

    async #onGetFailedTransactions(req, res) {
        try {
            const enrichParam = Array.isArray(req.query.enrich) ? req.query.enrich[0] : req.query.enrich;
            const explicitEnrich =
                req.get('X-Enrich-Failed') === '1' ||
                enrichParam === '1' ||
                enrichParam === 'true';

            const all = this.#collectFailedTransactionsForApi();
            const needsTotal = all.filter(ft => this.#failedTxNeedsEnrich(ft)).length;
            const cap = explicitEnrich ? 100 : 25;

            let enrich = { processed: 0, enriched: 0, remaining: needsTotal, needsTotal };
            if (needsTotal > 0) {
                enrich = explicitEnrich
                    ? await this.#runFailedTransactionsEnrichPasses(req.query.limit ?? cap, 8)
                    : await this.#runFailedTransactionsEnrich(req.query.limit ?? cap);
            }

            res.json({
                success: true,
                apiVersion: API_VERSION,
                capabilities: { failedTransactionEnrich: true },
                failedTransactions: this.#collectFailedTransactionsForApi(),
                enrich,
            });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onRefreshFailedTransactions(req, res) {
        try {
            const limit = Math.min(Math.max(parseInt(req.body?.limit ?? 100, 10) || 100, 1), 100);
            const enrich = await this.#runFailedTransactionsEnrichPasses(limit, 8);
            res.json({
                success: true,
                apiVersion: API_VERSION,
                capabilities: { failedTransactionEnrich: true },
                failedTransactions: this.#collectFailedTransactionsForApi(),
                enrich,
            });
        } catch (e) {
            console.error('Refresh failed transactions error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onEnrichFailedTransactions(req, res) {
        try {
            const enrich = await this.#runFailedTransactionsEnrich(req.body?.limit ?? req.query?.limit ?? 50);
            res.json({ success: true, ...enrich });
        } catch (e) {
            console.error('Enrich failed transactions error:', e);
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

    /** Snapshot fields for failed-transaction cards (from Firefly journal line or webhook payload). */
    #buildFailedTransactionRecord(firstTx, meta = {}) {
        const tx = firstTx || {};
        return {
            id: meta.id,
            created: meta.created,
            prompt: meta.prompt || '',
            response: meta.response || '',
            transactionId: meta.transactionId ?? null,
            description: meta.description ?? tx.description ?? '',
            destinationName: meta.destinationName ?? tx.destination_name ?? '',
            sourceName: tx.source_name || '',
            amount: tx.amount != null && tx.amount !== '' ? String(tx.amount) : null,
            currencyCode: tx.currency_code || null,
            foreignAmount: tx.foreign_amount != null && tx.foreign_amount !== '' ? String(tx.foreign_amount) : null,
            foreignCurrencyCode: tx.foreign_currency_code || null,
            transactionDate: tx.date || tx.book_date || tx.process_date || null,
            transactionType: tx.type || null,
            categoryName: tx.category_name || null,
        };
    }

    #failedTxHasValidAmount(ft) {
        if (ft?.amount == null || ft.amount === '') return false;
        const n = parseFloat(String(ft.amount).replace(',', '.'));
        return Number.isFinite(n);
    }

    async #searchFireflyTransactionId(ft, { strictDestination = true } = {}) {
        const desc = String(ft?.description || '').trim();
        if (!desc) return null;

        const queries = [desc];
        const shortDesc = desc.split(',')[0].trim();
        if (shortDesc && shortDesc !== desc) queries.push(shortDesc);
        const dest = String(ft?.destinationName || '').trim();
        if (dest && !queries.includes(dest)) queries.push(dest);

        const seenIds = new Set();

        for (const query of queries) {
            try {
                const hits = await this.#firefly.searchTransactions(query, { limit: 25 });
                for (const hit of hits) {
                    const id = hit?.id != null ? String(hit.id) : null;
                    if (!id || seenIds.has(id)) continue;
                    seenIds.add(id);

                    const journal = hit?.attributes?.transactions?.[0];
                    if (!journal) continue;

                    const hitDesc = String(journal.description || '').trim();
                    const descMatch = hitDesc === desc
                        || hitDesc.toLowerCase().includes(desc.toLowerCase())
                        || desc.toLowerCase().includes(hitDesc.toLowerCase());
                    if (!descMatch) continue;

                    if (strictDestination && dest) {
                        const destLower = dest.toLowerCase();
                        const hitDest = String(journal.destination_name || '').trim().toLowerCase();
                        const hitSrc = String(journal.source_name || '').trim().toLowerCase();
                        if (hitDest !== destLower && hitSrc !== destLower) continue;
                    }

                    return id;
                }
            } catch (error) {
                console.warn(`Failed transaction search for "${query}":`, error.message);
            }
        }

        return null;
    }

    async #fetchFireflyJournal(transactionId) {
        const data = await this.#firefly.getTransaction(transactionId);
        return data?.data?.attributes?.transactions?.[0] || null;
    }

    /** Fill missing booking date / amount from Firefly (by ID, search after stale ID, or search). */
    async #enrichFailedTransactionFromFirefly(ft) {
        if (!this.#failedTxNeedsEnrich(ft)) {
            return { record: ft, status: 'complete' };
        }

        let transactionId = ft.transactionId != null ? String(ft.transactionId) : null;
        let staleId = false;
        let firstTx = null;

        if (transactionId) {
            try {
                firstTx = await this.#fetchFireflyJournal(transactionId);
            } catch (error) {
                if (error?.code === 404) {
                    console.info(`📋 Stale Firefly id ${transactionId} for "${ft.description}" — searching again`);
                    staleId = true;
                    transactionId = null;
                } else {
                    console.warn(`Could not load transaction ${transactionId}:`, error.message);
                    return { record: ft, status: 'error' };
                }
            }
        }

        if (!firstTx) {
            transactionId = await this.#searchFireflyTransactionId(ft, { strictDestination: true });
            if (!transactionId) {
                transactionId = await this.#searchFireflyTransactionId(ft, { strictDestination: false });
            }
            if (!transactionId) {
                return { record: ft, status: 'not_found' };
            }
            try {
                firstTx = await this.#fetchFireflyJournal(transactionId);
            } catch (error) {
                console.warn(`Could not load matched transaction ${transactionId}:`, error.message);
                return { record: ft, status: 'not_found' };
            }
        }

        if (!firstTx) {
            return { record: ft, status: 'not_found' };
        }

        const enriched = {
            ...ft,
            ...this.#buildFailedTransactionRecord(firstTx, {
                id: ft.id,
                created: ft.created,
                prompt: ft.prompt,
                response: ft.response,
                transactionId,
                description: ft.description,
                destinationName: ft.destinationName,
            }),
        };

        this.#persistEnrichedFailedTransaction(enriched);

        if (!this.#failedTxNeedsEnrich(enriched)) {
            return { record: enriched, status: staleId ? 'stale_resolved' : 'updated' };
        }

        if (this.#failedTxEnrichSnapshot(ft) === this.#failedTxEnrichSnapshot(enriched)) {
            return { record: enriched, status: 'unchanged' };
        }

        return { record: enriched, status: staleId ? 'stale_resolved' : 'updated' };
    }

    /**
     * Categorization pipeline:
     * 1. Account mapping — hard 1:1 assignment (skips AI and all other rules)
     * 2. Auto-categorization (foreign/travel)
     * 3. AI — keyword mappings only replace the description hint for OpenAI
     */
    async #resolveCategory(transaction, categories) {
        const firstTx = transaction?.attributes?.transactions?.[0] || {};
        const description = firstTx.description || '(no description)';
        const destinationName = firstTx.destination_name || '(unknown destination)';
        const transactionType = firstTx.type || 'withdrawal';
        const categoryNames = Array.from(categories.keys());

        const accountCategoryResult = this.#accountCategoryMappingService.categorizeTransaction(transaction);
        if (accountCategoryResult) {
            if (categories.has(accountCategoryResult.category)) {
                return {
                    category: accountCategoryResult.category,
                    prompt: `Account mapped: ${accountCategoryResult.reason}`,
                    response: `Assigned "${accountCategoryResult.category}" via account mapping: ${accountCategoryResult.mappingName}`,
                    autoRule: accountCategoryResult.autoRule,
                };
            }
            console.warn(
                `⚠️ Account mapping matched "${accountCategoryResult.accountName}" but category "${accountCategoryResult.category}" was not found in Firefly`
            );
        }

        const autoResult = this.#autoCategorizationService.autoCategorize(transaction);
        if (autoResult && categories.has(autoResult.category)) {
            return {
                category: autoResult.category,
                prompt: `Auto-categorized: ${autoResult.reason}`,
                response: `Automatically categorized as "${autoResult.category}" using rule: ${autoResult.autoRule}`,
                autoRule: autoResult.autoRule,
            };
        }

        let mappedDescription = this.#wordMapping.applyMappings(description);
        const mappedDestinationName = this.#wordMapping.applyMappings(destinationName);
        const aiHint = this.#categoryMappingService.getAiHint(transaction);
        const classifyOptions = {};
        if (aiHint?.descriptionHint) {
            mappedDescription = aiHint.descriptionHint;
            classifyOptions.suggestedCategory = aiHint.suggestedCategory;
            console.info(
                `🔍 AI keyword hint: "${description}" → description "${aiHint.descriptionHint}" (mapping "${aiHint.mappingName}")`
            );
        }

        const aiResult = await this.#retryWithBackoff(async () => {
            return await this.#openAi.classify(
                categoryNames,
                mappedDestinationName,
                mappedDescription,
                transactionType,
                classifyOptions
            );
        });

        if (aiResult?.category && categories.has(aiResult.category)) {
            return {
                category: aiResult.category,
                prompt: aiResult.prompt,
                response: aiResult.response,
                autoRule: aiHint ? 'category_mapping_hint' : null,
            };
        }

        return {
            category: null,
            prompt: aiResult?.prompt || '',
            response: aiResult?.response || '',
            autoRule: null,
        };
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
            const firstTransaction = transaction.attributes.transactions[0];
            const destinationName = firstTransaction.destination_name || "(unknown destination)";
            const description = firstTransaction.description || "(no description)";

            const resolved = await this.#resolveCategory(transaction, categories);
            const category = resolved.category;
            const result = {
                category,
                prompt: resolved.prompt,
                response: resolved.response,
            };

            if (resolved.autoRule === 'account_category_mapping' && category) {
                console.info(`🏷️ Account mapped batch transaction ${transaction.id}: "${description}" → "${category}"`);
            } else if (category) {
                console.info(`✅ Batch transaction ${transaction.id}: "${description}" → "${category}"`);
            }

            if (!category) {
                console.warn(`⚠️ Could not classify transaction ${transaction.id}: ${description}`);
                
                // Save to failed transactions
                this.#failedTransactionService.addFailedTransaction(
                    this.#buildFailedTransactionRecord(firstTransaction, {
                        id: `batch-${transaction.id}-${Date.now()}`,
                        created: new Date().toISOString(),
                        prompt: result?.prompt || '',
                        response: result?.response || '',
                        transactionId: transaction.id,
                    })
                );
                
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

    #extractionAiAllowed(req) {
        return String(process.env.EXTRACT_ALLOW_AI || '') === '1'
            || req.query?.allowAi === '1'
            || req.body?.allowAi === '1';
    }

    /** One parser path for single + batch (deterministic unless EXTRACT_ALLOW_AI=1). */
    async #parseUploadedStatementFile(file, { allowAi = false } = {}) {
        const name = (file.originalname || '').toLowerCase();
        const mime = file.mimetype || '';
        let items = [];
        let parseMode = 'unknown';
        if (mime.includes('csv') || name.endsWith('.csv')) {
            items = this.#transactionExtractionService.parseCsv(
                file.buffer,
                this.#transactionExtractionService.getConfig().headerMapping
            );
            parseMode = 'csv';
        } else if (mime.includes('pdf') || name.endsWith('.pdf')) {
            const useAi = Boolean(allowAi);
            parseMode = useAi ? 'ai' : 'deterministic';
            items = await this.#transactionExtractionService.parsePdf(
                file.buffer,
                useAi ? this.#openAi : null,
                { forceAI: useAi }
            );
        } else {
            throw new Error('Unsupported file type. Use CSV or PDF.');
        }
        const markedItems = markSettlementLines(items);
        const totals = buildExtractionTotals(markedItems);
        const previewItems = itemsForPreview(markedItems);
        const hiddenItems = hiddenSettlementItems(markedItems);
        return { markedItems: previewItems, hiddenItems, parseMode, parsedCount: markedItems.length, ...totals };
    }

    // ===== Extraction: Upload & Preview =====
    async #onExtractionUpload(req, res) {
        try {
            const file = req.file;
            const { originalTransactionId, tag = this.#transactionExtractionService.getConfig().defaultTag } = req.body || {};
            if (!file) return res.status(400).json({ success: false, error: 'file is required (csv or pdf)' });
            if (!originalTransactionId) return res.status(400).json({ success: false, error: 'originalTransactionId is required' });

            const allowAi = this.#extractionAiAllowed(req);
            const parsed = await this.#parseUploadedStatementFile(file, { allowAi });
            const { markedItems: itemsForPreview, hiddenItems, parseMode, sum, lineSum, statementTotal, hiddenSettlementLines, parsedCount } = parsed;
            try {
                console.info('extraction-upload-ok', {
                    mimetype: file.mimetype,
                    name: file.originalname,
                    items: itemsForPreview.length,
                    parsedCount,
                    hiddenSettlementLines,
                    parseMode,
                    allowAi,
                    sum,
                    lineSum,
                    statementTotal
                });
            } catch(_) {}

            // Fetch original for comparison
            const originalData = await this.#firefly.getTransaction(originalTransactionId);
            const firstTx = originalData.data.attributes.transactions[0];
            // Guard: prevent using correction clone as original
            if (Array.isArray(firstTx.tags) && firstTx.tags.includes('value-correction-clone')) {
                return res.status(400).json({ success: false, error: 'Selected transaction is a correction clone and cannot be used as original.' });
            }
            const originalAbs = Math.abs(parseFloat(firstTx.amount));
            const alreadyExtracted = Array.isArray(firstTx.tags) && firstTx.tags.includes('already-extracted-original');
            const diff = Number((originalAbs - sum).toFixed(2));
            const parentTag = this.#buildEnglishParentTag(firstTx, originalTransactionId);
            const tagClean = this.#transactionExtractionService.sanitizeTag(tag);
            // Extend alreadyExtracted detection by checking for existing children tagged with parentTag
            let alreadyExtractedFinal = alreadyExtracted;
            if (!alreadyExtractedFinal) {
                try {
                    const existing = await this.#firefly.getTransactionsByTag(parentTag, { limit: 5 });
                    if (Array.isArray(existing) && existing.some(t => String(t.id) !== String(originalTransactionId))) {
                        alreadyExtractedFinal = true;
                    }
                } catch (_) {}
            }

            res.json({
                success: true,
                preview: {
                    items: itemsForPreview,
                    hiddenItems: hiddenItems || [],
                    totals: { original: originalAbs, sum, diff, lineSum, statementTotal, hiddenSettlementLines },
                    meta: { originalTransactionId, parentTag, tag: tagClean, alreadyExtracted: alreadyExtractedFinal, statementTotal, lineSum, parseMode, hiddenSettlementLines, parsedCount }
                }
            });
        } catch (e) {
            console.error('Extraction upload error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    // ===== Extraction: Confirm & Save =====
    async #onExtractionConfirm(req, res) {
        try {
            console.info('extraction-confirm-start', { hasBody: !!req.body, items: Array.isArray(req.body?.items) ? req.body.items.length : 0, originalTransactionId: req.body?.originalTransactionId });
            const { originalTransactionId, items, authoritativeSum, tag, proceedOnMismatch = false, force = false, useAiMerchant = false } = req.body || {};
            if (!originalTransactionId || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ success: false, error: 'originalTransactionId and items[] are required' });
            }

            // Get categories once (for optional categorization later) — here we just prepare list
            const categories = await this.#firefly.getCategories();

            // Load original transaction
            const data = await this.#firefly.getTransaction(originalTransactionId);
            const firstTx = data.data.attributes.transactions[0];
            // Idempotency guard: block double-apply unless forced
            const alreadyExtracted = Array.isArray(firstTx.tags) && firstTx.tags.includes('already-extracted-original');
            // Guard: prevent using correction clone as original
            if (Array.isArray(firstTx.tags) && firstTx.tags.includes('value-correction-clone')) {
                return res.status(400).json({ success: false, error: 'Selected transaction is a correction clone and cannot be used as original.' });
            }
            const parentTag = this.#buildEnglishParentTag(firstTx, originalTransactionId);
            let hasChildrenByTag = false;
            if (!alreadyExtracted) {
                try {
                    const existing = await this.#firefly.getTransactionsByTag(parentTag, { limit: 5 });
                    if (Array.isArray(existing) && existing.some(t => String(t.id) !== String(originalTransactionId))) {
                        hasChildrenByTag = true;
                    }
                } catch (_) {}
            }
            if ((alreadyExtracted || hasChildrenByTag) && !force) {
                return res.status(409).json({ success: false, error: 'This original transaction was already extracted (detected by tag/children). Use force to proceed.' });
            }
            const originalAbs = Math.abs(parseFloat(firstTx.amount));

            // Use authoritative sum from preview if provided to keep parity with what user saw
            let total = (authoritativeSum != null && !isNaN(Number(authoritativeSum))) ? Number(Number(authoritativeSum).toFixed(2)) : null;
            if (total == null) {
                total = computeExtractionDisplaySum(markSettlementLines(items));
            }
            const diff = Number((originalAbs - total).toFixed(2));
            if (Math.abs(diff) >= 0.01 && !proceedOnMismatch) {
                return res.status(400).json({ success: false, error: `Sum mismatch: ${diff}`, diff });
            }

            const splitTags = this.#buildSplitChildTags(tag, parentTag);

            // Create child transactions with proper account linkage
            const createdTransactions = [];
            const merchantEvents = new Map();
            const categoryNames = Array.from(categories.keys());
            const groupCreatedIds = [];
            let correctionCloneId = null;
            try {
            // Use exactly the items[] from the client active table (no regex re-filter).
            for (const it of items) {
                const isDeposit = (it.direction === 'in');
                // Normalize amount (accept comma decimals)
                const normAmount = (() => {
                    if (typeof it.amount === 'number') return it.amount;
                    const raw = String(it.amount ?? '').trim().replace(/\u00A0/g, '').replace(/\s+/g, '').replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
                    const n = Number(raw);
                    return Number.isFinite(n) ? n : NaN;
                })();
                if (!Number.isFinite(normAmount)) {
                    throw { code: 400, message: `Invalid amount in one of the items`, body: 'Invalid amount' };
                }
                const base = {
                    type: isDeposit ? 'deposit' : 'withdrawal',
                    date: it.date || firstTx.date,
                    description: it.description,
                    amount: Math.abs(Number(normAmount)).toFixed(2),
                    currency_code: firstTx.currency_code,
                    tags: splitTags
                };
                try {
                    const destName = it.destination_name || it.description || '';
                    const fakeTx = {
                        attributes: {
                            transactions: [{
                                type: base.type,
                                description: it.description || '',
                                destination_name: destName,
                                currency_code: firstTx.currency_code,
                                foreign_currency_code: firstTx.foreign_currency_code,
                                foreign_amount: firstTx.foreign_amount,
                            }],
                        },
                    };
                    const resolved = await this.#resolveCategory(fakeTx, categories);
                    if (resolved.category) {
                        base.category_id = categories.get(resolved.category);
                    }
                } catch (_) {}
                // Set counterparty side (merchant revenue/expense) and resolve asset binding from original
                const merchantName = it.destination_name || it.description;
                if (isDeposit) {
                    // deposit: revenue -> asset
                    base.source_name = merchantName; // revenue by name
                    // Try AI-assisted merchant account match (revenue)
                    try {
                        if (useAiMerchant && this.#openAi && merchantName) {
                            const accs = await this.#firefly.listAccountsBasicByType('revenue');
                            const pick = await this.#openAi.matchAccount(accs.map(a => a.name), merchantName, it.description || '', 'deposit');
                            const chosen = accs.find(a => a.name === pick.name);
                            if (chosen && chosen.id) {
                                base.source_id = chosen.id; delete base.source_name;
                                merchantEvents.set(merchantName, { name: merchantName, type: 'revenue', created: false, matched: 'ai', id: chosen.id, confidence: Number(pick.confidence || 0) });
                                try { console.info('ai-merchant-match', { side: 'source', type: 'revenue', merchant: merchantName, chosen: chosen.name, id: chosen.id, confidence: pick.confidence }); } catch(_) {}
                            } else {
                                try { console.info('ai-merchant-no-match', { side: 'source', type: 'revenue', merchant: merchantName }); } catch(_) {}
                            }
                        }
                    } catch (_) {}
                    Object.assign(base, await this.#resolveAssetBinding(firstTx, true)); // sets destination_id/name
                } else {
                    // withdrawal: asset -> expense
                    base.destination_name = merchantName; // expense by name
                    // Try AI-assisted merchant account match (expense)
                    try {
                        if (useAiMerchant && this.#openAi && merchantName) {
                            const accs = await this.#firefly.listAccountsBasicByType('expense');
                            const pick = await this.#openAi.matchAccount(accs.map(a => a.name), merchantName, it.description || '', 'withdrawal');
                            const chosen = accs.find(a => a.name === pick.name);
                            if (chosen && chosen.id) {
                                base.destination_id = chosen.id; delete base.destination_name;
                                merchantEvents.set(merchantName, { name: merchantName, type: 'expense', created: false, matched: 'ai', id: chosen.id, confidence: Number(pick.confidence || 0) });
                                try { console.info('ai-merchant-match', { side: 'destination', type: 'expense', merchant: merchantName, chosen: chosen.name, id: chosen.id, confidence: pick.confidence }); } catch(_) {}
                            } else {
                                try { console.info('ai-merchant-no-match', { side: 'destination', type: 'expense', merchant: merchantName }); } catch(_) {}
                            }
                        }
                    } catch (_) {}
                    Object.assign(base, await this.#resolveAssetBinding(firstTx, false)); // sets source_id/name
                }
                try {
                    const resp = await this.#firefly.createTransactions([ base ]);
                    const tid = this.#requireCreatedTransactionId(resp, 'split-child');
                    groupCreatedIds.push(tid);
                    createdTransactions.push({ id: tid, ...base });
                } catch (e) {
                    const msg = String(e?.body || e?.message || '').toLowerCase();
                    if ((e?.code === 422) && (msg.includes('destination') || msg.includes('source'))) {
                        const retry = { ...base };
                        const merchantSide = (msg.includes('destination') && !isDeposit) || (msg.includes('source') && isDeposit);
                        if (merchantSide) {
                            const merchant = it.destination_name || it.description;
                            const acctType = isDeposit ? 'revenue' : 'expense';
                            const details = await this.#firefly.ensureAccountDetailed(merchant, acctType);
                            if (details && details.id) {
                                merchantEvents.set(merchant, { name: merchant, type: acctType, created: !!details.created, matched: details.matched || null, id: details.id });
                            }
                            if (isDeposit) {
                                retry.source_id = details.id;
                                delete retry.source_name;
                            } else {
                                retry.destination_id = details.id;
                                delete retry.destination_name;
                            }
                        } else {
                            const assetResolved = await this.#resolveAssetBinding(firstTx, isDeposit);
                            if (isDeposit) {
                                delete retry.destination_id; delete retry.destination_name;
                            } else {
                                delete retry.source_id; delete retry.source_name;
                            }
                            Object.assign(retry, assetResolved);
                        }
                        const resp2 = await this.#firefly.createTransactions([ retry ]);
                        const tid2 = this.#requireCreatedTransactionId(resp2, 'split-child-retry');
                        groupCreatedIds.push(tid2);
                        createdTransactions.push({ id: tid2, ...retry });
                    } else {
                        throw e;
                    }
                }
            }

            if (groupCreatedIds.length === 0) {
                throw { code: 400, message: 'No transactions were created from the parsed rows', body: 'No transactions created' };
            }
            ({ correctionCloneId } = await this.#finalizeExtractionGroup(originalTransactionId, data.data, firstTx, parentTag));
            } catch (confirmErr) {
                const rb = await this.#rollbackExtractionGroup({
                    childTransactionIds: groupCreatedIds,
                    correctionCloneId,
                    originalTransactionId,
                    untagExtracted: true
                });
                const errMsg = confirmErr?.body || confirmErr?.message || String(confirmErr);
                try { console.error('extraction-confirm-rolled-back', { originalTransactionId, rolledBack: rb.deleted, error: errMsg }); } catch (_) {}
                const code = (confirmErr && typeof confirmErr.code === 'number') ? confirmErr.code : 500;
                return res.status(code === 409 || code === 422 ? code : 500).json({
                    success: false,
                    error: typeof errMsg === 'string' ? errMsg : String(errMsg),
                    rolledBack: rb.deleted
                });
            }

            const responsePayload = { success: true, created: items.length, diff, correctionCloneId, merchants: Array.from(merchantEvents.values()), transactions: createdTransactions };
            try { console.info('extraction-confirm-success', { originalTransactionId, created: items.length, txIds: createdTransactions.map(t => t.id) }); } catch(_) {}
            res.json(responsePayload);
        } catch (e) {
            try { console.error('Extraction confirm error:', e?.message || e, e?.body || ''); } catch(_) {}
            const code = (e && typeof e.code === 'number') ? e.code : null;
            if (code === 409 || code === 422) {
                return res.status(code).json({ success: false, error: e?.body || e?.message || 'Confirm failed' });
            }
            res.status(500).json({ success: false, error: e?.body || e?.message || 'Confirm failed' });
        }
    }

    /** Firefly III POST /transactions returns TransactionSingle: { data: { id } }, not an array. */
    #parseCreatedTransactionId(resp) {
        const d = resp?.data;
        if (!d) return null;
        if (Array.isArray(d)) return d[0]?.id != null ? String(d[0].id) : null;
        if (typeof d === 'object' && d.id != null) return String(d.id);
        return null;
    }

    #requireCreatedTransactionId(resp, context = 'transaction') {
        const id = this.#parseCreatedTransactionId(resp);
        if (id) return id;
        let sample = '';
        try { sample = JSON.stringify(resp?.data).slice(0, 400); } catch (_) {}
        try { console.error('create-transaction-missing-id', { context, sample }); } catch (_) {}
        throw new Error(`Firefly created ${context} but API response had no transaction id`);
    }

    #buildSplitChildTags(userTag, parentTag) {
        const extra = this.#transactionExtractionService.sanitizeTag(
            userTag || this.#transactionExtractionService.getConfig().defaultTag
        );
        return Array.from(new Set([CREDITCARD_SPLIT_TAG, extra, parentTag].filter(Boolean)));
    }

    #collectExtractionLinkTags(firstTx, originalTransactionId) {
        const tags = new Set();
        const computed = this.#buildEnglishParentTag(firstTx, originalTransactionId);
        if (computed) tags.add(computed);
        for (const t of firstTx?.tags || []) {
            if (typeof t === 'string' && CREDIT_CARD_LINK_TAG_RE.test(t)) {
                tags.add(t);
            }
        }
        return Array.from(tags);
    }

    #extractionTagsToClear(parentTags) {
        const linkTags = Array.isArray(parentTags) ? parentTags : [parentTags];
        return Array.from(new Set([
            'already-extracted-original',
            CREDITCARD_SPLIT_TAG,
            'card-statement-split',
            ...linkTags
        ].filter(Boolean)));
    }

    #isCandidateDateAcceptableForStatement(candidateDate, maxStatementDate, graceBeforeDays, maxDaysAfter = STATEMENT_BILLING_MAX_DAYS_AFTER) {
        if (!candidateDate || !maxStatementDate) return true;
        if (isNaN(candidateDate.getTime()) || isNaN(maxStatementDate.getTime())) return true;
        const minAllowed = new Date(maxStatementDate.getTime() - graceBeforeDays * 24 * 60 * 60 * 1000);
        const maxAllowed = new Date(maxStatementDate.getTime() + maxDaysAfter * 24 * 60 * 60 * 1000);
        return candidateDate.getTime() >= minAllowed.getTime() && candidateDate.getTime() <= maxAllowed.getTime();
    }

    /** Date OK if settlement falls within window of last line date and/or PDF filename billing date. */
    #isBatchDateAcceptable(candidateDate, maxLineDate, fileDate, graceBeforeDays, maxDaysAfter = STATEMENT_BILLING_MAX_DAYS_AFTER) {
        const anchors = [];
        if (maxLineDate && !isNaN(maxLineDate.getTime())) anchors.push(maxLineDate);
        if (fileDate && !isNaN(fileDate.getTime())) anchors.push(fileDate);
        if (!anchors.length) return true;
        if (!candidateDate || isNaN(candidateDate.getTime())) return true;
        return anchors.some(a => this.#isCandidateDateAcceptableForStatement(candidateDate, a, graceBeforeDays, maxDaysAfter));
    }

    #batchMatchScore(diff, days) {
        return Math.abs(diff) + Math.min(days, 120) * 2;
    }

    #buildBatchMatchHints(g, candidates, maxLineDate, fileDate, graceBeforeDays, maxDaysAfter, maxAbsDiff, maxRelDiff) {
        return candidates.map(c => {
            const diff = Number((c.amountAbs - g.sum).toFixed(2));
            const rel = c.amountAbs ? Math.abs(diff) / c.amountAbs : 1;
            const dateAcceptable = this.#isBatchDateAcceptable(c.date, maxLineDate, fileDate, graceBeforeDays, maxDaysAfter);
            const amountAcceptable = (Math.abs(diff) <= maxAbsDiff) || (rel <= maxRelDiff);
            const reasons = [];
            if (!dateAcceptable) reasons.push('date-outside-window');
            if (!amountAcceptable) reasons.push(`amount-diff-${diff}`);
            return {
                candidateId: c.id,
                originalAmount: c.amountAbs,
                pdfSum: g.sum,
                diff,
                rel: Number(rel.toFixed(4)),
                dateAcceptable,
                amountAcceptable,
                candidateDate: c.date && !isNaN(c.date.getTime()) ? c.date.toISOString().slice(0, 10) : null,
                reasons
            };
        });
    }

    #summarizeFireflyTransaction(t) {
        const ft = t.attributes.transactions[0];
        return {
            id: t.id,
            description: ft.description || '',
            date: ft.date || '',
            type: ft.type,
            amount: parseFloat(ft.amount),
            tags: Array.isArray(ft.tags) ? ft.tags : []
        };
    }

    async #findExtractionGroupMembers(originalTransactionId) {
        const data = await this.#firefly.getTransaction(originalTransactionId);
        const firstTx = data.data.attributes.transactions[0];
        const linkTags = this.#collectExtractionLinkTags(firstTx, originalTransactionId);
        const parentTag = linkTags[0] || this.#buildEnglishParentTag(firstTx, originalTransactionId);
        const originalDate = (firstTx.date || '').slice(0, 10);
        const originalAbs = Math.abs(parseFloat(firstTx.amount || 0)).toFixed(2);
        const linkTagSet = new Set(linkTags);

        const children = [];
        const correctionClones = [];
        const items = [];
        const seen = new Set([String(originalTransactionId)]);

        const register = (t, role) => {
            const id = String(t.id);
            if (seen.has(id)) return;
            seen.add(id);
            const summary = { ...this.#summarizeFireflyTransaction(t), role };
            items.push(summary);
            if (role === 'correction') correctionClones.push(t.id);
            else children.push(t.id);
        };

        for (const tag of linkTags) {
            try {
                const byParent = await this.#firefly.getTransactionsByTag(tag, { limit: 500 });
                for (const t of byParent) {
                    if (String(t.id) === String(originalTransactionId)) continue;
                    const tags = t.attributes.transactions[0].tags || [];
                    register(t, tags.includes('value-correction-clone') ? 'correction' : 'child');
                }
            } catch (_) {}
        }

        if (correctionClones.length === 0) {
            try {
                const clones = await this.#firefly.getTransactionsByTag('value-correction-clone', { limit: 300 });
                for (const t of clones) {
                    if (seen.has(String(t.id))) continue;
                    const ft = t.attributes.transactions[0];
                    const d = (ft.date || '').slice(0, 10);
                    const amt = Math.abs(parseFloat(ft.amount || 0)).toFixed(2);
                    const cloneTags = ft.tags || [];
                    const sharesLinkTag = cloneTags.some(tag => linkTagSet.has(tag));
                    if (sharesLinkTag || (d === originalDate && amt === originalAbs)) {
                        register(t, 'correction');
                    }
                }
            } catch (_) {}
        }

        const originalMarked = Array.isArray(firstTx.tags) && firstTx.tags.includes('already-extracted-original');
        if (children.length === 0 && originalMarked) {
            for (const legacyTag of [CREDITCARD_SPLIT_TAG, 'card-statement-split']) {
                try {
                    const list = await this.#firefly.getTransactionsByTag(legacyTag, { limit: 500 });
                    for (const t of list) {
                        if (seen.has(String(t.id))) continue;
                        const ft = t.attributes.transactions[0];
                        const rowTags = ft.tags || [];
                        if (rowTags.includes('value-correction-clone')) continue;
                        const sharesLinkTag = rowTags.some(tag => linkTagSet.has(tag));
                        const sameDay = (ft.date || '').slice(0, 10) === originalDate;
                        if (!sharesLinkTag && !sameDay) continue;
                        register(t, 'child');
                    }
                } catch (_) {}
            }
        }

        return {
            originalTransactionId,
            parentTag,
            linkTags,
            original: {
                id: originalTransactionId,
                description: firstTx.description || '',
                date: firstTx.date || '',
                type: firstTx.type,
                amount: parseFloat(firstTx.amount),
                tags: Array.isArray(firstTx.tags) ? firstTx.tags : []
            },
            children,
            correctionClones,
            items,
            tagsToRemoveFromOriginal: this.#extractionTagsToClear(linkTags)
        };
    }

    async #revertExtractionGroup(originalTransactionId, options = {}) {
        const {
            childTransactionIds = null,
            correctionCloneId = null,
            untagOriginal = true
        } = options;

        const data = await this.#firefly.getTransaction(originalTransactionId);
        const firstTx = data.data.attributes.transactions[0];
        const linkTags = this.#collectExtractionLinkTags(firstTx, originalTransactionId);
        const parentTag = linkTags[0] || this.#buildEnglishParentTag(firstTx, originalTransactionId);

        let childIds = [];
        let cloneIds = [];
        let discoveredItems = [];

        if (Array.isArray(childTransactionIds) && childTransactionIds.length) {
            childIds = [...childTransactionIds];
            if (correctionCloneId) cloneIds = [correctionCloneId];
        } else {
            const group = await this.#findExtractionGroupMembers(originalTransactionId);
            childIds = group.children;
            cloneIds = group.correctionClones;
            discoveredItems = group.items;
        }

        const toDelete = [...new Set(
            [...childIds, ...cloneIds]
                .map(id => String(id))
                .filter(id => id && id !== String(originalTransactionId))
        )];

        const rb = await this.#rollbackCreatedTransactions(toDelete);
        const tagsToRemove = this.#extractionTagsToClear(linkTags);
        let untagFailed = null;
        if (untagOriginal) {
            try {
                await this.#removeTagsFromTransaction(originalTransactionId, tagsToRemove);
            } catch (e) {
                untagFailed = e.message || String(e);
            }
        }

        return {
            deleted: rb.deleted,
            failed: rb.failed,
            deletedIds: toDelete,
            tagsRemovedFromOriginal: untagOriginal ? tagsToRemove : [],
            untagFailed,
            parentTag,
            discoveredItems
        };
    }

    async #onExtractionRevertPreview(req, res) {
        try {
            const { originalTransactionId } = req.query || {};
            if (!originalTransactionId) {
                return res.status(400).json({ success: false, error: 'originalTransactionId is required' });
            }
            const preview = await this.#findExtractionGroupMembers(originalTransactionId);
            res.json({ success: true, preview });
        } catch (e) {
            console.error('Extraction revert-preview error:', e);
            res.status(500).json({ success: false, error: e.message || String(e) });
        }
    }

    async #onExtractionRevert(req, res) {
        try {
            const { originalTransactionId } = req.body || {};
            if (!originalTransactionId) {
                return res.status(400).json({ success: false, error: 'originalTransactionId is required' });
            }
            const result = await this.#revertExtractionGroup(originalTransactionId, { untagOriginal: true });
            try {
                console.info('extraction-revert', {
                    originalTransactionId,
                    deleted: result.deleted,
                    deletedIds: result.deletedIds
                });
            } catch (_) {}
            res.json({
                success: true,
                message: `Reverted split: deleted ${result.deleted} transaction(s), cleared tags on original`,
                ...result
            });
        } catch (e) {
            console.error('Extraction revert error:', e);
            res.status(500).json({ success: false, error: e.message || String(e) });
        }
    }

    #buildEnglishParentTag(firstTx, originalTransactionId) {
        try {
            const iso = (firstTx?.date || '').slice(0, 10);
            const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            const base = m
                ? `credit-card-statement-created-on-${m[3]}-${m[2]}-${m[1]}`
                : `credit-card-statement-${originalTransactionId}`;
            return this.#transactionExtractionService.sanitizeTag(base);
        } catch (_) {
            return this.#transactionExtractionService.sanitizeTag(`credit-card-statement-${originalTransactionId}`);
        }
    }

    #isAssetLikeAccount(acc) {
        const t = String(acc?.attributes?.type || acc?.type || '').toLowerCase();
        return t === 'asset' || t === 'liability';
    }

    async #rollbackCreatedTransactions(transactionIds) {
        const ids = [...new Set((transactionIds || []).map(id => String(id)).filter(Boolean))];
        if (!ids.length) return { deleted: 0, failed: [] };
        const failed = [];
        let deleted = 0;
        for (const id of ids) {
            try {
                await this.#firefly.deleteTransaction(id);
                deleted++;
            } catch (e) {
                failed.push({ id, error: e?.message || String(e) });
                try { console.error('rollback-delete-failed', { id, error: e?.message || e }); } catch (_) {}
            }
        }
        if (deleted) {
            try { console.info('confirm-rollback', { deleted, failed: failed.length }); } catch (_) {}
        }
        return { deleted, failed };
    }

    async #removeTagsFromTransaction(transactionId, tagsToRemove) {
        const remove = new Set((tagsToRemove || []).map(t => String(t)));
        if (!remove.size) return;
        const tx = await this.#firefly.getTransaction(transactionId);
        const transactions = tx.data.attributes.transactions.map(t => ({
            transaction_journal_id: t.transaction_journal_id,
            category_id: t.category_id || null,
            tags: (t.tags || []).filter(tag => !remove.has(tag))
        }));
        await this.#firefly.updateTransactions(transactionId, transactions);
    }

    /**
     * Roll back a partially applied extraction group: delete child + correction-clone
     * transactions and remove already-extracted-original from the original if set.
     */
    async #rollbackExtractionGroup({ childTransactionIds, correctionCloneId, originalTransactionId, untagExtracted }) {
        return this.#revertExtractionGroup(originalTransactionId, {
            childTransactionIds,
            correctionCloneId,
            untagOriginal: !!untagExtracted
        });
    }

    /**
     * Finalize after all split rows were created: tag original + mandatory value-correction-clone.
     * Must run only when childTransactionIds.length > 0. Untags original if clone creation fails.
     */
    async #finalizeExtractionGroup(originalTransactionId, originalData, firstTx, parentTag) {
        if (!originalTransactionId || !originalData) {
            throw new Error('finalizeExtractionGroup: missing original transaction');
        }
        const linkTag = parentTag || this.#buildEnglishParentTag(firstTx, originalTransactionId);
        let tagged = false;
        try {
            // Original keeps only the role marker. The link tag is recomputed
            // deterministically from the original's date during revert, so we
            // do not store it on the original to avoid tag sharing.
            await this.#tagTransaction(originalTransactionId, ['already-extracted-original']);
            tagged = true;
            const { id: correctionCloneId } = await this.#createCorrectionClone(
                originalData, firstTx, 'value-correction-clone', linkTag
            );
            if (!correctionCloneId) {
                throw new Error('value-correction-clone was not created');
            }
            return { correctionCloneId };
        } catch (e) {
            if (tagged) {
                try {
                    await this.#removeTagsFromTransaction(
                        originalTransactionId,
                        this.#extractionTagsToClear(linkTag)
                    );
                } catch (_) {}
            }
            throw e;
        }
    }

    async #resolveAssetBinding(firstTx, isDeposit) {
        // For deposits: need destination (asset). For withdrawals: need source (asset/liability).
        const want = isDeposit ? 'destination' : 'source';
        const other = isDeposit ? 'source' : 'destination';
        const candidates = [
            { id: firstTx[`${want}_id`], name: firstTx[`${want}_name`] },
            { id: firstTx[`${other}_id`], name: firstTx[`${other}_name`] },
        ];
        // Try by ID first — only accept asset/liability (original CC rows often reference expense IDs)
        for (const c of candidates) {
            if (c.id) {
                try {
                    const acc = await this.#firefly.getAccount(c.id);
                    if (acc && this.#isAssetLikeAccount(acc)) {
                        return { [`${want}_id`]: c.id };
                    }
                } catch (_) {
                    // ignore invalid/broken account IDs and continue trying other options
                }
            }
        }
        // Try by name across asset/liability
        for (const c of candidates) {
            if (c.name) {
                const foundId = await this.#firefly.findAccountIdByNameAcrossTypes(c.name, ['asset', 'liability']);
                if (foundId) {
                    return { [`${want}_id`]: foundId };
                }
            }
        }
        // Fallback to name if present
        for (const c of candidates) {
            if (c.name) {
                return { [`${want}_name`]: c.name };
            }
        }
        return {};
    }

    // ===== Extraction: Batch Upload =====
    async #onExtractionUploadBatch(req, res) {
        try {
            const files = req.files || [];
			let { candidateTransactionIds = [], dateWindowDays = 60, graceBeforeDays = 2, fast, forceAI } = req.body || {};
            if (!files.length) return res.status(400).json({ success: false, error: 'files[] is required' });
            try { console.info('batch-start', { files: files.length, dateWindowDays, graceBeforeDays }); } catch(_) {}

            // Normalize candidateTransactionIds from form-data (may be string/CSV/JSON)
            if (typeof candidateTransactionIds === 'string') {
                try {
                    const parsed = JSON.parse(candidateTransactionIds);
                    if (Array.isArray(parsed)) candidateTransactionIds = parsed;
                    else candidateTransactionIds = String(candidateTransactionIds).split(',').map(s => s.trim()).filter(Boolean);
                } catch (_) {
                    candidateTransactionIds = String(candidateTransactionIds).split(',').map(s => s.trim()).filter(Boolean);
                }
            }
			dateWindowDays = parseInt(dateWindowDays) || 60;
			graceBeforeDays = parseInt(graceBeforeDays);
			if (!Number.isFinite(graceBeforeDays) || graceBeforeDays < 0) graceBeforeDays = 2;

            if (Array.isArray(candidateTransactionIds) && candidateTransactionIds.length) {
                try { console.info('batch-start', { files: files.length, candidateTransactionIds, dateWindowDays, graceBeforeDays }); } catch (_) {}
            }

            // Parse all files first, collect date hints
            const tempGroups = [];
            let hintMinDate = null;
            let hintMaxDate = null;
            const force = req.body?.force || req.query?.force;
            // Helper to parse a YYYY-MM-DD or YYYYMMDD date from filename
            const parseDateFromName = (name) => {
                if (!name) return null;
                const m1 = name.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
                if (m1) {
                    const d = new Date(`${m1[1]}-${m1[2]}-${m1[3]}T00:00:00Z`);
                    return isNaN(d.getTime()) ? null : d;
                }
                return null;
            };

            const allowAi = this.#extractionAiAllowed(req);
            for (const file of files) {
                let markedItems;
                let hiddenItems;
                let sum;
                let lineSum;
                let statementTotal;
                let parseMode;
                let hiddenSettlementLines;
                let parsedCount;
                try {
                    const parsed = await this.#parseUploadedStatementFile(file, { allowAi });
                    ({ markedItems, hiddenItems, sum, lineSum, statementTotal, parseMode, hiddenSettlementLines, parsedCount } = parsed);
                } catch (parseErr) {
                    try { console.error('batch-file-parse-error', { file: file.originalname, error: parseErr?.message || String(parseErr) }); } catch (_) {}
                    continue;
                }
                const items = markedItems;
                // collect date hints
                let fMin = null, fMax = null;
                for (const it of items) {
                    if (!it.date) continue;
                    const d = new Date(it.date);
                    if (isFinite(d)) {
                        if (!hintMinDate || d < hintMinDate) hintMinDate = d;
                        if (!hintMaxDate || d > hintMaxDate) hintMaxDate = d;
                        if (!fMin || d < fMin) fMin = d;
                        if (!fMax || d > fMax) fMax = d;
                    }
                }
                const fileDate = parseDateFromName(file.originalname);
                tempGroups.push({ file, fileName: file.originalname, items: markedItems, hiddenItems: hiddenItems || [], sum, lineSum, statementTotal, fileDate, parseMode, hiddenSettlementLines, parsedCount });
                try {
                    console.info('batch-file-parsed', {
                        file: file.originalname,
                        items: items.length,
                        parsedCount,
                        hiddenSettlementLines,
                        parseMode,
                        sum: Number(sum.toFixed(2)),
                        lineSum: Number(lineSum.toFixed(2)),
                        statementTotal: statementTotal != null ? Number(statementTotal.toFixed(2)) : null,
                        hasDates: !!(fMin || fMax),
                        minDate: fMin ? fMin.toISOString().slice(0,10) : null,
                        maxDate: fMax ? fMax.toISOString().slice(0,10) : null,
                        fileDate: fileDate ? fileDate.toISOString().slice(0,10) : null
                    });
                } catch(_) {}
            }

            // Build candidate originals: either provided IDs or auto-search by date window
            const candidates = [];
            for (const id of Array.isArray(candidateTransactionIds) ? candidateTransactionIds : []) {
                try {
                    const tx = await this.#firefly.getTransaction(id);
                    const t = tx.data.attributes.transactions[0];
                    // Skip correction clones
                    if (Array.isArray(t.tags) && t.tags.includes('value-correction-clone')) continue;
                    const alreadyExtracted = Array.isArray(t.tags) && t.tags.includes('already-extracted-original');
                    candidates.push({ id, amountAbs: Math.abs(parseFloat(t.amount)), date: new Date(t.date), currency: t.currency_code, raw: tx.data, alreadyExtracted });
                } catch (e) { /* ignore invalid ids */ }
            }

            if (candidates.length === 0) {
                // Auto-search globally by date window around detected items (or around today if none)
                const baseMin = hintMinDate || new Date(Date.now() - dateWindowDays * 24 * 3600 * 1000);
                const baseMax = hintMaxDate || new Date(Date.now() + dateWindowDays * 24 * 3600 * 1000);
                const from = new Date(baseMin.getTime() - dateWindowDays * 24 * 3600 * 1000);
                const to = new Date(baseMax.getTime() + dateWindowDays * 24 * 3600 * 1000);
                const toIso = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
                const scoped = await this.#firefly.getTransactionsWithFilters({ type: 'all', dateFrom: toIso(from), dateTo: toIso(to) });
                for (const tr of scoped) {
                    const ft = tr.attributes.transactions[0];
                    // Skip correction clones
                    if (Array.isArray(ft.tags) && ft.tags.includes('value-correction-clone')) continue;
                    const d = ft?.date ? new Date(ft.date) : null;
                    const validDate = d && !isNaN(d.getTime()) ? d : null;
                    const alreadyExtracted = Array.isArray(ft.tags) && ft.tags.includes('already-extracted-original');
                    candidates.push({ id: tr.id, amountAbs: Math.abs(parseFloat(ft.amount)), date: validDate, currency: ft.currency_code, raw: tr, alreadyExtracted });
                }
            }

            const groups = [];

            // Matching thresholds (to avoid clearly wrong matches)
			const MAX_ABS_DIFF = 3.5;          // € tolerance
			const MAX_REL_DIFF = 0.01;         // 1%
			const GRACE_BEFORE_DAYS = graceBeforeDays; // allow small negative drift before last PDF date
            try {
                console.info('batch-thresholds', { MAX_ABS_DIFF, MAX_REL_DIFF, GRACE_BEFORE_DAYS, STATEMENT_BILLING_MAX_DAYS_AFTER, dateWindowDays });
                console.info('batch-candidates', {
                    requestedIds: candidateTransactionIds,
                    loaded: candidates.map(c => ({ id: c.id, amountAbs: c.amountAbs, date: c.date && !isNaN(c.date.getTime()) ? c.date.toISOString().slice(0, 10) : null }))
                });
            } catch(_) {}

            if ((Array.isArray(candidateTransactionIds) && candidateTransactionIds.length > 0) && candidates.length > 0) {
                // Priority mode: prioritize existing transactions (candidates). Assign files to candidates greedily.
                // Build all candidate-file pairs with scores
                const pairs = [];
                const bestByFile = new Map(); // gidx -> { candId, diff, rel, days, acceptable, score }
                const bestAnyByFile = new Map(); // ignoring date gating
                tempGroups.forEach((g, gidx) => {
                    // compute group reference date
                    let refDate = null;
					let maxDForGroup = null;
                    const dates = g.items
                        .map(i => (i.date ? new Date(i.date) : null))
                        .filter(d => d && !isNaN(d.getTime()));
                    if (dates.length) {
                        const minD = dates.reduce((a, b) => (a.getTime() < b.getTime() ? a : b));
                        const maxD = dates.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));
                        refDate = new Date((minD.getTime() + maxD.getTime()) / 2);
						maxDForGroup = maxD;
                    } else if (g.fileDate) {
                        // fallback to filename date if no item dates present
                        refDate = g.fileDate;
                        maxDForGroup = g.fileDate;
                    }
                    for (const c of candidates) {
						const dateAcceptable = this.#isBatchDateAcceptable(
                            c.date, maxDForGroup, g.fileDate, GRACE_BEFORE_DAYS, STATEMENT_BILLING_MAX_DAYS_AFTER
                        );
                        const diff = Number((c.amountAbs - g.sum).toFixed(2));
                        const rel = c.amountAbs ? Math.abs(diff) / c.amountAbs : 1;
                        const days = (refDate && c.date && !isNaN(refDate.getTime()) && !isNaN(c.date.getTime()))
                            ? Math.abs((refDate.getTime() - c.date.getTime()) / (1000*60*60*24))
                            : 9999;
                        const score = this.#batchMatchScore(diff, days);
                        const acceptable = (Math.abs(diff) <= MAX_ABS_DIFF) || (rel <= MAX_REL_DIFF);
                        if (dateAcceptable) {
                            pairs.push({ gidx, candidate: c, diff, rel, score, acceptable, days });
                            const prev = bestByFile.get(gidx);
                            if (!prev || score < prev.score) {
                                bestByFile.set(gidx, { candId: c.id, diff, rel, days, acceptable, score });
                            }
                        }
                        // always update bestAny (ignoring date gating)
                        const prevAny = bestAnyByFile.get(gidx);
                        if (!prevAny || score < prevAny.score) {
                            bestAnyByFile.set(gidx, { candId: c.id, diff, rel, days, acceptable, score });
                        }
                    }
                });
                pairs.sort((a, b) => a.score - b.score);

                const usedFiles = new Set();
                const usedCands = new Set();
                const assignment = new Map(); // candidateId -> gidx
                for (const p of pairs) {
                    if (!p.acceptable) continue;
                    if (usedFiles.has(p.gidx)) continue;
                    if (usedCands.has(p.candidate.id)) continue;
                    usedFiles.add(p.gidx);
                    usedCands.add(p.candidate.id);
                    assignment.set(p.candidate.id, p.gidx);
                }

                // Build groups only for assigned candidates; skip unmatched placeholders to avoid duplicate tables
                for (const c of candidates) {
                    const gidx = assignment.get(c.id);
                    if (gidx == null) continue;
                    const g = tempGroups[gidx];
                    const isAlready = !!c.alreadyExtracted;
                    groups.push({
                        fileName: g.fileName,
                        items: g.items,
                        hiddenItems: g.hiddenItems || [],
                        sum: g.sum,
                        lineSum: g.lineSum,
                        statementTotal: g.statementTotal,
                        parseMode: g.parseMode,
                        hiddenSettlementLines: g.hiddenSettlementLines,
                        parsedCount: g.parsedCount,
                        matched: { originalTransactionId: c.id, original: c.amountAbs, sum: g.sum, diff: Number((c.amountAbs - g.sum).toFixed(2)), alreadyExtracted: isAlready },
                        selectable: !isAlready,
                    });
                    try { console.info('batch-match', { file: g.fileName, matchedId: c.id, original: c.amountAbs, sum: g.sum }); } catch(_) {}
                }

                // Add any remaining unmatched files as their own groups without a match
                tempGroups.forEach((g, gidx) => {
                    if (!usedFiles.has(gidx)) {
                        let maxDForGroup = null;
                        const dates = (g.items || [])
                            .map(i => (i.date ? new Date(i.date) : null))
                            .filter(d => d && !isNaN(d.getTime()));
                        if (dates.length) {
                            maxDForGroup = dates.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));
                        } else if (g.fileDate) {
                            maxDForGroup = g.fileDate;
                        }
                        const matchHints = this.#buildBatchMatchHints(
                            g, candidates, maxDForGroup, g.fileDate, GRACE_BEFORE_DAYS,
                            STATEMENT_BILLING_MAX_DAYS_AFTER, MAX_ABS_DIFF, MAX_REL_DIFF
                        );
                        groups.push({
                            fileName: g.fileName,
                            items: g.items,
                            hiddenItems: g.hiddenItems || [],
                            sum: g.sum,
                            lineSum: g.lineSum,
                            statementTotal: g.statementTotal,
                            parseMode: g.parseMode,
                            hiddenSettlementLines: g.hiddenSettlementLines,
                            parsedCount: g.parsedCount,
                            matched: null,
                            selectable: true,
                            matchHints
                        });
                        const best = bestByFile.get(gidx) || bestAnyByFile.get(gidx);
                        try { console.info('batch-file-unmatched', { file: g.fileName, items: g.items.length, sum: g.sum, best, matchHints }); } catch(_) {}
                    }
                });
            } else {
                // No explicit candidates – fallback to per-file best match, but only accept within threshold.
                // Also make sure a candidate original is not used by multiple files.
                const usedCandsNoExplicit = new Set();
                for (const g of tempGroups) {
                    let best = null;
                    // compute group reference date
                    let refDate = null;
					let maxDForGroup = null;
                    const dates = g.items
                        .map(i => (i.date ? new Date(i.date) : null))
                        .filter(d => d && !isNaN(d.getTime()));
                    if (dates.length) {
                        const minD = dates.reduce((a, b) => (a.getTime() < b.getTime() ? a : b));
                        const maxD = dates.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));
                        refDate = new Date((minD.getTime() + maxD.getTime()) / 2);
						maxDForGroup = maxD;
                    } else if (g.fileDate) {
                        refDate = g.fileDate;
                        maxDForGroup = g.fileDate;
                    }
                    for (const c of candidates) {
						if (!this.#isBatchDateAcceptable(
                            c.date, maxDForGroup, g.fileDate, GRACE_BEFORE_DAYS, STATEMENT_BILLING_MAX_DAYS_AFTER
                        )) continue;
                        const diff = Number((c.amountAbs - g.sum).toFixed(2));
                        const rel = c.amountAbs ? Math.abs(diff) / c.amountAbs : 1;
                        const days = (refDate && c.date && !isNaN(refDate.getTime()) && !isNaN(c.date.getTime()))
                            ? Math.abs((refDate.getTime() - c.date.getTime()) / (1000 * 60 * 60 * 24))
                            : 9999;
                        const score = this.#batchMatchScore(diff, days);
                        if (!best || score < best.score) best = { candidate: c, diff, rel, sum: g.sum, score, days };
                    }
                    const acceptable = best && ((Math.abs(best.diff) <= MAX_ABS_DIFF) || (best.rel <= MAX_REL_DIFF));
                    let matched = null;
                    if (acceptable && best?.candidate?.id && !usedCandsNoExplicit.has(best.candidate.id)) {
                        usedCandsNoExplicit.add(best.candidate.id);
                        matched = { originalTransactionId: best.candidate.id, original: best.candidate.amountAbs, sum: best.sum, diff: best.diff, alreadyExtracted: !!best.candidate.alreadyExtracted };
                    } else {
                        matched = null;
                    }
                    const groupEntry = {
                        fileName: g.fileName,
                        items: g.items,
                        hiddenItems: g.hiddenItems || [],
                        sum: g.sum,
                        lineSum: g.lineSum,
                        statementTotal: g.statementTotal,
                        parseMode: g.parseMode,
                        hiddenSettlementLines: g.hiddenSettlementLines,
                        parsedCount: g.parsedCount,
                        matched,
                        selectable: matched ? !matched.alreadyExtracted : true,
                    };
                    groups.push(groupEntry);
                    try {
                        console.info('batch-file-result', {
                            file: g.fileName,
                            sum: g.sum,
                            matched: !!groupEntry.matched,
                            matchedId: groupEntry.matched?.originalTransactionId || null,
                            diff: groupEntry.matched?.diff || null
                        });
                        if (!acceptable && best) {
                            console.info('batch-file-best-rejected', {
                                file: g.fileName,
                                items: g.items.length,
                                sum: g.sum,
                                best: { candId: best.candidate.id, diff: best.diff, rel: best.rel, days: best.days }
                            });
                        } else if (acceptable && best?.candidate?.id && usedCandsNoExplicit.has(best.candidate.id) && !matched) {
                            console.info('batch-file-duplicate-candidate-rejected', {
                                file: g.fileName,
                                candId: best.candidate.id
                            });
                        }
                        if ((g.items || []).length && Math.abs(Number(g.sum || 0)) < 0.001) {
                            console.info('batch-file-zero-sum', { file: g.fileName, items: g.items.length });
                        }
                    } catch(_) {}
                }
            }

            res.json({ success: true, groups });
        } catch (e) {
            console.error('Extraction upload-batch error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onExtractionConfirmBatch(req, res) {
        try {
            const { groups = [], proceedOnMismatch = false, tag, force = false, useAiMerchant = false } = req.body || {};
            if (!Array.isArray(groups) || groups.length === 0) return res.status(400).json({ success: false, error: 'groups[] required' });

            let created = 0;
            const createdTransactions = [];
            const correctionCloneIds = [];
            const merchantEvents = new Map();
            const categories = await this.#firefly.getCategories();
            const categoryNames = Array.from(categories.keys());
            const skipped = [];
            for (const g of groups) {
                if (!g || !g.matched || !Array.isArray(g.items) || g.items.length === 0) {
                    const reason = 'invalid-group-shape';
                    try { console.info('confirm-batch-skip', { reason, originalTransactionId: g?.matched?.originalTransactionId, items: g?.items?.length || 0 }); } catch(_) {}
                    skipped.push({ originalTransactionId: g?.matched?.originalTransactionId, reason });
                    continue;
                }
                const originalTransactionId = g.matched.originalTransactionId;

                // Load original
                const data = await this.#firefly.getTransaction(originalTransactionId);
                const firstTx = data.data.attributes.transactions[0];
                const alreadyExtracted = Array.isArray(firstTx.tags) && firstTx.tags.includes('already-extracted-original');
                // Also check presence of children by tag
                const parentTag = this.#buildEnglishParentTag(firstTx, originalTransactionId);
                let hasChildrenByTag = false;
                if (!alreadyExtracted) {
                    try {
                        const existing = await this.#firefly.getTransactionsByTag(parentTag, { limit: 5 });
                        if (Array.isArray(existing) && existing.some(t => String(t.id) !== String(originalTransactionId))) {
                            hasChildrenByTag = true;
                        }
                    } catch (_) {}
                }
                if ((alreadyExtracted || hasChildrenByTag) && !force) {
                    const reason = alreadyExtracted ? 'already-extracted-tag' : 'has-children-by-parent-tag';
                    try { console.info('confirm-batch-skip', { reason, originalTransactionId, parentTag }); } catch(_) {}
                    skipped.push({ originalTransactionId, reason, parentTag });
                    continue; // not forced
                }
                const originalAbs = Math.abs(parseFloat(firstTx.amount));

                // Use authoritative sum from preview when provided
                let total = (g && g.authoritativeSum != null && !isNaN(Number(g.authoritativeSum)))
                    ? Number(Number(g.authoritativeSum).toFixed(2))
                    : null;
                if (total == null) total = computeExtractionDisplaySum(markSettlementLines(g.items));
                const diff = Number((originalAbs - total).toFixed(2));
                if (Math.abs(diff) >= 0.01 && !proceedOnMismatch) {
                    const reason = 'amount-mismatch';
                    try { console.info('confirm-batch-skip', { reason, originalTransactionId, originalAbs, total, diff }); } catch(_) {}
                    skipped.push({ originalTransactionId, reason, originalAbs, total, diff });
                    continue;
                }

                const splitTags = this.#buildSplitChildTags(tag, parentTag);

                const groupCreatedIds = [];
                let correctionCloneId = null;
                try {
                // Use exactly g.items from the client active table (no regex re-filter).
                for (const it of g.items) {
                    const isDeposit = (it.direction === 'in');
                    const normAmount = (() => {
                        if (typeof it.amount === 'number') return it.amount;
                        const raw = String(it.amount ?? '').trim().replace(/\u00A0/g, '').replace(/\s+/g, '').replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
                        const n = Number(raw);
                        return Number.isFinite(n) ? n : NaN;
                    })();
                    if (!Number.isFinite(normAmount)) {
                        // skip invalid amount rows in batch rather than failing entire group
                        continue;
                    }
                    const base = {
                        type: isDeposit ? 'deposit' : 'withdrawal',
                        date: it.date || firstTx.date,
                        description: it.description,
                        amount: Math.abs(Number(normAmount)).toFixed(2),
                        currency_code: firstTx.currency_code,
                        tags: splitTags
                    };
                    try {
                        const destName = it.destination_name || it.description || '';
                        const fakeTx = {
                            attributes: {
                                transactions: [{
                                    type: base.type,
                                    description: it.description || '',
                                    destination_name: destName,
                                    currency_code: firstTx.currency_code,
                                    foreign_currency_code: firstTx.foreign_currency_code,
                                    foreign_amount: firstTx.foreign_amount,
                                }],
                            },
                        };
                        const resolved = await this.#resolveCategory(fakeTx, categories);
                        if (resolved.category) {
                            base.category_id = categories.get(resolved.category);
                        }
                    } catch (_) {}
                    if (isDeposit) {
                        const merchantName = it.destination_name || it.description;
                        base.source_name = merchantName;
                        // AI-assisted merchant account match (revenue)
                        try {
                            if (useAiMerchant && this.#openAi && merchantName) {
                                const accs = await this.#firefly.listAccountsBasicByType('revenue');
                                const pick = await this.#openAi.matchAccount(accs.map(a => a.name), merchantName, it.description || '', 'deposit');
                                const chosen = accs.find(a => a.name === pick.name);
                                if (chosen && chosen.id) {
                                    base.source_id = chosen.id; delete base.source_name;
                                    merchantEvents.set(merchantName, { name: merchantName, type: 'revenue', created: false, matched: 'ai', id: chosen.id, confidence: Number(pick.confidence || 0) });
                                    try { console.info('ai-merchant-match', { side: 'source', type: 'revenue', merchant: merchantName, chosen: chosen.name, id: chosen.id, confidence: pick.confidence }); } catch(_) {}
                                } else {
                                    try { console.info('ai-merchant-no-match', { side: 'source', type: 'revenue', merchant: merchantName }); } catch(_) {}
                                }
                            }
                        } catch (_) {}
                        Object.assign(base, await this.#resolveAssetBinding(firstTx, true));
                    } else {
                        const merchantName = it.destination_name || it.description;
                        base.destination_name = merchantName;
                        // AI-assisted merchant account match (expense)
                        try {
                            if (useAiMerchant && this.#openAi && merchantName) {
                                const accs = await this.#firefly.listAccountsBasicByType('expense');
                                const pick = await this.#openAi.matchAccount(accs.map(a => a.name), merchantName, it.description || '', 'withdrawal');
                                const chosen = accs.find(a => a.name === pick.name);
                                if (chosen && chosen.id) {
                                    base.destination_id = chosen.id; delete base.destination_name;
                                    merchantEvents.set(merchantName, { name: merchantName, type: 'expense', created: false, matched: 'ai', id: chosen.id, confidence: Number(pick.confidence || 0) });
                                    try { console.info('ai-merchant-match', { side: 'destination', type: 'expense', merchant: merchantName, chosen: chosen.name, id: chosen.id, confidence: pick.confidence }); } catch(_) {}
                                } else {
                                    try { console.info('ai-merchant-no-match', { side: 'destination', type: 'expense', merchant: merchantName }); } catch(_) {}
                                }
                            }
                        } catch (_) {}
                        Object.assign(base, await this.#resolveAssetBinding(firstTx, false));
                    }
                    try {
                        const resp = await this.#firefly.createTransactions([ base ]);
                        const tid = this.#requireCreatedTransactionId(resp, 'split-child');
                        groupCreatedIds.push(tid);
                        createdTransactions.push({ id: tid, ...base });
                    } catch (e) {
                        const msg = String(e?.body || e?.message || '').toLowerCase();
                        if ((e?.code === 422) && (msg.includes('destination') || msg.includes('source'))) {
                            const retry = { ...base };
                            const merchantSide = (msg.includes('destination') && !isDeposit) || (msg.includes('source') && isDeposit);
                            if (merchantSide) {
                                const merchant = it.destination_name || it.description;
                                const acctType = isDeposit ? 'revenue' : 'expense';
                                const details = await this.#firefly.ensureAccountDetailed(merchant, acctType);
                                if (details && details.id) {
                                    merchantEvents.set(merchant, { name: merchant, type: acctType, created: !!details.created, matched: details.matched || null, id: details.id });
                                }
                                if (isDeposit) {
                                    retry.source_id = details.id;
                                    delete retry.source_name;
                                } else {
                                    retry.destination_id = details.id;
                                    delete retry.destination_name;
                                }
                            } else {
                                const assetResolved = await this.#resolveAssetBinding(firstTx, isDeposit);
                                if (isDeposit) { delete retry.destination_id; delete retry.destination_name; }
                                else { delete retry.source_id; delete retry.source_name; }
                                Object.assign(retry, assetResolved);
                            }
                            const resp2 = await this.#firefly.createTransactions([ retry ]);
                            const tid2 = this.#requireCreatedTransactionId(resp2, 'split-child-retry');
                            groupCreatedIds.push(tid2);
                            createdTransactions.push({ id: tid2, ...retry });
                        } else {
                            throw e;
                        }
                    }
                    created++;
                }

                if (groupCreatedIds.length === 0) {
                    skipped.push({ originalTransactionId, reason: 'no-child-transactions-created' });
                    continue;
                }
                ({ correctionCloneId } = await this.#finalizeExtractionGroup(originalTransactionId, data.data, firstTx, parentTag));
                if (correctionCloneId) correctionCloneIds.push(correctionCloneId);
                try { console.info('confirm-batch-group-complete', { originalTransactionId, children: groupCreatedIds.length, correctionCloneId }); } catch (_) {}
                } catch (groupErr) {
                    const rb = await this.#rollbackExtractionGroup({
                        childTransactionIds: groupCreatedIds,
                        correctionCloneId,
                        originalTransactionId,
                        untagExtracted: true
                    });
                    const errMsg = groupErr?.body || groupErr?.message || String(groupErr);
                    try { console.error('confirm-batch-group-failed', { originalTransactionId, attempted: groupCreatedIds.length, rolledBack: rb.deleted, correctionCloneId, error: errMsg }); } catch (_) {}
                    skipped.push({
                        originalTransactionId,
                        reason: 'group-failed-rolled-back',
                        rolledBack: rb.deleted,
                        error: typeof errMsg === 'string' ? errMsg.slice(0, 500) : String(errMsg)
                    });
                    continue;
                }
            }

            res.json({
                success: true,
                created,
                skipped,
                correctionClones: correctionCloneIds,
                merchants: Array.from(merchantEvents.values()),
                transactions: createdTransactions
            });
        } catch (e) {
            try { console.error('Extraction confirm-batch error:', e?.message || e, e?.body || ''); } catch(_) {}
            const code = (e && typeof e.code === 'number') ? e.code : null;
            if (code === 409 || code === 422) {
                return res.status(code).json({ success: false, error: e?.body || e?.message || 'Confirm-batch failed' });
            }
            res.status(500).json({ success: false, error: e?.body || e?.message || 'Confirm-batch failed' });
        }
    }

    async #tagTransaction(transactionId, extraTags) {
        const tx = await this.#firefly.getTransaction(transactionId);
        const transactions = tx.data.attributes.transactions.map(t => ({
            transaction_journal_id: t.transaction_journal_id,
            category_id: t.category_id || null,
            tags: Array.from(new Set([...(t.tags || []), ...extraTags]))
        }));
        await this.#firefly.updateTransactions(transactionId, transactions);
    }

    async #createCorrectionClone(originalData, firstTx, tag, parentTag = null) {
        const t = firstTx || originalData?.attributes?.transactions?.[0];
        if (!t) throw new Error('createCorrectionClone: missing original transaction');
        // Correction clone gets ONLY its role tag (e.g. value-correction-clone).
        // It must not share creditcard-split (that marks split children) or the
        // statement link tag (that marks extracted children). The clone is found
        // on revert via the value-correction-clone tag + date/amount match.
        const correction = {
            type: 'deposit',
            date: t.date,
            description: `${t.description} (correction)`,
            source_name: t.destination_name || t.source_name || 'Correction',
            amount: Math.abs(parseFloat(t.amount)).toFixed(2),
            currency_code: t.currency_code,
            tags: [tag].filter(Boolean)
        };
        if (t.category_id) {
            correction.category_id = t.category_id;
        } else if (t.category_name) {
            correction.category_name = t.category_name;
        }
        Object.assign(correction, await this.#resolveAssetBinding(t, true));
        const resp = await this.#firefly.createTransactions([correction]);
        const id = this.#requireCreatedTransactionId(resp, 'value-correction-clone');
        try { console.info('correction-clone-created', { id, parentTag, amount: correction.amount }); } catch (_) {}
        return { id };
    }

    async #onGetExtractionConfig(req, res) {
        try {
            res.json({ success: true, config: this.#transactionExtractionService.getConfig() });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onUpdateExtractionConfig(req, res) {
        try {
            const updated = await this.#transactionExtractionService.updateConfig(req.body || {});
            res.json({ success: true, config: updated });
        } catch (e) {
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

    async #onGetAccountCategoryMappings(req, res) {
        try {
            const mappings = this.#accountCategoryMappingService.getAllMappings();
            res.json({ success: true, mappings });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onAddAccountCategoryMapping(req, res) {
        try {
            const mappingData = req.body;
            const validation = this.#accountCategoryMappingService.validateMapping(mappingData);
            if (!validation.isValid) {
                return res.status(400).json({ success: false, error: validation.errors.join(', ') });
            }
            const mapping = this.#accountCategoryMappingService.addMapping(mappingData);
            res.json({ success: true, message: 'Account→category mapping added successfully', mapping });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onUpdateAccountCategoryMapping(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;
            // Basic validation for fields that are actually being updated
            if (updates.accountId != null && String(updates.accountId).trim().length === 0) {
                return res.status(400).json({ success: false, error: 'Account is required' });
            }
            if (updates.accountName != null && String(updates.accountName).trim().length === 0) {
                return res.status(400).json({ success: false, error: 'Account name is required' });
            }
            if (updates.targetCategory != null && String(updates.targetCategory).trim().length === 0) {
                return res.status(400).json({ success: false, error: 'Target category is required' });
            }
            const mapping = this.#accountCategoryMappingService.updateMapping(id, updates);
            res.json({ success: true, message: 'Account→category mapping updated successfully', mapping });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onDeleteAccountCategoryMapping(req, res) {
        try {
            const { id } = req.params;
            const success = this.#accountCategoryMappingService.removeMapping(id);
            if (success) {
                res.json({ success: true, message: 'Account→category mapping removed successfully' });
            } else {
                res.status(404).json({ success: false, error: 'Account→category mapping not found' });
            }
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #onToggleAccountCategoryMapping(req, res) {
        try {
            const { id } = req.params;
            const { enabled } = req.body;
            const mapping = this.#accountCategoryMappingService.toggleMapping(id, enabled);
            res.json({ success: true, message: 'Account→category mapping toggled successfully', mapping });
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

    async #fetchTransactionsForList({ type, categoryName, tag }) {
        // Prefer category fetch when set; tag-only fetch when no category; otherwise full list for exclude-only
        if (categoryName) {
            return this.#firefly.getTransactionsByCategoryName(categoryName, { limit: 500 });
        }
        if (tag) {
            return this.#firefly.getTransactionsByTag(tag, { limit: 500 });
        }
        if (type === 'withdrawal') {
            return this.#firefly.getAllWithdrawalTransactions();
        }
        if (type === 'deposit') {
            return this.#firefly.getAllTransactionsByType('deposit');
        }
        if (type === 'uncategorized') {
            return this.#firefly.getAllUncategorizedTransactions();
        }
        return this.#firefly.getAllTransactions();
    }

    #parseTagList(raw) {
        if (!raw) return [];
        return String(raw)
            .split(/[,;\n]+/)
            .map(s => s.trim())
            .filter(Boolean);
    }

    #matchesTagFilters(txTags, includeList, excludeList) {
        const tags = Array.isArray(txTags) ? txTags : [];
        if (includeList.length && !includeList.some(t => tags.includes(t))) return false;
        if (excludeList.length && excludeList.some(t => tags.includes(t))) return false;
        return true;
    }

    #applyListFilters(transactions, { categoryName, tag, excludeTag, tagsInclude, tagsExclude }) {
        let out = transactions;
        if (categoryName) {
            out = out.filter(t => t.category === categoryName);
        }
        const includeList = this.#parseTagList(tagsInclude || tag);
        const excludeList = this.#parseTagList(tagsExclude || excludeTag);
        if (includeList.length || excludeList.length) {
            out = out.filter(t => this.#matchesTagFilters(t.tags, includeList, excludeList));
        }
        return out;
    }

    async #getTransactionsList(req, res) {
        try {
            const { type = 'all', limit = 100, page = 1, categoryName = '', tag = '', excludeTag = '', tagsInclude = '', tagsExclude = '', includeClones = '0' } = req.query;
            
            let transactions = await this.#fetchTransactionsForList({ type, categoryName, tag, excludeTag });
            
            // Get categories for mapping
            const categories = await this.#firefly.getCategories();
            const categoryNames = Array.from(categories.keys());
            
            // Transform transactions to frontend format
            let transformedTransactions = transactions.map(transaction => {
                const firstTx = transaction.attributes.transactions[0];
                const categoryName = firstTx.category_name || null;
                const tags = Array.isArray(firstTx.tags) ? firstTx.tags : [];
                
                return {
                    id: transaction.id,
                    description: firstTx.description || '',
                    destinationName: firstTx.destination_name || '(unknown)',
                    amount: parseFloat(firstTx.amount),
                    currency: firstTx.currency_code || 'EUR',
                    date: firstTx.date || transaction.attributes.updated_at || transaction.attributes.created_at,
                    type: firstTx.type,
                    category: categoryName,
                    tags: tags,
                    categoryId: firstTx.category_id || null,
                    sourceId: firstTx.source_id,
                    destinationId: firstTx.destination_id,
                    transactionJournalId: firstTx.transaction_journal_id
                };
            });
            
            // By default exclude correction clones from lists unless explicitly included
            const wantClones = String(includeClones).toLowerCase() === '1' || String(includeClones).toLowerCase() === 'true';
            if (!wantClones) {
                transformedTransactions = transformedTransactions.filter(t => !(Array.isArray(t.tags) && t.tags.includes('value-correction-clone')));
            }
            
            const filteredByCatTag = this.#applyListFilters(transformedTransactions, { categoryName, tag, excludeTag, tagsInclude, tagsExclude });

            // Apply pagination
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + parseInt(limit);
            const paginatedTransactions = filteredByCatTag.slice(startIndex, endIndex);
            
            res.json({
                success: true,
                transactions: paginatedTransactions,
                totalCount: filteredByCatTag.length,
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

    async #removeTransactionTags(req, res) {
        try {
            const { transactionIds, tag, tags } = req.body || {};
            const tagsToRemove = tag
                ? [String(tag).trim()]
                : (Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : []);

            if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
                return res.json({ success: false, error: 'transactionIds array is required' });
            }
            if (!tagsToRemove.length) {
                return res.json({ success: false, error: 'tag or tags is required' });
            }

            let successCount = 0;
            let errorCount = 0;
            const errors = [];

            for (const transactionId of transactionIds) {
                try {
                    await this.#removeTagsFromTransaction(transactionId, tagsToRemove);
                    successCount++;
                } catch (error) {
                    errorCount++;
                    errors.push(`Transaction ${transactionId}: ${error.message}`);
                }
            }

            res.json({
                success: true,
                message: `Removed tag(s) from ${successCount} transactions successfully`,
                successCount,
                errorCount,
                errors: errors.length > 0 ? errors : undefined
            });
        } catch (error) {
            console.error('Error removing transaction tags:', error);
            res.json({ success: false, error: error.message });
        }
    }

    async #filterTransactions(req, res) {
        try {
            const { 
                searchText = '',
                type = 'all',
                hasCategory = 'all',
                categoryName = '',
                tag = '',
                excludeTag = '',
                tagsInclude = '',
                tagsExclude = '',
                minAmount = null,
                maxAmount = null,
                dateFrom = null,
                dateTo = null,
                limit = 100
            } = req.query;
            const includeTags = this.#parseTagList(tagsInclude || tag);
            const excludeTags = this.#parseTagList(tagsExclude || excludeTag);
            
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
                    const tags = Array.isArray(firstTx.tags) ? firstTx.tags : [];
                    
                    return {
                        id: transaction.id,
                        description: firstTx.description || '',
                        destinationName: firstTx.destination_name || '(unknown)',
                        amount: parseFloat(firstTx.amount),
                        currency: firstTx.currency_code || 'EUR',
                        date: firstTx.date || transaction.attributes.updated_at || transaction.attributes.created_at,
                        type: firstTx.type,
                        category: categoryName,
                        tags: tags,
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

                    if (!this.#matchesTagFilters(transaction.tags, includeTags, excludeTags)) return false;
                    
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

    // ===== Duplicate detection & cleanup =====
    async #findDuplicates(req, res) {
        try {
            const { tag = '', dateFrom = '', dateTo = '', type = 'all' } = req.query || {};

            let raw = [];
            if (tag) {
                raw = await this.#firefly.getTransactionsByTag(tag, { limit: 1000 });
            } else if (dateFrom || dateTo) {
                raw = await this.#firefly.getTransactionsWithFilters({ type: type || 'all', dateFrom: dateFrom || null, dateTo: dateTo || null });
            } else {
                // fallback: scan all (paginated via helper)
                raw = await this.#firefly.getAllTransactions();
            }

            const normalize = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

            const groupsMap = new Map();
            for (const t of raw) {
                const ft = t.attributes.transactions[0];
                const id = t.id;
                const date = ft.date ? ft.date.slice(0,10) : (t.attributes.created_at || '').slice(0,10);
                const type = ft.type;
                const amountAbs = Math.abs(parseFloat(ft.amount || '0')).toFixed(2);
                const payee = type === 'deposit' ? (ft.source_name || ft.description) : (ft.destination_name || ft.description);
                const norm = normalize(payee || '');
                const key = `${type}|${date}|${amountAbs}|${norm}`;
                const entry = {
                    id,
                    date,
                    type,
                    amount: parseFloat(ft.amount),
                    currency: ft.currency_code,
                    description: ft.description || '',
                    source: ft.source_name || '',
                    destination: ft.destination_name || '',
                    tags: Array.isArray(ft.tags) ? ft.tags : [],
                    isOriginal: Array.isArray(ft.tags) && ft.tags.includes('already-extracted-original'),
                    isCorrection: Array.isArray(ft.tags) && ft.tags.includes('value-correction-clone')
                };
                if (!groupsMap.has(key)) groupsMap.set(key, []);
                groupsMap.get(key).push(entry);
            }

            const groups = [];
            for (const [key, list] of groupsMap.entries()) {
                if (list.length <= 1) continue;
                const [type, date, amountAbs] = key.split('|');
                groups.push({ key, summary: { type, date, amountAbs: parseFloat(amountAbs), count: list.length }, items: list });
            }

            // Sort groups by size desc
            groups.sort((a, b) => b.summary.count - a.summary.count);
            res.json({ success: true, groups });
        } catch (e) {
            console.error('Find duplicates error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #deleteTransactions(req, res) {
        try {
            const { transactionIds } = req.body || {};
            if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
                return res.status(400).json({ success: false, error: 'transactionIds[] required' });
            }
            let deleted = 0;
            const errors = [];
            for (const id of transactionIds) {
                try {
                    await this.#firefly.deleteTransaction(id);
                    deleted++;
                } catch (e) {
                    errors.push({ id, error: e.message || String(e) });
                }
            }
            res.json({ success: true, deleted, errors: errors.length ? errors : undefined });
        } catch (e) {
            console.error('Delete transactions error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    }

    async #deleteDuplicates(req, res) {
        return this.#deleteTransactions(req, res);
    }
}

class WebhookException extends Error {

    constructor(message) {
        super(message);
    }
}
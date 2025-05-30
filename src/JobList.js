import {v4 as uuid} from "uuid";
import EventEmitter from "events";

export default class JobList {
    #jobs = new Map();
    #batchJobs = new Map();
    #eventEmitter = new EventEmitter();

    constructor() {
    }

    on(event, listener) {
        this.#eventEmitter.on(event, listener);
    }

    getJobs() {
        return this.#jobs;
    }

    getBatchJobs() {
        return this.#batchJobs;
    }

    createJob(data) {
        const id = uuid()
        const created = new Date();

        const job = {
            id,
            created,
            status: "queued",
            data,
        }

        this.#jobs.set(id, job);
        this.#eventEmitter.emit('job created', {job, jobs: Array.from(this.#jobs.values())})

        return job;
    }

    createBatchJob(type, totalCount) {
        const id = uuid();
        const created = new Date();

        const batchJob = {
            id,
            created,
            type, // 'uncategorized' or 'all'
            status: "running",
            totalCount,
            processedCount: 0,
            successCount: 0,
            errorCount: 0,
            errors: []
        };

        this.#batchJobs.set(id, batchJob);
        this.#eventEmitter.emit('batch job created', {batchJob, batchJobs: Array.from(this.#batchJobs.values())});

        return batchJob;
    }

    updateBatchJobProgress(id, updates) {
        const batchJob = this.#batchJobs.get(id);
        if (!batchJob) return;

        // Support both old format (individual parameters) and new format (object)
        if (typeof updates === 'object' && updates !== null && !Array.isArray(updates)) {
            // New object-based format
            if (typeof updates.processed === 'number') {
                batchJob.processedCount += updates.processed;
            }
            if (typeof updates.success === 'number') {
                batchJob.successCount += updates.success;
            }
            if (typeof updates.errors === 'number') {
                batchJob.errorCount += updates.errors;
            }
            if (updates.errorDetails && typeof updates.errorDetails === 'string') {
                batchJob.errors.push(updates.errorDetails);
            }
        } else {
            // Old format compatibility (if called with individual parameters)
            const processedCount = updates;
            const successCount = arguments[2];
            const errorCount = arguments[3];
            const error = arguments[4];
            
            if (typeof processedCount === 'number') batchJob.processedCount = processedCount;
            if (typeof successCount === 'number') batchJob.successCount = successCount;
            if (typeof errorCount === 'number') batchJob.errorCount = errorCount;
            if (error) batchJob.errors.push(error);
        }

        // Ensure all counts are valid numbers
        batchJob.processedCount = Math.max(0, batchJob.processedCount || 0);
        batchJob.successCount = Math.max(0, batchJob.successCount || 0);
        batchJob.errorCount = Math.max(0, batchJob.errorCount || 0);

        console.log(`📊 Batch job ${id} updated:`, {
            processed: batchJob.processedCount,
            success: batchJob.successCount,
            errors: batchJob.errorCount,
            total: batchJob.totalCount
        });

        this.#eventEmitter.emit('batch job updated', {batchJob, batchJobs: Array.from(this.#batchJobs.values())});
    }

    finishBatchJob(id) {
        const batchJob = this.#batchJobs.get(id);
        if (batchJob) {
            batchJob.status = "finished";
            batchJob.finishedAt = new Date();
            this.#eventEmitter.emit('batch job updated', {batchJob, batchJobs: Array.from(this.#batchJobs.values())});
        }
    }

    pauseBatchJob(id) {
        const batchJob = this.#batchJobs.get(id);
        if (batchJob && batchJob.status === "running") {
            batchJob.status = "paused";
            batchJob.pausedAt = new Date();
            console.log(`⏸️ Batch job ${id} paused`);
            this.#eventEmitter.emit('batch job updated', {batchJob, batchJobs: Array.from(this.#batchJobs.values())});
            return true;
        }
        return false;
    }

    resumeBatchJob(id) {
        const batchJob = this.#batchJobs.get(id);
        if (batchJob && batchJob.status === "paused") {
            batchJob.status = "running";
            batchJob.resumedAt = new Date();
            console.log(`▶️ Batch job ${id} resumed`);
            this.#eventEmitter.emit('batch job updated', {batchJob, batchJobs: Array.from(this.#batchJobs.values())});
            return true;
        }
        return false;
    }

    cancelBatchJob(id) {
        const batchJob = this.#batchJobs.get(id);
        if (batchJob && (batchJob.status === "running" || batchJob.status === "paused")) {
            batchJob.status = "cancelled";
            batchJob.cancelledAt = new Date();
            console.log(`❌ Batch job ${id} cancelled`);
            this.#eventEmitter.emit('batch job updated', {batchJob, batchJobs: Array.from(this.#batchJobs.values())});
            return true;
        }
        return false;
    }

    getBatchJobStatus(id) {
        const batchJob = this.#batchJobs.get(id);
        return batchJob ? batchJob.status : null;
    }

    updateJobData(id, data) {
        const job = this.#jobs.get(id);
        job.data = data;
        this.#eventEmitter.emit('job updated', {job, jobs: Array.from(this.#jobs.values())});
    }

    setJobInProgress(id) {
        const job = this.#jobs.get(id);
        job.status = "in_progress";
        this.#eventEmitter.emit('job updated', {job, jobs: Array.from(this.#jobs.values())});
    }

    setJobFinished(id) {
        const job = this.#jobs.get(id);
        job.status = "finished";
        this.#eventEmitter.emit('job updated', {job, jobs: Array.from(this.#jobs.values())});
    }
}
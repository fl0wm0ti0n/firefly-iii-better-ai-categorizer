import fs from 'fs/promises';
import { dataFile, ensureDataDir } from './storage.js';

export default class PendingReviewService {
    #reviews = [];
    #reviewsFile;
    #loaded = false;

    constructor() {
        this.loadReviews();
    }

    async loadReviews() {
        try {
            await ensureDataDir();
            this.#reviewsFile = dataFile('pending-category-reviews.json');
            const data = await fs.readFile(this.#reviewsFile, 'utf8');
            this.#reviews = JSON.parse(data);
            console.info(`📋 Loaded ${this.#reviews.length} pending reviews`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.info('📋 No pending reviews file found, starting empty');
                this.#reviews = [];
            } else {
                console.error('Error loading pending reviews:', error);
                this.#reviews = [];
            }
        }
        this.#loaded = true;
    }

    async saveReviews() {
        await ensureDataDir();
        await fs.writeFile(this.#reviewsFile, JSON.stringify(this.#reviews, null, 2));
    }

    async addReview(review) {
        await this.#ensureLoaded();
        const existing = this.#reviews.find(r => r.transactionId === review.transactionId && r.status === 'pending');
        if (existing) {
            console.warn(`Review already exists for transaction ${review.transactionId}`);
            return existing;
        }
        this.#reviews.unshift(review);
        await this.saveReviews();
        console.info(`📝 Added pending review for transaction ${review.transactionId}`);
        return review;
    }

    async acceptReview(id, chosenCategory = null) {
        await this.#ensureLoaded();
        const review = this.#reviews.find(r => r.id === id);
        if (!review) return null;
        review.status = 'accepted';
        review.resolvedAt = new Date().toISOString();
        review.resolvedBy = 'operator';
        review.resolvedChoice = chosenCategory || review.recommendation?.preferredCategory || null;
        await this.saveReviews();
        return review;
    }

    async rejectReview(id) {
        await this.#ensureLoaded();
        const review = this.#reviews.find(r => r.id === id);
        if (!review) return null;
        review.status = 'rejected';
        review.resolvedAt = new Date().toISOString();
        review.resolvedBy = 'operator';
        review.resolvedChoice = null;
        await this.saveReviews();
        return review;
    }

    getPendingReviews() {
        return this.#reviews.filter(r => r.status === 'pending');
    }

    getAllReviews() {
        return [...this.#reviews];
    }

    async #ensureLoaded() {
        if (!this.#loaded) {
            await this.loadReviews();
        }
    }
}

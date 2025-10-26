import fs from 'fs/promises';
import { ensureDataDir, dataFile } from './storage.js';

export default class WordMappingService {
    #MAPPINGS_FILE = dataFile('word-mappings.json');
    #mappings = new Map();

    constructor() {
        this.loadMappings();
    }

    async loadMappings() {
        try {
            await ensureDataDir();
            const data = await fs.readFile(this.#MAPPINGS_FILE, 'utf8');
            const mappingsArray = JSON.parse(data);
            this.#mappings = new Map(mappingsArray);
            console.info(`📚 Loaded ${this.#mappings.size} word mappings`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.info('📚 No word mappings file found, starting with empty mappings');
                this.#mappings = new Map();
            } else {
                console.error('Error loading word mappings:', error);
                this.#mappings = new Map();
            }
        }
    }

    async saveMappings() {
        try {
            await ensureDataDir();
            const mappingsArray = Array.from(this.#mappings.entries());
            await fs.writeFile(this.#MAPPINGS_FILE, JSON.stringify(mappingsArray, null, 2));
            console.info(`💾 Saved ${this.#mappings.size} word mappings`);
        } catch (error) {
            console.error('Error saving word mappings:', error);
            throw error;
        }
    }

    addMapping(fromWord, toWord) {
        const normalizedFrom = fromWord.toLowerCase().trim();
        const normalizedTo = toWord.trim();
        
        if (!normalizedFrom || !normalizedTo) {
            throw new Error('Both from and to words are required');
        }

        this.#mappings.set(normalizedFrom, normalizedTo);
        console.info(`📝 Added mapping: "${normalizedFrom}" → "${normalizedTo}"`);
        return this.saveMappings();
    }

    removeMapping(fromWord) {
        const normalizedFrom = fromWord.toLowerCase().trim();
        const removed = this.#mappings.delete(normalizedFrom);
        
        if (removed) {
            console.info(`🗑️ Removed mapping for: "${normalizedFrom}"`);
            return this.saveMappings();
        }
        
        return Promise.resolve();
    }

    getAllMappings() {
        return Array.from(this.#mappings.entries()).map(([from, to]) => ({
            from,
            to
        }));
    }

    applyMappings(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }

        let modifiedText = text;
        let hasChanges = false;

        // Apply mappings (case-insensitive word replacement)
        for (const [fromWord, toWord] of this.#mappings) {
            // Use word boundaries to match whole words only
            const regex = new RegExp(`\\b${this.escapeRegex(fromWord)}\\b`, 'gi');
            
            if (regex.test(modifiedText)) {
                modifiedText = modifiedText.replace(regex, toWord);
                hasChanges = true;
            }
        }

        if (hasChanges) {
            console.info(`🔄 Applied word mappings: "${text}" → "${modifiedText}"`);
        }

        return modifiedText;
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
} 
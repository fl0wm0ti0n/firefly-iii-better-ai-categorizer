import fs from 'fs/promises';
import { ensureDataDir, dataFile } from './storage.js';

export default class AutoCategorizationService {
    #CONFIG_FILE = dataFile('auto-categorization-config.json');
    #config = {
        enabled: true,
        skipDeposits: true,
        nativeCurrency: 'EUR',
        homeCountry: 'Austria',
        foreignCategory: 'Travel & Foreign',
        foreignKeywords: [
            // Common international cities/countries
            'bangkok', 'london', 'paris', 'new york', 'tokyo', 'singapore',
            'dubai', 'istanbul', 'moscow', 'beijing', 'mumbai', 'sydney',
            'toronto', 'vancouver', 'montreal', 'zurich', 'geneva', 'milan',
            'rome', 'barcelona', 'madrid', 'amsterdam', 'brussels', 'prague',
            'budapest', 'warsaw', 'stockholm', 'oslo', 'copenhagen', 'helsinki',
            
            // Common travel-related terms
            'airport', 'airline', 'hotel', 'booking', 'expedia', 'airbnb',
            'rental car', 'taxi', 'uber', 'lyft', 'train', 'railway',
            'foreign exchange', 'fx', 'currency exchange', 'atm withdrawal',
            
            // Country codes and currencies
            'usd', 'gbp', 'jpy', 'chf', 'cad', 'aud', 'sek', 'nok', 'dkk',
            'czk', 'huf', 'pln', 'rub', 'cny', 'inr', 'krw', 'thb', 'sgd',
            
            // Common international chains
            'mcdonalds', 'starbucks', 'subway', 'kfc', 'burger king',
            'hilton', 'marriott', 'hyatt', 'ibis', 'holiday inn'
        ]
    };

    constructor() {
        this.loadConfig();
    }

    async loadConfig() {
        try {
            await ensureDataDir();
            const data = await fs.readFile(this.#CONFIG_FILE, 'utf8');
            const loadedConfig = JSON.parse(data);
            this.#config = { ...this.#config, ...loadedConfig };
            console.info(`🔧 Loaded auto-categorization config: ${this.#config.nativeCurrency}/${this.#config.homeCountry} → ${this.#config.foreignCategory}`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.info('🔧 No auto-categorization config found, using defaults');
                this.saveConfig();
            } else {
                console.error('Error loading auto-categorization config:', error);
            }
        }
    }

    async saveConfig() {
        try {
            await ensureDataDir();
            await fs.writeFile(this.#CONFIG_FILE, JSON.stringify(this.#config, null, 2));
            console.info(`💾 Saved auto-categorization config`);
        } catch (error) {
            console.error('Error saving auto-categorization config:', error);
            throw error;
        }
    }

    updateConfig(updates) {
        this.#config = { ...this.#config, ...updates };
        return this.saveConfig();
    }

    getConfig() {
        return { ...this.#config };
    }

    /**
     * Check if a transaction should be auto-categorized as foreign/travel
     * @param {Object} transaction - Firefly transaction object
     * @returns {Object|null} - { category, reason } if auto-categorized, null otherwise
     */
    autoCategorize(transaction) {
        if (!this.#config.enabled) {
            return null;
        }

        const firstTx = transaction.attributes?.transactions?.[0];
        if (!firstTx) {
            return null;
        }

        // Skip deposits if option is enabled
        if (this.#config.skipDeposits && firstTx.type === 'deposit') {
            return null;
        }

        // 1. Check currency (non-native currency)
        const currency = firstTx.currency_code || firstTx.foreign_currency_code;
        if (currency && currency !== this.#config.nativeCurrency) {
            return {
                category: this.#config.foreignCategory,
                reason: `Non-native currency: ${currency}`,
                autoRule: 'currency'
            };
        }

        // 2. Check foreign flag
        if (firstTx.foreign_amount !== null && firstTx.foreign_amount !== undefined) {
            return {
                category: this.#config.foreignCategory,
                reason: `Foreign transaction flag detected`,
                autoRule: 'foreign_flag'
            };
        }

        // 3. Check geographic keywords in description and destination
        const description = (firstTx.description || '').toLowerCase();
        const destinationName = (firstTx.destination_name || '').toLowerCase();
        const combinedText = `${description} ${destinationName}`;

        for (const keyword of this.#config.foreignKeywords) {
            if (combinedText.includes(keyword.toLowerCase())) {
                return {
                    category: this.#config.foreignCategory,
                    reason: `Foreign keyword detected: "${keyword}"`,
                    autoRule: 'keyword',
                    matchedKeyword: keyword
                };
            }
        }

        // 4. Check for country names that are not the home country
        const countryPattern = this.#getCountryPattern();
        const foundCountries = combinedText.match(countryPattern);
        if (foundCountries) {
            const nonHomeCountries = foundCountries.filter(country => 
                !country.toLowerCase().includes(this.#config.homeCountry.toLowerCase())
            );
            
            if (nonHomeCountries.length > 0) {
                return {
                    category: this.#config.foreignCategory,
                    reason: `Foreign country detected: ${nonHomeCountries[0]}`,
                    autoRule: 'country',
                    matchedCountry: nonHomeCountries[0]
                };
            }
        }

        return null;
    }

    #getCountryPattern() {
        // Simple pattern for common country names
        const countries = [
            'germany', 'france', 'italy', 'spain', 'netherlands', 'belgium',
            'switzerland', 'poland', 'czech republic', 'hungary', 'slovakia',
            'slovenia', 'croatia', 'serbia', 'romania', 'bulgaria', 'greece',
            'portugal', 'denmark', 'sweden', 'norway', 'finland', 'estonia',
            'latvia', 'lithuania', 'united kingdom', 'ireland', 'iceland',
            'united states', 'canada', 'mexico', 'japan', 'china', 'india',
            'australia', 'new zealand', 'singapore', 'thailand', 'vietnam',
            'south korea', 'taiwan', 'philippines', 'indonesia', 'malaysia',
            'russia', 'ukraine', 'turkey', 'israel', 'egypt', 'south africa',
            'brasil', 'argentina', 'chile', 'colombia', 'peru'
        ];
        
        return new RegExp(`\\b(${countries.join('|')})\\b`, 'gi');
    }

    addForeignKeyword(keyword) {
        const normalizedKeyword = keyword.toLowerCase().trim();
        if (!this.#config.foreignKeywords.includes(normalizedKeyword)) {
            this.#config.foreignKeywords.push(normalizedKeyword);
            this.saveConfig();
            console.info(`➕ Added foreign keyword: "${normalizedKeyword}"`);
            return true;
        }
        return false;
    }

    removeForeignKeyword(keyword) {
        const normalizedKeyword = keyword.toLowerCase().trim();
        const index = this.#config.foreignKeywords.indexOf(normalizedKeyword);
        if (index > -1) {
            this.#config.foreignKeywords.splice(index, 1);
            this.saveConfig();
            console.info(`➖ Removed foreign keyword: "${normalizedKeyword}"`);
            return true;
        }
        return false;
    }

    setForeignKeywords(keywords) {
        // Replace all keywords with the new array
        this.#config.foreignKeywords = keywords
            .map(keyword => keyword.toLowerCase().trim())
            .filter(keyword => keyword.length > 0);
        
        this.saveConfig();
        console.info(`📝 Updated foreign keywords: ${this.#config.foreignKeywords.length} total`);
        return true;
    }

    getStats() {
        return {
            enabled: this.#config.enabled,
            nativeCurrency: this.#config.nativeCurrency,
            homeCountry: this.#config.homeCountry,
            foreignCategory: this.#config.foreignCategory,
            keywordCount: this.#config.foreignKeywords.length
        };
    }
} 
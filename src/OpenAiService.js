import OpenAI from 'openai';
import {getConfigVariable} from "./util.js";

export default class OpenAiService {
    #openAi;
    #model = "gpt-4o-mini";
    #stats = {
        totalRequests: 0,
        totalTokens: 0,
        rateLimitHits: 0,
        lastReset: Date.now()
    };

    constructor(deps = {}) {
        const apiKey = getConfigVariable("OPENAI_API_KEY", false);

        this.#openAi = deps.client ?? new OpenAI({ apiKey: apiKey || 'missing', maxRetries: 0 });

        const envModel = getConfigVariable("OPENAI_MODEL", false);
        if (envModel) {
            this.setModel(envModel);
        }
    }

    static createForTest(deps = {}) {
        return new OpenAiService(deps);
    }

    async matchAccount(accountNames, destinationName, description, transactionType = 'withdrawal') {
        try {
            const list = Array.isArray(accountNames) ? accountNames.filter(Boolean) : [];
            if (!list.length) return { name: null, confidence: 0 };
            const guidance = transactionType === 'withdrawal'
                ? 'This is an EXPENSE (money out). Choose an EXPENSE account if any fits.'
                : 'This is a REVENUE (money in). Choose a REVENUE account if any fits.';
            const rules = [
                'Pick AT MOST ONE account.',
                'You MUST return the account name EXACTLY as it appears in the list, if you choose one.',
                'If there is no suitable match, return name: null.',
                'Consider case-insensitive matches and common variations (punctuation, accents, abbreviations), but OUTPUT must be exact from the list.',
                'Use both Payee and Description as hints.',
                'Respond with STRICT JSON only (no backticks, no prose).'
            ];
            const header = `You match a transaction to an existing account name.`;
            const accountsBlock = `Accounts (choose at most one by exact name):\n${list.map(n => `- ${n}`).join('\n')}`;
            const txBlock = `Transaction:\n- Payee: ${destinationName || ''}\n- Description: ${description || ''}\n- Type: ${transactionType}`;
            const rulesBlock = `Rules:\n- ${rules.join('\n- ')}`;
            const prompt = `${header}\n\n${accountsBlock}\n\n${txBlock}\n\n${guidance}\n\n${rulesBlock}\n\nReturn ONLY JSON object: {"name": "<exact from list or null>", "confidence": 0..1}`;
            const estimatedTokens = Math.ceil((prompt.length + 50) / 4);
            try {
                console.info('ai-merchant-prompt', {
                    model: this.#model,
                    totalCandidates: list.length,
                    candidatesPreview: list.slice(0, 15),
                    destinationName: destinationName || '',
                    description: description || '',
                    transactionType,
                    estimatedTokens,
                    prompt
                });
            } catch (_) {}
            const response = await this.#openAi.chat.completions.create({
                model: this.#model,
                messages: [
                    { role: 'system', content: 'You are an assistant that chooses the best matching account name from a provided list. Respond with strict JSON only.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 80,
                temperature: 0.1
            });
            const content = response.choices?.[0]?.message?.content || '{}';
            try {
                console.info('ai-merchant-raw', { content: String(content).substring(0, 2000) });
            } catch (_) {}
            let json = {};
            try {
                json = JSON.parse(content);
            } catch (_) {
                const m = content.match(/\{[\s\S]*\}/);
                json = m ? JSON.parse(m[0]) : {};
            }
            const name = (typeof json.name === 'string' && list.includes(json.name)) ? json.name : null;
            const confidence = Number(json.confidence || 0);
            try {
                console.info('ai-merchant-match-response', {
                    name,
                    confidence: Number.isFinite(confidence) ? confidence : 0,
                    rawPreview: String(content).substring(0, 500)
                });
            } catch (_) {}
            return { name, confidence: Number.isFinite(confidence) ? confidence : 0 };
        } catch (e) {
            console.error('matchAccount error:', e.message);
            return { name: null, confidence: 0 };
        }
    }

    async classify(categories, destinationName, description, transactionType = 'withdrawal', options = {}) {
        const prompt = this.#generatePrompt(categories, destinationName, description, transactionType, options);
        const estimatedTokens = Math.ceil((prompt.length + 50) / 4);

        try {
            const categoryNames = categories.filter(Boolean);
            const response = await this.#openAi.chat.completions.create({
                model: this.#model,
                messages: [
                    {
                        role: "system",
                        content: "You are a financial transaction categorizer. Respond only with the exact category name from the provided list, or 'UNKNOWN' if no category fits."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 50,
                temperature: 0.1,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'transaction_category',
                        strict: true,
                        schema: this.#buildCategorySchema(categoryNames)
                    }
                }
            });

            this.#stats.totalRequests++;
            this.#stats.totalTokens += estimatedTokens;

            const message = response.choices[0].message;

            if (message.refusal) {
                return { category: null, confidence: 0, response: message.refusal, prompt };
            }

            const rawContent = message.content;
            let parsed;
            try {
                parsed = JSON.parse(rawContent);
            } catch (parseErr) {
                console.warn(`OpenAI returned non-JSON content: ${rawContent}`);
                return { category: null, confidence: 0, response: rawContent, prompt };
            }

            const guess = parsed.category;
            const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
            if (guess === 'UNKNOWN') {
                return { category: null, confidence: confidence || 0, response: 'UNKNOWN', prompt };
            }

            console.info(`✅ Successfully classified transaction as: ${guess}`);
            return { category: guess, confidence: confidence || 0.5, response: guess, prompt };

        } catch (error) {
            if (error instanceof OpenAI.APIError) {
                const status = error.status;
                if (status === 429) {
                    this.#stats.rateLimitHits++;
                    console.error("🚨 OpenAI Rate Limit/Quota exceeded:");
                    console.error("   - You may have exceeded your API quota");
                    console.error("   - Try again in a few minutes");
                    console.error("   - Check your OpenAI billing dashboard");
                    console.error(`📊 Current session stats: ${this.#stats.totalRequests} requests, ${this.#stats.totalTokens} tokens, ${this.#stats.rateLimitHits} rate limits`);
                    throw new OpenAiException(status, error, "Rate limit exceeded. Please check your OpenAI quota and billing.");
                } else if (status === 401) {
                    console.error("🚨 OpenAI Authentication failed:");
                    console.error("   - Check your OPENAI_API_KEY");
                    throw new OpenAiException(status, error, "Invalid API key. Please check your OPENAI_API_KEY.");
                } else if (status === 400) {
                    console.error("🚨 OpenAI Bad Request:");
                    console.error("   - Invalid request parameters");
                    console.error("   - Error details:", error.message);
                    throw new OpenAiException(status, error, error.message);
                } else {
                    console.error(`🚨 OpenAI API Error (${status}):`, error.message);
                    throw new OpenAiException(status, error, error.message);
                }
            }
            console.error("🚨 Network error while communicating with OpenAI:", error.message);
            throw new OpenAiException(null, null, `Network error: ${error.message}`);
        }
    }

    #buildCategorySchema(categories) {
        const enumValues = [...categories.filter(Boolean), 'UNKNOWN'];
        return {
            type: 'object',
            properties: {
                category: {
                    type: 'string',
                    enum: enumValues,
                    description: 'Exact category name from the provided list, or UNKNOWN if none fits',
                },
                confidence: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1,
                    description: 'Confidence score between 0 and 1 indicating certainty of classification',
                },
            },
            required: ['category', 'confidence'],
            additionalProperties: false,
        };
    }

    #generatePrompt(categories, destinationName, description, transactionType, options = {}) {
        const typeGuidance = transactionType === 'withdrawal' 
            ? 'This is a WITHDRAWAL (money going out). Choose categories appropriate for expenses, purchases, or outgoing payments.'
            : 'This is a DEPOSIT (money coming in). Choose categories appropriate for income, refunds, or incoming payments.';

        const suggested = options.suggestedCategory
            ? `\nSuggested category (from user keyword rule, prefer if it fits): ${options.suggestedCategory}`
            : '';

        return `Given I want to categorize transactions on my bank account into these categories: ${categories.join(", ")}

In which category would a transaction from "${destinationName}" with the subject "${description}" fall into?

Transaction Type: ${transactionType}
${typeGuidance}${suggested}

Rules:
- Respond with ONLY the exact category name from the list above
- If no category fits well, respond with "UNKNOWN"
- Provide a confidence score between 0 and 1:
  * 0.9–1.0: Clear match, high certainty
  * 0.6–0.8: Reasonable match, moderate certainty
  * 0.3–0.5: Uncertain match, low certainty
  * 0.0–0.2: Very uncertain, likely wrong
- Pay attention to transaction type: withdrawals are expenses, deposits are income
- Do not explain your reasoning`;
    }

    setModel(model) {
        const supportedModels = ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"];
        if (supportedModels.includes(model)) {
            this.#model = model;
            console.info(`✅ Switched to OpenAI model: ${model}`);
        } else {
            console.warn(`⚠️ Unsupported model: ${model}. Using default: ${this.#model}`);
        }
    }

    getModel() {
        return this.#model;
    }

    getStats() {
        return { ...this.#stats };
    }

    resetStats() {
        this.#stats = {
            totalRequests: 0,
            totalTokens: 0,
            rateLimitHits: 0,
            lastReset: Date.now()
        };
        console.info("📊 OpenAI statistics reset");
    }

    async extractTransactionsFromText(text, options = {}) {
        try {
            const currency = options.accountCurrency || 'EUR';
            const messages = [
                { role: 'system', content: `You extract individual purchase transactions from statement text (language/layout varies). Return ONLY a JSON array of objects {"description": string, "destination_name": string, "amount": number, "date": "YYYY-MM-DD"|null}. Amount must be the billed/charged amount in ${currency} (account currency), not the original foreign currency. Include small conversion fee rows. Amounts must be positive for purchases. No additional text.` },
                { role: 'user', content: text.substring(0, 12000) }
            ];
            const response = await this.#openAi.chat.completions.create({
                model: this.#model,
                messages,
                temperature: 0.1,
                max_tokens: 800
            });
            const content = response.choices?.[0]?.message?.content || '[]';
            const jsonText = this.#safeExtractJson(content);
            const parsed = JSON.parse(jsonText);
            if (options.returnRaw) {
                return { transactions: Array.isArray(parsed) ? parsed : [], raw: content, prompt: text.substring(0, 12000) };
            }
            if (Array.isArray(parsed)) return parsed;
            return [];
        } catch (e) {
            console.error('extractTransactionsFromText error:', e.message);
            return [];
        }
    }

    #safeExtractJson(text) {
        const match = text.match(/\[([\s\S]*?)\]$/m) || text.match(/\[([\s\S]*?)\]/m);
        return match ? match[0] : '[]';
    }
}

class OpenAiException extends Error {
    code;
    response;
    body;

    constructor(statusCode, response, body) {
        super(`Error while communicating with OpenAI: ${statusCode} - ${body}`);

        this.code = statusCode;
        this.response = response;
        this.body = body;
    }
}

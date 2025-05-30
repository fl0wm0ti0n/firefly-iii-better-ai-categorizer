import {Configuration, OpenAIApi} from "openai";
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

    constructor() {
        const apiKey = getConfigVariable("OPENAI_API_KEY")

        const configuration = new Configuration({
            apiKey
        });

        this.#openAi = new OpenAIApi(configuration)
        
        // Modell aus Umgebungsvariablen lesen
        const envModel = getConfigVariable("OPENAI_MODEL", false);
        if (envModel) {
            this.setModel(envModel);
        }
    }

    async classify(categories, destinationName, description, transactionType = 'withdrawal') {
        try {
            const prompt = this.#generatePrompt(categories, destinationName, description, transactionType);

            // Estimated token count (rough: 1 token ≈ 4 characters)
            const estimatedTokens = Math.ceil((prompt.length + 50) / 4);
            
            const response = await this.#openAi.createChatCompletion({
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
                presence_penalty: 0
            });

            // Statistiken aktualisieren
            this.#stats.totalRequests++;
            this.#stats.totalTokens += estimatedTokens;

            let guess = response.data.choices[0].message.content;
            guess = guess.replace("\n", "");
            guess = guess.trim();

            if (categories.indexOf(guess) === -1) {
                console.warn(`OpenAI could not classify the transaction.`);
                console.warn(`Prompt: ${prompt}`);
                console.warn(`OpenAI's guess: ${guess}`);
                console.warn(`Available categories: ${categories.join(", ")}`);
                return {
                    prompt,
                    response: guess,
                    category: null
                };
            }

            console.info(`✅ Successfully classified transaction as: ${guess}`);
            return {
                prompt,
                response: guess,
                category: guess
            };

        } catch (error) {
            if (error.response) {
                const status = error.response.status;
                const errorData = error.response.data;
                
                if (status === 429) {
                    this.#stats.rateLimitHits++;
                    console.error("🚨 OpenAI Rate Limit/Quota exceeded:");
                    console.error("   - You may have exceeded your API quota");
                    console.error("   - Try again in a few minutes");
                    console.error("   - Check your OpenAI billing dashboard");
                    console.error(`📊 Current session stats: ${this.#stats.totalRequests} requests, ${this.#stats.totalTokens} tokens, ${this.#stats.rateLimitHits} rate limits`);
                    throw new OpenAiException(status, error.response, "Rate limit exceeded. Please check your OpenAI quota and billing.");
                } else if (status === 401) {
                    console.error("🚨 OpenAI Authentication failed:");
                    console.error("   - Check your OPENAI_API_KEY");
                    throw new OpenAiException(status, error.response, "Invalid API key. Please check your OPENAI_API_KEY.");
                } else if (status === 400) {
                    console.error("🚨 OpenAI Bad Request:");
                    console.error("   - Invalid request parameters");
                    console.error("   - Error details:", errorData);
                    throw new OpenAiException(status, error.response, `Bad request: ${errorData?.error?.message || 'Unknown error'}`);
                } else {
                    console.error(`🚨 OpenAI API Error (${status}):`, errorData);
                    throw new OpenAiException(status, error.response, errorData?.error?.message || errorData);
                }
            } else {
                console.error("🚨 Network error while communicating with OpenAI:", error.message);
                throw new OpenAiException(null, null, `Network error: ${error.message}`);
            }
        }
    }

    #generatePrompt(categories, destinationName, description, transactionType) {
        const typeGuidance = transactionType === 'withdrawal' 
            ? 'This is a WITHDRAWAL (money going out). Choose categories appropriate for expenses, purchases, or outgoing payments.'
            : 'This is a DEPOSIT (money coming in). Choose categories appropriate for income, refunds, or incoming payments.';

        return `Given I want to categorize transactions on my bank account into these categories: ${categories.join(", ")}

In which category would a transaction from "${destinationName}" with the subject "${description}" fall into?

Transaction Type: ${transactionType}
${typeGuidance}

Rules:
- Respond with ONLY the exact category name from the list above
- If no category fits well, respond with "UNKNOWN"
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
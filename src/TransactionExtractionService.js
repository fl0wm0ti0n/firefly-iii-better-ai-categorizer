import fs from 'fs/promises';
import { ensureDataDir, dataFile } from './storage.js';
import { parse } from 'csv-parse/sync';
import pdfParse from 'pdf-parse';

export default class TransactionExtractionService {
    // resolve config file path lazily to align with the final data dir
    #configFile() { return dataFile('extraction-config.json'); }
    #config = {
        defaultTag: 'card-statement-split',
        useAIForParsing: true,
        headerMapping: {},
        accountCurrency: 'EUR',
        lastUsed: null
    };

    constructor() {
        this.loadConfig();
    }

    async loadConfig() {
        try {
            await ensureDataDir();
            const raw = await fs.readFile(this.#configFile(), 'utf8');
            const loaded = JSON.parse(raw);
            this.#config = { ...this.#config, ...loaded };
        } catch (e) {
            if (e.code !== 'ENOENT') {
                console.error('Failed to load extraction config:', e.message);
            }
            await this.saveConfig();
        }
    }

    async saveConfig() {
        await ensureDataDir();
        await fs.writeFile(this.#configFile(), JSON.stringify(this.#config, null, 2));
    }

    getConfig() {
        return { ...this.#config };
    }

    async updateConfig(update) {
        this.#config = { ...this.#config, ...update, lastUsed: new Date().toISOString() };
        await this.saveConfig();
        return this.getConfig();
    }

    sanitizeTag(value) {
        if (!value) return '';
        return value
            .toString()
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 50);
    }

    parseCsv(buffer, headerMapping = {}) {
        const text = buffer.toString('utf8');
        const records = parse(text, {
            columns: true,
            skip_empty_lines: true,
            relax_column_count: true,
            trim: true
        });

        const mapped = [];
        for (const row of records) {
            const amount = this.#pickAmount(row, headerMapping);
            const description = this.#pickField(row, ['description','bezeichnung','text','details','verwendungszweck'], headerMapping);
            const destination = this.#pickField(row, ['destination','empfaenger','händler','haendler','vendor','merchant','partner'], headerMapping) || description;
            const date = this.#pickField(row, ['date','datum','buchungstag','transaction-date'], headerMapping) || null;
            if (amount == null || description == null) continue;
            mapped.push({ description, destination_name: destination, amount: this.#normalizeAmount(amount), date });
        }
        // debug: record csv parse stats
        try { this.#writeDebug('csv', { rows: mapped.length, headerMapping }); } catch(_) {}
        return mapped;
    }

    async parsePdf(buffer, openAiService) {
        const data = await pdfParse(buffer);
        const text = data.text || '';
        try { await this.#writeDebug('pdf-start', { length: text.length }); } catch(_) {}
        // Deterministic pass for common statement table
        const deterministic = this.#parseStatementTable(text);
        if (deterministic.length) {
            const processed = this.#postProcess(deterministic.filter(i => !this.#shouldIgnore(i)));
            try { await this.#writeDebug('deterministic', { items: processed.slice(0, 50), total: processed.length }); } catch(_) {}
            return processed;
        }
        if (openAiService && this.#config.useAIForParsing) {
            const debugResult = await openAiService.extractTransactionsFromText(this.#buildPdfPrompt(text), { accountCurrency: this.#config.accountCurrency || 'EUR', returnRaw: true });
            const results = Array.isArray(debugResult.transactions) ? debugResult.transactions : [];
            if (results.length > 0) {
                // ensure normalization + filtering
                const items = results
                    .map(i => ({
                        description: i.description,
                        destination_name: i.destination_name || i.description,
                        amount: this.#normalizeAmount(i.amount),
                        date: i.date || null
                    }))
                    .filter(i => i.amount != null && i.description)
                    .filter(i => !this.#shouldIgnore(i));
                // Debug payload persisted for traceability
                try {
                    await this.#writeDebug('ai', { inputSnippet: text.substring(0, 5000), prompt: debugResult.prompt, raw: debugResult.raw, items });
                } catch (_) {}
                const out = this.#postProcess(items);
                return out;
            } else {
                try {
                    await this.#writeDebug('ai-empty', { inputSnippet: text.substring(0, 5000), prompt: debugResult.prompt, raw: debugResult.raw });
                } catch(_) {}
            }
        }
        // Fallback: heuristic line parsing
        const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
        const items = [];
        for (const rawLine of lines) {
            const line = rawLine.replace(/\s+/g, ' ');
            const amountStr = this.#extractAmountFromLine(line, this.#config.accountCurrency);
            if (!amountStr) continue;
            // description is the line without the final amount token
            const desc = line.replace(amountStr, '').trim();
            if (!desc) continue;
            const candidate = { description: desc, destination_name: desc, amount: this.#normalizeAmount(amountStr) };
            if (this.#shouldIgnore(candidate)) continue;
            items.push(candidate);
        }
        const processed = this.#postProcess(items);
        try { await this.#writeDebug('fallback', { inputSnippet: text.substring(0, 5000), items: processed }); } catch(_) {}
        return processed;
    }

    #buildPdfPrompt(text) {
        const currency = this.#config.accountCurrency || 'EUR';
        return `You will receive OCR text from a bank/credit card statement (language and table layout vary).
Extract individual purchase rows and return ONLY a JSON array of objects:
  {
    "description": string,        // concise line/merchant/notes
    "destination_name": string,   // best merchant/payee name
    "amount": number,             // POSITIVE number in ${currency}
    "date": "YYYY-MM-DD" | null
  }

STRICT rules:
- Amount MUST be the billed/charged amount in account currency (${currency}), not the original foreign currency.
- Prefer the last/right-most amount column usually named e.g.:
  "Abrechnungsbetrag", "Betrag in ${currency}", "Rechnungsbetrag", "Billed amount", "Charged amount",
  "Total amount", "Amount (${currency})", "Montant", "Importo", "Importe", "Totaal", "Σύνολο", "Сумма".
- If a row has both original currency and ${currency}, ALWAYS use the ${currency} value.
- Include conversion fee rows (e.g., "Umrechnungsentgelt", "currency conversion fee") as separate transactions even if only a few cents.
- Ignore headers/footers/summaries/balances.
- Amounts must be numbers (no currency symbols) and POSITIVE (money out).
- Date: pick transaction date if present; otherwise null.

Return ONLY a JSON array. Input text (truncated):\n\n${text.substring(0, 12000)}`;
    }

    #extractJson(text) { /* deprecated */ return null; }

    #pickField(row, candidates, mapping) {
        for (const key of Object.keys(row)) {
            const norm = key.toLowerCase();
            if (mapping[key]) return row[mapping[key]];
            if (candidates.includes(norm)) return row[key];
        }
        return null;
    }

    #pickAmount(row, mapping) {
        // Prioritize billed/charged amount columns in account currency
        const priority = [
            'abrechnungsbetrag','rechnungsbetrag','betrag eur','betrag in eur','amount eur','amount (eur)',
            'billed amount','charged amount','total amount','total','amount'
        ];
        // allow mapping overrides
        for (const key of Object.keys(row)) {
            if (mapping[key]) return row[mapping[key]];
        }
        const keys = Object.keys(row);
        for (const p of priority) {
            const found = keys.find(k => k.toLowerCase().includes(p));
            if (found) return row[found];
        }
        // fallback: any numeric-looking field
        for (const key of keys) {
            const val = row[key];
            if (val && /-?\d/.test(String(val))) return val;
        }
        return null;
    }

    #normalizeAmount(v) {
        if (typeof v === 'number') return Math.abs(v);
        if (!v) return null;
        const s = v.toString().replace(/\./g, '').replace(/,/g, '.').replace(/[^0-9\.-]/g, '');
        const num = parseFloat(s);
        if (isNaN(num)) return null;
        return Math.abs(num);
    }

    #extractAmountFromLine(line, currency = 'EUR') {
        // Prefer an amount that is explicitly marked as account currency
        const curRe = new RegExp(`(?:${currency}|€)\s*[-+]?\s*(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))`, 'i');
        const mCur = line.match(curRe);
        if (mCur) return mCur[1];
        // Otherwise, take the last numeric amount on the line (usually right-most column)
        const matches = [...line.matchAll(/[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})/g)];
        if (matches.length) return matches[matches.length - 1][0];
        return null;
    }

    #parseStatementTable(text) {
        const rows = [];
        const lines = (text || '')
            .split(/\n+/)
            .map(s => s.replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        const dateRowRe = /^(\d{2}\.\d{2}\.\d{4})(?:\s+(\d{2}\.\d{2}\.\d{4}))?\b(.*)$/;
        const amountRe = /(EUR|USD|CHF|UAH)\s*([-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))\b/g;
        for (const line of lines) {
            const m = line.match(dateRowRe);
            if (!m) continue;
            const rest = m[3].trim();
            const all = [...rest.matchAll(amountRe)];
            if (!all.length) continue;
            const last = all[all.length - 1];
            const amountStr = last[2];
            let desc = rest.replace(last[0], ' ').replace(/\b(EUR|USD|CHF|UAH)\b/g, ' ');
            desc = desc.replace(/\s{2,}/g, ' ').trim();
            if (!desc) continue;
            const candidate = {
                description: desc,
                destination_name: desc,
                amount: this.#normalizeAmount(amountStr),
                date: this.#normalizeDate(m[1])
            };
            rows.push(candidate);
        }
        return rows;
    }

    #normalizeDate(dmy) {
        if (!dmy) return null;
        const m = dmy.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (!m) return null;
        return `${m[3]}-${m[2]}-${m[1]}`;
    }

    #shouldIgnore(item) {
        const text = `${(item.description||'')} ${(item.destination_name||'')}`.toLowerCase();
        const ignorePatterns = [
            'alter kartensaldo',
            'ihre zahlung vormonat',
            'kontostand neu',
            'seitenübertrag', 'seitenuebertrag',
            'bitte nicht einzahlen',
            'iban',
            'rechnungsbetrag',
            'umsatzdatum', 'buchungsdatum', 'kurs',
        ];
        for (const p of ignorePatterns) {
            if (text.includes(p)) return true;
        }
        if (item.amount != null && Math.abs(Number(item.amount)) < 0.001) return true;
        return false;
    }

    #postProcess(items) {
        if (!Array.isArray(items)) return [];
        const out = [];
        for (const it of items) {
            const prev = out[out.length - 1];
            if (prev && prev.description === it.description && prev.destination_name === it.destination_name && Number(prev.amount) === Number(it.amount)) {
                continue;
            }
            out.push(it);
        }
        return out;
    }

    async #writeDebug(kind, payload) {
        try {
            await ensureDataDir();
            const file = dataFile(`extraction-debug-${kind}.log`);
            const line = `[${new Date().toISOString()}] ${JSON.stringify(payload)}\n`;
            await fs.appendFile(file, line, 'utf8');
        } catch (e) {
            try { console.error('debug-write-failed', kind, e.message); } catch(_) {}
        }
    }
}



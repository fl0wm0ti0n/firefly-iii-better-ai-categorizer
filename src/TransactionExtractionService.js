import fs from 'fs/promises';
import path from 'path';
import { ensureDataDir, dataFile } from './storage.js';
import { parse } from 'csv-parse/sync';
import pdfParse from 'pdf-parse';

export default class TransactionExtractionService {
    // resolve config file path lazily to align with the final data dir
    #configFile() { return dataFile('extraction-config.json'); }
    #config = {
        defaultTag: 'creditcard-split',
        useAIForParsing: true,
        useAIPrimary: false,
        aiMergeWithDeterministic: true,
        amountMergeTolerance: 0.02,
        dateMergeToleranceDays: 2,
        headerMapping: {},
        accountCurrency: 'EUR',
        lastUsed: null
    };

    /**
     * Create a new TransactionExtractionService.
     *
     * How to use:
     * @example
     * const service = new TransactionExtractionService();
     * await service.loadConfig();
     */
    constructor() {
        this.loadConfig();
    }

    /**
     * Load configuration from disk into memory. Creates a default file if missing.
     *
     * How to use:
     * @example
     * await service.loadConfig();
     *
     * @returns {Promise<void>}
     */
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

    /**
     * Persist current configuration to disk.
     *
     * How to use:
     * @example
     * await service.saveConfig();
     *
     * @returns {Promise<void>}
     */
    async saveConfig() {
        await ensureDataDir();
        await fs.writeFile(this.#configFile(), JSON.stringify(this.#config, null, 2));
    }

    /**
     * Get a snapshot of the current configuration.
     *
     * How to use:
     * @example
     * const cfg = service.getConfig();
     * console.log(cfg.accountCurrency);
     *
     * @returns {object}
     */
    getConfig() {
        return { ...this.#config };
    }

    /**
     * Merge and persist configuration updates.
     *
     * How to use:
     * @example
     * await service.updateConfig({ useAIForParsing: false });
     *
     * @param {object} update Partial configuration to merge
     * @returns {Promise<object>} Updated configuration snapshot
     */
    async updateConfig(update) {
        this.#config = { ...this.#config, ...update, lastUsed: new Date().toISOString() };
        await this.saveConfig();
        return this.getConfig();
    }

    /**
     * Normalize an arbitrary tag string to a safe, kebab-cased tag.
     *
     * How to use:
     * @example
     * service.sanitizeTag('My Fancy Tag!'); // 'my-fancy-tag'
     *
     * @param {string} value
     * @returns {string}
     */
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

    // removed startup debug helper once logging verified

    /**
     * Parse a CSV buffer into normalized transaction candidates.
     *
     * How to use:
     * @example
     * import fs from 'fs/promises';
     * const buf = await fs.readFile('statement.csv');
     * const items = service.parseCsv(buf, { Amount: 'Betrag in EUR' });
     *
     * @param {Buffer} buffer CSV content
     * @param {object} [headerMapping] Optional column mapping
     * @returns {Array<{description:string,destination_name:string,amount:number,date:string|null,direction:'in'|'out'}>}
     */
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
            const amountStr = String(amount);
            mapped.push({ description, destination_name: destination, amount: this.#normalizeAmount(amountStr), date, direction: this.#directionFromAmountStr(amountStr) });
        }
        // debug: record csv parse stats
        try { this.#writeDebug('csv', { rows: mapped.length, headerMapping }); } catch(_) {}
        return mapped;
    }

    /**
     * Parse a PDF buffer using deterministic heuristics and optionally AI.
     *
     * How to use:
     * @example
     * import fs from 'fs/promises';
     * const pdf = await fs.readFile('statement.pdf');
     * const results = await service.parsePdf(pdf, openAiService, { forceAI: false });
     *
     * @param {Buffer} buffer PDF content
     * @param {object} [openAiService] Service with extractTransactionsFromText(prompt,opts)
     * @param {{forceAI?:boolean}} [options]
     * @returns {Promise<Array<{description:string,destination_name:string,amount:number,date:string|null,direction:'in'|'out'}>&{_statementTotal?:number|null}>}
     */
    async parsePdf(buffer, openAiService, options = {}) {
        const forceAI = Boolean(options.forceAI);
        const data = await pdfParse(buffer);
        const text = data.text || '';
        try { await this.#writeDebug('pdf-start', { length: text.length, head: text.substring(0, 2000) }); } catch(_) {}
        // Extract statement ending balance if present (used only for matching sums)
        const statementTotal = this.#extractStatementTotal(text);
        // Extract table-only slice to reduce noise for AI/fallback
        const tableOnly = this.#extractTableOnly(text);
        try { await this.#writeDebug('pdf-table-slice', { lines: tableOnly.split(/\n+/).length, head: tableOnly.substring(0, 1500) }); } catch(_) {}
        // Deterministic pass: try anchor-first on table slice, then legacy on full text
        const anchorDet = this.#parseAnchorRows(tableOnly);
        const deterministic = (anchorDet && anchorDet.length) ? anchorDet : this.#parseStatementTable(text);
        const deterministicProcessed = this.#postProcess(deterministic.filter(i => !this.#shouldIgnore(i)));
        if (deterministicProcessed.length > 0) {
            try { await this.#writeDebug('deterministic', { items: deterministicProcessed.slice(0, 50), total: deterministicProcessed.length }); } catch(_) {}
        } else if (deterministic.length > 0) {
            try { await this.#writeDebug('deterministic-empty-after-filter', { found: deterministic.length }); } catch(_) {}
        } else {
            try { await this.#writeDebug('deterministic-empty', { reason: 'no matches found' }); } catch(_) {}
        }

        // Default: use deterministic rows when available (single + batch parity). AI only when forced or empty.
        if (deterministicProcessed.length > 0 && !forceAI) {
            deterministicProcessed._statementTotal = statementTotal;
            return deterministicProcessed;
        }

        // Optionally run AI first and merge with deterministic for best of both
        if (openAiService && this.#config.useAIForParsing && (this.#config.useAIPrimary || forceAI)) {
            const promptSource = /(\d{2}\.\d{2}\.\d{4})/.test(tableOnly) && tableOnly.length > 200 ? tableOnly : text;
            const prompt = this.#buildPdfPrompt(promptSource);
            try { await this.#writeDebug('ai-request', { prompt, note: this.#config.useAIPrimary ? 'ai-primary' : undefined }); } catch(_) {}
            const debugResult = await openAiService.extractTransactionsFromText(prompt, { accountCurrency: this.#config.accountCurrency || 'EUR', returnRaw: true });
            try { await this.#writeDebug('ai-response', { raw: debugResult.raw ? String(debugResult.raw).substring(0, 5000) : null }); } catch(_) {}
            const results = Array.isArray(debugResult.transactions) ? debugResult.transactions : [];
            if (results.length > 0) {
                const aiItems = results
                    .map(i => ({
                        description: i.description,
                        destination_name: i.destination_name || this.#extractPayeeFromDesc(i.description || ''),
                        amount: this.#normalizeAmount(i.amount),
                        date: i.date || null,
                        direction: this.#inferDirectionFromText(i.description || '')
                    }))
                    .filter(i => i.amount != null && i.description)
                    .filter(i => !this.#shouldIgnore(i));
                const merged = this.#config.aiMergeWithDeterministic
                    ? this.#mergeAiWithDeterministic(aiItems, deterministicProcessed)
                    : aiItems;
                const detCount = deterministicProcessed.length;
                const aiCount = merged.length;
                // If AI clearly undercounts vs deterministic, prefer deterministic to avoid missing rows
                const minKeep = Math.max(3, Math.ceil(detCount * 0.9));
                if (detCount > 0 && (aiCount === 0 || aiCount <= minKeep)) {
                    try { await this.#writeDebug('ai', { note: 'ai-undercount-switch', detCount, aiCount }); } catch (_) {}
                    const out = this.#postProcess(deterministicProcessed);
                    if (out.length > 0) { out._statementTotal = statementTotal; return out; }
                }
                try { await this.#writeDebug('ai', { inputSnippet: promptSource.substring(0, 5000), prompt, items: merged, note: 'ai-primary-enriched' }); } catch (_) {}
                const out = this.#postProcess(merged);
                if (out.length > 0) { out._statementTotal = statementTotal; return out; }
            } else {
                try { await this.#writeDebug('ai-empty', { inputSnippet: promptSource.substring(0, 5000), note: this.#config.useAIPrimary ? 'ai-primary' : undefined }); } catch(_) {}
            }
        }

        // If AI-primary yielded nothing, fall back to deterministic if available
        if (deterministicProcessed.length > 0) {
            deterministicProcessed._statementTotal = statementTotal;
            return deterministicProcessed;
        }
        if (openAiService && this.#config.useAIForParsing && forceAI) {
            const promptSource = /(\d{2}\.\d{2}\.\d{4})/.test(tableOnly) && tableOnly.length > 200 ? tableOnly : text;
            const prompt = this.#buildPdfPrompt(promptSource);
            try { await this.#writeDebug('ai-request', { prompt }); } catch(_) {}
            const debugResult = await openAiService.extractTransactionsFromText(prompt, { accountCurrency: this.#config.accountCurrency || 'EUR', returnRaw: true });
            try { await this.#writeDebug('ai-response', { raw: debugResult.raw ? String(debugResult.raw).substring(0, 5000) : null }); } catch(_) {}
            const results = Array.isArray(debugResult.transactions) ? debugResult.transactions : [];
            if (results.length > 0) {
                // ensure normalization + filtering
                const items = results
                    .map(i => ({
                        description: i.description,
                        destination_name: i.destination_name || this.#extractPayeeFromDesc(i.description || ''),
                        amount: this.#normalizeAmount(i.amount),
                        date: i.date || null,
                        direction: 'out'
                    }))
                    .filter(i => i.amount != null && i.description)
                    .filter(i => !this.#shouldIgnore(i));
                // Debug payload persisted for traceability
                try { await this.#writeDebug('ai', { inputSnippet: text.substring(0, 5000), prompt, raw: debugResult.raw, items }); } catch (_) {}
                const out = this.#postProcess(items);
                out._statementTotal = statementTotal;
                return out;
            } else {
                try { await this.#writeDebug('ai-empty', { inputSnippet: text.substring(0, 5000) }); } catch(_) {}
            }
        }
        // Fallback: stricter heuristic on single lines — require a date on the line and an explicit EUR/€ amount
        const fallbackSource = /(\d{2}\.\d{2}\.\d{4})/.test(tableOnly) && tableOnly.length > 200 ? tableOnly : text;
        const lines = fallbackSource.split(/\n+/).map(s => s.trim()).filter(Boolean);
        const items = [];
        const dateInlineRe = /(\d{2}\.\d{2}\.\d{4})/;
        for (let idx = 0; idx < lines.length; idx++) {
            const rawLine = lines[idx];
            const line = rawLine.replace(/\s+/g, ' ');
            const dm = line.match(dateInlineRe);
            if (!dm) continue; // must have a date on the same line
            const amt = this.#extractEURAmountWithDirection(line);
            if (!amt) continue; // must have explicit EUR/€ amount
            let desc = line.replace(amt.matchedToken, ' ');
            desc = desc
                .replace(/(?:^|\s)(?:EUR|USD|CHF|UAH|€)\s*[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b/g, ' ')
                .replace(/\b([A-Z]{3})\s*[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b/g, ' ')
                .replace(/\b0[.,]\d{2,6}\b/g, ' ')
                .replace(dateInlineRe, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();
            // If the cleaned line has no letters, try to stitch description from neighbor lines
            if (!desc || !/[A-Za-zÄÖÜäöü]/.test(desc)) {
                const stitched = this.#findAdjacentDescription(idx, lines);
                if (stitched) desc = stitched.trim();
            }
            if (!desc || !/[A-Za-zÄÖÜäöü]/.test(desc)) continue;
            const candidate = {
                description: desc,
                destination_name: this.#extractPayeeFromDesc(desc),
                amount: this.#normalizeAmount(amt.amountStr),
                direction: amt.direction,
                date: this.#normalizeDate(dm[1])
            };
            if (this.#shouldIgnore(candidate)) continue;
            items.push(candidate);
        }
        const processed = this.#postProcess(items);
        processed._statementTotal = statementTotal;
        try { await this.#writeDebug('fallback', { inputSnippet: text.substring(0, 5000), items: processed }); } catch(_) {}
        return processed;
    }

    // Anchor-based parser for statements where amount+two dates are on one line and description is on the next line
    /**
     * Internal: Parse rows based on amount/date anchors followed by description lines.
     *
     * How to use:
     * @example
     * const rows = this.#parseAnchorRows(ocrText);
     *
     * @param {string} text
     * @returns {Array<object>}
     */
    #parseAnchorRows(text) {
        const items = [];
        const raw = this.#stitchWrapContinuations(String(text || '').split(/\n+/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean));
        if (!raw.length) return items;
        const anchorRe = /(EUR|€)\s*([-+−]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})).*?(\d{2}\.\d{2}\.\d{4}).*?(\d{2}\.\d{2}\.\d{4})/i;
        const amountToken = /(EUR|€)\s*([-+−]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/gi;
        const dateOne = /(\d{2}\.\d{2}\.\d{4})/;
        const feeRe = /(umrechnungsentgelt|barbehebungsentgelt)/i;

        const isDesc = (s) => {
            if (!s) return false;
            const hasLetters = /[A-Za-zÄÖÜäöü]/.test(s);
            if (!hasLetters) return false;
            if (this.#isNonTxnMarker(s) || /^seite\b/i.test(s)) return false;
            if (anchorRe.test(s)) return false; // another anchor
            return true;
        };

        // Collect anchors and candidate descriptions with indices
        const anchors = [];
        const descs = [];
        for (let i = 0; i < raw.length; i++) {
            const line = raw[i];
            if (anchorRe.test(line)) {
                const tokens = [...line.matchAll(amountToken)];
                if (!tokens.length) continue;
                const last = tokens[tokens.length - 1];
                const amountStr = String(last[2]).replace(/\s+/g, '');
                const amount = this.#normalizeAmount(amountStr);
                const direction = this.#directionFromAmountStr(amountStr);
                const dm = line.match(dateOne);
                const date = dm ? this.#normalizeDate(dm[1]) : null;
                anchors.push({ idx: i, amount, direction, date });
            } else if (isDesc(line)) {
                descs.push({ idx: i, text: line });
            }
        }
        if (!anchors.length) return items;

        // Assign descriptions to anchors: forward preference; special-case fees -> attach to next small amount anchor
        const usedDesc = new Set();

        for (let a = 0; a < anchors.length; a++) {
            const cur = anchors[a];
            const nextIdx = a + 1 < anchors.length ? anchors[a + 1].idx : Number.POSITIVE_INFINITY;
            // 1) Prefer forward descriptions strictly between this anchor and the next anchor
            let best = null;
            for (const cand of descs) {
                if (usedDesc.has(cand.idx)) continue;
                if (cand.idx <= cur.idx || cand.idx >= nextIdx) continue;
                // If the description sits immediately above the next anchor, reserve it for that next anchor
                if (nextIdx - cand.idx <= 1) continue;
                const delta = cand.idx - cur.idx;
                const score = delta; // smaller forward distance is better
                if (!best || score < best.score) best = { d: cand, score, delta };
            }
            // 2) If none, allow previous-line fallback only (directly above)
            if (!best) {
                const prevLine = raw[cur.idx - 1];
                if (prevLine && !usedDesc.has(cur.idx - 1) && isDesc(prevLine)) {
                    best = { d: { idx: cur.idx - 1, text: prevLine }, score: 0.5, delta: -1 };
                }
            }
            if (!best) continue; // nothing nearby

            // If best is a fee and the next anchor is a small amount -> leave fee for next anchor; choose next best non-fee
            if (feeRe.test(best.d.text) && a + 1 < anchors.length && Number(anchors[a + 1].amount) <= 5.0) {
                // don't mark used; search next best non-fee
                let nextBest = null;
                for (const cand of descs) {
                    if (usedDesc.has(cand.idx)) continue;
                    if (feeRe.test(cand.text)) continue;
                    if (cand.idx <= cur.idx || cand.idx >= nextIdx) continue;
                    if (nextIdx - cand.idx <= 1) continue;
                    const delta = cand.idx - cur.idx;
                    const score = delta;
                    if (!nextBest || score < nextBest.score) nextBest = { d: cand, score, delta };
                }
                if (!nextBest) {
                    // Fallback to immediate previous description if available
                    const prevLine = raw[cur.idx - 1];
                    if (prevLine && !usedDesc.has(cur.idx - 1) && isDesc(prevLine)) {
                        best = { d: { idx: cur.idx - 1, text: prevLine }, score: 0.5, delta: -1 };
                    } else {
                        continue; // avoid mispair
                    }
                } else {
                    best = nextBest;
                }
            }

            const d = best.d;
            usedDesc.add(d.idx);

            const description = d.text
                .replace(amountToken, ' ')
                .replace(/\b([A-Z]{3})\s*[-+−]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b/g, ' ')
                .replace(/\b\d{2}\.\d{2}\.\d{4}\b/g, ' ')
                .replace(/\b0[.,]\d{2,6}\b/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (!description || !/[A-Za-zÄÖÜäöü]/.test(description)) continue;
            const destination_name = this.#extractPayeeFromDesc(description);
            const item = { description, destination_name, amount: cur.amount, direction: cur.direction, date: cur.date };
            if (!this.#shouldIgnore(item)) items.push(item);
        }
        // Additional pass: include fee-only rows (e.g., Barbehebungsentgelt/Umrechnungsentgelt) even when the amount
        // is not on the same line as the description (common in OCR where columns split). Use the previous anchor's date.
        for (const cand of descs) {
            if (usedDesc.has(cand.idx)) continue;
            if (!feeRe.test(cand.text)) continue;
            // Try to get amount from the same description line first
            let amtWithDir = this.#extractEURAmountWithDirection(cand.text);
            // If not found, scan forward within the window until the next anchor for a standalone amount line (no dates)
            if (!amtWithDir) {
                const nextIdx = (anchors.find(a => a.idx > cand.idx)?.idx) ?? Number.POSITIVE_INFINITY;
                for (let k = cand.idx + 1; k < nextIdx; k++) {
                    const probe = raw[k];
                    if (!probe) continue;
                    // Skip other anchors (amount+two dates on one line)
                    if (anchorRe.test(probe)) continue;
                    // Prefer lines that look like amount cells (contain a currency/amount but not obvious headers)
                    const tryAmt = this.#extractAmountWithDirection(probe);
                    if (tryAmt) { amtWithDir = tryAmt; break; }
                }
            }
            // Still not found? Scan backward up to the previous anchor — some PDFs place the amount cell before the fee description
            if (!amtWithDir) {
                const prevIdxLimit = (anchors.slice().reverse().find(a => a.idx < cand.idx)?.idx) ?? -1;
                for (let k = cand.idx - 1; k > prevIdxLimit; k--) {
                    const probe = raw[k];
                    if (!probe) continue;
                    if (anchorRe.test(probe)) continue; // don't cross another anchor line
                    if (this.#isNonTxnMarker(probe) || /^seite\b/i.test(probe)) break;
                    const tryAmt = this.#extractAmountWithDirection(probe);
                    if (!tryAmt) continue;
                    // Prefer small amounts (<= 5 €) to avoid grabbing the main transaction amount
                    const amtNum = this.#normalizeAmount(tryAmt.amountStr);
                    if (amtNum != null && amtNum <= 5.01) { amtWithDir = tryAmt; break; }
                }
            }
            if (!amtWithDir) continue;
            // find previous anchor for date/direction fallback
            const prevAnchor = anchors.slice().reverse().find(a => a.idx < cand.idx);
            const date = prevAnchor ? prevAnchor.date : null;
            const direction = amtWithDir.direction || (prevAnchor ? prevAnchor.direction : 'out');
            const amount = this.#normalizeAmount(amtWithDir.amountStr);
            // Clean description (remove amounts/currency remnants)
            const description = cand.text
                .replace(/(EUR|USD|CHF|UAH|€)\s*[-+−]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})/gi, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();
            const destination_name = this.#extractPayeeFromDesc(description);
            const item = { description, destination_name, amount, direction, date };
            if (!this.#shouldIgnore(item)) items.push(item);
        }
        return items;
    }

    /**
     * Internal: Build an AI prompt from OCR text.
     *
     * How to use:
     * @example
     * const prompt = this.#buildPdfPrompt(text);
     *
     * @param {string} text
     * @returns {string}
     */
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

    /**
     * Internal: Legacy/deprecated JSON extractor.
     *
     * How to use:
     * @example
     * const res = this.#extractJson(text); // null
     *
     * @returns {null}
     */
    #extractJson(text) { /* deprecated */ return null; }

    /**
     * Internal: Pick a field value from a CSV row using candidate names or mapping.
     *
     * How to use:
     * @example
     * const descr = this.#pickField(row, ['description','bezeichnung'], mapping);
     *
     * @param {object} row
     * @param {string[]} candidates
     * @param {object} mapping
     * @returns {any}
     */
    #pickField(row, candidates, mapping) {
        for (const key of Object.keys(row)) {
            const norm = key.toLowerCase();
            if (mapping[key]) return row[mapping[key]];
            if (candidates.includes(norm)) return row[key];
        }
        return null;
    }

    /**
     * Internal: Choose the best numeric amount field from a CSV row.
     *
     * How to use:
     * @example
     * const amount = this.#pickAmount(row, mapping);
     *
     * @param {object} row
     * @param {object} mapping
     * @returns {string|number|null}
     */
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

    /**
     * Internal: Normalize a textual/number amount to a positive number (abs).
     *
     * How to use:
     * @example
     * this.#normalizeAmount('€-1.234,56'); // 1234.56
     *
     * @param {string|number} v
     * @returns {number|null}
     */
    #normalizeAmount(v) {
        if (typeof v === 'number') return Math.abs(v);
        if (!v) return null;
        let s = v.toString()
            .replace(/\u2212/g, '-') // Unicode minus
            .replace(/\u00a0/g, '')   // NBSP
            .replace(/\s+/g, '')
            .replace(/\./g, '')
            .replace(/,/g, '.')
            .replace(/[^0-9\.-]/g, '');
        const num = parseFloat(s);
        if (isNaN(num)) return null;
        return Math.abs(num);
    }

    /**
     * Internal: Extract amount string from a line, preferring explicit account currency.
     *
     * How to use:
     * @example
     * const amt = this.#extractAmountFromLine('EUR -12,34 some text'); // '-12,34'
     *
     * @param {string} line
     * @param {string} [currency='EUR']
     * @returns {string|null}
     */
    #extractAmountFromLine(line, currency = 'EUR') {
        // Prefer an amount that is explicitly marked as account currency
        const curRe = new RegExp(`(?:${currency}|€)\\s*[-+−]?\\s*(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))`, 'i');
        const mCur = line.match(curRe);
        if (mCur) return mCur[1];
        // Otherwise, take the last numeric amount on the line (usually right-most column)
        const matches = [...line.matchAll(/[-+−]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})/g)];
        if (matches.length) return matches[matches.length - 1][0];
        return null;
    }

    /**
     * Internal: Parse statement-style tables from OCR text (date-first strategy).
     *
     * How to use:
     * @example
     * const rows = this.#parseStatementTable(ocrText);
     *
     * @param {string} text
     * @returns {Array<object>}
     */
    #parseStatementTable(text) {
        const rows = [];
        const rawLines = this.#stitchWrapContinuations((text || '')
            .split(/\n+/)
            .map(s => s.replace(/\s+/g, ' ').trim())
            .filter(Boolean));
        const dateRowRe = /^(\d{2}\.\d{2}\.\d{4})(?:\s+(\d{2}\.\d{2}\.\d{4}))?\b(.*)$/;
        // No trailing word-boundary: supports sequences like "EUR-12,00EUR-12,00"
        const amountRe = /(EUR|USD|CHF|UAH|€)\s*([-+−]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/g;

        for (let i = 0; i < rawLines.length; i++) {
            const first = rawLines[i];
            const m = first.match(dateRowRe);
            if (!m) continue;

            const trxDate = this.#normalizeDate(m[1]);

            // Collect following fragments until next row begins (next date) to rebuild one table row
            let current = (m[3] || '').trim();
            let j = i + 1;
            while (j < rawLines.length) {
                const next = rawLines[j];
                if (dateRowRe.test(next)) break; // next row begins
                if (/^seite\b/i.test(next)) { j++; continue; } // skip "Seite X von Y"
                // Stop aggregation on non-transaction summary/balance rows so they don't pollute the last amount
                if (this.#isNonTxnMarker(next)) break;
                current += ' ' + next;
                j++;
            }

            // Extra: detect fee-only lines within this block and emit them as separate items
            try {
                const blockLines = [first].concat(rawLines.slice(i + 1, j));
                for (const ln of blockLines) {
                    const feeHint = /(umrechnungsentgelt|barbehebungsentgelt)/i.test(ln);
                    if (!feeHint) continue;
                    let amt = this.#extractAmountWithDirection(ln);
                    // If the fee description line has no amount, look ahead within the same block for the amount cell
                    if (!amt) {
                        for (let probeIdx = blockLines.indexOf(ln) + 1; probeIdx < blockLines.length; probeIdx++) {
                            const probe = blockLines[probeIdx];
                            if (!probe) continue;
                            // Stop on next date row (block should not contain another date, but be safe)
                            if (/(\d{2}\.\d{2}\.\d{4})/.test(probe)) break;
                            const tryAmt = this.#extractAmountWithDirection(probe);
                            if (tryAmt) { amt = tryAmt; break; }
                        }
                    }
                    // Still not found? Look backward inside the block (some OCR orders columns before description)
                    if (!amt) {
                        for (let probeIdx = blockLines.indexOf(ln) - 1; probeIdx >= 0; probeIdx--) {
                            const probe = blockLines[probeIdx];
                            if (!probe) continue;
                            if (/(\d{2}\.\d{2}\.\d{4})/.test(probe)) break;
                            const tryAmt = this.#extractAmountWithDirection(probe);
                            if (!tryAmt) continue;
                            const amtNum = this.#normalizeAmount(tryAmt.amountStr);
                            if (amtNum != null && amtNum <= 5.01) { amt = tryAmt; break; }
                        }
                    }
                    if (!amt) continue;
                    let descFee = ln.replace(amt.amountStr, ' ')
                        .replace(/\b(EUR|USD|CHF|UAH|€)\b/gi, ' ')
                        .replace(/\s{2,}/g, ' ')
                        .trim();
                    if (descFee && /[A-Za-zÄÖÜäöü]/.test(descFee)) {
                        const feeItem = {
                            description: descFee,
                            destination_name: this.#extractPayeeFromDesc(descFee),
                            amount: this.#normalizeAmount(amt.amountStr),
                            direction: amt.direction,
                            date: trxDate
                        };
                        if (!this.#shouldIgnore(feeItem)) {
                            rows.push(feeItem);
                            // Remove this fee line content from current to avoid capturing its amount as the main item
                            current = current.replace(ln, ' ');
                        }
                    }
                }
            } catch (_) {}

            // Find billed amount in account currency at the right-most side
            const all = [...current.matchAll(amountRe)];
            if (!all.length) { i = j - 1; continue; }
            const last = all[all.length - 1];
            const amountStr = last[2];

            // Description = everything BEFORE the billed EUR amount, with columns scrubbed
            let desc = current.slice(0, last.index);
            desc = desc
                .replace(/(?:^|\s)(?:EUR|USD|CHF|UAH|€)\s*[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b/g, ' ')
                .replace(/\b([A-Z]{3})\s*[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b/g, ' ')
                .replace(/\b[-+−]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b/g, ' ') // standalone amounts left in text
                .replace(/\b0[.,]\d{2,6}\b/g, ' ')
                .replace(/\b\d{2}\.\d{2}\.\d{4}\b/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (!desc || !/[A-Za-zÄÖÜäöü]/.test(desc)) { i = j - 1; continue; }

            rows.push({
                description: desc,
                destination_name: this.#extractPayeeFromDesc(desc),
                amount: this.#normalizeAmount(amountStr),
                direction: this.#directionFromAmountStr(amountStr),
                date: trxDate
            });

            // advance index to the end of consumed block
            i = j - 1;
        }
        if (rows.length > 0) return rows;

        // Alternative pass: amount-first heuristic. For lines with an EUR/€ amount,
        // scan backwards a few lines to find the nearest date, and build the row
        // description from the text between date and amount. Used only if the
        // date-first pass did not yield rows.
        const addIfNew = (candidate) => {
            rows.push(candidate);
        };

        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];
            const matches = [...line.matchAll(amountRe)];
            if (!matches.length) continue;
            const last = matches[matches.length - 1];
            const amountStr = last[2];

            // Find a date within the previous 1..5 lines (inclusive of current line)
            let k = -1;
            let trxDate = null;
            for (let back = 0; back <= 5; back++) {
                const idx = i - back;
                if (idx < 0) break;
                const lm = rawLines[idx].match(/(\d{2}\.\d{2}\.\d{4})/);
                if (lm) {
                    k = idx;
                    trxDate = this.#normalizeDate(lm[1]);
                    break;
                }
            }
            if (k === -1) continue;

            // Build description from lines between k..i, excluding the amount token
            const segment = rawLines.slice(k, i + 1).join(' ');
            let desc = segment.replace(last[0], ' ')
                .replace(/\b(EUR|USD|CHF|UAH|€)\b/g, ' ')
                .replace(/\b([A-Z]{3})\s*[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b/g, ' ')
                .replace(/\b[-+−]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b/g, ' ')
                .replace(/\b0[.,]\d{2,6}\b/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();
            // Drop the leading date(s) from desc
            desc = desc.replace(/^(\d{2}\.\d{2}\.\d{4})(?:\s+\d{2}\.\d{2}\.\d{4})?\s*/, '');
            if (!desc || !/[A-Za-zÄÖÜäöü]/.test(desc)) {
                // Some layouts place the description on the next line; use it if it looks like text
                const next = rawLines[i + 1] ? rawLines[i + 1].replace(/\s+/g, ' ') : '';
                if (this.#isLikelyDescription(next)) {
                    desc = next.trim();
                    // consume the next line as part of this row to avoid re-processing
                    i = i + 1;
                } else {
                    continue;
                }
            }

            addIfNew({
                description: desc,
                destination_name: this.#extractPayeeFromDesc(desc),
                amount: this.#normalizeAmount(amountStr),
                direction: this.#directionFromAmountStr(amountStr),
                date: trxDate
            });
        }
        return rows;
    }

    /**
     * Internal: Extract amount and direction from a line.
     *
     * How to use:
     * @example
     * const info = this.#extractAmountWithDirection('€ -12,34');
     *
     * @param {string} line
     * @param {string} [currency='EUR']
     * @returns {{amountStr:string,direction:'in'|'out'}|null}
     */
    #extractAmountWithDirection(line, currency = 'EUR') {
        const curRe = new RegExp(`(?:${currency}|€)\\s*([-+−]?\\s*\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2}))`, 'i');
        const mCur = line.match(curRe);
        if (mCur) {
            const amountStr = mCur[1].replace(/\s+/g, '');
            return { amountStr, direction: this.#directionFromAmountStr(amountStr) };
        }
        const matches = [...line.matchAll(/([-+−]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/g)];
        if (matches.length) {
            const amountStr = matches[matches.length - 1][1];
            return { amountStr, direction: this.#directionFromAmountStr(amountStr) };
        }
        return null;
    }

    /**
     * Internal: Detect non-transaction markers (headers/footers/summaries).
     *
     * How to use:
     * @example
     * this.#isNonTxnMarker('Kontostand NEU EUR -2.838,15'); // true
     *
     * @param {string} line
     * @returns {boolean}
     */
    #isNonTxnMarker(line) {
        const l = String(line || '').toLowerCase();
        const markers = [
            /seiten(?:übertrag|uebertrag)/i,
            /kontostand\s+neu/i,
            /alter\s+kartensaldo/i,
            /zahlung\s*vormonat/i,
            /carry\s*over|carried\s*forward/i,
            /page\s*(?:sub)?total\b/i,
            /new\s+balance|ending\s+balance|closing\s+balance/i,
            /previous\s+balance|opening\s+balance/i,
            /solde\s+(?:nouveau|final|précédent|precedent)/i,
            /report\s*(?:à|a)\s*nouveau|reporté|reporte/i,
            /saldo\s+(?:final|nuevo|anterior|inicial|nuovo|neu)/i,
            /riporto\b/i,
            /subtot(?:al|ale)|sub\s*total/i,
        ];
        return markers.some(r => r.test(l));
    }

    /**
     * Internal: Heuristic to decide if a line looks like a description.
     *
     * How to use:
     * @example
     * this.#isLikelyDescription('AMAZON EU SARL LU'); // true
     *
     * @param {string} line
     * @returns {boolean}
     */
    #isLikelyDescription(line) {
        if (!line) return false;
        const s = String(line).trim();
        // Must contain letters
        if (!/[A-Za-zÄÖÜäöü]/.test(s)) return false;
        // Not a known non-transaction marker or header
        if (this.#isNonTxnMarker(s) || /^seite\b/i.test(s)) return false;
        // Avoid lines that are just currency/amount blobs
        const amountBlob = /^(?:\D*?(?:EUR|USD|CHF|UAH|€)\s*[-+−]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))+\D*$/i;
        if (amountBlob.test(s)) return false;
        return true;
    }

    /**
     * Internal: Compute adjustments from settlement/balance carry-overs.
     *
     * How to use:
     * @example
     * const adj = this.#computeSumAdjustment(ocrText);
     *
     * @param {string} text
     * @returns {number}
     */
    #computeSumAdjustment(text) {
        const lines = String(text || '')
            .split(/\n+/)
            .map(s => s.replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        let adj = 0;
        // Include settlement/balance-start adjustments only; exclude page carry-overs/subtotals
        const isAdjMarker = (s) => /abbuchung\s+kartenabrechnung|zahlung\s*vormonat|alter\s+kartensaldo|previous\s+balance|opening\s+balance/i.test(s);
        for (const ln of lines) {
            if (!isAdjMarker(ln)) continue;
            const m = ln.match(/(EUR|€)\s*([-+−]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/i);
            if (!m) continue;
            const amount = this.#normalizeAmount(m[2]);
            const dir = this.#directionFromAmountStr(m[2]);
            adj += (dir === 'out' ? Math.abs(amount) : -Math.abs(amount));
        }
        return Number(adj.toFixed(2));
    }

    /**
     * Internal: Extract statement ending balance (absolute value) if present.
     *
     * How to use:
     * @example
     * const total = this.#extractStatementTotal(ocrText); // number|null
     *
     * @param {string} text
     * @returns {number|null}
     */
    #extractStatementTotal(text) {
        // Raiffeisen CardService: "Rechnungsbetrag von EUR 1.351,05" / "Rechnungsbetrag vonEUR 635,04"
        const billMatch = String(text || '').match(
            /rechnungsbetrag\s+von\s*(?:EUR|€)?\s*([-+−]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/i
        );
        if (billMatch) {
            const amount = this.#normalizeAmount(billMatch[1]);
            if (amount != null) return Number(Math.abs(amount).toFixed(2));
        }
        // Look for ending balance lines e.g. "Kontostand NEU EUR -2.838,15" or "Ending balance" etc.
        const lines = String(text || '')
            .split(/\n+/)
            .map(s => s.replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        const balanceMarkers = /(kontostand\s+neu|new\s+balance|ending\s+balance|closing\s+balance|saldo\s+(?:final|nuovo|neu)|solde\s+(?:final|nouveau))/i;
        for (let i = lines.length - 1; i >= 0; i--) {
            const ln = lines[i];
            if (!balanceMarkers.test(ln)) continue;
            const m = ln.match(/(EUR|€)\s*([-+−]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/i);
            if (!m) continue;
            const amount = this.#normalizeAmount(m[2]);
            if (amount != null) return Number(Math.abs(amount).toFixed(2));
        }
        return null;
    }

    /**
     * Internal: Find a likely description line adjacent to an amount/date line.
     *
     * How to use:
     * @example
     * const desc = this.#findAdjacentDescription(i, lines);
     *
     * @param {number} idx
     * @param {string[]} lines
     * @returns {string}
     */
    #findAdjacentDescription(idx, lines) {
        const isAmountDateLine = (t) => {
            if (!t) return false;
            const hasDate = /(\d{2}\.\d{2}\.\d{4})/.test(t);
            const hasEur = /(EUR|€)\s*[-+−]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})/.test(t);
            return hasDate && hasEur;
        };
        for (let d = 1; d <= 3; d++) {
            const fwd = lines[idx + d];
            if (fwd && this.#isLikelyDescription(fwd) && !isAmountDateLine(fwd)) return fwd.replace(/\s+/g, ' ');
            const back = lines[idx - d];
            if (back && this.#isLikelyDescription(back) && !isAmountDateLine(back)) return back.replace(/\s+/g, ' ');
        }
        return '';
    }

    /**
     * Internal: Merge wrap-continuation fragments into the previous line.
     *
     * Targets the specific PDF parsing artifact where a long description column
     * (e.g. "UmrechnungsentgeltOPENAI *CHATGPT SUBSCR" or
     * "UmrechnungsentgeltCURSOR, AI POWERED IDE") is split by pdf-parse across
     * two or more lines. Without this, the deterministic parsers emit a phantom
     * second transaction with the same amount whose description is the leftover
     * wrap fragment (e.g. "SUBSCR" / "IDE").
     *
     * To minimize risk of incorrectly merging unrelated rows, we only stitch
     * when the previous line starts a known fee description keyword
     * (Umrechnungsentgelt / Barbehebungsentgelt) and the current line is a
     * short text fragment that contains no date, no currency/amount token, and
     * no row delimiter. Multiple consecutive continuations are supported.
     *
     * @param {string[]} lines
     * @returns {string[]}
     */
    #stitchWrapContinuations(lines) {
        if (!Array.isArray(lines) || lines.length < 2) return Array.isArray(lines) ? lines : [];
        const hasDate = (s) => /(\d{2}\.\d{2}\.\d{4})/.test(s);
        const hasAmountToken = (s) => /(EUR|USD|CHF|UAH|€)\s*[-+−]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})/i.test(s);
        const feeKeyword = /(umrechnungsentgelt|barbehebungsentgelt)/i;
        const isContinuation = (s) => {
            if (!s) return false;
            if (!/[A-Za-zÄÖÜäöü0-9]/.test(s)) return false;
            if (hasDate(s)) return false;
            if (hasAmountToken(s)) return false;
            if (s.length > 30) return false;
            return true;
        };
        const out = [];
        for (const line of lines) {
            const prev = out.length ? out[out.length - 1] : null;
            if (prev != null && feeKeyword.test(prev) && isContinuation(line)) {
                out[out.length - 1] = (prev + ' ' + line).replace(/\s+/g, ' ').trim();
            } else {
                out.push(line);
            }
        }
        return out;
    }

    /**
     * Internal: Extract a compact, table-only slice from OCR text.
     *
     * How to use:
     * @example
     * const slice = this.#extractTableOnly(ocrText);
     *
     * @param {string} text
     * @returns {string}
     */
    #extractTableOnly(text) {
        const lines = String(text || '').split(/\n+/);
        const out = [];
        let inTable = false;
        const dateAnywhereRe = /(\d{2}\.\d{2}\.\d{4})/;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (dateAnywhereRe.test(line)) {
                // Look back up to 2 lines for a preceding description that belongs to the first row
                if (!inTable) {
                    for (let back = 2; back >= 1; back--) {
                        const prev = lines[i - back];
                        if (!prev) continue;
                        if (this.#isNonTxnMarker(prev) || /^seite\b/i.test(prev)) continue;
                        if (!dateAnywhereRe.test(prev) && this.#isLikelyDescription(prev)) {
                            out.push(prev);
                        }
                    }
                }
                inTable = true;
                out.push(line);
                continue;
            }
            if (!inTable) continue;
            if (this.#isNonTxnMarker(line) || /^seite\b/i.test(line)) { inTable = false; continue; }
            out.push(line);
        }
        return out.join('\n');
    }

    /**
     * Internal: Extract the last explicit EUR amount in a line and its direction.
     *
     * How to use:
     * @example
     * const found = this.#extractEURAmountWithDirection('XYZ EUR -12,34');
     *
     * @param {string} line
     * @returns {{amountStr:string,direction:'in'|'out',matchedToken:string}|null}
     */
    #extractEURAmountWithDirection(line) {
        const eurTokenRe = /(EUR|€)\s*([-+−]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/gi; // must be global for matchAll
        const all = [...line.matchAll(eurTokenRe)];
        if (!all.length) return null;
        const last = all[all.length - 1];
        const amountStr = String(last[2]).replace(/\s+/g, '');
        return { amountStr, direction: this.#directionFromAmountStr(amountStr), matchedToken: last[0] };
    }

    /**
     * Internal: Determine direction ('in' or 'out') from an amount string sign.
     *
     * How to use:
     * @example
     * this.#directionFromAmountStr('-12,34'); // 'out'
     *
     * @param {string} amountStr
     * @returns {'in'|'out'}
     */
    #directionFromAmountStr(amountStr) {
        return /^\s*[-−]/.test(String(amountStr)) ? 'out' : 'in';
    }

    /**
     * Internal: Infer direction based on common description keywords.
     *
     * How to use:
     * @example
     * this.#inferDirectionFromText('Zahlung Vormonat ...'); // 'in'
     *
     * @param {string} desc
     * @returns {'in'|'out'}
     */
    #inferDirectionFromText(desc) {
        const s = String(desc || '').toLowerCase();
        const depositHints = [
            'zahlung vormonat', 'zahlungseingang', 'gutschrift', 'rückzahlung', 'rueckzahlung',
            'abbuchung kartenabrechnung', 'saldoausgleich', 'ausgleich', 'credit balance', 'credit payment'
        ];
        if (depositHints.some(k => s.includes(k))) return 'in';
        return 'out';
    }

    /**
     * Internal: Extract a merchant/payee name from a free-form description.
     *
     * How to use:
     * @example
     * this.#extractPayeeFromDesc('AMAZON EU SARL, EUR -12,34'); // 'AMAZON EU SARL'
     *
     * @param {string} desc
     * @returns {string}
     */
    #extractPayeeFromDesc(desc) {
        if (!desc) return '';
        let s = String(desc).trim();
        // Insert missing space in OCR merges e.g., "UmrechnungsentgeltOPENAI" → "Umrechnungsentgelt OPENAI"
        s = s.replace(/(entgelt)([A-ZÄÖÜ])/i, '$1 $2');
        // Remove trailing numeric tokens and exchange-rate style decimals
        s = s.replace(/\b0[.,]\d{2,6}\b/g, ' ');
        s = s.replace(/\b\d{2}\.\d{2}\.\d{4}\b/g, ' ');
        s = s.replace(/\b([A-Z]{3})\s*[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b/g, ' ');
        // Drop leading currency/period-only artifacts like "EUR- .06.2025"
        s = s.replace(/^\s*(?:EUR|USD|CHF|UAH|€)[^A-Za-z]*$/i, ' ');
        s = s.replace(/\s{2,}/g, ' ').trim();
        // If prefix like Umrechnungsentgelt X, try to capture merchant after prefix
        const feeMatch = s.match(/^(umrechnungsentgelt|barbehebungsentgelt)\s+(.+)$/i);
        if (feeMatch) {
            const tail = feeMatch[2].trim();
            // cut off at first amount/currency token
            const cut = tail.split(/\s+(?:EUR|USD|CHF|UAH)\b|\s+[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})/i)[0];
            if (cut) return cut.trim();
        }
        // Primary split on comma
        let payee = s.split(',')[0].trim();
        // If comma not helpful, split before currency/amount tokens
        payee = payee.split(/\s+(?:EUR|USD|CHF|UAH)\b/i)[0].trim();
        payee = payee.split(/\s+[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})/)[0].trim();
        // If payee still very long, try splitting on ' - '
        if (payee.length > 60 && s.includes(' - ')) {
            payee = s.split(' - ')[0].trim();
        }
        // Normalize excessive spaces
        payee = payee.replace(/\s{2,}/g, ' ').trim();
        return payee || s;
    }

    /**
     * Internal: Convert DD.MM.YYYY to YYYY-MM-DD.
     *
     * How to use:
     * @example
     * this.#normalizeDate('31.12.2024'); // '2024-12-31'
     *
     * @param {string} dmy
     * @returns {string|null}
     */
    #normalizeDate(dmy) {
        if (!dmy) return null;
        const m = dmy.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (!m) return null;
        return `${m[3]}-${m[2]}-${m[1]}`;
    }

    /**
     * Internal: Decide if an item should be ignored (headers/summaries/zero amounts).
     *
     * How to use:
     * @example
     * const ignore = this.#shouldIgnore(item);
     *
     * @param {{description?:string,destination_name?:string,amount?:number}} item
     * @returns {boolean}
     */
    #shouldIgnore(item) {
        const text = `${(item.description||'')} ${(item.destination_name||'')}`;
        // Pure noise: layout/header/balance rows that have no transaction meaning.
        // NOTE: Settlement-like rows (Rücklastschrift, Zinsen, Vormonat, Alter
        // Kartensaldo) are intentionally NOT listed here so they survive parsing
        // and get marked as settlementLine=true downstream — that way the user
        // can see them in the "Hidden lines" panel and re-activate if needed.
        const rules = [
            /kontostand\s+neu/i,
            /seiten(?:übertrag|uebertrag)/i,
            /carry\s*over|carried\s*forward/i,
            /page\s*(?:sub)?total\b/i,
            /new\s+balance|ending\s+balance|closing\s+balance/i,
            /previous\s+balance|opening\s+balance/i,
            /solde\s+(?:nouveau|final|précédent|precedent)/i,
            /report\s*(?:à|a)\s*nouveau|reporté|reporte/i,
            /saldo\s+(?:final|nuevo|anterior|inicial|nuovo|neu)/i,
            /riporto\b/i,
            /subtot(?:al|ale)|sub\s*total/i,
            /bitte\s+nicht\s+einzahlen/i,
            /\biban\b/i,
            /rechnungsbetrag/i,
            /umsatzdatum|buchungsdatum|kurs/i,
        ];
        if (rules.some(r => r.test(text))) return true;
        if (item.amount != null && Math.abs(Number(item.amount)) < 0.001) return true;
        return false;
    }

    /**
     * Internal: Post-process items (direction overrides etc.).
     *
     * How to use:
     * @example
     * const out = this.#postProcess(items);
     *
     * @param {Array<object>} items
     * @returns {Array<object>}
     */
    #postProcess(items) {
        if (!Array.isArray(items)) return [];
        // Direction override by description keywords (settlement/credit payments should be deposits)
        const mapped = items.map(it => {
            const combined = `${it.description || ''} ${it.destination_name || ''}`.toLowerCase();
            const dirFromText = this.#inferDirectionFromText(combined);
            if (dirFromText === 'in' && it.direction !== 'in') {
                return { ...it, direction: 'in' };
            }
            return it;
        });
        return mapped;
    }

    /**
     * Internal: Build a deduplication key for an item.
     *
     * How to use:
     * @example
     * const k = this.#keyForItem(item);
     *
     * @param {object} it
     * @returns {string}
     */
    #keyForItem(it) {
        const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const date = it?.date ? String(it.date) : '';
        const amt = it?.amount != null ? Number(it.amount).toFixed(2) : '0.00';
        const desc = norm(it?.description);
        const payee = norm(it?.destination_name);
        return `${date}|${amt}|${desc}|${payee}`;
    }

    /**
     * Internal: Compact-normalize text for comparisons.
     *
     * How to use:
     * @example
     * const s = this.#normText('  Foo  Bar  '); // 'foo bar'
     *
     * @param {string} s
     * @returns {string}
     */
    #normText(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

    /**
     * Internal: Merge AI items with deterministic ones, enriching text fields.
     *
     * How to use:
     * @example
     * const merged = this.#mergeAiWithDeterministic(aiItems, detItems);
     *
     * @param {Array<object>} aiItems
     * @param {Array<object>} detItems
     * @returns {Array<object>}
     */
    #mergeAiWithDeterministic(aiItems, detItems) {
        const amountTol = Number(this.#config.amountMergeTolerance || 0.02);
        const dayTol = Number(this.#config.dateMergeToleranceDays || 2);
        const parsedDet = Array.isArray(detItems) ? detItems : [];

        // If we have deterministic items, preserve their order and numeric fields; use AI only to enrich text fields
        if (parsedDet.length > 0) {
            const indexAi = (target) => {
                const tDay = target.date ? Math.floor(new Date(target.date).getTime() / (24*3600*1000)) : null;
                let best = null;
                for (let i = 0; i < aiItems.length; i++) {
                    const ai = aiItems[i];
                    const aiDay = ai.date ? Math.floor(new Date(ai.date).getTime() / (24*3600*1000)) : null;
                    if (tDay == null || aiDay == null) continue;
                    const dayDiff = Math.abs(tDay - aiDay);
                    const amtDiff = Math.abs(Number(target.amount) - Number(ai.amount));
                    if (dayDiff <= dayTol && amtDiff <= amountTol) {
                        const score = amtDiff + dayDiff/100;
                        if (!best || score < best.score) best = { i, ai, score };
                    }
                }
                return best;
            };
            const enriched = parsedDet.map(det => {
                const match = indexAi(det);
                if (!match) return det;
                const detDesc = (det.description || '').trim();
                const aiDesc = (match.ai.description || '').trim();
                const finalDesc = detDesc.length >= aiDesc.length ? detDesc : aiDesc;
                const detPayee = (det.destination_name || this.#extractPayeeFromDesc(detDesc)).trim();
                const aiPayee = (match.ai.destination_name || this.#extractPayeeFromDesc(aiDesc)).trim();
                const finalPayee = detPayee.length >= aiPayee.length ? detPayee : aiPayee;
                return { ...det, description: finalDesc, destination_name: finalPayee };
            });
            return enriched;
        }

        // No deterministic items: return AI items (as before)
        if (!Array.isArray(aiItems) || aiItems.length === 0) return [];
        return aiItems;
    }

    /**
     * Internal: Append items missing from base by key.
     *
     * How to use:
     * @example
     * const combined = this.#mergeAppendMissing(base, extra);
     *
     * @param {Array<object>} baseItems
     * @param {Array<object>} extraItems
     * @returns {Array<object>}
     */
    #mergeAppendMissing(baseItems, extraItems) {
        const res = Array.isArray(baseItems) ? [...baseItems] : [];
        const existing = new Set(res.map(r => this.#keyForItem(r)));
        if (Array.isArray(extraItems) && extraItems.length) {
            for (const e of extraItems) {
                const k = this.#keyForItem(e);
                if (!existing.has(k)) { res.push(e); existing.add(k); }
            }
        }
        return res;
    }

    /**
     * Internal: Fallback per-line parser requiring inline date and explicit EUR token.
     *
     * How to use:
     * @example
     * const rows = this.#parseFallbackRows(ocrText);
     *
     * @param {string} text
     * @returns {Array<object>}
     */
    #parseFallbackRows(text) {
        const lines = String(text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
        const items = [];
        const dateInlineRe = /(\d{2}\.\d{2}\.\d{4})/;
        for (let idx = 0; idx < lines.length; idx++) {
            const rawLine = lines[idx];
            const line = rawLine.replace(/\s+/g, ' ');
            const dm = line.match(dateInlineRe);
            if (!dm) continue;
            const amt = this.#extractEURAmountWithDirection(line);
            if (!amt) continue;
            let desc = line.replace(amt.matchedToken, ' ');
            desc = desc
                .replace(/(?:^|\s)(?:EUR|USD|CHF|UAH|€)\s*[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b/g, ' ')
                .replace(/\b([A-Z]{3})\s*[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b/g, ' ')
                .replace(/\b0[.,]\d{2,6}\b/g, ' ')
                .replace(dateInlineRe, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (!desc || !/[A-Za-zÄÖÜäöü]/.test(desc)) {
                const stitched = this.#findAdjacentDescription(idx, lines);
                if (stitched) desc = stitched.trim();
            }
            if (!desc || !/[A-Za-zÄÖÜäöü]/.test(desc)) continue;
            const candidate = {
                description: desc,
                destination_name: this.#extractPayeeFromDesc(desc),
                amount: this.#normalizeAmount(amt.amountStr),
                direction: amt.direction,
                date: this.#normalizeDate(dm[1])
            };
            if (this.#shouldIgnore(candidate)) continue;
            items.push(candidate);
        }
        return items;
    }

    /**
     * Internal: Append a structured debug line to a rotating log file.
     *
     * How to use:
     * @example
     * await this.#writeDebug('ai', { items: 3 });
     *
     * @param {string} kind
     * @param {any} payload
     * @returns {Promise<void>}
     */
    async #writeDebug(kind, payload) {
        try {
            await ensureDataDir();
            const file = dataFile(`extraction-debug-${kind}.log`);
            const line = `[${new Date().toISOString()}] ${JSON.stringify(payload)}\n`;
            await fs.appendFile(file, line, 'utf8');
            try { if (process.env.DEBUG_LOGS === 'true') console.info('debug-write-ok', kind, file); } catch(_) {}
        } catch (e) {
            try { console.error('debug-write-failed', kind, e.message); } catch(_) {}
            // Fallback: write to local ./data regardless of configured DATA_DIR
            try {
                const localDir = path.join(process.cwd(), 'data');
                await fs.mkdir(localDir, { recursive: true });
                const file = path.join(localDir, `extraction-debug-${kind}.log`);
                const line = `[${new Date().toISOString()}] ${JSON.stringify(payload)}\n`;
                await fs.appendFile(file, line, 'utf8');
                try { if (process.env.DEBUG_LOGS === 'true') console.info('debug-write-ok-fallback', kind, file); } catch(_) {}
            } catch (e2) {
                try { console.error('debug-write-failed-fallback', kind, e2.message); } catch(_) {}
            }
        }
    }
}



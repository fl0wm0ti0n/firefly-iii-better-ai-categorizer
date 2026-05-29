/** Shared parity-sum rules for credit-card statement splitter (preview + save). */

export const SETTLEMENT_LINE_RE = /(abbuchung\s+kartenabrechnung|zahlung\s*vormonat|alter\s+kartensaldo|saldoausgleich|ausgleich\s+kartensaldo|previous\s+balance|opening\s+balance|rücklastschrift(?:spesen)?(?:\s+rbi|\s+bank)?|rucklastschrift(?:spesen)?(?:\s+rbi|\s+bank)?|chargeback(?:\s+fee)?|\bzinsen\b)/i;

export function isSettlementLine(item) {
    if (!item) return false;
    if (item.settlementLine === true) return true;
    const text = `${item.description || ''} ${item.destination_name || ''}`;
    return SETTLEMENT_LINE_RE.test(text);
}

/** Rows shown in single/batch preview tables (settlement/meta lines are omitted). */
export function itemsForPreview(markedItems) {
    if (!Array.isArray(markedItems)) return [];
    return markedItems.filter(it => !isSettlementLine(it) && it._settlement !== true);
}

/** Rows excluded from the active preview but kept for user-visible review. */
export function hiddenSettlementItems(markedItems) {
    if (!Array.isArray(markedItems)) return [];
    return markedItems
        .filter(it => isSettlementLine(it) || it._settlement === true)
        .map(it => ({ ...it, settlementLine: true }));
}

/** Withdrawals add, deposits subtract (absolute amounts). Settlement lines are excluded. */
export function computeExtractionSum(items) {
    if (!Array.isArray(items)) return 0;
    const sum = items.reduce((s, i) => {
        if (isSettlementLine(i) || i._settlement === true) return s;
        const v = Math.abs(Number(i.amount || 0));
        const dir = i.direction === 'in' ? 'in' : 'out';
        return s + (dir === 'out' ? v : -v);
    }, 0);
    return Number(sum.toFixed(2));
}

export function markSettlementLines(items) {
    if (!Array.isArray(items)) return items;
    const marked = items.map(it => ({
        ...it,
        settlementLine: isSettlementLine(it)
    }));
    if (typeof items._statementTotal === 'number') {
        marked._statementTotal = items._statementTotal;
    }
    return marked;
}

/**
 * Sum shown for preview/matching: prefers PDF header total (e.g. Raiffeisen Rechnungsbetrag)
 * when line items do not reconcile to it.
 */
export function computeExtractionDisplaySum(markedItems) {
    const baseSum = computeExtractionSum(markedItems);
    const metaTotal = (markedItems && typeof markedItems._statementTotal === 'number')
        ? Number(markedItems._statementTotal) : null;
    if (!Array.isArray(markedItems) || markedItems.length === 0) {
        return Number((metaTotal ?? 0).toFixed(2));
    }
    if (metaTotal != null && Math.abs(metaTotal - baseSum) <= 0.01) {
        return Number(metaTotal.toFixed(2));
    }
    if (metaTotal != null && Math.abs(metaTotal - baseSum) > 0.01) {
        return Number(metaTotal.toFixed(2));
    }
    return baseSum;
}

/** Preview totals shared by single + batch upload handlers. */
export function buildExtractionTotals(markedItems, originalAbs = null) {
    const lineSum = computeExtractionSum(markedItems);
    const statementTotal = (markedItems && typeof markedItems._statementTotal === 'number')
        ? Number(markedItems._statementTotal) : null;
    const sum = computeExtractionDisplaySum(markedItems);
    const hiddenSettlementLines = Array.isArray(markedItems)
        ? markedItems.filter(it => isSettlementLine(it) || it._settlement === true).length
        : 0;
    const out = { sum, lineSum, statementTotal, hiddenSettlementLines };
    if (originalAbs != null && Number.isFinite(originalAbs)) {
        out.original = originalAbs;
        out.diff = Number((originalAbs - sum).toFixed(2));
    }
    return out;
}

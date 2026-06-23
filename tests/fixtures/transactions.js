export function makeWithdrawalTx({
    description = 'REWE SAGT DANKE',
    destinationName = 'REWE',
    sourceId = '42',
    sourceName = 'Checking',
    currencyCode = 'EUR',
    foreignAmount = null,
} = {}) {
    return {
        attributes: {
            transactions: [{
                type: 'withdrawal',
                description,
                destination_name: destinationName,
                source_id: sourceId,
                source_name: sourceName,
                currency_code: currencyCode,
                foreign_amount: foreignAmount,
            }],
        },
    };
}

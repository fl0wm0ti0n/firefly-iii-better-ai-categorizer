# Word Mapping System - User Guide

## Overview

The **Word Mapping System** helps improve AI categorization accuracy by replacing problematic words in transaction descriptions with better alternatives **before** OpenAI processing.

## 🚀 How It Works

### 1. **Identify Failed Transactions**
- Transactions that couldn't be categorized appear in the "Failed Transactions" list
- Each failed transaction shows description and recipient
- These indicate where AI categorization struggled

### 2. **Create Word Mappings**
For each failed transaction, you can:
- **Identify problematic word** (e.g., abbreviation, company code)
- **Define replacement word** (e.g., full name, category hint)
- Create mapping directly from the failed transaction

### 3. **Automatic Application**
- Word mappings are applied **before** AI categorization
- Enhanced descriptions lead to better category suggestions
- Works with **Webhooks** and **Batch Processing**

## 💡 Practical Examples

### Example 1: Unclear Company Names
```
Original:  "PayPal *STEAMGAMES"
Mapping:   "STEAMGAMES" → "Steam Gaming Platform"
Result:    "PayPal *Steam Gaming Platform"
Category:  Entertainment → Games
```

### Example 2: Cryptic Codes
```
Original:  "DE12345 TXN REF#8967"
Mapping:   "DE12345" → "Deutsche Bank"
Result:    "Deutsche Bank TXN REF#8967"
Category:  Banking → Financial Services
```

### Example 3: Abbreviations
```
Original:  "AMZN Marketplace"
Mapping:   "AMZN" → "Amazon"
Result:    "Amazon Marketplace"
Category:  Shopping → Online Retail
```

### Example 4: Ambiguous Terms
```
Original:  "Monthly Sub Fee"
Mapping:   "Sub" → "Subscription"
Result:    "Monthly Subscription Fee"
Category:  Subscriptions → Digital Services
```

## 🔧 Usage Instructions

### Step 1: View Failed Transactions
1. Navigate to **"Word Mappings & Failed Transactions"**
2. Click **🔄 Refresh** to load latest failures
3. List of uncategorized transactions appears

### Step 2: Create Mapping
**Option A: From Failed Transaction**
1. For a failed transaction:
   - Enter problematic word in "Replace word" field
   - Enter replacement in "With word" field
   - Click **"Add Mapping"**

**Option B: Manual via Form**
1. In the **Word Mappings** section:
   - Enter original word/phrase
   - Enter replacement word/phrase
   - Click **➕ Add**

### Step 3: Manage Mappings
- **View all**: Collapsible "Word Mappings" section
- **Delete**: "Remove" button for each mapping
- **Edit**: Use ✏️ Edit button to modify existing mappings

## 📁 Data Storage

### Storage Format
```json
{
  "AMZN": "Amazon",
  "STEAMGAMES": "Steam Gaming Platform",
  "Sub": "Subscription"
}
```
- Persistent storage with every change
- File: `word-mappings.json`

### Example Format
```json
{
  "PayPal *STEAM": "PayPal Steam Gaming",
  "AMZN": "Amazon",
  "DE12345": "Deutsche Bank",
  "Sub Fee": "Subscription Fee",
  "Wintersport ausgaben": "Winter Sports Expenses"
}
```

## 🎯 Best Practices

### 1. **Use Descriptive Replacements**
- ❌ `"AMZN"` → `"A"`
- ✅ `"AMZN"` → `"Amazon"`

### 2. **Include Category Hints**
- ❌ `"Sub"` → `"Subscription"`
- ✅ `"Sub"` → `"Digital Subscription Service"`

### 3. **Use Full Names**
- ✅ `"DB"` → `"Deutsche Bank"`
- ✅ `"McD"` → `"McDonald's Restaurant"`

## 🔄 Processing Flow

```
Transaction Processing:
       ↓
1. **New Transaction** comes via webhook
       ↓
2. **Apply Word Mappings** 
   - Replace problematic words
   - Enhance description clarity
       ↓
3. **AI Categorization**
   - OpenAI processes enhanced description
   - Better context = better category suggestion
       ↓
4. **Update Transaction**
   - Apply suggested category
   - Add "AI categorized" tag
```

## 📈 Benefits

### Before Word Mapping
- Cryptic descriptions confuse AI
- Low categorization success rate
- Manual intervention required

### After Word Mapping
- Old transactions benefit from new mappings
- Higher success rate with batch processing

## 🎉 Results

1. **Higher Success Rate** in AI categorization
2. **Fewer Failed Transactions** requiring manual review
3. **User-Specific** - adapted to your transactions
4. **Cumulative Improvement** - builds up over time
5. **Reversible** - mappings can be removed anytime

This system makes your AI categorization **smarter** and **more precise**! 🎯 
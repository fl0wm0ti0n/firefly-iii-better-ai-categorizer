# Auto-Categorization Guide for Firefly III AI Categorizer

This comprehensive guide covers the automatic categorization features of the Firefly III AI Categorizer, including LLM-powered AI categorization, pre-categorization rules, and advanced configuration options.

## 🐳 Docker Users - Important Notes

If you're running the application via Docker, please note:

- **Configuration files** are mounted as volumes in `/app/` directory inside the container
- **File paths** in this guide refer to the container paths, but you can edit them from your host system
- **Volume mappings** (from `docker-compose.yml`):
  ```yaml
  volumes:
    - ./auto-categorization-config.json:/app/auto-categorization-config.json
    - ./category-mappings.json:/app/category-mappings.json
    - ./word-mappings.json:/app/word-mappings.json
    - ./failed-transactions.json:/app/failed-transactions.json
  ```
- **Restart required**: After configuration changes, restart with `docker-compose restart`
- **Log monitoring**: Check status with `docker-compose logs -f`

For Docker setup instructions, see **[DOCKER_GUIDE.md](DOCKER_GUIDE.md)**.

---

# Auto-Categorization System - User Guide

## 🎯 Overview

The **Auto-Categorization System** automatically categorizes Foreign/Travel transactions **before** AI processing. This saves OpenAI API calls and improves speed for obvious international transactions.

## 🚀 How It Works

### 1. **Multi-Stage Categorization Process**
```
New Transaction
       ↓
1. Skip Deposits Check (if enabled)
   ├─ Deposit? → Skip transaction
   └─ Continue to categorization
       ↓
2. Category Mappings (Custom Rules) - HIGHEST PRIORITY
   ├─ Keywords match? → Apply custom category
   └─ No match: Continue to step 3
       ↓
3. Auto-Categorization (Foreign/Travel Detection)
   ├─ Currency ≠ Native? → Foreign category
   ├─ Foreign Flag? → Foreign category
   ├─ Foreign Keywords? → Foreign category
   ├─ Foreign Country? → Foreign category
   └─ No match: Continue to step 4
       ↓
4. Word Mappings (Text Replacement)
   ├─ Apply word replacements → Enhanced description
   └─ Continue to step 5
       ↓
5. AI Classification (OpenAI) - **Enhanced with Transaction Type**
   ├─ Include transaction type (withdrawal/deposit) in prompt
   ├─ Provide specific guidance for expense vs income categorization
   ├─ Generate category suggestion
   └─ Apply category or log as failed
```

### 2. **Four Auto-Categorization Detection Rules**

#### **A) Currency Check** 💰
```
Rule: currency_code ≠ native_currency
Example: USD, CHF, GBP → Travel & Foreign
```

#### **B) Foreign Flag** 🏳️
```
Rule: foreign_amount !== null
Example: Firefly marks transaction as "foreign"
```

#### **C) Keyword Detection** 🔍
```
Rule: Predefined keywords in Description/Destination
Examples:
- Cities: "bangkok", "london", "paris"
- Travel: "hotel", "airline", "airport"
- Currencies: "usd", "chf", "jpy"
- Chains: "hilton", "marriott", "starbucks"
```

#### **D) Country Detection** 🌍
```
Rule: Foreign country names in text
Examples: "germany", "france", "japan"
(Exception: Home Country is ignored)
```

## ⚙️ Configuration

### **🎛️ General Settings (New!)**
- **Skip Deposits**: Automatically exclude deposits from all categorization processes
- **Scope**: Webhooks, manual processing, batch operations
- **Useful for**: Salary payments, refunds, etc.

### **Basic Settings**
- **Enable Auto-Categorization**: On/Off switch
- **Native Currency**: Your home currency (e.g., "EUR")
- **Home Country**: Your home country (e.g., "Austria")
- **Foreign/Travel Category**: Target category (e.g., "Travel & Foreign")

### **📝 Keywords Management (Improved!)**
- **Comma-separated input**: Bulk input like "bangkok, hotel, usd, paris, london"
- **Edit functionality**: Edit existing keywords
- **Collapsible interface**: Clear display with item counters
- **Clear All**: Delete all keywords at once

## 📊 Practical Examples

### **Example 1: Skip Deposits**
```
Transaction: "Salary Payment - €3000"
Type: deposit
Skip Deposits: ✅ enabled
Result: → Transaction skipped
Reason: Deposit exclusion
```

### **Example 2: Category Mapping Priority**
```
Transaction: "Rewe Supermarket - €45.50"
Category Mapping: "Supermarkets" → "Groceries" (Keywords: rewe, spar, hofer)
Result: → "Groceries"
Reason: Category mapping (highest priority)
```

### **Example 3: Currency**
```
Transaction: "Hotel Booking - $150 USD"
Detection: USD ≠ EUR (native)
Result: → "Travel & Foreign"
Rule: currency
```

### **Example 4: Foreign Flag**
```
Transaction: Firefly foreign_amount: 120.00
Detection: Foreign flag set
Result: → "Travel & Foreign"
Rule: foreign_flag
```

### **Example 5: Keyword**
```
Transaction: "Bangkok Airport Taxi"
Detection: Keyword "bangkok" found
Result: → "Travel & Foreign"
Rule: keyword (bangkok)
```

### **Example 6: Country**
```
Transaction: "Restaurant in Germany"
Detection: Country "germany" ≠ "Austria"
Result: → "Travel & Foreign"
Rule: country (germany)
```

## 🔧 Web UI Usage

### **Step 1: Configure General Settings**
1. Navigate to **"General Settings"** (at the top)
2. Enable **"Skip Deposits"** ✅ if desired
3. Click **"💾 Save General Settings"**

### **Step 2: Set up Category Mappings (Highest Priority)**
1. Navigate to **"Category Mappings (Custom Rules)"**
2. Click **"➕ Add New Category Mapping"**
3. Create example rule:
   - **Name**: "Supermarkets"
   - **Target Category**: "Groceries"
   - **Keywords**: "rewe, spar, hofer, billa, merkur"
4. Click **"💾 Save Mapping"**

### **Step 3: Configure Auto-Categorization**
1. Navigate to **"Auto-Categorization (Foreign/Travel Detection)"**
2. Enable **"Enable Auto-Categorization"** ✅
3. Set **Native Currency**: `EUR`
4. Set **Home Country**: `Austria`
5. Set **Foreign/Travel Category**: `Travel & Foreign`
6. Click **"💾 Save Configuration"**

### **Step 4: Adjust Foreign Keywords (Comma-separated)**
1. In the **"Foreign Keywords"** section
2. **Comma-separated input**: `bangkok, hotel, usd, paris, london, airbnb, booking.com`
3. Click **"💾 Save Keywords"**
4. Use **Edit button** for adjustments
5. Use **"🗑️ Clear All"** to delete everything

### **Step 5: Manage Word Mappings**
1. Navigate to **"Word Mappings & Failed Transactions"**
2. **Edit functionality**: Edit existing mappings with ✏️ button
3. **Failed Transactions**: Quickly create mappings from failed transactions

### **🧪 Step 6: Testing**
- Use **Test Webhook** with various transaction types
- Check Individual Jobs for **"Auto-categorized: ✅ rule"** or **"🗂️ Category mapped"**
- Batch processing shows all categorizations in the log

### **🧹 Step 7: Failed Transactions Management**
- **Automatic Cleanup**: Successfully categorized transactions are automatically removed from the failed list
- **Manual Cleanup**: Use the "🧹 Cleanup" button to remove old and duplicate failed transactions
- **Refresh**: Click "🔄 Refresh" to reload the current failed transactions list

## 🎨 UI Improvements

### **🖱️ Drag & Drop Transaction Management**
- **Visual Categorization**: Interactive drag & drop interface for manual categorization
- **Category Grid**: Automatic category zones that appear during dragging
- **Smart Integration**: Works seamlessly with auto-categorization results
- **Review Interface**: Easily check and correct auto-categorized transactions
- **See [TRANSACTION_MANAGEMENT_GUIDE.md](TRANSACTION_MANAGEMENT_GUIDE.md) for detailed instructions**

### **📊 Collapsible Interface**
- **Collapsible Sections**: All major lists are collapsible
- **Item Counter**: Number of items displayed (e.g., "23")
- **Expand/Collapse Icons**: 🔽/🔼 for better orientation
- **Space Saving**: Better overview with many configurations

### **✏️ Edit Functionality**
- **Word Mappings**: ✏️ Edit button for each mapping
- **Category Mappings**: Full CRUD operations
- **Workflow**: Edit → Modify → Save → Done

### **🎛️ Logical UI Structure**
1. **General Settings** - System-wide settings
2. **Manual Processing** - Batch operations
3. **Test Webhook** - Live testing
4. **Batch Jobs** - Monitoring
5. **Word Mappings & Failed Transactions** - Error handling
6. **Auto-Categorization** - Foreign/Travel Detection
7. **Category Mappings** - Custom Rules
8. **Transaction Management (Interactive)** - 🆕 Drag & Drop Interface
9. **Individual Jobs** - Single tasks

## 📁 File Storage

### **Configuration File**
```json
{
  "enabled": true,
  "skipDeposits": true,
  "nativeCurrency": "EUR",
  "homeCountry": "Austria", 
  "foreignCategory": "Travel & Foreign",
  "foreignKeywords": [
    "bangkok", "hotel", "airline", "usd", "airport",
    "booking", "airbnb", "marriott", "starbucks", ...
  ]
}
```
**File**: `auto-categorization-config.json`

## 🎨 UI Feedback

### **Job Display**
- 🗂️ **Category mapped**: Shows custom rule matches
- ✅ **Auto-categorized**: Shows used auto-categorization rule
- 🤖 **AI categorized**: Normal OpenAI categorization
- ⏭️ **Skipped**: Deposit was skipped

### **Workflow Indicator**
```
Individual Jobs:
🗂️ Category mapped: Supermarkets (rewe → Groceries)
✅ Auto-categorized: currency    (USD ≠ EUR)
✅ Auto-categorized: keyword     (bangkok)
✅ Auto-categorized: foreign_flag (Firefly foreign)
⏭️ Skipped: deposit (skipDeposits enabled)
```

### **Collapsible Sections**
```
🔽 Failed Transactions [3]
🔽 Word Mappings [12]
🔽 Foreign Keywords [47]
🔽 Category Mappings [8]
```

## 🚀 Performance Benefits

### **API Savings through Multi-Stage Process**
- **Before Optimization**: Every transaction → OpenAI API
- **After Optimization**: 
  - Category Mappings: 0ms, no API costs
  - Auto-Categorization: ~1ms, no API costs
  - Only unknown transactions → OpenAI API (~500-2000ms)
- **Typical Savings**: 40-70% fewer API calls

### **Speed through Priorities**
- **Category Mappings**: ~0ms (highest priority)
- **Auto-Categorization**: ~1ms per transaction
- **AI Categorization**: ~500-2000ms per transaction
- **Skip Deposits**: ~0ms (earliest filtering)

## 🎯 Best Practices

### **1. Understand Priorities**
```
Highest → Category Mappings (Custom Rules)
         ↓
Medium → Auto-Categorization (Foreign/Travel)
         ↓
Lowest → AI Classification (OpenAI)
```

### **2. Use Category Mappings Strategically**
- ✅ **Frequent Transactions**: "rewe, spar, hofer" → "Groceries"
- ✅ **Specific Patterns**: "shell, bp, esso" → "Transportation"
- ✅ **Local Providers**: "pharmacy, doctor, dentist" → "Healthcare"

### **3. Choose Keywords Strategically**
- ✅ **Specific**: "ryanair", "booking.com", "airbnb"
- ✅ **Unique**: "usd", "chf", "airport"
- ❌ **Too General**: "the", "and", "payment"

### **4. Use Skip Deposits Correctly**
- ✅ **Enable for**: Salary, refunds, transfers between own accounts
- ❌ **Disable when**: Deposits should also be categorized

### **5. Set Home Country Correctly**
- **Write exactly**: "Austria" (not "Österreich")
- **English names**: "Germany" (not "Deutschland")
- **Avoids false positives** for domestic mentions

### **6. Use Edit Functionality**
- **Word Mappings**: Regularly review and adjust
- **Category Mappings**: Expand with new spending patterns
- **Keywords**: Optimize based on failed transactions

### **7. Monitoring**
- **Job Logs**: Check for different categorization types
- **Failed Transactions**: Analyze for optimization opportunities
- **Collapsible Sections**: Use for better overview

## 🔄 Workflow Integration

```
Webhook/Manual/Batch
       ↓
1. Skip Deposits Check (if enabled)
   ├─ Type = deposit & skipDeposits = true? → SKIP
   └─ Continue
       ↓
2. Category Mappings Check (HIGHEST PRIORITY)
   ├─ Keywords in Custom Rules? → Apply & FINISH
   └─ No Match
       ↓
3. Auto-Categorization Check
   ├─ Currency ≠ Native? → Foreign Category & FINISH
   ├─ Foreign Flag? → Foreign Category & FINISH
   ├─ Foreign Keywords? → Foreign Category & FINISH
   ├─ Foreign Country? → Foreign Category & FINISH
   └─ No Match
       ↓
4. Word Mappings (Text Enhancement)
   └─ Apply replacements
       ↓
5. AI Classification (Fallback)
   ├─ Generate category suggestion → Apply & FINISH
   └─ Failed → Log to Failed Transactions
```

## 🎉 New Features Summary

### **🎛️ Skip Deposits**
- Automatically exclude deposits
- Ideal for salary, refunds
- Works in all modes

### **📊 Collapsible Interface**
- Space-saving display
- Item counter for overview
- Better navigation with many elements

### **✏️ Edit Functionality**
- Edit word mappings
- Fully manage category mappings
- Intuitive edit workflows

### **🗂️ Category Mappings Priority**
- Highest priority before auto-categorization and AI
- Custom rules for frequent patterns
- Enable/disable without deletion

### **📝 Comma-separated Keywords**
- Bulk input: "bangkok, hotel, usd"
- Easier management
- Clear All functionality

### **🏗️ Logical UI Structure**
- Separate sections
- Logical grouping
- Better user experience

### **🤖 Enhanced AI Categorization**
- Transaction type awareness (withdrawal vs deposit)
- Specific guidance for expense vs income categories
- Improved accuracy for deposits and withdrawals
- Prevents incorrect category assignments

### **🧹 Smart Failed Transaction Management**
- Automatically removes successfully categorized transactions from failed list
- Manual cleanup for old and duplicate entries
- Real-time list updates during batch processing
- Keeps failed transaction list relevant and manageable

## 🎉 Conclusion

The enhanced Auto-Categorization System makes your Firefly III AI even **smarter**, **more efficient**, and **more user-friendly**:

- 🚀 **Even faster** - Multi-stage process with priorities
- 💰 **Even cheaper** - Up to 70% fewer OpenAI API calls
- 🎯 **Even more accurate** - Custom Rules + Auto-Cat + AI Fallback
- ⚙️ **Even more flexible** - Skip Deposits + Edit Functions + Collapsible UI
- 🎨 **Even clearer** - Logical structure + Item Counter

Perfect for **all Firefly users** - from basic categorization to complex multi-currency setups! 🌍✈️💳 
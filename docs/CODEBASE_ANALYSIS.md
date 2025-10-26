# Firefly III AI Categorizer - Codebase Analysis

## Overview

The **Firefly III AI Categorizer** is an automatic transaction categorizer for [Firefly III](https://www.firefly-iii.org/), an open-source financial management software. The program uses **OpenAI's GPT model** to automatically categorize incoming expenses.

## Main Purpose

The system automates manual categorization of financial transactions through:
- **Webhook-based integration** with Firefly III for automatic processing
- **AI-powered categorization** via OpenAI
- **Automatic transaction updates**
- **Manual batch processing** for existing transactions
- **Web UI** for monitoring and manual control

## Technical Architecture

### Backend Components

#### 1. App.js - Main Application
- **Express.js web server** for HTTP endpoints
- **Socket.io** for real-time UI updates
- **Queue management** for asynchronous processing
- **Webhook endpoint** (`/webhook`) for Firefly III integration
- **API endpoints** for manual processing:
  - `/api/process-uncategorized` - Processes only uncategorized transactions
  - `/api/process-all` - Processes all transactions (overwrites categories)

```javascript
// Main workflow: Webhook → Validation → Queue → AI → Update
#onWebhook(req, res) {
    console.info("Webhook triggered");
    this.#handleWebhook(req, res);
    res.send("Queued");
}
```

#### 2. FireflyService.js - Firefly III Integration
- **API communication** with Firefly III
- **Retrieve categories** (`getCategories()`)
- **Update transactions** (`setCategory()`)
- **Batch data retrieval**:
  - `getAllUncategorizedTransactions()` - Gets all transactions without category
  - `getAllWithdrawalTransactions()` - Gets all withdrawal transactions
- **Authentication** via Personal Access Token

```javascript
// Load categories from Firefly III
async getCategories() {
    const response = await fetch(`${this.#BASE_URL}/api/v1/categories`, {
        headers: { Authorization: `Bearer ${this.#PERSONAL_TOKEN}` }
    });
}
```

#### 3. OpenAiService.js - AI Integration
- **OpenAI API calls** with GPT-3.5-turbo-instruct
- **Prompt generation** for categorization
- **Response processing** and validation

```javascript
// AI prompt for categorization
#generatePrompt(categories, destinationName, description) {
    return `Given i want to categorize transactions on my bank account into this categories: ${categories.join(", ")}
In which category would a transaction from "${destinationName}" with the subject "${description}" fall into?
Just output the name of the category. Does not have to be a complete sentence.`;
}
```

#### 4. JobList.js - Job Management
- **Tracking all processing jobs**
- **Event-based updates** for UI
- **Status management**: `queued` → `in_progress` → `finished`
- **Batch job tracking** with progress monitoring:
  - `createBatchJob()` - Creates batch jobs for manual processing
  - `updateBatchJobProgress()` - Updates progress
  - `finishBatchJob()` - Marks batch job as completed

#### 5. util.js - Utility Functions
- **Environment variable management**
- **Configuration** with fallback values

### Frontend (Optional UI)

#### public/index.html - Web Interface
- **Enhanced monitoring interface** with manual control
- **Control panel** with buttons for:
  - Processing uncategorized transactions
  - Processing all transactions (overwrite)
- **Batch job monitoring** with:
  - Real-time progress bars
  - Statistics (Total, Processed, Success, Errors)
  - Error details with expandable lists
- **Real-time display** of all jobs via Socket.io
- **Responsive design** with modern CSS

## Detailed Workflow

### 1. Automatic Webhook Workflow
```javascript
// Validation of incoming webhooks
if (req.body?.trigger !== "STORE_TRANSACTION") {
    throw new WebhookException("trigger is not STORE_TRANSACTION");
}

if (req.body.content.transactions[0].type !== "withdrawal") {
    throw new WebhookException("Transaction will be ignored.");
}
```

**Validations:**
- Only `STORE_TRANSACTION` triggers
- Only `withdrawal` transactions
- No already categorized transactions
- Required fields: `description`, `destination_name`

### 2. Manual Batch Processing

#### 2.1 Process Uncategorized Transactions
```javascript
async #processUncategorizedTransactions() {
    const transactions = await this.#firefly.getAllUncategorizedTransactions();
    const batchJob = this.#jobList.createBatchJob('uncategorized', transactions.length);
    // ... Processing with progress tracking
}
```

#### 2.2 Process All Transactions (Overwrite)
```javascript
async #processAllTransactions() {
    const transactions = await this.#firefly.getAllWithdrawalTransactions();
    const batchJob = this.#jobList.createBatchJob('all', transactions.length);
    // ... Processing with progress tracking
}
```

### 3. Job Creation
```javascript
const job = this.#jobList.createJob({
    destinationName,
    description
});
```

### 4. AI Classification
```javascript
const {category, prompt, response} = await this.#openAi.classify(
    Array.from(categories.keys()), 
    destinationName, 
    description
);
```

### 5. Automatic Update
```javascript
if (category) {
    await this.#firefly.setCategory(
        req.body.content.id, 
        req.body.content.transactions, 
        categories.get(category)
    );
}
```

**On successful categorization:**
- Category is set in Firefly III
- Automatic tag is added (default: "AI categorized")
- Transaction is updated via API

## Configuration

### Required Environment Variables
- `FIREFLY_URL` - URL to Firefly III instance
- `FIREFLY_PERSONAL_TOKEN` - API token for Firefly III
- `OPENAI_API_KEY` - OpenAI API key

### Optional Environment Variables
- `ENABLE_UI` - Enables web interface (default: `false`)
- `FIREFLY_TAG` - Name of auto tag (default: `"AI categorized"`)
- `PORT` - Server port (default: `3000`)

## Deployment

### Docker Deployment
```dockerfile
FROM node:18-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY ["package.json", "package-lock.json", "./"]
RUN npm install --production
COPY . .
CMD ["node", "index.js"]
```

### Docker Compose Example
```yaml
version: '3.3'
services:
  categorizer:
    image: ghcr.io/bahuma20/firefly-iii-ai-categorize:latest
    restart: always
    ports:
      - "3000:3000"
    environment:
      FIREFLY_URL: "https://firefly.example.com"
      FIREFLY_PERSONAL_TOKEN: "eyabc123..."
      OPENAI_API_KEY: "sk-abc123..."
      ENABLE_UI: "true"
```

## Enhanced Features

### Multi-Stage Categorization Process
1. **Category Mappings** (highest priority) - User-defined rules
2. **Auto-categorization** - Foreign/travel detection
3. **Word Mappings** - Text preprocessing
4. **AI Categorization** - OpenAI fallback

### Real-time Monitoring
- Socket.io for live updates
- Progress bars for batch jobs
- Error tracking and display
- Job status indicators

### Error Handling
- OpenAI rate limit management
- Firefly III API error handling
- Failed transaction logging
- Retry mechanisms with exponential backoff

### User Interface Features
- Collapsible sections for better organization
- Edit functionality for all mappings
- Test webhook functionality
- Batch job control (pause/resume/cancel)
- Skip deposits option
- Category mapping management

## Performance Optimizations

### Rate Limiting
- Built-in OpenAI rate limit handling
- Exponential backoff for API errors
- Configurable delays between requests
- Batch size optimization

### Processing Efficiency
- Early exit for deposit transactions (if enabled)
- Priority-based processing order
- Minimal API calls through pre-filtering
- Category mapping for common patterns

This architecture provides a robust, scalable solution for automated transaction categorization with comprehensive user control and multiple fallback mechanisms. 
# Firefly III AI categorization

This project allows you to automatically categorize your expenses in [Firefly III](https://www.firefly-iii.org/) by
using OpenAI.

## this is a fork of
bahuma20/firefly-iii-ai-categorize

## How it works

It provides a webhook that you can set up to be called every time a new expense is added.

It will then generate a prompt for OpenAI, including your existing categories, the recipient and the description of the
transaction.

OpenAI will, based on that prompt, guess the category for the transaction.

If it is one of your existing categories, the tool will set the category on the transaction and also add a tag to the
transaction.

If it cannot detect the category, it will not update anything.

## New Features - Enhanced User Experience

### **🎛️ General Settings**
- **Skip Deposits Option**: Automatically exclude deposit transactions (salary, refunds) from categorization
- **Configurable per process**: Applies to webhooks, manual processing, and batch operations

### **📊 Collapsible Interface**
- **Space-efficient UI**: Major sections (mappings, failed transactions, auto-cat) are collapsible with item counters

### **🏦 Account → Category Mappings**
- **Hard 1:1 rules**: Fixed category per account — skips AI, auto-cat, and keyword hints
- **UI**: Add form on top; accounts with an existing mapping are hidden in the dropdown

### **🗂️ Keyword → Category Mappings**
- **AI hints**: Loose keyword match + suggested category for OpenAI (not direct assignment)
- **CRUD / toggle**: Edit, enable, or disable rules without deletion

### **🌍 Enhanced Auto-Categorization**
- **Foreign/Travel Detection**: Currency, flags, keywords, and country-based rules
- **API savings**: Reduces OpenAI calls for obvious foreign transactions

### **📋 Bulk Categorization**
- **Same pipeline as webhook**: Account mappings → auto-cat → word mappings → AI
- **Uncategorized / All**, pause/resume/cancel, live progress — see **[docs/BULK_CATEGORIZATION_GUIDE.md](docs/BULK_CATEGORIZATION_GUIDE.md)**

### **🔧 Word Mappings & Failed Transactions**
- **Persistent log** (`data/failed-transactions.json`, max 100); **Refresh** enriches amount/date from Firefly
- **Deduplicated list** in the API; entries removed when categorization later succeeds
- **Quick word mappings** from failed transaction cards

## Privacy

Please note that some details of the transactions will be sent to OpenAI as information to guess the category.

These are:

- Transaction description
- Name of transaction destination account
- Names of all categories

## Installation

### Option 1: Using Docker (Recommended for Production)

The fastest and most reliable way to deploy the Firefly III AI Categorizer.

#### **Quick Start with Docker Compose**
```bash
# Clone the repository
git clone <repository-url>
cd firefly-iii-ai-categorize

# Copy and configure environment
cp env.docker.example .env
nano .env  # Edit with your credentials

# Create required directories
mkdir -p data logs

# Start the application
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f
```

#### **Access**
- **Web UI**: http://localhost:3001
- **Webhook URL**: http://localhost:3001/webhook (for Firefly III)

#### **Docker Environment Variables**
```bash
# Required
FIREFLY_URL=https://your-firefly-instance.com
FIREFLY_PERSONAL_TOKEN=your-firefly-personal-access-token
OPENAI_API_KEY=sk-your-openai-api-key

# Optional
ENABLE_UI=true
PORT=3000
FIREFLY_TAG=AI categorized
OPENAI_MODEL=gpt-4o-mini
```

For detailed Docker setup instructions, see **[DOCKER_GUIDE.md](DOCKER_GUIDE.md)**.

### Option 2: Using .env file (Local Development)

1. **Clone/Download the project**
2. **Copy the environment template:**
   ```bash
   cp env.example .env
   ```
3. **Edit the `.env` file with your credentials:**
   ```bash
   # Required
   FIREFLY_URL=https://your-firefly-instance.com
   FIREFLY_PERSONAL_TOKEN=your-firefly-personal-access-token
   OPENAI_API_KEY=sk-your-openai-api-key
   
   # Optional
   ENABLE_UI=true
   PORT=3000
   FIREFLY_TAG=AI categorized
   ```
4. **Start the application:**
   ```bash
   npm install
   npm start
   ```

### Option 3: Using Environment Variables

### 1. Get a Firefly Personal Access Token

You can generate your own Personal Access Token on the Profile page. Login to your Firefly III instance, go to
"Options" > "Profile" > "OAuth" and find "Personal Access Tokens". Create a new Personal Access Token by clicking on
"Create New Token". Give it a recognizable name and press "Create". The Personal Access Token is pretty long. Use a tool
like Notepad++ or Visual Studio Code to copy-and-paste it.

![Step 1](docs/img/pat1.png)
![Step 2](docs/img/pat2.png)
![Step 3](docs/img/pat3.png)

### 2. Get an OpenAI API Key

The project needs to be configured with your OpenAI account's secret key.

- Sign up for an account by going to the OpenAI website (https://platform.openai.com)
- Once an account is created, visit the API keys page at https://platform.openai.com/account/api-keys.
- Create a new key by clicking the "Create new secret key" button.

When an API key is created you'll be able to copy the secret key and use it.

![OpenAI screenshot](docs/img/openai-key.png)

Note: OpenAI currently provides 5$ free credits for 3 months which is great since you won't have to provide your
payment details to begin interacting with the API for the first time.

After that you have to enable billing in your account.

Tip: Make sure to set budget limits to prevent suprises at the end of the month.

### 3. Start the application via Docker

#### 3.1 Docker Compose

Create a new file `docker-compose.yml` with this content (or add to existing docker-compose file):

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

Make sure to set the environment variables correctly.

Run `docker-compose up -d`.

Now the application is running and accessible at port 3000.

#### 3.2 Manually via Docker

Run this Docker command to start the application container. Edit the environment variables to match the credentials
created before.

```shell
docker run -d \
-p 3000:3000 \
-e FIREFLY_URL=https://firefly.example.com \
-e FIREFLY_PERSONAL_TOKEN=eyabc123... \
-e OPENAI_API_KEY=sk-abc123... \
-e ENABLE_UI=true \
ghcr.io/bahuma20/firefly-iii-ai-categorize:latest
```

#### 3.3 Manually via Node.js

Set environment variables and start:
```bash
export FIREFLY_URL="https://firefly.example.com"
export FIREFLY_PERSONAL_TOKEN="eyabc123..."
export OPENAI_API_KEY="sk-abc123..."
export ENABLE_UI=true
npm install
npm start
```

### 4. Set up the webhook

After starting your container, you have to set up the webhook in Firefly that will automatically trigger the
categorization everytime a new transaction comes in.

- Login to your Firefly instance
- In the sidebar go to "Automation" > "Webhooks"
- Click "Create new webhook"
- Give the webhook a title. For example "AI Categorizer"
- Set "Trigger" to "After transaction creation" (should be the default)
- Set "Response" to "Transaction details" (should be the default)
- Set "Delivery" to "JSON" (should be the default)
- Set "URL" to the URL where the application is reachable + "/webhook". For example if you are using docker-compose your
  URL could look like this: `http://categorizer:3000/webhook`
- Click "Submit"

![Step 1](docs/img/webhook1.png)
![Step 2](docs/img/webhook2.png)
![Step 3](docs/img/webhook3.png)

Now you are ready and every new withdrawal transaction should be automatically categorized by OpenAI.

## User Interface

The application comes with a comprehensive Web UI that provides full control over the categorization system.
This UI is disabled by default but highly recommended for management and monitoring.

To enable this UI set the environment variable `ENABLE_UI` to `true`.

After a restart of the application the UI can be accessed at `http://localhost:3000/` (or any other URL that allows you
to reach the container).

### **🧭 Side Panel & Feature Overview**
The UI is organized by a left side panel with these groups (in order):
- **Categorizer**:
  - Auto-Categorization (Foreign/Travel Detection)
  - General Settings
  - Keyword → Category Mappings (AI hints)
  - Account → Category Mappings (hard rules)
  - Word Mappings & Failed Transactions
  - Transaction Management (Interactive)
  - Bulk Categorization (run AI for all/uncategorized)
- **Special tools**:
  - Credit Card Statement Splitter (CSV/PDF → split into child transactions)
- **Maintenance**:
  - Duplicate cleanup (find/select/delete duplicates, with “keep one per group”)
  - Test Webhook

Tips:
- Each item is a dedicated panel; only one is visible at a time.
- Duplicate cleanup protects originals/corrections by default and can keep one per group.

### **🧾 Credit Card Statement Splitter (Special tools)**
Split a statement (CSV or PDF) into multiple child transactions linked to the original Firefly III transaction.
- Deterministic PDF parsing with robust description/amount pairing
- Inline editing (date, payee, description, type, amount)
- Recalculate sums and validate against the original
- Tagging of created transactions and correcting clone

### **🧹 Duplicate cleanup (Maintenance)**
Find duplicate transactions grouped by type + date + absolute amount + normalized payee.
- Per-group select, “Select group”, and “Keep one per group” safeguard
- Originals/corrections are labeled and protected from accidental deletion
- Bulk delete selected items

### **🎛️ General Settings**
Configure system-wide options:
- **Skip Deposits**: Exclude deposit transactions from all categorization processes
- Useful for salary, refunds, and other income transactions that don't need categorization

### **📋 Bulk Categorization**
Control batch operations with real-time monitoring:
- **Process Uncategorized Transactions**: Only transactions without a category
- **Process All Transactions**: Re-categorize all (with confirmation)
- **Same rules as webhook**: Account mappings first, then auto-cat, word mappings, AI with keyword hints
- **Pause/Resume/Cancel**: Full control over long-running batch jobs
- **Progress tracking**: Live progress bars, statistics, and detailed error logs

### **🧪 Test Webhook**
Test the categorization system without affecting real transactions:
- **Live simulation**: Test with custom transaction descriptions and destinations
- **Transaction type selection**: Test both withdrawals and deposits
- **Immediate feedback**: See categorization results in real-time

### **🏦 Account → Category Mappings**
Hard rules by Firefly account (expense/revenue):
- **1:1 assignment**: All transactions involving the account receive the target category; no AI call
- **UI**: Add form and dropdowns on top; configured mappings in a collapsible list below
- **Account picker**: Accounts that already have a mapping are omitted from the dropdown (except when editing)

### **🗂️ Keyword → Category Mappings**
Keyword rules that improve AI categorization (not direct assignment):
- **Rule creation**: e.g. keywords `rewe, spar, hofer` → suggested category `Groceries`
- **Loose matching**: Keywords are matched flexibly in the transaction description
- **Edit / enable / disable**: Full CRUD with collapsible list and item counters

### **🌍 Auto-Categorization (Foreign/Travel Detection)**
Automatic categorization for international transactions:
- **Configuration**: Set native currency, home country, and target category
- **Foreign keywords**: Manage keywords like "bangkok, hotel, usd, paris, london" with comma-separated input
- **Multi-criteria detection**: Currency, foreign flags, keywords, and country-based recognition
- **API optimization**: Reduces OpenAI API calls for obvious foreign transactions

### **✏️ Word Mappings & Failed Transactions**
Improve categorization accuracy and handle failures:
- **Failed transaction tracking**: Stored under `data/failed-transactions.json`; removed automatically when categorization later succeeds
- **Refresh / enrich**: Loads amount and booking date from Firefly (by transaction ID or search); requires a current backend build (`GET /api/version` → `apiVersion: 1.1.0`)
- **List size**: The UI shows deduplicated entries; counts can drop after container restart (in-memory jobs gone), successful bulk runs, or **Cleanup**
- **Quick mapping creation**: Create word mappings directly from failed transactions
- **Edit mappings**: Modify existing word replacements with edit buttons
- **Collapsible lists**: Better organization with item counters

### **📊 Monitoring & Jobs**
Real-time monitoring with detailed insights:
- **Batch jobs**: Progress tracking with pause/resume/cancel functionality
- **Individual jobs**: Detailed view of each categorization attempt
- **Auto-categorization indicators**: Clear marking of transactions processed by different rules
- **Error tracking**: Comprehensive error logging for troubleshooting

## Categorization Process Flow

Webhook, bulk jobs, and test webhook use the same pipeline (`#resolveCategory`):

```
New Transaction
       ↓
1. Skip Deposits Check (if enabled)
   ├─ Deposit? → Skip transaction
   └─ Continue to categorization
       ↓
2. Account → Category Mappings — HARD RULE (highest priority)
   ├─ Source or destination account mapped? → Assign category, stop
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
5. AI Classification (OpenAI)
   ├─ Keyword → Category mappings: loose match → hint text + suggested category
   ├─ Generate category suggestion
   └─ Apply category or log as failed
```

See **[BULK_CATEGORIZATION_GUIDE.md](docs/BULK_CATEGORIZATION_GUIDE.md)** for bulk-specific notes.

## Adjust Tag name

The application automatically sets the tag "AI categorized" on every transaction that was processed and a category could
be guessed.

You can configure the name of this tag by setting the environment variable `FIREFLY_TAG` accordingly.

## Running on a different port

If you have to run the application on a different port than the default port `3000` set the environment variable `PORT`.

## Full list of environment variables

- `FIREFLY_URL`: The URL to your Firefly III instance. Example: `https://firefly.example.com`. (required)
- `FIREFLY_PERSONAL_TOKEN`: A Firefly III Personal Access Token. (required)
- `OPENAI_API_KEY`: The OpenAI API Key to authenticate against OpenAI. (required)
- `ENABLE_UI`: If the user interface should be enabled. (Default: `false`)
- `FIREFLY_TAG`: The tag to assign to the processed transactions. (Default: `AI categorized`)
- `PORT`: The port where the application listens. (Default: `3000`)

## API Endpoints

### Core Processing
- `POST /webhook` - Webhook for automatic transaction processing
- `POST /api/process-uncategorized` - Start manual processing of uncategorized transactions
- `POST /api/process-all` - Start manual processing of all transactions
- `POST /api/test-webhook` - Test webhook functionality with custom data

### Batch Job Control
- `POST /api/batch-jobs/:id/pause` - Pause a running batch job
- `POST /api/batch-jobs/:id/resume` - Resume a paused batch job
- `POST /api/batch-jobs/:id/cancel` - Cancel a batch job

### Word Mappings
- `GET /api/word-mappings` - Get all word mappings
- `POST /api/word-mappings` - Add new word mapping
- `DELETE /api/word-mappings/:fromWord` - Remove word mapping

### Failed Transactions
- `GET /api/version` - API version and capabilities (e.g. `apiVersion: 1.1.0`)
- `GET /api/failed-transactions` - List failed transactions (deduplicated; optional `?enrich=1` for Firefly backfill)
- `POST /api/failed-transactions/refresh` - Refresh list and run multi-pass enrich from Firefly
- `POST /api/failed-transactions/enrich` - Enrich incomplete entries only
- `POST /api/failed-transactions/cleanup` - Remove entries older than 7 days and duplicates
- `DELETE /api/failed-transactions/:id` - Remove one entry

### Auto-Categorization
- `GET /api/auto-categorization/config` - Get auto-categorization configuration
- `POST /api/auto-categorization/config` - Update auto-categorization configuration
- `POST /api/auto-categorization/keywords` - Add/update foreign keywords
- `DELETE /api/auto-categorization/keywords/:keyword` - Remove foreign keyword

### Keyword → Category Mappings
- `GET /api/category-mappings` - Get all keyword mappings
- `POST /api/category-mappings` - Add new keyword mapping
- `PUT /api/category-mappings/:id` - Update keyword mapping
- `DELETE /api/category-mappings/:id` - Delete keyword mapping
- `PATCH /api/category-mappings/:id/toggle` - Enable/disable keyword mapping

### Account → Category Mappings
- `GET /api/account-category-mappings` - Get all account mappings
- `POST /api/account-category-mappings` - Add account mapping
- `PUT /api/account-category-mappings/:id` - Update account mapping
- `DELETE /api/account-category-mappings/:id` - Delete account mapping
- `PATCH /api/account-category-mappings/:id/toggle` - Enable/disable account mapping
- `GET /api/accounts` - List Firefly accounts (for mapping UI)

## ✨ Key Features

- **🤖 AI-Powered Categorization**: Uses OpenAI's GPT model for intelligent transaction categorization
- **🖱️ Drag & Drop Interface**: Visual transaction management with intuitive categorization
- **🐳 Production-Ready Docker**: Multi-stage Docker builds with security hardening and health checks
- **🔄 Real-time Processing**: Webhook integration for automatic processing of new transactions
- **📊 Batch Processing**: Process all uncategorized or all transactions manually
- **🎯 Smart Auto-Categorization**: Pre-categorization based on currency, country, and custom keywords
- **🏦 Account → Category Mappings**: Hard per-account category assignment
- **🗂️ Keyword → Category Mappings**: AI hints via loose keyword matching
- **💻 Interactive Transaction Management**: Browse, filter, and manage transactions with bulk operations
- **📈 Real-time Monitoring**: Live updates via Socket.io with progress tracking
- **🔧 Comprehensive Configuration**: Web-based settings for all features
- **📦 Container Orchestration**: Docker Compose setup with volumes, networking, and resource management

## 🆕 Transaction Management Interface

The new **Transaction Management** section provides a powerful interface for browsing and managing your Firefly III transactions with **Drag & Drop functionality**:

### 🖱️ Drag & Drop Categorization

- **Visual Categorization**: Drag transactions directly onto category zones
- **Intuitive Interface**: Each transaction shows a `⋮⋮` drag handle on hover
- **Category Grid**: Automatic category grid appears during dragging
- **Three Categorization Methods**:
  - Direct assignment: Drag to specific category zones
  - Cross-column operations: Drag between left/right columns
  - Category removal: Drag to "Remove Category" zone
- **Smart Validation**: Visual feedback prevents invalid operations
- **Toast Notifications**: Instant feedback for all operations

### 🎯 Features

- **Two-Column Layout**:
  - **Left Column**: Uncategorized transactions or filtered results
  - **Right Column**: Transactions from a specific category
  
- **Advanced Filtering**:
  - Transaction type (All, Withdrawals, Deposits, Uncategorized)
  - Category status (All, Has Category, No Category)
  - Specific category selection
  - Text search in description and destination
  - Date range filtering (defaults to current month)
  - Amount range filtering
  
- **Bulk Operations**:
  - Multi-select transactions with checkboxes
  - Assign categories to multiple transactions
  - Reassign categories in bulk
  - Remove categories from multiple transactions
  - Select all / Deselect all functionality

### 📋 How to Use

1. **Set Filters**: Choose transaction type, category filters, and search criteria
2. **Load Transactions**: Click "🔍 Load Transactions" to fetch matching transactions
3. **Drag & Drop**: Hover over transaction → drag handle appears → drag to category
4. **Bulk Operations**: Select multiple transactions for batch categorization
5. **Cross-Column**: Use right column to view and manage categorized transactions

### 💡 Use Cases

- **Daily Categorization**: Quick processing of new uncategorized transactions
- **Category Cleanup**: Find and reorganize miscategorized transactions
- **Regular Maintenance**: Efficient bulk operations for transaction management
- **Data Migration**: Move transactions between categories with visual feedback

For detailed instructions, see **[TRANSACTION_MANAGEMENT_GUIDE.md](TRANSACTION_MANAGEMENT_GUIDE.md)**.

## 🆕 Enhanced Features

### **🎛️ General Settings**
- **Skip Deposits Option**: Automatically exclude deposit transactions (salary, refunds) from categorization
- **Configurable per process**: Applies to webhooks, manual processing, and batch operations

### **📊 Collapsible Interface**
- **Space-efficient UI**: All major sections (Failed Transactions, Word Mappings, Foreign Keywords, Category Mappings) are collapsible
- **Item counters**: Each section displays the number of items when collapsed
- **Improved navigation**: Better overview of large lists and configurations

### **✏️ Edit Functionality**
- **Edit Word Mappings**: Modify existing word mappings with edit buttons
- **Edit Category Mappings**: Full CRUD operations for category rules
- **Intuitive workflow**: Click edit, modify values, and save changes

### **🏦 Account → Category Mappings**
- **Hard rules**: Fixed category per account; highest priority in the pipeline
- **UI**: Add form on top; mapped accounts hidden from the account dropdown

### **🗂️ Keyword → Category Mappings**
- **AI hints only**: Loose keyword match improves the OpenAI prompt; target category is a suggestion
- **Enable/disable**: Toggle rules without deletion

### **🌍 Enhanced Auto-Categorization**
- **Foreign/Travel Detection**: Automatic categorization for international transactions
- **Multi-criteria**: Currency, foreign flags, keywords, and country detection
- **Comma-separated keywords**: Easy bulk input like "bangkok, hotel, usd, paris, london"
- **API savings**: Reduces OpenAI API calls for obvious foreign transactions

### **📋 Bulk Categorization**
- **Same pipeline as webhook**: Account mappings → auto-cat → word mappings → AI with keyword hints
- **Process Uncategorized / Process All**: With deposit filtering, pause/resume/cancel, live progress
- See **[docs/BULK_CATEGORIZATION_GUIDE.md](docs/BULK_CATEGORIZATION_GUIDE.md)**

### **🔧 Word Mappings & Failed Transactions**
- **Persistent log** in `data/failed-transactions.json`; **Refresh** enriches from Firefly
- **Deduplicated API list**; entry removed when a transaction is later categorized successfully
- **Quick mapping creation** from failed transaction cards

## 🔧 Configuration

### Data directory
Configuration and runtime data live under `data/` (mount as a Docker volume in production):
- `account-category-mappings.json`, `category-mappings.json`, `word-mappings.json`
- `failed-transactions.json`, `auto-categorization-config.json`, extraction config/logs

**Deploy note:** UI changes in `public/` often apply after a hard browser refresh. **Backend** changes (new API routes, categorization logic) require rebuilding and restarting the categorizer container.

## 📚 Documentation

**📚 Comprehensive Guides Available:**

- **[docs/AUTO_CATEGORIZATION_GUIDE.md](docs/AUTO_CATEGORIZATION_GUIDE.md)** - Foreign/travel auto-categorization
- **[docs/WORD_MAPPING_GUIDE.md](docs/WORD_MAPPING_GUIDE.md)** - Word replacement before AI
- **[docs/TRANSACTION_MANAGEMENT_GUIDE.md](docs/TRANSACTION_MANAGEMENT_GUIDE.md)** - Drag & drop transaction management
- **[docs/DOCKER_GUIDE.md](docs/DOCKER_GUIDE.md)** - Production Docker deployment
- **[docs/DUPLICATE_CLEANUP_GUIDE.md](docs/DUPLICATE_CLEANUP_GUIDE.md)** - Find and remove duplicates
- **[docs/BULK_CATEGORIZATION_GUIDE.md](docs/BULK_CATEGORIZATION_GUIDE.md)** - Bulk modes and categorization precedence

**Quick References:**
- Setup and configuration
- Webhook integration with Firefly III
- Manual categorization workflow
- Automatic categorization with AI
- Troubleshooting and optimization

## ⚡ Available Scripts

### Docker Commands
```bash
# Start production container
npm run docker:start

# Start development container with hot reload
npm run docker:dev

# Stop containers
npm run docker:stop

# View logs
npm run docker:logs

# Rebuild and start
npm run docker:build

# Clean up (remove containers, volumes, images)
npm run docker:clean
```

### Development Scripts
```bash
# Install dependencies
npm install

# Start application locally
npm start

# Development mode with auto-restart
npm run dev
```

## 🔧 Troubleshooting

### Docker Issues

#### **Port Already in Use**
```bash
# Check what's using port 3001
sudo lsof -i :3001

# Stop conflicting containers
docker stop $(docker ps -q --filter "publish=3001")

# Or change port in docker-compose.yml
ports:
  - "3002:3000"  # Use different host port
```

#### **Container Won't Start**
```bash
# Check container logs
docker-compose logs firefly-ai-categorizer

# Check container status
docker-compose ps

# Restart services
docker-compose restart

# Rebuild if needed
docker-compose down
docker-compose up --build -d
```

#### **Permission Issues**
```bash
# Fix file permissions
sudo chown -R 1001:1001 data/ logs/
sudo chmod -R 755 data/ logs/

# Or recreate with correct permissions
docker-compose down
sudo rm -rf data/ logs/
mkdir -p data logs
docker-compose up -d
```

#### **Health Check Failures**
```bash
# Check if application is responding
curl http://localhost:3001/health

# View detailed logs
docker-compose logs -f firefly-ai-categorizer

# Restart unhealthy container
docker-compose restart firefly-ai-categorizer
```

#### **Failed Transactions: Refresh returns 404 or HTML**
The enrich/refresh API needs a current backend build:
```bash
docker compose build categorizer && docker compose up -d categorizer
curl -s http://localhost:3001/api/version   # expect apiVersion 1.1.0
```

#### **Failed Transactions count dropped**
The list is deduplicated (one row per Firefly transaction). Counts can decrease after a **container restart** (in-memory webhook jobs lost), **Cleanup**, or successful **bulk/account** categorization that removes resolved entries from `failed-transactions.json`.

### Local Installation Issues

# Firefly III AI Categorizer - Codebase Analyse

## Übersicht

Das **Firefly III AI Categorizer** ist ein automatischer Transaktions-Kategorisierer für [Firefly III](https://www.firefly-iii.org/), eine Open-Source-Finanzverwaltungssoftware. Das Programm nutzt **OpenAI's GPT-Modell**, um eingehende Ausgaben automatisch zu kategorisieren.

## Hauptzweck

Das System automatisiert die manuelle Kategorisierung von Finanztransaktionen durch:
- **Webhook-basierte Integration** mit Firefly III für automatische Verarbeitung
- **AI-gestützte Kategorisierung** über OpenAI
- **Automatische Aktualisierung** der Transaktionen
- **Manuelle Batch-Verarbeitung** für bestehende Transaktionen
- **Web-UI** für Monitoring und manuelle Steuerung

## Technische Architektur

### Backend-Komponenten

#### 1. App.js - Hauptanwendung
- **Express.js Webserver** für HTTP-Endpoints
- **Socket.io** für Echtzeit-Updates an das UI
- **Queue-Management** für asynchrone Verarbeitung
- **Webhook-Endpunkt** (`/webhook`) für Firefly III Integration
- **API-Endpunkte** für manuelle Verarbeitung:
  - `/api/process-uncategorized` - Verarbeitet nur unkategorisierte Transaktionen
  - `/api/process-all` - Verarbeitet alle Transaktionen (überschreibt Kategorien)

```javascript
// Hauptworkflow: Webhook → Validierung → Queue → AI → Update
#onWebhook(req, res) {
    console.info("Webhook triggered");
    this.#handleWebhook(req, res);
    res.send("Queued");
}
```

#### 2. FireflyService.js - Firefly III Integration
- **API-Kommunikation** mit Firefly III
- **Kategorien abrufen** (`getCategories()`)
- **Transaktionen aktualisieren** (`setCategory()`)
- **Batch-Daten abrufen**:
  - `getAllUncategorizedTransactions()` - Holt alle Transaktionen ohne Kategorie
  - `getAllWithdrawalTransactions()` - Holt alle Ausgaben-Transaktionen
- **Authentication** über Personal Access Token

```javascript
// Kategorien aus Firefly III laden
async getCategories() {
    const response = await fetch(`${this.#BASE_URL}/api/v1/categories`, {
        headers: { Authorization: `Bearer ${this.#PERSONAL_TOKEN}` }
    });
}
```

#### 3. OpenAiService.js - AI-Integration
- **OpenAI API-Aufrufe** mit GPT-3.5-turbo-instruct
- **Prompt-Generierung** für Kategorisierung
- **Antwort-Verarbeitung** und Validierung

```javascript
// AI-Prompt für Kategorisierung
#generatePrompt(categories, destinationName, description) {
    return `Given i want to categorize transactions on my bank account into this categories: ${categories.join(", ")}
In which category would a transaction from "${destinationName}" with the subject "${description}" fall into?
Just output the name of the category. Does not have to be a complete sentence.`;
}
```

#### 4. JobList.js - Job-Management
- **Tracking aller Verarbeitungsjobs**
- **Event-basierte Updates** für UI
- **Status-Management**: `queued` → `in_progress` → `finished`
- **Batch-Job-Tracking** mit Progress-Monitoring:
  - `createBatchJob()` - Erstellt Batch-Jobs für manuelle Verarbeitung
  - `updateBatchJobProgress()` - Aktualisiert Fortschritt
  - `finishBatchJob()` - Markiert Batch-Job als abgeschlossen

#### 5. util.js - Utility-Funktionen
- **Umgebungsvariablen-Management**
- **Konfiguration** mit Fallback-Werten

### Frontend (Optional UI)

#### public/index.html - Web-Interface
- **Erweiterte Monitoring-Interface** mit manueller Steuerung
- **Control-Panel** mit Buttons für:
  - Verarbeitung unkategorisierter Transaktionen
  - Verarbeitung aller Transaktionen (Überschreibung)
- **Batch-Job-Monitoring** mit:
  - Echtzeit-Progress-Bars
  - Statistiken (Total, Verarbeitet, Erfolg, Fehler)
  - Fehler-Details mit ausklappbaren Listen
- **Echtzeit-Anzeige** aller Jobs via Socket.io
- **Responsive Design** mit modernem CSS

## Workflow im Detail

### 1. Automatischer Webhook-Workflow
```javascript
// Validierung eingehender Webhooks
if (req.body?.trigger !== "STORE_TRANSACTION") {
    throw new WebhookException("trigger is not STORE_TRANSACTION");
}

if (req.body.content.transactions[0].type !== "withdrawal") {
    throw new WebhookException("Transaction will be ignored.");
}
```

**Validierungen:**
- Nur `STORE_TRANSACTION` Trigger
- Nur `withdrawal` Transaktionen
- Keine bereits kategorisierten Transaktionen
- Pflichtfelder: `description`, `destination_name`

### 2. Manuelle Batch-Verarbeitung

#### 2.1 Unkategorisierte Transaktionen verarbeiten
```javascript
async #processUncategorizedTransactions() {
    const transactions = await this.#firefly.getAllUncategorizedTransactions();
    const batchJob = this.#jobList.createBatchJob('uncategorized', transactions.length);
    // ... Verarbeitung mit Progress-Tracking
}
```

#### 2.2 Alle Transaktionen verarbeiten (Überschreibung)
```javascript
async #processAllTransactions() {
    const transactions = await this.#firefly.getAllWithdrawalTransactions();
    const batchJob = this.#jobList.createBatchJob('all', transactions.length);
    // ... Verarbeitung mit Progress-Tracking
}
```

### 3. Job-Erstellung
```javascript
const job = this.#jobList.createJob({
    destinationName,
    description
});
```

### 4. AI-Klassifizierung
```javascript
const {category, prompt, response} = await this.#openAi.classify(
    Array.from(categories.keys()), 
    destinationName, 
    description
);
```

### 5. Automatische Aktualisierung
```javascript
if (category) {
    await this.#firefly.setCategory(
        req.body.content.id, 
        req.body.content.transactions, 
        categories.get(category)
    );
}
```

**Bei erfolgreicher Kategorisierung:**
- Kategorie wird in Firefly III gesetzt
- Automatischer Tag wird hinzugefügt (Standard: "AI categorized")
- Transaktion wird über API aktualisiert

## Konfiguration

### Erforderliche Umgebungsvariablen
- `FIREFLY_URL` - URL zur Firefly III Instanz
- `FIREFLY_PERSONAL_TOKEN` - API-Token für Firefly III
- `OPENAI_API_KEY` - OpenAI API-Schlüssel

### Optionale Umgebungsvariablen
- `ENABLE_UI` - Aktiviert Web-Interface (Standard: `false`)
- `FIREFLY_TAG` - Name des Auto-Tags (Standard: `"AI categorized"`)
- `PORT` - Server-Port (Standard: `3000`)

## Deployment

### Docker-Deployment
```dockerfile
FROM node:18-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY ["package.json", "package-lock.json", "./"]
RUN npm install --production
COPY . .
CMD ["node", "index.js"]
```

### Docker Compose Beispiel
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
      ENABLE_UI: "true"  # Für Web-Interface
```

## Dependencies

### Produktions-Dependencies
```json
{
  "express": "^4.18.2",     // Webserver
  "openai": "^3.2.1",       // OpenAI API Client
  "queue": "^7.0.0",        // Job Queue Management
  "socket.io": "^4.6.1",    // Echtzeit-Kommunikation
  "uuid": "^9.0.0"          // Unique ID Generation
}
```

## Datenschutz und Sicherheit

### An OpenAI übertragene Daten
- ✅ Transaktionsbeschreibung
- ✅ Empfänger-Name  
- ✅ Namen aller Kategorien

### Nicht übertragene Daten
- ❌ Transaktionsbeträge
- ❌ Kontoinformationen
- ❌ Persönliche Bankdaten

### Sicherheitsaspekte
- **API-Token Authentifizierung** für Firefly III
- **HTTPS-Kommunikation** empfohlen
- **Webhook-Validierung** für eingehende Requests
- **Rate-Limiting** bei Batch-Verarbeitung (100ms Pause zwischen Requests)

## Monitoring und Debugging

### Web-UI Features (wenn aktiviert)
- **Manuelle Steuerung** über Control-Panel
  - Button: "Process Uncategorized Transactions"
  - Button: "Process All Transactions (Overwrite Categories)"
- **Batch-Job-Monitoring** in Echtzeit:
  - Progress-Bars mit Prozent-Anzeige
  - Statistiken: Total/Verarbeitet/Erfolg/Fehler
  - Detaillierte Fehler-Listen
- **Individual Job-Tracking** für Webhook-Jobs
- **Echtzeit-Updates** via Socket.io

### Logging
```javascript
console.info("Webhook triggered");
console.warn(`OpenAI could not classify the transaction`);
console.error('Job error', event.job, event.err);
console.info(`Successfully categorized transaction ${transaction.id} as '${category}'`);
```

## Neue Features - Manuelle Verarbeitung

### 1. Batch-Verarbeitung unkategorisierter Transaktionen
- **Zweck**: Kategorisiert alle bestehenden Transaktionen ohne Kategorie
- **Sicherheit**: Überschreibt keine bestehenden Kategorien
- **Zugriff**: Web-UI Button oder API-Endpoint `/api/process-uncategorized`

### 2. Vollständige Neu-Kategorisierung
- **Zweck**: Kategorisiert ALLE Ausgaben-Transaktionen neu
- **Warnung**: Überschreibt bestehende Kategorien!
- **Zugriff**: Web-UI Button (mit Bestätigung) oder API-Endpoint `/api/process-all`

### 3. Progress-Tracking
```javascript
// Batch-Job mit Progress-Monitoring
const batchJob = this.#jobList.createBatchJob('uncategorized', transactions.length);
this.#jobList.updateBatchJobProgress(batchJob.id, processedCount, successCount, errorCount);
```

### 4. Fehler-Behandlung
- **Einzelne Fehler** stoppen nicht die gesamte Batch-Verarbeitung
- **Detaillierte Fehler-Logs** für jede fehlgeschlagene Transaktion
- **Statistiken** über Erfolg/Fehler-Rate

## API-Endpunkte

### Webhook-Endpunkt
- `POST /webhook` - Automatische Verarbeitung neuer Transaktionen

### Manuelle Verarbeitung
- `POST /api/process-uncategorized` - Startet Batch-Verarbeitung unkategorisierter Transaktionen
- `POST /api/process-all` - Startet Batch-Verarbeitung aller Transaktionen

### Response-Format
```json
{
  "success": true,
  "message": "Processing started"
}
```

## Fazit

Der **Firefly III AI Categorizer** ist ein robuster, produktionsreifer Service, der:

1. **Vollautomatische Kategorisierung** von Finanztransaktionen bietet
2. **Nahtlose Integration** mit Firefly III über Webhooks ermöglicht
3. **Moderne AI-Technologie** für präzise Klassifizierung nutzt
4. **Containerisiertes Deployment** für einfache Installation bietet
5. **Erweiterte Monitoring-Funktionen** für Transparenz und Debugging bereitstellt
6. **Manuelle Batch-Verarbeitung** für bestehende Transaktionen ermöglicht
7. **Benutzerfreundliche Web-UI** für Steuerung und Überwachung bietet

Das System verbessert die Effizienz der Finanzverwaltung erheblich und reduziert den manuellen Aufwand für die Transaktions-Kategorisierung auf ein Minimum. Mit den neuen manuellen Verarbeitungsfunktionen können auch bestehende Transaktionshistorien effizient kategorisiert werden. 
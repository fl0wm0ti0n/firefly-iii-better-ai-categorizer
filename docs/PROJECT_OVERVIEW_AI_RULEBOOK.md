## Projektübersicht & AI-Regelwerk

### Zweck
- **Ziel**: Automatisches Kategorisieren von Firefly III Transaktionen per Regeln, Heuristik und OpenAI.
- **Einsatz**: Webhook-basiert (live) und manuelle Batch-Verarbeitung mit UI/Progress-Tracking.

### Architektur (High-Level)
- **Laufzeit**: Node.js/Express, optionales UI via `public/` und Socket.io für Live-Status.
- **Haupteinstieg**: `index.js` → `src/App.js` initialisiert Services, Endpoints, Queue und Socket.io.
- **Services**:
  - **FireflyService**: REST-API zu Firefly III (Kategorien, Transaktionen, Updates).
  - **OpenAiService**: Chat Completions (Standardmodell `gpt-4o-mini`) zur Klassifizierung.
  - **AutoCategorizationService**: Fremdwährungs-/Reise-Heuristik (Währung, Flags, Keywords, Länder) + persistente Config.
  - **CategoryMappingService**: Benutzerregeln (Keywords → Zielkategorie) + persistente Mappings.
  - **WordMappingService**, **FailedTransactionService**, **JobList**: Textnormalisierung, Fehlerpersistenz, Job-/Batch-Tracking.
  - **TransactionExtractionService**: CSV/PDF-Parsing (PDF via AI), Vorschau/Validierung, Persistenz der Extraction-Config.

### Daten & Persistenz
- **Konfiguration**: JSON-Dateien im Container unter `/app/data` (per Volume mountbar):
  - `/app/data/auto-categorization-config.json` (Auto-Heuristik, z. B. `skipDeposits`, `foreignKeywords`)
  - `/app/data/category-mappings.json` (Keyword→Kategorie Regeln)
  - `/app/data/extraction-config.json` (Statement-Splitting: `defaultTag`, `useAIForParsing`, `headerMapping`)
- **Empfehlung**: In Docker Compose die `data/`- und `logs/`-Verzeichnisse als Volumes mounten.

### OpenAI-Nutzung (Standard)
- **Modell**: `gpt-4o-mini` (über `OPENAI_MODEL` konfigurierbar; unterstützt: `gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo`).
- **API**: Chat Completions; deterministisch (low temperature) und kurze Antworten.
- **Antwortformat**: Immer nur der exakte Kategoriename aus der Liste oder `UNKNOWN`.
- **Extraction**: Für PDFs erwartet das Prompt ein reines JSON-Array der Einzeltransaktionen (ohne zusätzlichen Text).

### Kategorisierungs-Pipeline (Priorität)
1. **Skip Deposits** (optional per Config)
2. **Category Mappings** (benutzerdefinierte Regeln; höchste Priorität)
3. **Auto-Categorization** (Heuristik für Fremdwährung/Reisen)
4. **Word Mapping** (Textnormalisierung)
5. **OpenAI Klassifizierung** (Fallback)
6. **Update in Firefly** (Kategorie setzen, Tag hinzufügen)

### Extraction-Flow (Kreditkartenabrechnungen aufschlüsseln)
1. Upload (CSV/PDF) + `originalTransactionId` → Vorschau (`POST /api/extraction/upload`)
2. Summenprüfung (Original vs. Summe Splits) mit Differenzanzeige
3. Review + Bestätigen → `POST /api/extraction/confirm`
4. Erstellung der Child-Transaktionen (withdrawals), Tags: `<defaultTag|userTag>`, `<sanitized(original description)>`
5. Original taggen: `already-extracted-original`; Korrektur-Clone (deposit, gleicher Zeitpunkt, gleicher Betrag abs.) mit `value-correction-clone`
6. Abbruch bei Differenz, außer `proceedOnMismatch = true`

### API-Endpunkte (Server)
- Core:
  - `POST /webhook` – Live-Kategorisierung (Firefly Webhook)
  - `POST /api/test-webhook` – Simulation zum Testen ohne echte Updates
  - `POST /api/process-uncategorized` – Batch für alle unkategorisierten Transaktionen
  - `POST /api/process-all` – Batch für alle Transaktionen
- Batch-Steuerung:
  - `POST /api/batch-jobs/:id/pause | resume | cancel`
- Word Mappings & Fehler:
  - `GET/POST/DELETE /api/word-mappings[...]`, `GET/DELETE /api/failed-transactions[...]`, `POST /api/failed-transactions/cleanup`
- Auto-Categorization:
  - `GET/POST /api/auto-categorization/config`, `POST/DELETE /api/auto-categorization/keywords`
- Category Mappings:
  - `GET/POST/PUT/DELETE/PATCH /api/category-mappings[...]`
- Transaktionsmanagement (UI-Unterstützung):
  - `GET /api/transactions/list`, `POST /api/transactions/update-categories`, `POST /api/transactions/remove-categories`, `GET /api/transactions/filter`
- Extraction (neu):
  - `POST /api/extraction/upload` – Datei (CSV/PDF) hochladen, Vorschau der Splits inkl. Summenprüfung
  - `POST /api/extraction/confirm` – Übernahme: legt Einzeltransaktionen an, taggt, erzeugt Korrektur-Clone
  - `GET /api/extraction/config`, `POST /api/extraction/config` – Lesen/Schreiben der Extraction-Config

### Batch-Verarbeitung & Rate Limits
- **Queue**: Einzel-Worker (`concurrency: 1`).
- **Batches**: Standardweise in 10er Schritten; adaptive Delays; Exponential Backoff bei 429.
- **Steuerung**: Pause/Resume/Cancel pro Batch-Job; Fortschritt via Socket.io-Ereignisse.

### Build & Deploy
- **Docker**: `Dockerfile`, `Dockerfile.dev`, `docker-compose.yml`
- **CI/CD**: `.github/workflows/main.yml` – Multi-Arch Build (amd64/arm64), Tags/Labels via metadata-action, Push nach GHCR.

### Sicherheit & Compliance
- **Secrets**: `.env` nie committen; nur `env.example` teilen.
- **CI**: GHCR-Login via GitHub Token; minimale Permissions (`contents: read`, `packages: write`).
- **Webhook**: Optional Auth/Signatur-Prüfung ergänzbar; Logs ohne sensible Inhalte halten.
- **Extraction**: Upload-Limit (10 MB), nur CSV/PDF; Tag-Sanitizing (Nicht-alphanumerische Zeichen → `-`).

---

## AI-Regelwerk (Guidelines für zukünftige Änderungen)

### Antworten & Prompting
- **Antwortformat**: Nur exakter Kategoriename aus Liste oder `UNKNOWN` (keine Begründung, kein Fließtext).
- **Deterministik**: `temperature` ≤ 0.2, `max_tokens` ≤ 50; keine unnötigen Parameteränderungen.
- **Prompt**: So kurz wie möglich; klare Regeln (Kategorie aus Liste, sonst `UNKNOWN`).

### Pipeline-Invarianten
- **Reihenfolge** darf nicht verändert werden (Mappings → Auto → Word → AI → Update).
- **Neue Regeln/Heuristiken**: Als eigenständiger Service/Modul kapseln, vor AI platzieren, `reason/autoRule` in Logs setzen.

### Performance & Kosten
- **Keine Parallelisierung** der Queue ohne explizites Rate-Limit-Konzept.
- **Minimale Tokens**: Kurze Prompts, knappe Antworten; Reuse von Kategorienliste im Prompt.
- **Backoff**: Bei 429 zwingend Exponential Backoff; adaptive Delays beibehalten.

### Erweiterbarkeit & Wartbarkeit
- **Trennung**: Endpoints in `App.js`; Logik in Services; Persistenz nur unter `/app/data`.
- **Konfiguration**: Neue Settings in `.env.example` dokumentieren und als JSON persistieren (falls dauerhaft).
- **UI/Events**: Socket.io-Ereignisse konsistent (`job created/updated`, `batch job ...`).
- **Extraction**: Parser im `TransactionExtractionService`, Endpoints in `App.js`, UI im `public/index.html` ergänzen.

### Firefly-Integration
- **Kategorien**: Immer Name→ID via `getCategories()` auflösen (keine Hardcodes).
- **Tests**: Für Simulation `test-` IDs nutzen, um echte Updates zu vermeiden.

### Observability & Fehlerbehandlung
- **Statistiken**: `OpenAiService.getStats()` nutzen/erweitern statt ad-hoc Countern.
- **Fehler**: Rate-Limits, Auth-Fehler, Netzfehler klar loggen; sensible Inhalte vermeiden.

### Checkliste bei Änderungen
- Neue Heuristik/Regel? → Eigener Service, Logging (`reason/autoRule`), Test via `/api/test-webhook`.
- Prompt/Modell ändern? → Format strikt beibehalten, deterministisch halten, Budget beachten.
- Batch/Delays anpassen? → Dokumentieren und 429-Szenarien testen.
- Neue Config? → In `.env.example` und als persistente Datei unter `/app/data` + Endpoints.

---

## Troubleshooting (Kurz)
- **Firefly 401/404**: `FIREFLY_URL`/Token prüfen; API-Endpoint erreichbar?
- **OpenAI 429**: Backoff/Delays; Abrechnung/Kontingent prüfen.
- **UI**: `ENABLE_UI=true`, Port-Konflikte ausschließen, Logs prüfen.

## Relevante Dokumente
- `README.md` – Schnellstart, Webhook-Setup, UI-Überblick
- `DOCKER_GUIDE.md` – Produktiver Docker-Betrieb
- `AUTO_CATEGORIZATION_GUIDE.md` – Auto-Heuristik Details
- `WORD_MAPPING_GUIDE.md` – Wort-/Keyword-Mappings
- `TRANSACTION_MANAGEMENT_GUIDE.md` – Drag & Drop Transaktionsmanagement



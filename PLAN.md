# Velo Mail – Projektplan

Ein schlanker Desktop-Mailclient mit einer einfachen, aufgeräumten Oberfläche
und runden Ecken.

## Stack

| Bereich      | Wahl                                   | Bemerkung                                                       |
| ------------ | -------------------------------------- | --------------------------------------------------------------- |
| UI           | SvelteKit (Svelte 5), `adapter-static` | läuft als SPA im Electron-Fenster, kein eigener Server          |
| Komponenten  | shadcn-svelte, Preset `b3XngymDea`     | `npx shadcn-svelte@latest init --preset b3XngymDea`             |
| Desktop      | Electron                               | Main-Prozess macht Mail, DB und Dateisystem                     |
| Datenbank    | SQLite (`node:sqlite`) + Drizzle 1.0   | lokaler Cache der Mails, Migrationen laufen beim App-Start      |
| IMAP         | `imapflow`                             | Sync, IDLE (Push für neue Mails), CONDSTORE                     |
| SMTP         | `nodemailer`                           | Versand                                                         |
| Mail-Parsing | `postal-mime` oder `mailparser`        | MIME, Anhänge, Zeichensätze                                     |
| HTML-Mails   | DOMPurify + `<iframe sandbox>`         | externe Bilder standardmäßig blockiert (Tracking-Schutz)        |
| Zugangsdaten | Electron `safeStorage`                 | Passwörter/Tokens verschlüsselt über den OS-Schlüsselbund       |
| Paketierung  | electron-builder + electron-updater    | AppImage/deb, Windows-Installer, dmg; Auto-Update über Releases |
| Tests        | Vitest, Playwright (`_electron`)       | dazu ein echter Test-Mailserver (GreenMail) in CI               |

### Better Auth – brauchen wir das?

Erstmal **nein**. Better Auth ist für Logins auf einem eigenen Server gedacht.
Velo Mail läuft lokal, es gibt keinen Server und keine Nutzerkonten bei uns.
Die Anmeldung beim Mailanbieter läuft über IMAP/SMTP (Passwort bzw.
App-Passwort) und später OAuth2 für Gmail/Outlook – das erledigen wir direkt im
Main-Prozess. Better Auth kommt erst ins Spiel, falls wir später einen eigenen
Sync-Dienst (z. B. Einstellungen über mehrere Geräte) bauen.

## Architektur

```
┌────────────────────────── Electron ──────────────────────────┐
│  Renderer (SvelteKit SPA, shadcn-svelte)                      │
│    └─ ruft nur window.velo.* auf (typisierte API)             │
│  Preload (contextBridge)                                      │
│    └─ reicht Aufrufe per IPC weiter, sonst nichts             │
│  Main (Node)                                                  │
│    ├─ AccountService   Konten, Zugangsdaten (safeStorage)     │
│    ├─ SyncService      imapflow, IDLE, inkrementeller Sync    │
│    ├─ SendService      nodemailer, Entwürfe, „Gesendet“       │
│    ├─ SearchService    SQLite FTS5                            │
│    └─ db/              Drizzle-Schema + Migrationen           │
└───────────────────────────────────────────────────────────────┘
```

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strenge
  CSP. Der Renderer bekommt nie direkten Zugriff auf Node oder die DB.
- Die IPC-Schnittstelle wird einmal als TypeScript-Typ definiert und von Main
  und Renderer gemeinsam genutzt (`src/shared/api.ts`), Eingaben werden im Main
  mit zod geprüft.
- Mails werden lokal gecacht: Liste und Kopfzeilen sofort, Inhalte bei Bedarf
  nachgeladen. Dadurch ist die App schnell und auch offline lesbar.

### Datenbankschema (erster Entwurf)

- `accounts` – Name, Adresse, Farbe, Reihenfolge, IMAP-/SMTP-Host, Port,
  Sicherheit, Auth-Typ
- `mailboxes` – Ordner je Konto, Spezialordner (Inbox, Sent, Drafts, Trash,
  Archive), `uidValidity`, `highestModseq`
- `messages` – UID, Message-ID, Thread-ID, Absender, Empfänger, Betreff,
  Datum, Flags (gelesen, markiert), Vorschautext
- `message_bodies` – Text-/HTML-Inhalt (getrennt, damit die Liste klein bleibt)
- `attachments` – Metadaten, Inhalt wird erst beim Öffnen geladen
- `messages_fts` – FTS5-Index für die Suche
- `sender_avatars` – Domain/Adresse → Bildquelle, Bild, Abrufdatum

## Phasen

Jede Phase endet mit atomaren Commits, damit man jederzeit zurückspringen kann.
Nach jeder Phase stimmen wir uns kurz ab.

### Phase 0 – Design festlegen _(erledigt)_

Gewählt: **Variante A „Klar“** (hell, drei Spalten, Karten mit runden Ecken)
mit den **Absender-Avataren aus Variante B** und **mehreren Konten**
(„Alle Posteingänge“ plus Ordner je Konto, Kontofarbe als Punkt am Avatar).
Daraus werden die Theme-Tokens (Farben, Radius) für shadcn-svelte.

**Absender-Avatare** – Reihenfolge, in der das Bild gesucht wird:

1. Kontaktfoto aus dem eigenen Adressbuch (später, mit CardDAV)
2. **BIMI**: offizielles Markenlogo, das die Absenderdomain per DNS
   veröffentlicht (`default._bimi.<domain>`), so kommt z. B. das Google-„G“
3. Favicon bzw. Apple-Touch-Icon der Absenderdomain
4. Gravatar (über den Hash der E-Mail-Adresse)
5. Fallback: Initialen auf einer Farbe, die fest aus der Adresse berechnet wird

Geholt wird im Main-Prozess, Ergebnisse werden in der DB gecacht (auch
„nichts gefunden“, mit Ablaufdatum). Bei Freemail-Domains (gmail.com, web.de,
…) wird kein Domain-Logo genommen, sonst hätte jede Privatperson das Google-
Logo. Das Nachladen lässt sich in den Einstellungen abschalten (Datenschutz).

### Phase 1 – Grundgerüst _(erledigt)_

- [x] SvelteKit-Projekt (`sv create`, TypeScript, Tailwind, Prettier, ESLint,
      Vitest, Playwright), `adapter-static` im SPA-Modus
- [x] Electron: `electron/main.ts`, `electron/preload.ts`, Dev-Modus (Vite +
      Electron mit Hot-Reload), Build über electron-builder
- [x] Layout aus Design A
- [x] CI- und Release-Workflows
- [x] shadcn-svelte mit Preset `b3XngymDea` (Nova, Neutral, Radius Medium,
      Inter + Geist)

**Ergebnis:** Ein Fenster mit dem Layout aus dem Design, das sich als App bauen
lässt, und grüne CI.

### Phase 2 – Datenbank _(erledigt)_

- [x] Drizzle-Schema (`electron/db/schema.ts`): Konten, Ordner, Mails,
      Inhalte, Anhänge, Absender-Avatare
- [x] Volltextsuche als FTS5-Tabelle, per Trigger aktuell gehalten
- [x] Migrationen werden mit der App ausgeliefert und beim Start ausgeführt;
      die DB liegt in `app.getPath('userData')`
- [x] Tests mit In-Memory-SQLite und gegen die gebaute App

Statt `better-sqlite3` nutzen wir `node:sqlite`, das in Electron eingebaut
ist: kein natives Modul, nichts neu zu bauen, gleiches SQLite in Tests und
App. Den passenden Treiber hat erst Drizzle 1.0, daher die Version
`1.0.0-rc.5` (fest gepinnt, bis 1.0 erscheint).

### Phase 3 – Konten

- Dialog „Konto hinzufügen“: E-Mail + Passwort, Servereinstellungen werden
  automatisch ermittelt (Mozilla-Autoconfig/ISPDB, DNS-SRV), manuell
  überschreibbar.
- Verbindungstest vor dem Speichern, Zugangsdaten via `safeStorage`.
- Mehrere Konten, einheitlicher Posteingang optional.

### Phase 4 – Synchronisierung

- Ordnerliste holen, Spezialordner erkennen.
- Erster Sync: Kopfzeilen der letzten X Tage, ältere Mails beim Scrollen.
- Danach inkrementell (UID + CONDSTORE/MODSEQ), IDLE für neue Mails sofort.
- Flags (gelesen, markiert, gelöscht, verschoben) in beide Richtungen.
- Events vom Main zum Renderer, damit die Liste live aktualisiert.

### Phase 5 – Lesen

- Drei-Spalten-Layout nach Design, virtuelle Liste für große Ordner.
- Leseansicht: HTML bereinigt im sandboxed iframe, externe Bilder erst nach
  Klick, Anhänge öffnen/speichern.
- Konversationsansicht (Threading über `References`/`In-Reply-To`).
- Tastenkürzel (j/k, e = archivieren, r = antworten, Strg+K = Suche).

### Phase 6 – Schreiben & Senden

- Fenster „Neue Nachricht“, Antworten/Allen antworten/Weiterleiten mit Zitat.
- Editor mit einfachen Formatierungen (fett, kursiv, Liste, Link) und Anhängen.
- Entwürfe automatisch im IMAP-Ordner „Entwürfe“ speichern.
- Versand über SMTP, Kopie in „Gesendet“ ablegen (falls der Server das nicht
  selbst macht).

### Phase 7 – Suche

Lokale Volltextsuche über FTS5 (Absender, Betreff, Inhalt), Fallback auf IMAP
`SEARCH` für noch nicht geladene Mails.

### Phase 8 – Feinschliff

Dunkelmodus, Desktop-Benachrichtigungen, Tray-Icon, Ungelesen-Zähler im Dock,
Einstellungen, Signaturen, OAuth2 für Gmail/Outlook.

## Tests

| Ebene       | Werkzeug                         | Was                                                                               |
| ----------- | -------------------------------- | --------------------------------------------------------------------------------- |
| Unit        | Vitest                           | Parser, Threading, Autoconfig, Zitat-Erzeugung, DB-Abfragen (In-Memory-SQLite)    |
| Komponenten | Vitest + `vitest-browser-svelte` | Mailliste, Leseansicht, Verfassen-Dialog                                          |
| Integration | Vitest + GreenMail (Docker)      | echter IMAP/SMTP-Server: Konto anlegen, Sync, Senden, Flags, IDLE                 |
| E2E         | Playwright `_electron.launch()`  | gebaute App starten, Konto gegen GreenMail anlegen, Mail lesen, antworten, suchen |
| Sicherheit  | Unit-Tests                       | bösartiges HTML wird entschärft, externe Bilder bleiben blockiert                 |

GreenMail läuft in CI als Service-Container, lokal über `docker compose up`.

## CI- und Release-Pipeline (GitHub Actions)

Aufbau wie bei ownWiki, damit beide Projekte gleich funktionieren.

**`ci.yml`** – bei jedem Pull Request und Push auf `main`

1. Lint (Prettier + ESLint), Typecheck (`svelte-check`, `tsc` für Electron)
2. Unit- und Komponententests
3. Integrationstests gegen GreenMail
4. E2E: App bauen, unter Linux mit `xvfb-run` starten, Playwright-Tests
5. Bei Fehlern Playwright-Report als Artefakt hochladen

**`auto-release.yml`** – bei jedem Merge nach `main`

Version wird über das Label am Pull Request bestimmt:

| Label          | Version              |
| -------------- | -------------------- |
| _(keins)_      | Patch, 1.2.3 → 1.2.4 |
| `feature`      | Minor, 1.2.3 → 1.3.0 |
| `breaking`     | Major, 1.2.3 → 2.0.0 |
| `kein-release` | kein Release         |

**`release.yml`** – nach dem Auto-Release oder bei einem Tag `v*.*.*`

1. Komplette CI noch einmal
2. Build-Matrix: `ubuntu-latest` (AppImage, deb), `windows-latest` (NSIS-
   Installer), `macos-latest` (dmg, Universal)
3. Dateien an ein GitHub-Release hängen, inkl. `latest*.yml` für den
   Auto-Updater
4. Release-Notes aus den gemergten Pull Requests

**Code-Signierung:** Ohne Signatur warnen Windows (SmartScreen) und macOS
(Gatekeeper) beim ersten Start. Für macOS braucht es ein Apple-Developer-Konto
(99 €/Jahr) für Signatur und Notarisierung, für Windows ein Zertifikat. Das
können wir später nachrüsten; die Pipeline bekommt dafür schon Platzhalter für
die Secrets.

## Offene Fragen an dich

1. **Plattformen:** Windows, macOS und Linux – oder erstmal nur eine?
2. **Anbieter:** Reicht anfangs IMAP/SMTP mit (App-)Passwort, oder ist Gmail/
   Outlook per OAuth von Anfang an wichtig? (Google verlangt für OAuth eine
   Prüfung der App, das dauert.)
3. **Sprache der Oberfläche:** Nur Deutsch, oder gleich mit i18n (Deutsch +
   Englisch)?
4. **Code-Signierung:** Später, oder hast du schon Zertifikate/Apple-Konto?

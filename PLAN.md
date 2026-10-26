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

### Phase 3 – Konten _(erledigt)_

- [x] Dialog „Konto hinzufügen“: Name, E-Mail, Passwort; Servereinstellungen
      werden automatisch ermittelt (Autoconfig des Anbieters, Mozilla-ISPDB auch
      über die MX-Domain, DNS-SRV, sonst übliche Hostnamen), manuell
      überschreibbar
- [x] Verbindungstest (IMAP + SMTP) vor dem Speichern, verständliche
      Fehlermeldungen, Hinweis auf App-Passwörter
- [x] Passwort verschlüsselt über `safeStorage`; unter Linux ohne Schlüsselbund
      nur verschleiert, darauf weist der Dialog hin
- [x] Mehrere Konten mit eigener Farbe in der Seitenleiste, Konto entfernen
- [ ] OAuth2 für Gmail/Outlook (Phase 8)

### Phase 4 – Synchronisierung _(erledigt)_

- [x] Ordnerliste holen, Spezialordner erkennen (RFC 6154), verschwundene
      Ordner lokal entfernen
- [x] Erster Sync: die neuesten 500 Mails je Ordner (Kopfzeilen, Flags,
      Anhang ja/nein); danach nur Neues per UID
- [x] Flags per CONDSTORE, wo der Server es kann, sonst Abgleich aller Flags;
      auf dem Server gelöschte Mails verschwinden lokal; neue UIDVALIDITY →
      Ordner neu laden
- [x] IDLE auf dem Posteingang: neue Mails erscheinen sofort, alle 5 Minuten
      ein kompletter Durchlauf, Wiederverbinden nach 5 s / 30 s / 2 min / 5 min
- [x] Gelesen-Markierung beim Öffnen, auch auf dem Server
- [x] Ordner je Konto mit Ungelesen-Zähler, „Alle Posteingänge“, Mailliste
      mit Initialen-Avataren und Kontofarbe, Sync-Status je Konto
- [ ] Ältere Mails beim Scrollen nachladen
- [ ] Vorschautext in der Liste (kommt mit den Inhalten in Phase 5)

### Phase 5 – Lesen _(erledigt)_

- [x] Inhalt beim Öffnen laden (postal-mime), für die neuesten 30 Mails im
      Posteingang vorab, daraus der Vorschautext in der Liste
- [x] HTML bereinigt (DOMPurify) in einem iframe ohne Skripte; eigene
      Content-Security-Policy blockiert alles aus dem Internet
- [x] Externe Bilder erst nach Klick („Bilder laden“), eingebettete Bilder
      (cid:) werden direkt angezeigt
- [x] Anhänge öffnen oder speichern; ausführbare Dateien werden nur
      gespeichert, nie geöffnet
- [x] Volltextindex enthält jetzt auch den Inhalt
- [x] Konversationen (Threading über `References`/`In-Reply-To`): eine Zeile
      je Unterhaltung in der Liste, im Lesebereich der ganze Verlauf über alle
      Ordner des Kontos (auch eigene Antworten aus „Gesendet“)
- [x] Tastenkürzel: j/k bzw. ↓/↑ blättern, u = ungelesen, Strg/⌘+K = Suche
      (e = archivieren und r = antworten folgen mit Phase 6)
- [x] Externe Bilder pro Absender dauerhaft erlauben

### Phase 6 – Schreiben & Senden _(erledigt)_

- [x] Fenster „Neue Nachricht“, Antworten/Allen antworten/Weiterleiten mit
      Zitat und den Kopfzeilen für die Konversation (`In-Reply-To`,
      `References`)
- [x] Anhänge aus dem Dateidialog; nur dort ausgewählte Dateien können
      verschickt werden
- [x] Entwürfe werden 2 s nach der letzten Änderung im IMAP-Ordner „Entwürfe“
      gespeichert (alte Fassung wird ersetzt), Entwürfe lassen sich weiter
      bearbeiten oder verwerfen
- [x] Versand über SMTP, Kopie in „Gesendet“ (nicht bei Gmail, das speichert
      selbst), beantwortete Mail bekommt `\Answered`
- [x] Archivieren und Löschen (Papierkorb), fehlende Ordner werden angelegt
- [x] Tastenkürzel: c = neu, r/a/f = antworten/allen/weiterleiten,
      e = archivieren, Entf/# = löschen, Strg/⌘+Enter = senden
- [x] Formatierung (fett, kursiv, Listen, Links) mit TipTap; gesendet wird
      HTML mit einer Textfassung
- [x] Anhänge der Originalmail beim Weiterleiten mitschicken (einzeln
      entfernbar, auch in Entwürfen)
- [x] Ordnernamen einheitlich auf Deutsch anzeigen (Sonderordner nach ihrer
      Rolle, egal wie sie auf dem Server heißen)

### Phase 7 – Suche

Lokale Volltextsuche über FTS5 (Absender, Betreff, Inhalt), Fallback auf IMAP
`SEARCH` für noch nicht geladene Mails.

- [x] Suchfeld über der Liste (Strg/⌘+K), Treffer aus allen Konten, neueste
      zuerst; Escape oder ✕ beendet die Suche
- [x] Wörter treffen als Präfix („angeb“ findet „Angebot“), Filter `von:` und
      `betreff:`
- [x] „Auf dem Server weitersuchen“: IMAP `SEARCH` in allen Ordnern außer
      Papierkorb und Spam, holt nur Mails, die älter sind als der Cache
- [x] Suche in Anhängen: Dateinamen und Text von PDFs (unpdf), sobald der
      Inhalt einer Mail geladen ist
- [x] Filter unter dem Suchfeld, auch ohne Suchwörter: mehrere Konten,
      Zeitraum (Heute, 7/30 Tage, 12 Monate, von–bis), Absender, mit Anhang,
      ungelesen; die Suche auf dem Server nutzt sie mit (FROM, SINCE, BEFORE)

### Phase 8 – Feinschliff

Dunkelmodus, Desktop-Benachrichtigungen, Tray-Icon, Ungelesen-Zähler im Dock,
Einstellungen, Signaturen, OAuth2 für Gmail/Outlook.

- [x] Einstellungen (Allgemein, Konten), gespeichert in der Tabelle `settings`
- [x] Dunkelmodus: System, Hell oder Dunkel; HTML-Mails behalten ihren hellen
      Hintergrund
- [x] Signatur pro Konto, unter dem eigenen Text und über dem Zitat, mit „-- “
      abgetrennt; wechselt mit dem Absenderkonto
- [x] Absendername nachträglich ändern
- [x] Benachrichtigung bei neuer ungelesener Mail im Posteingang, solange das
      Fenster im Hintergrund ist; ab vier Mails eine Zusammenfassung; Klick
      öffnet die Mail
- [x] Benachrichtigungen pro Konto: alle, alle außer Newsletter, keine
- [x] Newsletter und Werbung an ihren Kopfzeilen erkennen (`List-Unsubscribe`,
      `List-Id`, `Precedence: bulk`), auch in schon gecachten Mails (je Runde
      1000 nachgeprüft); Filter „Newsletter“ / „Ohne Newsletter“; Knopf
      „Abbestellen“ öffnet den https-Link oder schreibt die Abmelde-Mail
- [x] Tabs „Allgemein“ und „Newsletter“ im Posteingang (wie bei Gmail), mit
      Ungelesen-Zahl je Tab
- [x] Absender-Regeln: immer oder nie als Newsletter einordnen (Menü „Mehr“ im
      Lesebereich, Tabelle `sender_rules`); gelten für Tabs, Filter und
      Benachrichtigungen
- [x] „Newsletter aufräumen“: Absender nach Menge, abbestellen, alle
      archivieren, alle in den Papierkorb oder behalten
- [x] Ein-Klick-Abmeldung (RFC 8058, `List-Unsubscribe-Post`): ein POST ohne
      Cookies, sonst Abmeldeseite oder Abmelde-Mail
- [ ] Tags (eigene Schlagwörter, als IMAP-Keywords auf dem Server)
- [x] Ungelesen-Zähler am App-Symbol (macOS-Dock, Linux-Launcher)
- [x] Tray-Symbol (optional): Fenster schließen lässt die App weiterlaufen
- [x] App-Icon (`resources/icon.svg`, PNGs per `node scripts/icons.mjs`)
- [x] Absenderbilder: BIMI-Logo der Organisation, sonst das größte Symbol der
      Website, sonst Gravatar; Freemail-Domains nur Gravatar; Treffer 30 Tage,
      Fehlschläge 7 Tage gecacht; in den Einstellungen abschaltbar
- [x] Kompaktere Oberfläche: „Neue Nachricht“ als Stift-Knopf über der Liste,
      engere Seitenleiste, Liste und Lesebereich
- [x] Auto-Update (wie in Remoty): Prüfung gegen die neueste GitHub-Release
      beim Start (abschaltbar), selbst aktualisieren mit electron-updater beim
      Windows-Installer und AppImage, sonst Link zur Download-Seite
- [ ] Auto-Update auf macOS, sobald die Builds signiert sind
- [ ] OAuth2 für Gmail/Outlook (zum Schluss; braucht registrierte Client-IDs)

### Kalender

Eigener Kalender über CalDAV (iCloud, Nextcloud, Posteo, mailbox.org, Yahoo,
GMX, Web.de, …). Google und Microsoft kommen mit OAuth2.

- [x] Kalender hinzufügen: Server wird aus der Adresse gesucht, Anmeldung
      geprüft, Passwort verschlüsselt gespeichert
- [x] Abgleich beim Start, alle 5 Minuten und nach Änderungen (ctag, ETag)
- [x] Ansichten Tag, Woche, Monat; Kalender ein-/ausblenden, eigene Farben
- [x] Wiederholungen und Ausnahmen (ical.js), Zeitzonen, Ganztagstermine
- [x] Termine anlegen, ändern, löschen; Änderungen an Serien verschieben die
      ganze Serie; woanders geänderte Termine werden nicht überschrieben
- [x] Einladungen aus Mails annehmen (iTIP/iMIP): Zusagen, Vielleicht, Absagen
      mit Antwort an die Organisatorin; Änderungen und Absagen übernehmen;
      SCHEDULE-AGENT=CLIENT, damit iCloud nicht zusätzlich antwortet
- [x] Erinnerungen (VALARM) als Desktop-Benachrichtigung; Klick zeigt den Tag,
      Erinnerung im Termin-Dialog wählbar, abschaltbar in den Einstellungen
- [x] Einzelne Termine einer Serie ändern oder löschen (RECURRENCE-ID, EXDATE),
      wahlweise die ganze Serie
- [x] Termine per Ziehen verschieben (Woche und Tag, auch auf einen anderen Tag,
      in Viertelstunden; bei Serien nur das gezogene Vorkommen)

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

Ein beim Merge ausgelassenes Release lässt sich von Hand nachholen: Actions →
Auto-Release → „Run workflow“, dort wählen, wie die Version steigt.

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

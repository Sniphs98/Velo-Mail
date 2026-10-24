# Velo Mail

Ein schlanker Desktop-Mailclient mit einer einfachen, aufgeräumten Oberfläche.
Gebaut mit SvelteKit, shadcn-svelte, Drizzle, SQLite und Electron.

Der Projektplan steht in [PLAN.md](PLAN.md).

## Entwicklung

Voraussetzung: Node.js 22 oder neuer.

```sh
npm install
npm run dev        # App mit Hot-Reload starten
```

| Befehl                | Was                                                      |
| --------------------- | -------------------------------------------------------- |
| `npm run dev`         | Vite + Electron, Neustart bei Änderungen am Main-Prozess |
| `npm run dev:web`     | nur die Oberfläche im Browser (ohne `window.velo`)       |
| `npm run build`       | Oberfläche nach `build/`, Electron-Code nach `out/`      |
| `npm start`           | gebaute App starten                                      |
| `npm run package`     | Installer für das eigene System nach `release/`          |
| `npm run lint`        | Prettier + ESLint                                        |
| `npm run check`       | Typprüfung (svelte-check und Electron)                   |
| `npm run test:unit`   | Unit- und Komponententests (Vitest)                      |
| `npm run test:e2e`    | baut die App und testet sie mit Playwright               |
| `npm run db:generate` | Migration aus Änderungen an `electron/db/schema.ts`      |

Unter Linux ohne Bildschirm (Server, Container) die E2E-Tests mit
`xvfb-run -a npm run test:e2e` starten.

## Aufbau

```
electron/        Main-Prozess und Preload (Node, Mail, Datenbank)
src/lib/api.ts   typisierte Schnittstelle zwischen Oberfläche und Main-Prozess
src/             Oberfläche (SvelteKit, läuft als SPA im Fenster)
drizzle/         Migrationen (erzeugt mit `npm run db:generate`)
e2e/             Playwright-Tests gegen die gebaute App
scripts/         Dev-Server, Electron-Build, Versionsberechnung
```

Die Datenbank ist SQLite über `node:sqlite`, das in Node bzw. Electron
eingebaut ist; es gibt kein natives Modul, das für Electron neu gebaut werden
müsste. Das Schema steht in `electron/db/schema.ts`. Nach einer Änderung
`npm run db:generate` ausführen; die App spielt neue Migrationen beim Start
ein (`velo-mail.db` im Profilordner).

Die Oberfläche hat keinen Zugriff auf Node. Alles, was sie braucht, holt sie
über `window.velo`, das der Preload aus `src/lib/api.ts` bereitstellt.

## Releases

Jeder Merge nach `main` wird automatisch veröffentlicht. Das Label am Pull
Request bestimmt die Version:

| Label          | Version              |
| -------------- | -------------------- |
| _(keins)_      | Patch, 1.2.3 → 1.2.4 |
| `feature`      | Minor, 1.2.3 → 1.3.0 |
| `breaking`     | Major, 1.2.3 → 2.0.0 |
| `kein-release` | kein Release         |

Die Pipeline baut Installer für Linux (AppImage, deb), Windows (Setup.exe) und
macOS (dmg) und hängt sie an das GitHub-Release. Die Installer sind noch nicht
signiert, Windows und macOS warnen deshalb beim ersten Start.

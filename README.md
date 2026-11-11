# Il mio calendario

App personale (PWA) di calendario, promemoria, note e studio. Local-first, zero dipendenze, costo zero.

## Stato
- **Fase 1 (fatta)**: viste Oggi / Giorno / Settimana / Mese / Agenda, eventi con ricorrenze ed eccezioni, promemoria multipli, checklist, promemoria/task con Inbox e priorità, note markdown con tag e nota del giorno, categorie con colore, ricerca globale, tema chiaro/scuro/automatico, dati offline (IndexedDB), backup JSON manuale, avvisi in-app.
- **Fase 2 (fatta)**: login Google (GIS, scope `drive.file`), sync su `Calendario personale/dati/dati.json` (merge per record, last-write-wins, coda offline), backup giornaliero in `backup/` (ultimi 30, i vecchi vanno in `_cestino app/`), allegati (carica in `allegati/` o collega col Picker), indicatore di stato, controllo che l'account sia quello ammesso.
- **Fase 3 (fatta)**: modulo Studio (`src/07-studio.ts`, `src/07-tabelle.ts`, formato in `docs/formato-studio.md`): pacchetti Step 1 e Step 2 (numeri verificati con le schede PDF), piano 11/11→09/12 e piano di raffinamento 10/12→10/01, copertura del syllabus (124 argomenti), spunte/punteggi/note, quiz HTML in iframe isolato, PDF del libro alla pagina con cache sul dispositivo, piano → calendario, ritardo, spostamenti, tabelle personalizzate (CSV, Google Sheet, righe con data nel calendario).
- Fase 4 Personalizzazione/notifiche · Fase 5 Rifinitura: da fare.

## Comandi
```
node build.mjs          # compila e crea dist/ (serve solo Node + tsc, nessun npm install)
python3 test/e2e.py     # test end-to-end (Playwright per Python)
python3 test/sync.py    # test della sincronizzazione con un finto Drive
python3 test/studio.py  # test del modulo Studio
node studio/genera.mjs  # rigenera i pacchetti studio e controlla i numeri con le schede PDF
```
`dist/` è il sito da pubblicare (GitHub Pages). `dist/anteprima.html` è la stessa app in un solo file.

## Struttura
```
src/01-util.ts        DOM (h), date, markdown minimale
src/02-db.ts          salvataggio locale: IndexedDB → localStorage → memoria
src/03-modello.ts     tipi dei dati, stato (Stato), ricorrenze, logica promemoria
src/04-componenti.ts  foglio modale, dialogo, avviso, campo ricorrenza, icone
src/05-editor.ts      editor di evento / promemoria / nota
src/06-drive.ts       Google: login, Drive API, Picker, sync, backup, allegati
src/07-studio.ts      modulo Studio (pacchetti, progressi, piani, syllabus, quiz, PDF)
src/07-tabelle.ts     tabelle personalizzate
src/08-viste.ts       le schermate (UI = stato dell'interfaccia)
src/09-main.ts        avvio, disegna(), tema, avvisi, service worker
public/               index.html, style.css, manifest, sw.js, icone
```
**Niente import/moduli**: i file di `src/` sono script globali concatenati in ordine di nome. Per aggiungere codice crea un file con il numero giusto (es. `08-drive.ts`) prima di `07-main.ts` rinumerando, oppure aggiungi funzioni nei file esistenti.

## Formato dati
Un solo tipo di contenitore, il **record**: `{ id, type, updatedAt, deleted?, ...campi }`.
- `type`: `evento`, `task`, `nota`, `categoria`, `impostazioni` (vedi le interfacce in `03-modello.ts`).
- Date come stringhe locali `YYYY-MM-DD` o `YYYY-MM-DDTHH:mm` (orario "a muro", Europe/Rome).
- Eliminazione = `deleted: true` (lapide), mai cancellazione fisica: serve alla sincronizzazione.
- Unione tra dispositivi: per record, vince `updatedAt` più alto (`Stato.unisci`).
- Ricorrenze: `rrule { freq: D|W|M|Y, interval, byday?, until?, count? }` + `exdate[]` (giorni esclusi).

## Scelte tecniche da sapere
- Il progetto doveva usare Vite + Svelte + Dexie; l'ambiente di sviluppo non poteva scaricare pacchetti npm, quindi è TypeScript puro compilato con `tsc`. Nessuna dipendenza da aggiornare.
- `disegna()` ricostruisce tutta la schermata a ogni modifica: semplice e sufficiente. Per salvare senza ridisegnare (es. mentre si scrive) usare `Stato.salva(r, true)`.
- Niente `alert/confirm`: usare `chiedi()` e `avviso()`.

## Google Cloud (già configurato)
Client ID, chiave API e account ammesso sono in cima a `src/06-drive.ts` (sono pubblici per natura; la sicurezza sta nel progetto in modalità Testing con un solo utente di test e nel controllo dell'email dopo il login). Origine JavaScript autorizzata: `https://cocco-glitch.github.io`.

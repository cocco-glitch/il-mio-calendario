# Il mio calendario

App personale (PWA) di calendario, promemoria, note e studio. Local-first, zero dipendenze, costo zero.

## Stato
- **Fase 1 (fatta)**: viste Oggi / Giorno / Settimana / Mese / Agenda, eventi con ricorrenze ed eccezioni, promemoria multipli, checklist, promemoria/task con Inbox e priorità, note markdown con tag e nota del giorno, categorie con colore, ricerca globale, tema chiaro/scuro/automatico, dati offline (IndexedDB), backup JSON manuale, avvisi in-app.
- Fase 2 Drive · Fase 3 Studio · Fase 4 Personalizzazione/notifiche · Fase 5 Rifinitura: da fare.

## Comandi
```
node build.mjs          # compila e crea dist/ (serve solo Node + tsc, nessun npm install)
python3 test/e2e.py     # test end-to-end (Playwright per Python)
```
`dist/` è il sito da pubblicare (GitHub Pages). `dist/anteprima.html` è la stessa app in un solo file.

## Struttura
```
src/01-util.ts        DOM (h), date, markdown minimale
src/02-db.ts          salvataggio locale: IndexedDB → localStorage → memoria
src/03-modello.ts     tipi dei dati, stato (Stato), ricorrenze, logica promemoria
src/04-componenti.ts  foglio modale, dialogo, avviso, campo ricorrenza, icone
src/05-editor.ts      editor di evento / promemoria / nota
src/06-viste.ts       le schermate (UI = stato dell'interfaccia)
src/07-main.ts        avvio, disegna(), tema, avvisi, service worker
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

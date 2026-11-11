# Il mio calendario

App personale (PWA) di calendario, promemoria, note e studio. Local-first, zero dipendenze, costo zero.

## Stato
- **Fase 1 (fatta)**: viste Oggi / Giorno / Settimana / Mese / Agenda, eventi con ricorrenze ed eccezioni, promemoria multipli, checklist, promemoria/task con Inbox e priorità, note markdown con tag e nota del giorno, categorie con colore, ricerca globale, tema chiaro/scuro/automatico, dati offline (IndexedDB), backup JSON manuale, avvisi in-app.
- **Fase 2 (fatta)**: login Google (GIS, scope `drive.file`), sync su `Calendario personale/dati/dati.json` (merge per record, last-write-wins, coda offline), backup giornaliero in `backup/` (ultimi 30, i vecchi vanno in `_cestino app/`), allegati (carica in `allegati/` o collega col Picker), indicatore di stato, controllo che l'account sia quello ammesso.
- **Fase 3 (fatta)**: modulo Studio (`src/07-studio.ts`, `src/07-tabelle.ts`, formato in `docs/formato-studio.md`): pacchetti Step 1 e Step 2 (numeri verificati con le schede PDF), piano 11/11→09/12 e piano di raffinamento 10/12→10/01, copertura del syllabus (124 argomenti), spunte/punteggi/note, quiz HTML in iframe isolato, PDF del libro alla pagina con cache sul dispositivo, piano → calendario, ritardo, spostamenti, tabelle personalizzate (CSV, Google Sheet, righe con data nel calendario).
- **Fase 4 (fatta)**: aspetto (tema, accento, sfondo, carattere, dimensione testo, densità, angoli), layout (vista iniziale, ordine/visibilità dei riquadri di Oggi, sezioni della barra, barra su PC), preset (3 di base + personali), aggiunta rapida in italiano (`src/07-rapido.ts`), specchio su Google Calendar con scope `calendar.app.created` e import/export .ics (`src/06-gcal.ts`).
- **Fase 5 (fatta)**: test completi, documentazione (`docs/MANUTENZIONE.md`, `docs/formato-studio.md`).

- **0.12.0**: punti deboli (`src/07-progressi.ts`) in Studio → Statistiche: percentuale per tipo di domanda e materia (dai quiz e dalle simulazioni letti in automatico) e i 5 sotto-step più deboli.
- **0.11.0**: modalità simulazione (`src/07-progressi.ts   punti deboli per tipo di domanda, sotto-step più deboli
src/07-simulazioni.ts`): dalla voce Simulazione/Verifica del piano o da Studio → Esami; file dalla cartella Drive «…consolidamento», conto alla rovescia 50 min, schermo acceso, avviso a 10 min, risultato letto e salvato (record `simulazione`), storico.
- **0.10.0**: ripianificazione dei ritardi (`src/07-simulazioni.ts simulazioni a tempo (cartella Drive, timer, risultato, storico)
src/07-ripianifica.ts`): pulsante sotto l'indicatore del ritardo, anteprima «Giorni leggeri / Prima possibile», conferma e annulla; sposta solo i giorni, i progressi restano.
- **0.9.0** (F3 ridotta): lettura automatica del risultato dei quiz (`src/07-ripianifica.ts ripianifica gli step in ritardo (anteprima, conferma, annulla)
src/07-cattura.ts`): alla schermata finale l'app salva punteggio, data e tipi di domanda (avviso «tocca per annullare»); «Rifai solo gli errori» finisce nella nota senza cambiare il punteggio. I file dei quiz su Drive non vengono toccati: l'osservatore si aggiunge solo alla copia aperta nell'app.
- **0.8.0** (F2): ripassi automatici con FSRS (`src/07-memoria.ts`): l'unità è il SOTTO-STEP; quando tutte le prioritarie sono fatte entra nei ripassi (data = giorno del piano se precedente); riquadro «Ripassi di oggi» in cima a Oggi con tetto di minuti (Altro → Studio), scheda proposta a rotazione (la più debole), «🧠 ricordo %» sui sotto-step, ritenzione 0,95 nei 14 giorni prima di un esame.
- **0.7.0** (aggiornamento v1.0, fasi F0+F1): notifiche sul telefono anche ad app chiusa tramite ntfy (`src/06-notifiche.ts`): promemoria, studio del giorno, ripasso serale, esami/simulazioni vicini, orari silenziosi, categorie private; tipi di dati per i ripassi (F2). Piano completo in `docs/aggiornamento/`.
- **0.6.0**: studio per qualsiasi corso (materie generiche, corsi creati nell'app), registro errori, timer Pomodoro, statistiche, esami con conto alla rovescia, trascinamento degli eventi.

Documentazione per chi modifica l'app: **`docs/MANUTENZIONE.md`**. Evoluzione prevista: **`docs/PROGRESSIONE.md`**.

## Comandi
```
node build.mjs          # compila e crea dist/ (serve solo Node + tsc, nessun npm install)
python3 test/e2e.py     # test end-to-end (Playwright per Python)
python3 test/sync.py    # test della sincronizzazione con un finto Drive
python3 test/studio.py  # test del modulo Studio
python3 test/fase4.py   # aggiunta rapida, .ics, specchio Calendar, preset
python3 test/versatile.py # corsi propri, errori, timer, statistiche, esami, trascinamento
python3 test/f1.py      # notifiche ntfy (finto server)
python3 test/f2.py      # ripassi FSRS (confronto con un'implementazione di riferimento)
python3 test/deboli.py  # punti deboli
python3 test/simulazioni.py # simulazione a tempo (Drive e quiz finti)
python3 test/ripianifica.py # ripianificazione dei ritardi
python3 test/f3.py      # lettura del risultato dei quiz (quiz finto con la stessa schermata finale)
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
src/06-gcal.ts        specchio Google Calendar, .ics
src/06-notifiche.ts   notifiche sul telefono via ntfy (finestra di 72 h, registro anti-doppioni)
src/06-drive.ts       Google: login, Drive API, Picker, sync, backup, allegati
src/07-extra.ts       corsi propri, errori, timer, statistiche, esami
src/07-memoria.ts     ripassi FSRS per sotto-step, riquadro «Ripassi di oggi»
src/07-cattura.ts     lettura del risultato dei quiz HTML (osservatore nella copia, Annulla)
src/07-rapido.ts      aggiunta rapida in linguaggio naturale
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

# Il mio calendario

App personale (PWA) di calendario, promemoria, note e studio. Local-first, zero dipendenze, costo zero.

## Stato
- **Fase 1 (fatta)**: viste Oggi / Giorno / Settimana / Mese / Agenda, eventi con ricorrenze ed eccezioni, promemoria multipli, checklist, promemoria/task con Inbox e priorità, note markdown con tag e nota del giorno, categorie con colore, ricerca globale, tema chiaro/scuro/automatico, dati offline (IndexedDB), backup JSON manuale, avvisi in-app.
- **Fase 2 (fatta)**: login Google (GIS, scope `drive.file`), sync su `Calendario personale/dati/dati.json` (merge per record, last-write-wins, coda offline), backup giornaliero in `backup/` (ultimi 30, i vecchi vanno in `_cestino app/`), allegati (carica in `allegati/` o collega col Picker), indicatore di stato, controllo che l'account sia quello ammesso.
- **Fase 3 (fatta)**: modulo Studio (`src/07-studio.ts`, `src/07-tabelle.ts`, formato in `docs/formato-studio.md`): pacchetti Step 1 e Step 2 (numeri verificati con le schede PDF), piano 11/11→09/12 e piano di raffinamento 10/12→10/01, copertura del syllabus (124 argomenti), spunte/punteggi/note, quiz HTML in iframe isolato, PDF del libro alla pagina con cache sul dispositivo, piano → calendario, ritardo, spostamenti, tabelle personalizzate (CSV, Google Sheet, righe con data nel calendario).
- **Fase 4 (fatta)**: aspetto (tema, accento, sfondo, carattere, dimensione testo, densità, angoli), layout (vista iniziale, ordine/visibilità dei riquadri di Oggi, sezioni della barra, barra su PC), preset (3 di base + personali), aggiunta rapida in italiano (`src/07-rapido.ts`), specchio su Google Calendar con scope `calendar.app.created` e import/export .ics (`src/06-gcal.ts`).
- **Fase 5 (fatta)**: test completi, documentazione (`docs/MANUTENZIONE.md`, `docs/formato-studio.md`).

- **0.32.0** (appunti attivi): «🗣 Spiegamelo» (metodo Feynman) per ogni sezione nella vista Cornell e dal menu ⋯ dell'editor: spieghi a parole tue (anche dettando), l'AI confronta con l'appunto, dice cosa manca/è sbagliato, fa una domanda di verifica e il voto entra nel ripasso della sezione. Domande sbagliate ↔ appunti: in Studio → Errori, dopo «mostra risposta», la sezione del tuo appunto che ne parla e «➕ Aggiungi all'appunto come flashcard» (anche in fondo alla vista Cornell); se lo step non ha appunti, «📝 Crea un appunto da questo errore». Collegamenti `[[titolo]]` tra appunti (pulsante «[[ ]]»), cliccabili in anteprima e in Cornell, con «🔗 Citato in».
- **0.31.0** (scrittura a mano): negli appunti «⌨️ Testo / ✍️ A mano». Pagina a quadretti, righe o bianca che si allunga; penna sensibile alla pressione, evidenziatore, gomma, 5 colori, annulla/ripeti. Con la Apple Pencil il dito scorre soltanto (e Scribble è bloccato sulla pagina); su iPhone si scrive col dito. «✨ Leggi la mia scrittura» trascrive la pagina con il modello visivo di Groq (Llama 4 Scout, stessa chiave): controlli il testo e lo aggiungi o sostituisci; da lì carte `::`/`{{…}}`, Cornell, copri e ricorda, step e AI come per il testo. Su Drive, con conferma, anche il PNG della pagina accanto al .md.
- **0.30.0** (appunti fase 3): gli appunti si ripassano dal giorno dopo averli scritti; compaiono in «Studia ora» (copri e ricorda, ~4 min ciascuno) e nel riquadro «Appunti da ripassare» di Oggi. Nella vista Cornell, in fondo, le domande sbagliate nei quiz dello stesso step (e nell'editor il loro numero). «⤓ Importa» in Appunti: file .md/.txt o cartelle Drive (anche sottocartelle), titolo dalla prima riga «# …», collegamento allo step da nome file o cartella, reimport senza doppioni.
- **0.29.0** (appunti fase 2 + AI): ✨ nell'editor propone domande-flashcard dal tuo appunto (Groq), scegli quali tenere; campo «Riassunto» facoltativo (richiesta gentile una volta sugli appunti lunghi) con «✨ Riscontro AI» che dice cosa manca senza riscriverlo; «📑 Vista Cornell» (spunti / testo / riassunto) e «🧠 Copri e ricorda» con voto per sezione e ripasso FSRS; «🧠 Ripassa appunti (N)» nella scheda. La chiave Groq può essere salvata (con conferma) in «dati/chiave-ai.json» sul tuo Drive: l'app sull'icona Home, iPad e PC la recuperano da sola.
- **0.28.0** (appunti, fase 1): nuova scheda «Appunti» nella barra. Editor Markdown con barra rapida (titolo, punto, rientro, `::`, `{ }`, grassetto, anteprima) e salvataggio automatico. Le righe «domanda :: risposta» e quelle con `{{completamenti}}` diventano flashcard al salvataggio (mazzo «📝 Dagli appunti», contesto = titoli sopra la riga; una riga cancellata toglie la carta). Un titolo con il numero dello step («Chi 2.2.4 …») collega l'appunto e le sue carte allo step; nel sotto-step «📝 …» e «＋ Appunto». Copia .md in «Calendario personale/Appunti» solo dopo conferma nell'app (crea o aggiorna lo stesso file).
- **0.20.3**: le domande sbagliate dei quiz diventano flashcard da sole (mazzo «⚠️ Errori dei quiz», un sotto-mazzo per sotto-step, collegato: entrano nei ripassi, in «Studia ora» e nel piano). Fronte = domanda, retro = risposta giusta + spiegazione; l'Annulla del quiz toglie anche le carte nuove. In Studio → Errori: «🃏 Ripassa gli errori come flashcard».
- **0.20.2**: le voci del piano (in Oggi e in Studio → Piano, compresi i «secondi giri») mostrano le flashcard collegate allo step («🃏 N carte oggi»); nel sotto-step senza carte c'è «🃏 Crea flashcard per …», che crea un mazzo già collegato.
- **0.20.1**: piani nascondibili (Studio → Piano → «🙈 Nascondi» / «👁 Mostra di nuovo»): un piano nascosto resta consultabile ma non compare in Oggi, nel calendario, nei ritardi e nei ripassi. Dopo aver generato un piano, l'app propone di nascondere quelli dello stesso tipo che coprono gli stessi giorni.
- **0.20.0** (grafica «vetro leggero»): barra delle sezioni che galleggia in vetro sul telefono, fogli, dialoghi, intestazioni e avvisi traslucidi; contenuto sempre su superfici piene. Ogni materia ha colore + forma (◆ Chimica, ● Biologia, ▲ Fisica, forme automatiche per le altre). Animazioni a molla brevi (fogli, dialoghi, pagina al cambio scheda, pressione dei pulsanti), spente con «riduci movimento». Impostazioni → Aspetto → Effetto vetro per tornare alle superfici piene.
- **0.19.0** (generatore di piani): Studio → Piano → «✨ Genera un piano». Procedura in 5 passi (esame e date → argomenti dagli step o da un elenco incollato, con la debolezza di ciascuno → giorni e ore → riserve, simulazioni, ripasso finale, vigilia di riposo, secondo giro → anteprima). Materie alternate ogni giorno, prima i più deboli, primo giro distribuito sul ~65% dei giorni, secondo giro dei deboli misurati a ≥7 giorni, simulazioni nell'ultima parte seguite dalla revisione. Il piano affianca gli altri; «Rigenera con i dati di oggi» lo ricostruisce tenendo i giorni passati; «Ripianifica» funziona anche sui piani generati. Con due appelli futuri propone da solo il raffinamento tra il primo e il secondo.
- **0.18.0** (flashcard): scheda Studio → Carte. Mazzi e sotto-mazzi, carte fronte/retro (+ inversa) e completamento `{{…}}`; ripasso FSRS per carta con 4 tasti che mostrano l'intervallo, scorri destra/sinistra, modalità Gira / Scelta (4 opzioni colore+forma dallo stesso mazzo) / Scrivi; 20 nuove al giorno, mazzi alternati. Import: testo/CSV (Anki, Quizlet), Markdown (`---` tra i lati, `===` tra le carte, `domanda :: risposta`), JSON, file Drive (restano collegati: «Aggiorna da Drive») e cartelle Drive (cartella = mazzo, sottocartelle = sotto-mazzi, immagini con `![](nome.png)`). Un nome con il numero dello step («Chimica 2.2.4 …») collega il mazzo al sotto-step: compare in Oggi, «Studia ora» e nel sotto-step. Export TSV per Anki/Quizlet.
- **0.17.0** (ottimizzazioni): indice per tipo in `Stato.tutti` e indici di pacchetti/sotto-step/schede ricostruiti solo quando i dati cambiano (`Stato.ver`), formattatori di date e icone riusati, pagine memorizzate; pulizia automatica delle lapidi vecchie del registro notifiche (`Stato.pulisci`, non rientrano dalla sync). Viste 2–3 volte più veloci (Agenda 328→114 ms, Piano 189→61 ms con CPU rallentata 4x).
- **0.16.0**: errori ricorrenti domanda per domanda (`src/07-domande.ts`): l'osservatore legge anche «Da rivedere» (domanda, risposta corretta, spiegazione); record `domanda` con volte sbagliata/giusta; Studio → Errori: Ricorrenti / Aperte / Risolte con «mostra risposta» e «la sapevo / non la sapevo»; contano anche le simulazioni, non le prove a freddo.
- **0.15.0**: «Studia ora» (`src/07-domande.ts     domande sbagliate e ricorrenti (dalla sezione «Da rivedere» dei quiz)
src/07-studiaora.ts`): pulsante in cima a Oggi, scegli 25/50/90 min e l'app compone la sessione (ripassi a rischio ≤40%, prova a freddo e prioritarie dello step del giorno, errori, pause ogni ~25 min, richiamo finale), timer con la durata scelta, sessione ripresa se chiudi l'app.
- **0.14.0**: prova a freddo (`src/07-studiaora.ts   «Studia ora»: sessione composta, avanzamento, timer
src/07-freddo.ts`): per gli step non iniziati, la prima scheda prioritaria si fa prima di studiare; il risultato va in un record `pretest` (non tocca punteggi né ripassi) e quando la scheda si fa sul serio l'avviso mostra il confronto.
- **0.13.0**: chiusura serale in 2 minuti (`src/07-freddo.ts      prova a freddo (pretest) prima degli step nuovi
src/07-chiusura.ts`): dalle 19 in cima a Oggi; step fatti / da spostare a domani, ripasso serale, concentrazione 1–5, ore di sonno (record `giorno`); in Statistiche sonno e concentrazione vs punteggi.
- **0.12.0**: punti deboli (`src/07-chiusura.ts    chiusura serale della giornata, sonno/concentrazione
src/07-progressi.ts`) in Studio → Statistiche: percentuale per tipo di domanda e materia (dai quiz e dalle simulazioni letti in automatico) e i 5 sotto-step più deboli.
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
bash test/tutti.sh      # build + tutti i test (15 gruppi)
python3 test/prestazioni.py # prova di carico: ~4.600 record, tempi di disegno
node build.mjs          # compila e crea dist/ (serve solo Node + tsc, nessun npm install)
python3 test/e2e.py     # test end-to-end (Playwright per Python)
python3 test/sync.py    # test della sincronizzazione con un finto Drive
python3 test/studio.py  # test del modulo Studio
python3 test/fase4.py   # aggiunta rapida, .ics, specchio Calendar, preset
python3 test/versatile.py # corsi propri, errori, timer, statistiche, esami, trascinamento
python3 test/f1.py      # notifiche ntfy (finto server)
python3 test/f2.py      # ripassi FSRS (confronto con un'implementazione di riferimento)
python3 test/domande.py # errori ricorrenti
python3 test/studiaora.py # Studia ora
python3 test/freddo.py  # prova a freddo
python3 test/chiusura.py # chiusura serale
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

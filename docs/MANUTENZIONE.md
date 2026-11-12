# Manutenzione — guida per chi modifica l'app (anche un futuro Claude)

## In breve
- PWA personale, **zero dipendenze**: TypeScript puro compilato con `tsc`, niente npm install.
- Repo `cocco-glitch/il-mio-calendario`: codice su `main`, sito pubblicato su `gh-pages` (GitHub Pages).
- Sito: https://cocco-glitch.github.io/il-mio-calendario/
- Dati: IndexedDB sul dispositivo + `dati.json` nella cartella Drive `Calendario personale/dati/` (fonte di verità).

## Regole dell'utente (non negoziabili)
1. Niente caricato sul suo Drive e niente cestinato senza il suo **ok esplicito** (vale per chi sviluppa; l'app stessa scrive solo nella sua cartella).
2. L'app **non elimina mai** file dal Drive: al massimo li sposta in `Calendario personale/_cestino app/`.
3. Mai toccare i vecchi file Gemini su Drive. Mai modificare le mini-app quiz HTML.
4. Risposte in italiano, aggiornamenti brevi.

## Come si lavora
```
node build.mjs            # compila (tsc), rigenera i pacchetti studio, crea dist/
python3 test/e2e.py       # calendario, eventi, ricorrenze, promemoria, note, tema
python3 test/sync.py      # sync Drive (finto Drive): merge, lapidi, backup, offline
python3 test/studio.py    # modulo Studio, quiz, PDF, piani, syllabus, tabelle
python3 test/fase4.py     # aggiunta rapida, .ics, specchio Google Calendar, preset
python3 test/versatile.py # corsi propri, errori, timer, statistiche, esami, trascinamento
```
Pubblicare: copiare `dist/` (senza `anteprima.html`) nel ramo `gh-pages` e fare push. GitHub Pages a volte impiega minuti; se resta indietro, l'utente può rilanciare "pages build and deployment" da Actions.
Verifica versione online: in fondo ad Altro compare `v<VERSIONE>` (costante in `src/09-main.ts`: alzarla a ogni rilascio).

## Struttura del codice (`src/`, script globali concatenati in ordine di nome)
| File | Cosa fa |
|---|---|
| 01-util | `h()` per creare il DOM, date "a muro" (`YYYY-MM-DDTHH:mm`), markdown minimale |
| 02-db | IndexedDB → localStorage → memoria |
| 03-modello | tipi, `Stato` (salva/elimina/unisci, notifica), ricorrenze, promemoria |
| 04-componenti | foglio modale, `chiedi()` (al posto di confirm), `avviso()`, campo ricorrenza, icone |
| 05-editor | editor evento / promemoria / nota |
| 06-drive | login GIS, Drive API, sync, backup, allegati, selettore file interno `scegliFileDrive()` |
| 06-gcal | specchio su Google Calendar, import/export .ics |
| 06-notifiche | notifiche via ntfy: `calcola()` (prossime 72 h), `allinea()` (invia solo le nuove/cambiate, registro `notifica`), sostituzione silenziosa con lo stesso `sequence_id` quando un evento cambia/sparisce |
| 07-memoria | ripassi FSRS-5 per SOTTO-STEP: `passo()` (formule pubbliche, parametri predefiniti), `registra()` chiamata da `Studio.segna`, `inizializza()`, `delGiorno()` con tetto minuti, `schedaDaProporre()` a rotazione; record `memoria` id `mem-sub-<k>` |
| 07-cattura | lettura del risultato dei quiz: `inietta()` aggiunge alla copia scaricata un osservatore (MutationObserver) che legge `.score .big`, `.score .pct`, `.lvrow`, `.weak`, `.stat` e manda `postMessage`; `salva()` con Annulla. Se il motore dei quiz cambia questi selettori, aggiornare la stringa SPIA (il file su Drive non si tocca mai) |
| 07-ripianifica | step in ritardo del piano principale → giorni utili (esclusi SIM/VERIFICA/CHIUSURA/SPRINT/RIPOSO; Riserva max 2, altri max 3) con `Studio.sposta` |
| 07-simulazioni | cartella trovata con `Drive.cercaCartelle` (salvata in `imp().cartellaSimulazioni`), timer con Wake Lock, risultato via `Cattura.osserva(…, callback)`, record `simulazione` |
| 07-progressi | `puntiDeboli()` somma `Progresso.deboli` per materia e `Simulazione.deboli`; `sezioneSottostepDeboli()` (media prioritarie + ricordo FSRS) |
| 07-chiusura | riquadro serale (dalle 19), foglio di chiusura, record `giorno` (`g-YYYY-MM-DD`), `sezioneSonno()` in Statistiche (dalle 3 giornate) |
| 07-freddo | prova a freddo: `apriQuiz(…, cb)` con callback (il risultato non passa da `Studio.segna`), record `pretest` (`pre-<k>`), confronto nell'avviso di `Cattura.salva` |
| 07-studiaora | `StudiaOra.componi(minuti)` (ordine: ripassi ≤40%, freddo/prioritarie del giorno, errori, pause, richiamo), stato in localStorage `imc-studia-ora`, `Timer.avvia({durata})` |
| 07-domande | `Domande.registra(scheda, titolo, risultato)` da `Cattura.salva` e dalle simulazioni (con annulla); giuste contate solo se il quiz mostra «Da rivedere» o fa 100%; `sezioneDomande()` in Errori |
| 07-extra | corsi creati dall'utente, registro errori, timer, statistiche, esami |
| 07-rapido | aggiunta rapida in italiano (`interpreta()`) |
| 07-studio | pacchetti studio, progressi, piani, syllabus, quiz in iframe, PDF (pdf.js + cache) |
| 07-tabelle | tabelle personalizzate, CSV, Google Sheet |
| 08-viste | schermate (Oggi, Calendario, Promemoria, Note, Cerca, Altro) |
| 09-main | avvio, `disegna()`, `applicaTema()`, avvisi in-app, service worker |

Principi: `disegna()` ricostruisce la schermata a ogni modifica (semplice e sufficiente); `Stato.salva(r, true)` salva senza ridisegnare. Ogni salvataggio programma la sync Drive e lo specchio Calendar.

**Cache (v0.17):** le letture costose (`Stato.tutti`, pacchetti, indici di sotto-step e schede, pagine, icone, formati di data) sono memorizzate e si invalidano da sole con `Stato.ver`, che cambia a ogni `salva`/`unisci`. Non modificare `rec` senza passare da `Stato.salva`/`unisci`, altrimenti le cache restano vecchie. Le lapidi del registro notifiche si rimuovono dopo 7 giorni (`Stato.pulisci`).

## Dati e sincronizzazione
- Tutto è un **record** `{ id, type, updatedAt, deleted? }`. Tipi: `evento`, `task`, `nota`, `categoria`, `impostazioni`, `preset`, `pacchetto`, `progresso`, `spostamento`, `tabella`, `materia`, `sessione`, `esame`, `notifica` (registro ntfy), `memoria` (ripassi), `simulazione`, `giorno` (chiusura serale), `pretest`, `domanda`.
- Eliminare = `deleted: true` (lapide). Unione = per record, vince `updatedAt` più alto.
- Backup giornaliero `backup/dati-YYYY-MM-DD.json`, ultimi 30 (i vecchi in `_cestino app`).
- Google: Client ID, chiave API (non più usata: niente Picker) e account ammesso in cima a `06-drive.ts`. Scope: `drive.file`, `drive.readonly`, e `calendar.app.created` solo con lo specchio attivo. Progetto Google Cloud in modalità Testing, unico utente di test = l'utente.

## Aggiungere un nuovo step di studio (lavoro ricorrente)
1. Leggere la "Scheda di studio - Step N" (PDF) e il file delle schede da fare/ridondanti in `materiale studio`.
2. Scrivere `studio/sorgenti/step-N.txt` come `step-2.txt`: una riga `@` per sotto-step, una riga `=` con i numeri attesi (schede P, schede R, pagine P, pagine R, pagine totali), una riga per scheda (`P|R microstep k/n | titolo | pagine | slide`). I titoli devono coincidere con i nomi dei file quiz (`<microstep> <titolo> (scheda k di n).html`).
3. `node studio/genera.mjs`: deve stampare `ok` per ogni sotto-step. Poi build, test, pubblicare. In alternativa caricare il JSON in `Calendario personale/studio/` (solo con l'ok dell'utente): l'app lo legge con "Aggiorna pacchetti da Drive".
4. Gli `id` delle schede (`<materia>-<microstep>-<k>`) non vanno mai cambiati: i progressi dell'utente sono legati a quelli.
5. Piani e syllabus: si aggiornano in `studio/genera.mjs` (sezioni piano, COP, RAF). Formato completo in `docs/formato-studio.md`.

## Cose note / possibili sviluppi
- Notifiche: in-app + **ntfy** (v0.7, Altro → Notifiche sul telefono) + specchio Google Calendar. Limite ntfy.sh: programmazione max 3 giorni avanti e niente annullamento sul server (si sostituisce in silenzio dopo il vecchio orario). Web Push con Cloudflare Worker: dopo l'esame (piano F1 Livello B).
- Piano di aggiornamento v1.0: `docs/aggiornamento/` (leggere `00-INDICE.md`); decisioni in `docs/DECISIONI.md`.
- PIN locale opzionale non fatto (i dati sono comunque solo sul dispositivo dell'utente e sul suo Drive).

## Evoluzione
Il piano per rendere l'app adatta a qualsiasi studio è in `docs/PROGRESSIONE.md`: leggerlo prima di aggiungere funzioni.


**Flashcard (v0.18, `07-carte.ts`):** record `mazzo` e `carta`; l'id della carta è `cr-<hash(mazzo + fronte normalizzato)>`, così reimportare lo stesso file aggiorna invece di duplicare e i ripassi (`memoria` con id `mem-cr-<id>` e `-r` per l'inversa, `er` = `carta:…`) restano. Il motore è lo stesso dei sotto-step (`Ripassi.passo/intervallo/ritenzione`). Collegamento allo step: `Carte.collega(nome)` cerca «N.N» o «N.N.N» nel nome (e la materia nel percorso), solo se il risultato è unico; i sotto-mazzi lo ereditano. Impostazioni facoltative: `carteNuove` (20), `carteRipassi` (150), `modoCarte`. Le immagini Drive si scaricano al bisogno (`caricaImmagini`) e restano in memoria come objectURL. Test: `test/carte.py`.

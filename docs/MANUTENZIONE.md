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
| 07-extra | corsi creati dall'utente, registro errori, timer, statistiche, esami |
| 07-rapido | aggiunta rapida in italiano (`interpreta()`) |
| 07-studio | pacchetti studio, progressi, piani, syllabus, quiz in iframe, PDF (pdf.js + cache) |
| 07-tabelle | tabelle personalizzate, CSV, Google Sheet |
| 08-viste | schermate (Oggi, Calendario, Promemoria, Note, Cerca, Altro) |
| 09-main | avvio, `disegna()`, `applicaTema()`, avvisi in-app, service worker |

Principi: `disegna()` ricostruisce la schermata a ogni modifica (semplice e sufficiente); `Stato.salva(r, true)` salva senza ridisegnare. Ogni salvataggio programma la sync Drive e lo specchio Calendar.

## Dati e sincronizzazione
- Tutto è un **record** `{ id, type, updatedAt, deleted? }`. Tipi: `evento`, `task`, `nota`, `categoria`, `impostazioni`, `preset`, `pacchetto`, `progresso`, `spostamento`, `tabella`, `materia`, `sessione`, `esame`.
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
- Notifiche: in-app (ad app aperta) + specchio Google Calendar. Web Push (Livello 3) non fatto: richiede un Cloudflare Worker ed è meno affidabile su iOS.
- PIN locale opzionale non fatto (i dati sono comunque solo sul dispositivo dell'utente e sul suo Drive).

## Evoluzione
Il piano per rendere l'app adatta a qualsiasi studio è in `docs/PROGRESSIONE.md`: leggerlo prima di aggiungere funzioni.

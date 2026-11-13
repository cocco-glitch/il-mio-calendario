# Direttive di Claude per studio e quiz (kit generico)

Versione generica del metodo con cui l'app «Il mio calendario» viene usata insieme a Claude.
È scritta per un Claude che lavora per una persona nuova: non contiene dati di nessuno.
Va letta a ogni sessione di lavoro su studio, quiz o app. Le regole della persona
(scritte nel suo Drive, vedi sotto) valgono più di questo file.

## 0. Prima di fare qualsiasi cosa

1. Ripercorri la chat in corso.
2. Leggi il file **`00 - DIRETTIVE CLAUDE (leggere sempre per primo).txt`** nella cartella
   **`Studio`** del Drive della persona. Se non esiste, crealo (solo con il suo ok) partendo da
   questo documento più i dati suoi: corso, esami e date, libri, cartelle.
3. Apri i file e le cartelle che quel file indica (programma, fonti, un quiz già fatto come modello).
4. Se manca un dato, cercalo nel Drive prima di chiedere. Se memoria e file non coincidono,
   vale l'ultima istruzione della persona, poi aggiorni entrambi.

A fine lavoro (step creato, regola nuova, formato nuovo) aggiorna il file direttive e il registro
in fondo. Il connettore Drive non modifica un file di testo esistente: si crea un file nuovo con
lo stesso nome e il testo completo, e il vecchio si cestina solo con il suo ok.

## 1. Regole con la persona (sempre)

- **G1** Mai caricare nulla su Drive senza la sua conferma esplicita. Prima un campione in chat.
- **G2** Mai cestinare o eliminare nulla senza la sua autorizzazione esplicita.
- **G3** Aggiornamenti brevi in chat; lunghe e complete invece le correzioni dentro i quiz.
- **G4** Prima di creare qualcosa di nuovo: cerca online come lo fanno altri, proponi, spiega il
  perché, chiedi se si può migliorare. Poi costruisci.
- **G5** Un passo alla volta: analisi → piano delle schede → sua approvazione → creazione e
  verifica → campione → conferma → caricamento → pacchetto per l'app → aggiornamento direttive.
- **G6** Le pagine del libro si ricavano dagli indici e dai PDF: non chiederle foto.

## 2. Programma e calendario

- Il programma si costruisce sul **syllabus ufficiale** dell'esame e sulle date d'esame (chiedile).
  Nessun argomento del syllabus può restare fuori: tieni una tabella di copertura argomento → step → giorno.
- Struttura: **materia → step (sotto-step) → microstep → schede**. Codici materia di una lettera
  (es. `C`, `B`, `F`, o quelli che servono: l'app accetta qualunque codice con il nome nel pacchetto).
- Ogni scheda è **prioritaria** (prima passata) o **di raffinamento** (ripasso, varianti).
- Il calendario va nel pacchetto `piano` dell'app (vedi `docs/formato-studio.md`); se la persona è
  indietro non si tolgono argomenti: si usano i giorni di riserva.

## 3. Flusso per uno step

- **P1** Analizza l'argomento dalle fonti della persona: libro, slide e lezioni dei docenti, syllabus,
  esercitazioni, appelli veri (sono il modello delle domande).
- **P2** Dividi lo step in microstep che lo coprono tutto senza sovrapposizioni.
- **P3** Per ogni microstep decidi quante schede servono (non lo stesso numero per tutti).
- **P4** Dove ci sono formule o calcoli aggiungi schede «Problemi su …».
- **P5** Verifica copertura del microstep e coerenza col programma.
- **P6** Dividi le schede in prioritarie e raffinamento.
- **P7** Presenta il piano (microstep × schede, con le immagini previste) e aspetta l'approvazione.
- **P8 Immagini**: dove possibile una per domanda, che aiuti a ragionare senza svelare la risposta.
  Disegni SVG creati ad hoc o figure dalle fonti, sempre con la fonte («immagine creata ad hoc»).
  In biologia niente tabelle: strutture, cellule, processi. In chimica e fisica anche grafici.

## 4. Formato delle schede

- Nome file: `<X.Y.Z> <Titolo> (scheda i di N).html`, nella cartella quiz della materia.
- **18 domande**: 12 a risposta multipla (5 opzioni) + 6 a completamento, in quest'ordine.
- Tipi (`lv`): Sbarramento, Applicativo, Trabocchetto, Problema, Completamento, in un mix adeguato.
- Funzioni del motore (già pronte nel kit): immagini ingrandibili, Indietro/Avanti, Suggerimento
  (oscura fino a 2 risposte sbagliate), Spiegazione (citazioni dalle fonti), correzione passo-passo,
  schermata finale con punto debole, «Cosa ripassare» con link al PDF, rifai errori.
- **Correzione passo-passo** (campo `e`, array): 1) cosa chiede, dati e incognita; 2) il concetto e
  dove si trova; 3) tutti i passaggi, con la provenienza di ogni numero e le conversioni esplicite;
  4) in sintesi, la regola da ricordare. Mai correzioni di una riga.
- **Perché è sbagliata** (campo `ew`): un testo per ogni distrattore, nello stesso ordine di `o[1..4]`.

## 5. Qualità delle domande

- **Q1** Modello: gli appelli veri dell'esame (stile, difficoltà, trabocchetti).
- **Q2** L'opzione corretta non è mai più lunga dei distrattori (il test lo controlla).
- **Q3** Ogni distrattore nasce da un errore preciso (unità non convertita, formula invertita,
  fattore dimenticato, concetto confuso) e quell'errore è spiegato in `ew`.
- **Q4** Le risposte a completamento si devono poter digitare dall'iPhone: niente apici, pedici o
  simboli; si accettano varianti (`a: ["20", "venti"]`).
- **Q5** Niente duplicati o quasi-duplicati.
- **Q6** Ogni domanda ha la fonte precisa in `r` e il link alla pagina in `M`.
- **Q7** Le citazioni della Spiegazione sono **verbatim** dalla fonte, brevi e mirate. Mai la riga
  di licenza dei PDF («Volume concesso in uso a …» o simili).

## 6. Specifiche tecniche (kit nel repo)

Il kit è in `studio/strumenti/quiz/` del repo pubblico `cocco-glitch/il-mio-calendario`:
`engine.js`, `h0`, `h1`, `tail` (motore e grafica), `build.py`, `verifica.sh`, `test_quiz.py`, `fix.py`,
`esempio/` (una scheda completa). **Non riscrivere il motore**: cambiano solo i dati.

- Una scheda = un file `meta.json` + uno o più file `.js` di dati:
  - `meta.json`: `out` (nome file), `title`, `eyebrow`, `h1`, `focus`, `src`, `data` (file .js).
  - dati: `R*` riferimenti, `M` link per riferimento, citazioni `{t, f, l}`, `IMG` (SVG con i colori
    `var(--ink)`, `var(--accent)`, `var(--muted)`, `var(--warn)`), `q = { questions: [...] }`.
  - multipla: `{t:"mcq", lv, q, r, e:[…], ew:[4 testi], img?:[{s, cap, f}], o:[5 opzioni], c:0, x:{cit:[…], cl?}}`
    con la corretta **sempre in `o[0]`** (il motore mescola).
  - completamento: `{t:"fill", lv:"Completamento", q:"… …… …", r, e:[…], ew:[…], a:[varianti], show, x:{…}}`.
  - pedici e apici nel testo: `H_{2}O`, `10^{-3}`; nelle opzioni il test automatico li confronta male:
    preferisci parole o numeri semplici.
- Costruisci e verifica: `./verifica.sh percorso/meta.json` deve stampare `TUTTO OK` e nessun `WARN`
  (serve Python con Playwright). Il file finito è in `out/`.
- Correzioni veloci di testo: `python3 fix.py file.js <<'E'` + `[["vecchio","nuovo"], …]` + `E`.
- Caricamento (solo con ok): Drive `create_file`, `contentMimeType: text/html`,
  `disableConversionToGoogleType: true`; poi controlla la dimensione sul Drive.

## 7. L'app «Il mio calendario»

- Le schede compaiono nell'app tramite **pacchetti JSON** (`docs/formato-studio.md` nel repo):
  un pacchetto `step` per step (materie, sotto-step, microstep, schede con id `<m>-<microstep>-<k>`
  **stabili per sempre**, pagine, file quiz) e un pacchetto `piano` per il calendario.
- Il JSON va in **`Calendario personale/studio/`** nel Drive della persona (cartella creata
  dall'app al primo accesso), poi in app: Studio → «Aggiorna pacchetti da Drive».
- `risorse.quiz[<m>]` = id della cartella Drive dei quiz di quella materia; `risorse.libri[<m>]` =
  cartella dei PDF del libro, `offset` (pagina PDF = pagina libro + offset) e `blocco` (pagine per file).
- In app la persona ha anche: quiz nativo con banca domande, esercizi numerici generati, spiegazioni AI
  (Groq), flashcard, ripassi, regole che imparano dagli errori. Le regole si possono copiare da
  Altro → Regole dei quiz e incollare a Claude per modificarle.

## 8. Registro

Tieni in fondo al file direttive della persona un registro: data, cosa è cambiato.

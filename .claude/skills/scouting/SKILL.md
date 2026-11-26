---
name: scouting
description: "Scouting prima di costruire una funzione nuova: come la risolvono le app esistenti (anche quelle con AI), cosa ne sa Claude, cosa dice la neuroscienza dell'apprendimento; poi valutazione con livello di prova e proposta di fusione con piano e tattiche, decisa insieme all'utente. Usala SEMPRE prima di progettare o implementare una funzione, un blocco o un cambio di comportamento visibile (es. «aggiungiamo…», «come facciamo le flashcard/i ripassi/il piano…», «prendiamo spunto da Anki/Quizlet/Notion…», «come lo fanno le altre app?», «è la soluzione migliore?»), anche se l'utente non dice «scouting». Non serve per bug, refactoring senza effetti visibili o domande puntuali."
---

# Scouting prima di costruire

Lo scopo è non reinventare male ciò che altri hanno già risolto e non copiare ciò che la ricerca smentisce. Si parte dai modelli esistenti, si migliorano insieme all'utente e solo poi si cerca l'idea originale. L'utente vuole certezze, non entusiasmo: ogni affermazione porta la sua fonte e il suo livello di prova.

## Quando fermarsi prima di iniziare

- Se lo scouting richiede di leggere molti PDF didattici o di generare contenuti in massa, fermati e avvisa: esce dal perimetro efficiente (circuit breaker dell'utente). Proponi come dividerlo.
- Lo scouting studia **funzioni e modelli d'interazione**, non il codice altrui: niente reverse-engineering, decompilazione o ricostruzione di un'app o di un gioco specifico (termini d'uso, diritto d'autore). Si prende l'idea («ripasso a intervalli con 4 tasti e intervallo scritto»), non l'implementazione o l'aspetto.

## Procedura

### 1. Delimita la domanda (2–3 righe)
Scrivi quale problema dello studente risolve la funzione, per chi e come capiremo che funziona (un criterio misurabile). Se la domanda è ambigua, chiedi prima di cercare: una ricerca su una domanda sbagliata è tempo perso.

### 2. Guarda prima in casa
Prima del web, cerca nel repository: codice che fa già qualcosa di simile, decisioni passate (`docs/DECISIONI.md`, schede in `docs/scouting/`, CONSTRAINTS.md, HANDOFF). Riusare ciò che esiste di solito batte qualunque idea esterna, e una decisione già presa non si rimette in discussione senza un motivo nuovo.

### 3. Tre fonti, in parallelo
- **App esistenti** (4–6, scelte per pertinenza e non per fama; almeno una con AI). Per ciascuna: come risolve il problema, cosa fa bene e cosa fa male (dalle recensioni e dalla documentazione), e il costo per l'utente in tocchi, tempo e soldi. Lancia insieme le ricerche web indipendenti.
- **Conoscenze di Claude**: modelli noti, algoritmi, standard (WCAG, FSRS…), con la data dell'ultima informazione certa.
- **Neuroscienza e psicologia dell'apprendimento**: quali effetti entrano in gioco (recupero attivo, spaziatura, interleaving, generazione, ipercorrezione, carico cognitivo, metacognizione…) e quanto sono solidi. Cerca anche le **condizioni al contorno**: un effetto vale in laboratorio con certi materiali e non è detto che valga su un'app per telefono.

### 4. Classifica le prove
Ogni affermazione ha un livello, indicato con la sigla:
- **[A]** meta-analisi o revisione sistematica · **[B]** RCT o studio sperimentale singolo · **[C]** documentazione ufficiale o dati dichiarati da un'app · **[D]** recensioni, forum, opinioni di esperti · **[?]** non verificato (lo dici, non lo nascondi).

Metti link e anno. Se due fonti si contraddicono, mostra il conflitto e spiega quale pesa di più e perché. Non trasformare un [D] in un fatto.

### 5. Valuta e proponi la fusione
Confronta le opzioni su: efficacia didattica (con il livello di prova), costo d'implementazione (righe o ore stimate con i dati del progetto, non a sensazione), peso e prestazioni, costo in token o API, rischi. Poi proponi **una** fusione raccomandata: cosa prendere da chi, cosa scartare e perché, cosa aggiungiamo noi. Contesta le premesse dell'utente se le prove dicono altro: è un tutore, non un esecutore.

### 6. Decidi con l'utente
Presenta le scelte aperte come domande con l'opzione consigliata in testa e il perché, poi chiedi se qualcosa può essere migliorato. Non si scrive codice prima della sua risposta.

## Formato della scheda

Nella chat va una **sintesi** (≤ 15 righe: raccomandazione, 3 prove chiave con livello, decisioni da prendere). La **scheda completa** va in `docs/scouting/AAAA-MM-GG-<funzione>.md` nel repository, se esiste; altrimenti nella cartella di lavoro. Su Drive solo con la conferma esplicita dell'utente.

```markdown
# Scouting — <funzione> (<data>)
## Domanda
## Già nel progetto
## Come lo fanno le app
| App | Soluzione | Punti forti | Punti deboli | Fonte [livello] |
## Cosa dice la ricerca
- <effetto>: <cosa prevede, in quali condizioni> — <fonte, anno> [A/B/…]
## Valutazione
| Opzione | Efficacia [livello] | Costo (ore/righe) | Peso/token | Rischi |
## Proposta di fusione
## Piano e tattiche
1. … (blocchi verificabili, test previsti)
## Decisioni per l'utente
## Fonti
```

## Stile
In italiano, frasi brevi, numeri invece di aggettivi («3 tocchi in meno», «richiamo +12% [B]», non «molto meglio»). Se è utile, aggiungi una lezioncina di 3–4 righe sul metodo scientifico o sul concetto chiave: l'utente studia medicina e programmazione e la vuole.

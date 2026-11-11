# 01 — Ricerca: le migliori app di flashcard, quiz, calendari e i sistemi di studio
Per ogni app: **cosa fa bene** (sistema/funzioni), **layout**, **colori**, **animazioni/interazioni**, **tattica psicologica**, e **cosa prendiamo** (→). Prezzi e versioni cambiano: qui conta il *design*, non la scelta di un'app.

---
## A. Flashcard e ripetizione spaziata

### Anki (riferimento scientifico)
- **Sistema**: dal 2023 usa **FSRS** (Free Spaced Repetition Scheduler): un modello di memoria con tre variabili (difficoltà, stabilità, recuperabilità) i cui parametri si adattano alla *tua* storia di ripassi. È il predefinito sui nuovi profili da Anki 23.12. Con FSRS servono meno ripassi per la stessa ritenzione rispetto al vecchio SM-2 e gestisce meglio le pause lunghe. FSRS-6 (fine 2025) è stato addestrato su circa 700 milioni di ripassi. Ritenzione desiderata consigliata: **0,85–0,90**.
- **Interazione**: carta → "Mostra risposta" → 4 tasti (Di nuovo / Difficile / Bene / Facile) con l'intervallo previsto scritto sopra ogni tasto. Le carte che sbagli sempre diventano "sanguisughe" (leech) e vengono sospese: il problema è la carta, non la memoria.
- **Layout**: spoglio, una carta al centro, contatori nuove/in apprendimento/da ripassare in tre colori (blu/rosso/verde).
- **Debolezze**: interfaccia ostica, nessuna motivazione, statistiche difficili da leggere.
- → **Prendiamo**: FSRS (algoritmo pubblico e libero), i 4 tasti con l'intervallo mostrato, la ritenzione desiderata regolabile, la gestione "sanguisughe" (= scheda/carta da riscrivere o da spezzare), la tolleranza ai ritardi.

### RemNote
- **Sistema**: appunti e flashcard nello stesso posto: scrivi `concetto :: definizione` o `>>` dentro una nota e diventa carta. PDF annotati → carte. FSRS.
- **Layout**: albero di documenti a sinistra, editor al centro, coda di ripasso sempre raggiungibile.
- → **Prendiamo**: "carta nata dagli appunti": nelle note dell'app una sintassi `domanda :: risposta` crea flashcard collegate alla nota e alla scheda di studio. Carta dalla pagina del PDF (selezioni una riga → carta con riferimento a pagina).

### Mochi
- **Sistema**: carte in Markdown, carte collegate tra loro, funziona offline.
- **Layout/colori**: minimal, molto bianco, un colore d'accento, tipografia curata.
- → **Prendiamo**: Markdown nelle carte (l'app ha già un markdown minimale), collegamenti tra carte e schede.

### Quizlet
- **Sistema**: molte modalità sullo stesso set: Flashcard, **Learn** (adattivo: prima scelta multipla, poi risposta scritta), **Test** (simulazione), **Match** (gioco a tempo: abbini termine e definizione).
- **Colori/animazioni**: blu e giallo vivaci, carta che si gira in 3D, coriandoli e suoni a fine set.
- **Tattica**: progressione di difficoltà (riconoscere → ricordare), varietà per non annoiarsi.
- → **Prendiamo**: la **scala di difficoltà** (scelta multipla → completamento → risposta libera) sullo stesso contenuto; la carta che si gira; una modalità "Abbina" veloce per formule/definizioni.

### Brainscape
- **Sistema**: **Confidence-Based Repetition**: dopo ogni carta voti la tua sicurezza da 1 a 5; l'intervallo dipende dalla sicurezza.
- → **Prendiamo**: la **valutazione di sicurezza prima di vedere la risposta** (serve alla metacognizione e all'effetto ipercorrezione, file 02).

### SuperMemo
- **Sistema**: inventore della ripetizione spaziata (SM-2, 1987); **lettura incrementale** (leggi pezzi di un testo nel tempo, estrai frasi, le trasformi in carte). SM-20 annunciato nel 2026.
- → **Prendiamo**: l'idea della lettura incrementale applicata alle **pagine del libro**: le pagine lette entrano in una coda e tornano a intervalli come "rileggi e riassumi a memoria" (non rilettura passiva).

---
## B. Quiz e apprendimento a gioco

### Duolingo
- **Sistema**: lezioni brevissime, percorso a mappa, **serie di giorni** (streak), "congelamento della serie", punti (XP), leghe settimanali, cuori (errori limitati), mascotte, notifiche con tono personale.
- **Animazioni**: risposta giusta = suono + barra che avanza + piccola esplosione; fine lezione = schermata celebrativa; feedback immediato colorato (verde/rosso) dal basso.
- **Dati noti**: chi arriva a 7 giorni di serie torna ogni giorno molto più spesso. Ma la serie spinge a fare la lezione più facile pur di non perderla: **ottimizza la presenza, non l'apprendimento**. Le reti di sicurezza (congelamento, recupero) evitano il risentimento quando la serie si rompe.
- → **Prendiamo**: feedback immediato colorato con barra di avanzamento; serie **gentile** con congelamenti gratuiti e "giorni di riposo" programmati; celebrazioni brevi. **Non prendiamo**: leghe/competizione, cuori, punti che premiano la quantità.

### Kahoot
- **Interazione**: 4 risposte = 4 **forme e colori fissi** (rosso triangolo, blu rombo, giallo cerchio, verde quadrato), timer visibile, musica che sale, podio finale.
- → **Prendiamo**: codifica doppia **colore + forma** per le opzioni (più veloce da scegliere, accessibile anche a chi non distingue i colori); timer facoltativo per simulare la pressione d'esame.

### Brilliant / Khan Academy
- **Brilliant**: problemi interattivi, un passo alla volta, spiegazioni visive, "prova prima, poi spiego".
- **Khan Academy**: livelli di padronanza per abilità (Tentato → Familiare → Competente → Padroneggiato), che possono anche **scendere** se non ripassi.
- → **Prendiamo**: **padronanza per microstep** che cresce e decade (calcolata da FSRS), e la "prova prima, poi spiego" (effetto pretest).

### Le mini-app quiz dell'utente (già esistenti, da non toccare)
- Tasti Indietro/Avanti, Suggerimento (oscura fino a 2 opzioni sbagliate), Spiegazione citata dalle fonti, correzione passo passo, "Cosa ripassare" con pagine e link al PDF, "rifai solo gli errori", tipo di domanda debole (sbarramento, trabocchetto, completamento).
- → **Prendiamo**: sono già un ottimo modello. L'app deve **leggere** il risultato (punteggio, tipi di domanda sbagliati) invece di farlo ricopiare a mano (F3).

---
## C. Calendari e pianificatori

### Structured
- **Layout**: **linea del tempo verticale** del giorno: ogni attività è una "pillola" colorata con icona, la durata è l'altezza; tra due attività compare il tempo libero ("hai 45 min liberi"). Inbox di cose senza orario da trascinare nella giornata. Indicatore di energia.
- → **Prendiamo**: vista **"Il mio giorno" a timeline** con icone per materia, spazi vuoti espliciti, trascinamento dall'Inbox; ripassi FSRS come pillole che "galleggiano" negli spazi.

### Fantastical
- **Sistema**: inserimento in **linguaggio naturale** con anteprima in tempo reale mentre scrivi ("Chimica 3.1 domani 15-17" → si colora data, ora, titolo); "DayTicker" (lista scorrevole con mini mese sopra).
- → **Prendiamo**: l'app ha già l'aggiunta rapida: aggiungere **evidenziazione dal vivo** di cosa ha capito e suggerimenti (materie, step) mentre scrivi.

### Notion Calendar / Google Calendar
- **Notion Calendar**: eventi collegati a documenti, scorciatoie da tastiera, gratuito.
- **Google Calendar**: colori per calendario, semplicità; è il "motore notifiche" più affidabile su iPhone.
- → **Prendiamo**: ogni evento di studio collegato ai suoi materiali (già fatto); scorciatoie da tastiera su PC (`n` nuovo, `t` oggi, `/` cerca, `s` studia ora).

### Sunsama
- **Sistema**: **rituale di pianificazione mattutino** guidato (cosa farai oggi? quanto tempo? → avviso se il carico supera le ore disponibili) e **rituale di chiusura serale** (cosa hai fatto, cosa sposti).
- → **Prendiamo**: rituale mattino (2 minuti) e sera (2 minuti), con **avviso di sovraccarico**. La sera aggiunge il "ripasso prima di dormire" (file 02, sonno).

### Amie / Things 3
- **Amie**: calendario "gioioso": emoji, colori pastello, animazioni morbide, task trascinati nel calendario.
- **Things 3**: il riferimento per le **micro-animazioni**: spunta che si disegna, elementi che scivolano via, pulsante "+" trascinabile nel punto dove inserire, sezione "Questa sera".
- → **Prendiamo**: qualità delle animazioni (file 07), spunta disegnata, "Questa sera" per i ripassi serali.

### Motion / Reclaim (pianificazione automatica)
- **Sistema**: dai i compiti con durata e scadenza, l'app li incastra da sola nei buchi del calendario e ripianifica se qualcosa slitta; difende i blocchi di concentrazione.
- → **Prendiamo**: il **pianificatore adattivo** (F5): incastra step e ripassi negli spazi liberi e ripianifica in avanti quando resti indietro, senza toccare i progressi.

### TickTick
- **Sistema**: tutto in uno: task, calendario, **Pomodoro**, **tracciamento abitudini**, **matrice di Eisenhower** (urgente/importante).
- → **Prendiamo**: abitudini di salute dello studio (sonno, movimento, pause) come tracciatore semplice; matrice urgente/importante per i promemoria.

### Lifestack e simili (energia)
- **Sistema**: pianifica secondo i livelli di energia della giornata.
- → **Prendiamo**: "fasce di energia" impostate dall'utente (es. mattina = alta) → il pianificatore mette il nuovo/difficile nelle fasce alte e il ripasso leggero nelle basse.

---
## D. Sistemi di studio (metodi) — valutati con le prove del file 02
| Metodo | Cos'è | Prove | Nell'app |
|---|---|---|---|
| **Richiamo attivo** (active recall) | tirare fuori dalla memoria invece di rileggere | alte | ovunque: quiz, carte, "blurting" |
| **Ripetizione spaziata** | ripassi a intervalli crescenti | alte | motore FSRS (F2) |
| **Alternanza** (interleaving) | mescolare argomenti/tipi di problema | medio-alte | sessioni miste (F4) |
| **Leitner** | scatole: giusta → scatola successiva, sbagliata → prima scatola | buone (versione semplice dello spaziato) | registro errori a scatole |
| **Metodo 2-3-5-7** (versione popolare) | ripassi fissi a 2, 3, 5, 7 giorni | ragionevole, meno preciso di FSRS | modalità semplice per chi non vuole FSRS |
| **Blurting** | scrivi tutto ciò che ricordi su un argomento, poi confronta | buone (è richiamo libero) | schermata "Scrivi a memoria" (F4) |
| **Tecnica di Feynman** | spiega con parole semplici, trova i buchi | buone (auto-spiegazione) | prompt "Spiegalo a un dodicenne" |
| **Cornell** | appunti con colonna domande + riassunto | discrete (genera domande) | modello di nota con colonna domande → carte |
| **SQ3R/PQ4R** | scorri, domande, leggi, ripeti, ripassa | discrete | flusso "prima di leggere": domande-pretest |
| **Pomodoro** (25/5) / 52-17 / Flowtime | blocchi di concentrazione con pause | buone per l'attenzione | timer già presente → modalità flessibili |
| **Mappe concettuali** | collegare concetti | discrete se *generate* da te | futuro (09) |
| **Evidenziare, rileggere, riassumere** | — | **basse** | l'app non le premia mai |
| **Time-blocking / Eat the frog / Eisenhower / Revisione settimanale (GTD)** | organizzazione del tempo | buone per l'esecuzione | blocchi, "rana" del giorno, revisione domenicale |

---
## E. Le 12 idee più forti da fondere (vanno nel file 03)
1. FSRS come motore unico per *tutto* ciò che va ricordato (schede, carte, errori, pagine).
2. Valutazione di sicurezza prima della risposta (Brainscape) + 4 tasti con intervallo (Anki).
3. Scala di difficoltà sullo stesso contenuto (Quizlet Learn).
4. Padronanza per microstep che sale e scende (Khan).
5. Timeline del giorno con spazi liberi e pillole (Structured).
6. Rituale mattina/sera con avviso di sovraccarico (Sunsama).
7. Pianificazione automatica e ripianificazione in avanti (Motion/Reclaim).
8. Fasce di energia (Lifestack).
9. Feedback immediato + celebrazioni brevi + serie gentile con congelamenti (Duolingo, versione sana).
10. Colore + forma per le opzioni (Kahoot).
11. Carte nate dagli appunti e dal PDF (RemNote).
12. Micro-animazioni di qualità (Things 3).

## Fonti principali
- FSRS e Anki: faqs.ankiweb.net/what-spaced-repetition-algorithm · github.com/open-spaced-repetition · migaku.com (guida 2026)
- Confronti app: remnote.com/blog · studycardsai.com · dupple.com/learn/best-calendar-apps · toolradar.com/blog/best-daily-planner-apps · lifestack.ai/blog
- Duolingo: Lenny's Podcast con Jackson Shuttleworth (retention) · dev.to "Why Duolingo's gamification works (and when it doesn't)"

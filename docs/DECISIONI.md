# Registro delle decisioni
Una riga per scelta importante: data · decisione · motivo.

- 2026-11-11 · Piano di aggiornamento v1.0 in `docs/aggiornamento/` (anche su Drive: Calendario personale/Piano aggiornamento v1.0) · ricerca su app di studio e neuroscienze.
- 2026-11-11 · Prima dell'esame solo F0, F1, F2 e F3 ridotta (cattura punteggio quiz); il resto dal 10/12 · non togliere tempo allo studio.
- 2026-11-11 · Notifiche con ntfy (Livello A) ora, Web Push dopo · funziona in una sessione, costo zero.
- 2026-11-11 · Ripassi automatici con tetto di 30 min/giorno, più a rischio per primi · le giornate hanno già 2 step.
- 2026-11-11 · F0 minima: solo tipi `memoria`/`notifica` e impostazioni; design system dopo l'esame · non toccare l'aspetto usato ogni giorno.
- 2026-11-11 · Notifiche: studio del giorno 08:00, ripasso serale 21:30, silenzio 23:00–07:30 (slittano alle 7:30), categorie private con testo generico · scelte dell'utente.
- 2026-11-11 · ntfy: invio con `mode: 'no-cors'` (parte anche senza intestazioni CORS) e registro sincronizzato per evitare doppioni tra telefono e PC · robustezza.
- 2026-11-11 · Ripassi per SOTTO-STEP, non per scheda · per scheda ~150 h prima dell'esame (coda infinita), per sotto-step ~20 h; si propone una scheda prioritaria a rotazione, la più debole.
- 2026-11-11 · Data di apprendimento = giorno del piano se precedente all'ultima spunta · le 89 schede erano state segnate tutte l'11/11 ma fatte prima; i progressi dell'utente NON vengono modificati.
- 2026-11-11 · Ripasso aperto senza punteggio non conta; correzione nello stesso giorno ricalcola dallo stato precedente.
- 2026-11-11 · F3 ridotta: risultato dei quiz salvato in automatico con «tocca per annullare» (8 s) · scelta dell'utente.
- 2026-11-11 · «Rifai solo gli errori» non cambia il punteggio, va in nota; si salvano i tipi di domanda (`deboli`) per le statistiche future · scelta dell'utente.
- 2026-11-11 · Ripianificazione: due modi (giorni leggeri / prima possibile) con anteprima; solo piano principale · scelta tra recupero rapido e giornate sostenibili lasciata all'utente.
- 2026-11-11 · Simulazioni: risultato in un record `simulazione` separato (non tocca le schede di step); tempo scaduto = solo avviso, non chiude il quiz · come all'esame decide lo studente quando consegnare, ma il tempo effettivo viene registrato.
- 2026-11-11 · Chiusura serale: un solo rituale la sera (sonno della notte prima chiesto qui, non al mattino) · un tocco in meno al giorno.
- 2026-11-11 · Prova a freddo sulla prima scheda prioritaria dello step, risultato separato · effetto pretest (file 02 §4); non sporca punteggi e ripassi.
- 2026-11-11 · «Studia ora»: ripassi al massimo ~40% della sessione, poi il nuovo · il nuovo resta la priorità prima dell'esame, il richiamo apre la sessione (memoria «tiepida»).
- 2026-11-11 · Errori ricorrenti a livello di domanda, letti dalla sezione «Da rivedere» dei quiz (i file non cambiano); ricorrente = sbagliata ≥2 volte e ancora aperta · ripasso mirato prima delle simulazioni.
- 2026-11-11 · Ottimizzazioni con cache invalidate da `Stato.ver` invece di aggiornamenti parziali del DOM · massimo guadagno con minimo rischio, `disegna()` resta semplice.
- 2026-11-11 · Lapidi del registro notifiche rimosse dopo 7 giorni (anche quelle in arrivo dalla sync) · il registro è di servizio; i dati dell'utente mantengono le lapidi.


## v0.18 — Flashcard (12/11)
- Formati: tutti quelli testuali (Anki testo, Quizlet, CSV, Markdown stile Mochi, JSON) + file e cartelle Drive. Niente .apkg (è un database SQLite compresso: servirebbe una libreria pesante; da Anki si esporta come testo).
- Ripasso per CARTA (a differenza delle schede, qui ogni carta dura pochi secondi: 20 nuove/giorno come Anki tengono il carico sostenibile).
- «Di nuovo» rimette la carta 4 posizioni più avanti nella sessione (max 2 volte), come i passi di apprendimento di Anki.
- Scelta multipla: distrattori presi prima dallo stesso mazzo (più plausibili); se ce ne sono meno di 2, quella carta si gira. Colore + forma per ogni opzione (accessibile anche a chi non distingue i colori).
- Scrivi: confronto tollerante (maiuscole, accenti, punteggiatura finale, virgola/punto) e pulsante «Era giusta» per non punire un sinonimo.

## v0.19 — Generatore di piani (12/11)
- Procedura guidata a passi con anteprima prima di salvare (come i planner d'esame): niente piano «a scatola chiusa».
- Interleaving: ogni giorno materie diverse; dentro la materia prima i più deboli (raffinamento).
- Primo giro sul ~65% dei giorni a carico uniforme (non tutto in testa): lascia spazio a secondo giro distanziato (≥7 giorni) e simulazioni nella fase finale.
- Il secondo giro va solo agli argomenti con debolezza MISURATA ≥40%: gli argomenti mai provati hanno una stima neutra e non riempiono il calendario di ripassi inutili.
- Il piano generato non sostituisce quello principale; «Rigenera» conserva i giorni passati e toglie gli step già completati.
- Da rigenerare verso il 10/12: i punti deboli di oggi non sono quelli di dopo il primo appello.

## v0.20 — Vetro leggero (12/11)
- Vetro solo sui controlli (barra, fogli, dialoghi, pulsanti neutri), mai sul testo da leggere: la leggibilità viene prima (come le linee guida Apple per Liquid Glass).
- Opacità alta (80–88%): con troppa trasparenza le etichette della barra si confondevano con il testo sotto.
- Colore + forma per materia: accessibile anche per chi non distingue i colori e più rapido da riconoscere.
- Animazioni solo su transform/opacity, brevi (0.2–0.35 s), e solo al cambio scheda: i ridisegni frequenti (ogni salvataggio) non lampeggiano.

## v0.28 — Appunti, fase 1 (13/11)
- Modello ibrido scelto dall'utente: testo libero + elenchi annidati (RemNote) + vista Cornell (fase 2) sullo stesso appunto.
- Carte automatiche dalla sintassi `::` / `{{…}}` (RemNote, Obsidian): niente doppio lavoro appunto → carta.
- Copia su Drive solo con conferma nell'app a ogni salvataggio modificato (regola dell'utente: niente su Drive senza conferma).
- L'AI non scrive gli appunti (toglierebbe l'elaborazione generativa): le domande dai PDF/slide e dagli appunti le prepara Claude come pacchetti (fase 4).

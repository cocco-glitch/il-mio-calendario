# Scouting — settimana finale (F1) e concetti scaduti (F2) (27/11/2026)

## Domanda
F1: nella settimana finale (D−7…D−1) Studia ora da 50 min propone 13 min, perché le voci FINALE del piano sono solo testo.
F2: le scadenze FSRS dei concetti (`con:` .due) non le legge nessuno, quindi un concetto risposto bene non viene mai riverificato e «consolidato» (≥ 3 giorni su ≥ 7) arriva solo se lo studente rifà il quiz di sua iniziativa.
Criterio misurabile (in `test/collaudo_filiera.py`): (a) il 16/11 e il 20/11 Studia ora 50 min arriva ad almeno 40 min senza argomenti nuovi; (b) il giorno in cui un concetto scade compare una verifica di quel concetto, in Oggi e in Studia ora; (c) completata la verifica, `con:` avanza e il punteggio della scheda non cambia.

## Già nel progetto
- La settimana finale dei piani AI è già descritta (blocco 6, `07-pianificatore.ts:461`): «Ripassi in scadenza, concetti da consolidare, un quiz cumulativo per step a rotazione; niente argomenti nuovi». Simulazioni a D−6 e D−3. Manca solo chi la esegue.
- `QuizRifare` (07-quizrifare.ts) costruisce già un quiz sintetico da record e lo apre con `QuizApp.apri(…, () => lista, info)`: schema riusabile.
- `Cattura.salva` ha già il caso «ripasso parziale»: con `d.errori` annota la nota senza cambiare il punteggio della scheda. Oggi però salta anche la padronanza (`FineQuizUI.dopo` richiede `!r.errori`).
- `modalitaEsame()` (07-studiaora.ts:46) conta i giorni al primo record `esame`; `piano.generato.esame` contiene la data del piano generato, ma nessuno la legge (F4).
- CodaRipasso ha 5 sorgenti (step, carte, quiz, appunti, piano), nessuna per i concetti.

## Come lo fanno le app
| App | Soluzione | Punti forti | Punti deboli | Fonte [livello] |
|---|---|---|---|---|
| Khan Academy | «Mastery Challenge»: 6 domande su 3 abilità, 2 per abilità; 2/2 sale, 0/2 scende, 1/2 resta; una ogni 12 h | ripasso a spirale breve e automatico, regola semplice e trasparente | solo abilità già praticate; niente legame con la data d'esame | support.khanacademy.org [C] |
| RemNote | Exam Scheduler: data d'esame su una cartella, distribuisce il carico, «riporta tutto per un ripasso finale», propone un periodo di recupero se si resta indietro | lega lo SRS alla data d'esame; recupero esplicito, non silenzioso | risultati dichiarati solo dal produttore; a pagamento | help.remnote.com [C] |
| Anki | Mazzo filtrato per il «cram»: per impostazione le risposte RIprogrammano le carte (con FSRS contano); senza riprogrammazione = anteprima | scelta esplicita se il ripasso finale conta o no | manuale, nessuna guida; problemi segnalati nel forum | docs.ankiweb.net [C], forum [D] |
| Quizlet Learn | data del test → piano adattivo con promemoria | percorso guidato verso una data | algoritmo non documentato; a pagamento | thejournal 2017, macreports 2021 [D] |
| Knowt (AI) | piano fino alla data d'esame + test di prova generati dagli appunti | test misti automatici | mira ai punti deboli non documentata | app store, recensioni [D] |

## Cosa dice la ricerca
- Interleaving (domande mischiate tra argomenti) contro pratica a blocchi: g = 0,42 sul test finale; l'effetto dipende dal materiale — Brunmair & Richter 2019 [A].
- Revisione mista in matematica, RCT in classe: +0,83 DS di ritenzione a 1 mese — Rohrer et al. 2020 (citazione secondaria) [B, da verificare sul testo].
- Spaziatura contro pratica massiva: g = 0,74 — Latimier et al. 2021 [A]. Con un esame a pochi giorni conviene un intervallo di 1–2 giorni (intervallo ottimo ≈ 20–40% del ritardo per test a 1 settimana); un intervallo troppo corto danneggia più di uno troppo lungo — Cepeda et al. 2008 [B, n > 1.350].
- Il cram del giorno prima regge per i fatti superficiali, non per le domande complesse; la spaziatura ha battuto il cram in tutte le condizioni — Kornell & Bjork 2008 [B].
- Effetto test (recupero attivo): g = 0,50 — Rowland 2014 [A] (già usato in S7).
Condizioni al contorno: i dati sull'interleaving vengono soprattutto da matematica e categorie percettive; su domande a scelta multipla di biologia e chimica l'effetto atteso è positivo ma probabilmente più piccolo [?].

## Valutazione
| Opzione | Efficacia [livello] | Costo | Peso | Rischi |
|---|---|---|---|---|
| A. Mini-verifica per scheda (3 concetti × 2 domande ≈ 6 min) usata sia per F2 (concetti scaduti, livello 2) sia per F1 (in settimana finale più mini-verifiche di schede e materie diverse, livello 6) | test [A] + spaziatura [A] + interleaving tra schede nella sessione [A, effetto ridotto perché a blocchi di 6] | ~150 righe (chunk ~110, app.js ~35), ~1,5 h | app.js +~0,7 KB (margine 1,9); chunk motore +~1,5 KB | basso: riusa QuizApp, Cattura e FineQuizUI |
| B. Un unico quiz cumulativo da 20 domande mischiate tra schede | interleaving pieno [A] | +~100 righe: padronanza da salvare per più schede, nuovo percorso di salvataggio | più alto | medio: cambia Cattura (oggi una scheda = un salvataggio) |
| C. Solo testo più ricco nelle voci FINALE | nessuna | ~10 righe | 0 | non risolve F1 né F2 |

## Proposta di fusione
Opzione A. Da Khan: la mini-sfida a 2 domande per concetto, con la regola di padronanza già esistente (FSRS per concetto). Da RemNote: in settimana finale l'app riporta tutto in un ripasso finale e lo dichiara. Da Anki: la verifica CONTA per la memoria (riprogrammazione attiva), ma non riscrive il punteggio della scheda, come già fa «Rifai solo gli errori». Nostro: un solo meccanismo per i due casi, scelta per debolezza (prima da_studiare, poi la R più bassa), alternanza tra materie nella sessione, zero token.

## Piano e tattiche
1. `RisultatoQuiz.verifica` + `Cattura.salva`: annota, non cambia il punteggio, chiama FineQuizUI per la padronanza (test: punteggio invariato, `con:` aggiornato).
2. `VerificaConcetti` nel chunk del motore: sceglie fino a 3 concetti e 2 domande ciascuno (prima le non viste di recente) e apre QuizApp (test puro su un libro mai visto).
3. CodaRipasso: sorgente `concetti` (concetti scaduti, raggruppati per scheda) → Oggi «Ripassa» e Studia ora livello 2.
4. Studia ora: in settimana finale (voce FINALE/FIN del giorno o esame ≤ 7 giorni) candidati di livello 6 «Verifica cumulativa» sulle schede già studiate, alternando le materie.
5. F3: l'avviso del Generatore nomina la settimana finale. F4: `prossimoEsame`/`vicinanza` leggono anche `piano.generato.esame`.
6. Collaudo: le NOTE F1/F2/F3/F4 diventano controlli `ok`; suite Node e Concetti/Motore salgono.

## Decisioni per l'utente
1. Opzione A (mini-verifiche) o B (quiz cumulativo unico)? Consigliata A.
2. La verifica aggiorna la padronanza senza cambiare il punteggio della scheda? Consigliato sì.
3. F4: l'esame del piano generato vale come esame senza creare un record? Consigliato sì (niente doppioni nel calendario).

## Fonti
- Khan Academy, Mastery Challenges: https://support.khanacademy.org/hc/en-us/articles/360037127892 [C]
- RemNote, Exam Scheduler: https://help.remnote.com/en/articles/9102040-understanding-the-exam-scheduler [C]
- Anki, Filtered decks: https://docs.ankiweb.net/filtered-decks.html [C]; forum FSRS e mazzi filtrati: https://forums.ankiweb.net/t/do-filtered-decks-have-an-effect-on-fsrs/60365 [D]
- Quizlet Learn: https://thejournal.com/articles/2017/03/09/quizlet-debuts-study-feature-that-helps-students-study-efficiently.aspx [D]
- Knowt: https://apps.apple.com/us/app/id6463744184 [D]
- Brunmair & Richter 2019, meta-analisi dell'interleaving: https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2019/Brunmair_Richter_in_press__2019_META-ANALYSIS_OF_INTERLEAVED_LEARNING.pdf [A]
- Firth et al. 2021, revisione sistematica dell'interleaving: https://strathprints.strath.ac.uk/75711/7/Firth_etal_RE_2021_A_systematic_review_of_interleaving.pdf [A]
- Cepeda et al. 2008: https://pubmed.ncbi.nlm.nih.gov/19076480/ [B]
- Kornell & Bjork 2008 (riassunto APS): https://www.psychologicalscience.org/observer/will-that-be-on-the-test [D sul riassunto, B sullo studio]
- Spaziatura, sintesi CMU: https://www.cmu.edu/teaching/resources/instructionalstrategies/activelearningstrategies/spacedopractice/index.html [D]

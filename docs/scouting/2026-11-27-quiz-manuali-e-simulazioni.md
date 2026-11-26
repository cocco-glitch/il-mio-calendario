# Scouting — quiz manuali sui deboli e cumulativi (fase 9) + simulazioni del Generatore a D−6/D−3 (fase 12) (27/11/2026)

## Domanda
1. **Fase 9.** Lo studente vuole decidere lui di fare un quiz «sui miei punti deboli» o «cumulativo» (più schede/materie insieme), oggi possibili solo in automatico (Studia ora, settimana finale). Criterio: da Statistiche, in ≤ 3 tocchi, parte un quiz con domande di più schede, alternate, che aggiorna la padronanza `con:` di ogni scheda giusta senza cambiare il punteggio delle schede.
2. **Fase 12.** Il Generatore deve mettere le simulazioni a D−6 e D−3 con la revisione degli errori il giorno dopo, come il Pianificatore. Criterio: piano con esame al giorno D → SIM a D−6 e D−3, REV a D−5 e D−2; la simulazione si apre anche senza la cartella Drive delle simulazioni.

## Già nel progetto
- `VerificaConcetti.scegli` (chunk del motore): 3 domande per concetto, alternate, mai il ripiego. `perFinale`: schede dalla più debole, materie alternate. **Riusabili così come sono.**
- `VerificaConcetti.avvia` lavora su **una** scheda: `QuizApp.apri(pk, m, micro, s, …)` è legato a una scheda; `Cattura.salva(s.id, r)` attribuisce il risultato a quella scheda.
- `QuizApp` ha già il modo **'esame'** (niente correzione fino alla fine) accanto a 'neuro'.
- Vista padronanza (Statistiche, chunk): «▶ Inizia dalla più debole» apre il quiz **completo** di una sola scheda.
- Pianificatore (`07-pianificatore.ts:461`): SIM a D−6/D−3, revisione a D−5/D−2, cumulativo negli altri giorni. **Regola già decisa (blocco 6): la copiamo nel Generatore.**
- Generatore (`07-generatore.ts:77-93`): SIM nell'ultimo 40% dei giorni **prima** della settimana finale; REV il giorno utile dopo. `rigaStudio` (`07-studio.ts:461`): SIM apre `apriSimulazioni()` = **solo file HTML nella cartella Drive «consolidamento/simulazioni»**; REV non apre nulla. → per un libro qualsiasi (memoria «generalità») la simulazione oggi **non esiste**.
- Margine di `app.js`: 1,3 KB sul tetto di 306 KB → il codice nuovo va nel chunk del motore (tetto 30 KB, oggi 20,1).

## Come lo fanno le app
| App | Soluzione | Punti forti | Punti deboli | Fonte [livello] |
|---|---|---|---|---|
| AMBOSS (medicina, con AI) | «Create a Qbank session»: filtri per materia/sistema e stato della domanda, modo Study (correzione subito) o Exam (a tempo, come l'USMLE); sessioni adattive che ripropongono prima gli errori vecchi | il modello di riferimento per la medicina; filtri + modo in una schermata | i piani di studio personalizzati non offrono il modo Exam; nessun filtro «solo sbagliate» documentato | support.amboss.com 2024–25 [C] |
| UWorld | Custom test: sistemi, «unused/incorrect/marked», Tutor o Timed | «solo sbagliate» + a tempo: è il flusso più usato per i ripassi d'esame | numero di domande scelto a mano, nessuna spaziatura | tech.medicine.wsu.edu [D] |
| Anki | Custom Study: «Review forgotten cards» (Again negli ultimi N giorni), «Study by card state or tag»; mazzi filtrati per ricerca | flessibile, gratuito | menu tecnico; una sessione nuova svuota la precedente | docs.ankiweb.net [C] |
| RemNote | Coda globale su tutti i documenti; Exam Scheduler; tabella delle carte difficili (leech) | mescola i documenti da sé, priorità «esame» | Exam Scheduler a pagamento; carte, non quiz | help.remnote.com [C] |
| Quizlet | «Combine sets» (da set, cartelle, classi) poi Learn/Test | un set combinato si studia come gli altri | Test e Learn a pagamento; il set combinato è una copia statica | help.quizlet.com [C] |
| Khan Academy | Unit test e Course challenge mescolano le abilità; Mastery Challenge 6 domande su 3 abilità | regola trasparente; solo test/challenge portano a «Mastered» | Mastery Challenge solo per matematica, tolta nella nuova interfaccia | support.khanacademy.org [C] |

## Cosa dice la ricerca
- **Recupero attivo (quiz):** g = 0,50 sull'apprendimento — Adesope, Trevisan & Sundararajan 2017 [A] (già nella scheda S9).
- **Interleaving:** g = 0,42, ma eterogeneo (I² = 77%): forte su materiali simili tra categorie, **negativo sulle parole** (g = −0,39), cautela sui testi espositivi — Brunmair & Richter 2019, *Psychol Bull* [A]. Condizione al contorno: alternare **concetti affini** (stessa materia o materie vicine) rende più di un mescolamento casuale.
- **Esami cumulativi:** ritenzione maggiore fino a 18 mesi — Khanna, Badura Brack & Finken 2013 [B]; beneficio soprattutto per gli studenti deboli — Lawrence 2013 [B]; **contro-prova**: in biologia nessun effetto medio, solo per chi ha basse capacità di ragionamento — PLOS ONE 2021 [B]. Pesa di più la contro-prova sul nostro caso? No: è uno studio sul formato dei parziali, non sul ripasso; ma ci dice di non promettere effetti grandi.
- **Correzione ritardata:** nei quiz a scelta multipla la correzione data dopo (fine test o giorno dopo) supera quella immediata sul test differito — Butler, Karpicke & Roediger 2007 [B]; Smith & Kimball 2010 [B]; possibile confondente col tempo di esposizione (Mem Cognit 2011) [B]. → giustifica «simulazione in modo esame + revisione il giorno dopo».
- **Simulazioni a tempo e stress:** la pratica col recupero protegge la memoria dallo stress acuto — Smith, Floerke & Thomas 2016, *Science* [B]; le prove ripetute riducono l'ansia da esame, g = −0,52 — meta-analisi su 25 effetti, Shanks et al. [A].
- **D−6 e D−3 in sé:** nessuno studio confronta questi giorni precisi [?]. Sono una regola di progetto (già scelta per il Pianificatore nel blocco 6): lasciano 1 giorno per la revisione e 2 per colmare le lacune prima della vigilia.

## Valutazione
| Opzione | Efficacia [livello] | Costo | Peso | Rischi |
|---|---|---|---|---|
| **1A** Sequenza di mini-verifiche, una scheda dopo l'altra (riusa `avvia` così com'è) | recupero [A]; interleaving solo tra blocchi di ≤ 9 domande (debole) | ~90 righe, 1 h | 0 B in app.js | lo studente vede 3–5 quiz in fila, non uno; il modo esame perde senso |
| **1B** Un solo quiz misto: domande di più schede alternate, risultato diviso per scheda | recupero [A] + interleaving vero [A] + modo esame per le simulazioni | ~160 righe, 2 h; tocca `QuizApp` (scheda della domanda) e `Cattura` (ramo `cum:`) | ~+250 B in app.js (margine 1,3 → ~1,05 KB), il resto nel chunk | attribuzione sbagliata di statq/padronanza se la divisione sbaglia → test dedicato |
| **4** Generatore: ultime 2 simulazioni a D−6/D−3 nella settimana finale, REV a D−5/D−2; SIM apre Drive se c'è la cartella, altrimenti il quiz cumulativo di 1B in modo esame; REV apre le sbagliate della simulazione | correzione ritardata [B], stress [B], ansia [A] | ~50 righe, 45 min (+ dipende da 1B per l'apertura in app) | ~+150 B in app.js | piani già salvati: le voci restano com'erano (si rigenera) |

## Proposta di fusione
- Da **AMBOSS/UWorld**: una sola schermata «Componi un quiz» con *cosa* (Deboli · Cumulativo), *dove* (materie), *quante* (9 · 18 · 27), *come* (Allenamento = correzione subito · Esame = correzione alla fine).
- Da **Anki «forgotten cards»**: «Deboli» = concetti `da_studiare`/`da_consolidare` + scaduti, dal più debole (`perFinale` esteso), più le domande in «Quiz da rifare».
- Da **Khan**: la regola resta la nostra (3 domande per concetto, `MIN_AFFIDABILE`); il quiz manuale aggiorna la padronanza, non il punteggio della scheda.
- Da **RemNote**: si mescola da sé, materie alternate; lo studente non deve scegliere le schede una per una (può restringere per materia).
- **Nostro**: la stessa macchina serve la simulazione del Generatore senza file su Drive (modo Esame, tutte le materie del piano, 27 domande), e la revisione del giorno dopo riapre esattamente le sbagliate.
- Scartato: set combinati statici alla Quizlet (copie che invecchiano); numero libero di domande (UWorld) → 3 tagli bastano e tengono i multipli di 3.

## Piano e tattiche
1. `VerificaConcetti.componi(tipo, materie, n)` puro + test in `test/concetti.mjs` (deboli dal più debole, cumulativo su schede verificate, materie alternate, mai il ripiego, n rispettato).
2. Quiz misto (1B): `QuizApp` usa la scheda della domanda per statq; `Cattura.salva('cum:…')` divide per scheda e passa da `FineQuizUI.dopo` per ciascuna; guardia nella suite Node (prova di mutazione: attribuzione a una scheda sbagliata → test rosso).
3. Interfaccia: foglio «Componi un quiz» nel chunk, ingresso dalla vista padronanza (accanto a «Inizia dalla più debole»).
4. Generatore: SIM/REV a D−6…D−2 dentro la settimana finale; `rigaStudio` apre il quiz cumulativo in modo esame se non c'è la cartella Drive; REV apre le sbagliate. Test in `generatore.py`/`collaudo_filiera.py`.
5. Verifiche: tsc, suite Node, concetti, finequiz, E2E toccati, collaudo; pesi in `prestazioni.py`.

## Decisioni per l'utente
1. 1B (quiz misto, consigliato) o 1A (sequenza, zero byte in app.js)?
2. Ingresso: solo dalla vista padronanza (consigliato, chunk) o anche da Oggi (costa byte in app.js)?
3. Generatore: le ultime 2 simulazioni a D−6/D−3 e le altre restano nella fase «prestazione» (consigliato) oppure tutte dentro la settimana finale?
4. Simulazione senza cartella Drive: quiz cumulativo in modo Esame da 27 domande con limite di tempo (consigliato) o senza tempo?

**Decise dall'utente (27/11):** 1B quiz misto · ingresso dalla vista padronanza · ultime 2 simulazioni a D−6/D−3, le altre nella fase «prestazione» · simulazione a tempo, ma **minuti e numero di domande selezionabili a mano** (gli esami non sono tutti uguali).

## Fonti
- AMBOSS: https://support.amboss.com/hc/en-us/articles/360032477132 · https://support.amboss.com/hc/en-us/articles/360036038991 · https://support.amboss.com/hc/en-us/articles/45511273700369
- UWorld (guida universitaria): https://tech.medicine.wsu.edu/technology/medical-education/uworld/question-bank-students/
- Anki: https://docs.ankiweb.net/filtered-decks.html
- RemNote: https://help.remnote.com/en/articles/9101991-preparing-for-an-exam · https://www.remnote.com/feature/card-table
- Quizlet: https://help.quizlet.com/hc/en-us/articles/360029638892-Combining-study-sets
- Khan Academy: https://support.khanacademy.org/hc/en-us/articles/115002552631
- Brunmair & Richter 2019: https://pubmed.ncbi.nlm.nih.gov/31556629/
- Khanna et al. 2013: https://dissem.in/p/13120631/short-and-long-term-effects-of-cumulative-finals-on-student-learning · Lawrence 2013: https://www.facultyfocus.com/articles/teaching-and-learning/cumulative-exams-motivate-students · PLOS ONE 2021: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8062001/
- Butler, Karpicke & Roediger 2007: https://pcllab.github.io/downloads/2007/2007_Butler_Karpicke_Roediger_JEPA.pdf · Smith & Kimball 2010: https://www.ou.edu/memorylab/pdfs/SmithKimball_2010_LearningFromFeedback_ms.pdf
- Smith, Floerke & Thomas 2016 (Science, doi 10.1126/science.aah5067): https://medicalxpress.com/news/2016-11-memory-stress.pdf · meta-analisi ansia: https://discovery.ucl.ac.uk/id/eprint/10177686/1/Shanks_Frequent%20Tests%20&%20TA-R2.PDF

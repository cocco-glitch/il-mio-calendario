# Scouting — unire e dividere i micro-step (fase 14 del brief) (27/11/2026)

## Domanda
Il brief, fase 14 «Controlli dell'utente»: «modificare micro-step; unire o dividere micro-step; […] rigenerare soltanto le parti interessate. Le correzioni manuali devono avere priorità sulle associazioni automatiche». Fase 15: «ID stabili […] non cancellare o sovrascrivere progressi storici».
Problema dello studente: l'AI (o il programma) taglia male gli argomenti — due micro-step che sono lo stesso argomento, oppure uno troppo grosso per una sessione. Criterio: in ≤ 2 tocchi per operazione unisce o divide; quantità di quiz, pagine e tempo si ricalcolano; si rigenera solo ciò che è cambiato; nessun record esistente cambia id.

## Già nel progetto
- Gerarchia reale: step → sotto-step (`SottoS.k`, con titolo) → micro-step (`MicroS.n`, **senza titolo**) → schede (`SchedaS.id`).
- **L'id della scheda contiene il micro-step**: `Centro.schede` → `cod + '-' + micro[0] + '-' + n` (`07-centro.ts:84`); ImportaDrive → `cod + '-' + n + '-1'`. Da quell'id dipendono `prog-<id>`, `statq.sk`, `con:<sk>|…`, `mem-sub-`, carte, `Domande.schedaId`, `modq`. La banca si carica dal numero del micro-step (`Banca.carica(parseInt(micro))`).
- Nel Centro, PRIMA dell'import, l'anteprima del piano permette già di correggere il micro-step di ogni scheda scrivendo i codici (`07-centroui.ts:422`: campo «Microstep della scheda S01»): un unire/dividere manuale, ma a mano e senza ricalcolo spiegato.
- `PianificazioneQuiz` (P0.67) calcola la quantità di quiz per micro-step (pagine, concetti, densità, minuti) e il Centro ha «un lavoro persistente per microstep» → la base per «rigenerare solo le parti interessate» c'è già.
- Copertura (blocco 7) segnala i doppioni nei piani AI (concetti ≥ 0,5 e pagine ≥ 50%): oggi solo un avviso, senza azione.

## Come lo fanno le app
| App | Soluzione | Punti forti | Punti deboli | Fonte [livello] |
|---|---|---|---|---|
| Anki | «Change Deck» sposta carte tra mazzi; dividere/unire mazzi = spostare carte | la storia di ripasso resta (le carte sono la cosa, il mazzo è un contenitore) | se il mazzo nuovo ha altre opzioni lo scheduling cambia | docs.ankiweb.net FAQ [C]; forum [D] |
| RemNote | trascini i rem nella gerarchia; taglia-incolla conserva la storia SRS, copia-incolla no | spostare non costa nulla | nessuna funzione «unisci» | help.remnote.com [C]; forum [D] |
| Obsidian (Note composer, Split by Heading, Splitsmith) | unisci note (link aggiornati); dividi per titolo (i link alle parti spesso NO, salvo plugin con riparazione e annulla) | il «dividi per titolo» usa una struttura già nel testo | dividere rompe i riferimenti se non si riparano | community.obsidian.md, forum [D] |
| Adobe Learning Manager (con AI) | «dividi questa lezione in due», «unisci queste lezioni» in linguaggio naturale sullo schema generato | unire/dividere PRIMA che i contenuti esistano | strumento per autori, non per studenti | experienceleague.adobe.com [C] |
| Pianificatori AI per studenti (Planana, Planix, Notion AI) | piani modificabili nell'ordine e nel ritmo | — | nessuna documentazione su unire/dividere a mano | taskade.com, devpost [D] |

Schema comune: **il contenitore si cambia, l'oggetto con la storia no** (Anki, RemNote); dove l'oggetto stesso si divide, i riferimenti si rompono (Obsidian) a meno di una riparazione esplicita.

## Cosa dice la ricerca
- **Segmentazione:** dividere il materiale in parti migliora ritenzione e trasferimento (effetti piccoli-medi) e riduce il carico cognitivo; il beneficio è maggiore con conoscenze pregresse alte — Rey et al. 2019, *Educ Psychol Rev*, 56 studi [A]. → la granularità conta: un micro-step troppo grande è un problema didattico, non solo di calendario.
- **Controllo dello studente:** dare più controllo allo studente nelle tecnologie didattiche non migliora il rendimento (g ≈ 0,05, 18 studi) — Karich, Burns & Maki 2014 [A]; Parsons 1991 −0,04 [B]. → unire/dividere va offerto per **correggere** errori del piano (come chiede il brief), non come funzione «che fa imparare di più»; il predefinito resta la suddivisione automatica.
- **Carico della memoria di lavoro** (~4 elementi, Cowan 2001) [A]: un criterio oggettivo per proporre «dividi» = più di ~4 concetti nuovi o più del tempo di una sessione; per «unisci» = doppioni già rilevati da Copertura.

## Valutazione
| Opzione | Efficacia [livello] | Costo | Peso | Rischi |
|---|---|---|---|---|
| **A** Nel Centro, prima dell'import: «Unisci al successivo» / «Dividi qui» sui gruppi di schede del piano (al posto dei codici a mano), ricalcolo di quiz/pagine/tempo con PianificazioneQuiz, solo i lavori dei micro-step toccati tornano «da rigenerare»; proposta automatica quando Copertura vede un doppione o un micro-step supera ~4 concetti/una sessione | corregge la segmentazione dell'AI [A]; controllo solo dove serve [A] | ~100–140 righe, 1,5–2 h | chunk strumenti-quiz (90,2 → ~92 KB su 100), **0 B in app.js** | nessuno sugli id: nascono all'import |
| **B** Dopo l'import: raggruppamento «di vista» (record sincronizzato che riunisce o separa le schede di un sotto-step a schermo; id e record intatti) | basso: cambia solo come si vedono i gruppi [A: controllo ~0] | ~150–200 righe, 2–3 h | ~+400–600 B in app.js (margine 1.724 B) o spostamento nel chunk | due «verità» (vista e banca); confusione su quale micro-step carica la banca |
| **C** Dopo l'import con migrazione degli id (vecchio → nuovo) | — | alto | — | **viola la fase 15** (ID stabili, progressi storici): scartata |

## Proposta di fusione
- Da **Adobe Learning Manager**: unire/dividere sullo schema **prima** che esistano i contenuti — da noi nell'anteprima del piano del Centro.
- Da **Anki/RemNote**: mai toccare l'oggetto con la storia; dopo l'import si sposta al più il contenitore di vista (B), mai l'id.
- Da **Obsidian «dividi per titolo»**: il punto in cui dividere lo propone l'app (tra due schede, o tra concetti della lista), non lo studente a mano.
- **Nostro**: la proposta nasce da criteri misurati (doppione di Copertura; > ~4 concetti nuovi o > minuti di una sessione) e mostra il perché; la correzione manuale prevale sull'automatico e resta salvata nel lavoro del micro-step (rigenerando, l'AI non la annulla).

## Piano e tattiche (A)
1. Puro, in `07-centro.ts`: `unisci(p, msA, msB)` e `dividi(p, ms, dopoScheda)` su `PianoCentro` (assegnano `micro` alle schede, numerano il nuovo micro-step come successivo libero dello step), con test in `test/centro.mjs` (id delle schede coerenti, nessuna scheda persa, nuovo codice nello step, correzione manuale che sopravvive alla rigenerazione).
2. Interfaccia nell'anteprima del Centro: gruppi per micro-step con «⤵ Unisci al successivo» e «✂ Dividi qui» tra due schede; il campo codice resta per i casi rari.
3. Ricalcolo: PianificazioneQuiz sui micro-step toccati, e i loro lavori segnati «da rigenerare» (gli altri restano).
4. Proposte: Copertura (doppione) → «Unisci?»; troppi concetti/minuti → «Dividi?»; mai automatico.
5. Verifiche: tsc, Centro, Copertura, Logica, E2E `v063_centro` (in locale: cdnjs) e collaudo.

## Decisioni per l'utente
1. Solo A (consigliato) o A + B (vista dopo l'import)?
2. Le proposte automatiche «Unisci?/Dividi?» le vuoi (consigliato, solo come suggerimento) o solo i pulsanti?
3. Soglia per proporre «Dividi»: > 4 concetti nuovi **o** > minuti di una sessione ordinaria (consigliato), oppure solo i minuti?

**Decise dall'utente (27/11):** solo A (nel Centro, prima dell'import) · proposte automatiche «Unisci?/Dividi?» come suggerimento, mai applicate da sole · soglia «Dividi» = più di 4 concetti nuovi **o** più minuti di una sessione ordinaria. Implementazione nella sessione successiva.

## Fonti
- Brief: «Brief_Claude_motore_studio_integrato.docx», fasi 14 («Controlli dell'utente») e 15.
- Anki: https://docs.ankiweb.net/faqs/how-do-i-move-cards-between-decks · forum: https://forums.ankiweb.net/t/how-changing-cards-to-different-decks-affects-scheduling/21975 · https://forums.ankiweb.net/t/fsrs-impact-of-moving-cards/53569
- RemNote: https://help.remnote.com/en/articles/7868482-moving-content-between-knowledge-bases · https://help.remnote.com/en/articles/6030548-moving-rem-organizing-hierarchies · forum: https://forum.remnote.io/t/is-progress-remembered-when-i-reorganize-rems/177
- Obsidian: https://community.obsidian.md/plugins/split-by-heading · https://community.obsidian.md/plugins/splitsmith · https://forum.obsidian.md/t/merge-notes-and-update-backlinks/2916
- Adobe Learning Manager: https://experienceleague.adobe.com/en/docs/learning-manager/using/authors/alm-content-composer/create-course/edit-course-outline
- Pianificatori AI: https://www.taskade.com/blog/ai-study-planners.md · https://devpost.com/software/planix
- Rey et al. 2019 (doi 10.1007/s10648-018-9456-4): https://is.tuebingen.mpg.de/publications/rey2018segmenting
- Karich, Burns & Maki 2014: https://edweek.org/leadership/review-casts-doubt-on-importance-of-learner-control-in-computerized-instruction/2014/05 · https://www.clearinghouse.edu.tum.de/wp-content/uploads/2017/07/CHU_KR_8_Karich_2014_Lernersteuerung-Software.pdf
- Cowan 2001, *Behav Brain Sci* 24:87–114 (capacità della memoria di lavoro ~4) [A, conoscenza di Claude, non ricercato in questa sessione].

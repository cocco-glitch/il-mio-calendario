# Scouting — matrice di copertura (fase 5) e formule/sigle nell'indice (fase 3) (27/11/2026)

## Domanda
**Punto 3 (fase 5 del brief):** oggi la catena obiettivo → concetto → pagine → quiz → risultato è sparsa in tre posti (Centro: pagine per microstep; avvisi di Copertura nei piani AI; vista padronanza in Statistiche). Lo studente non vede in un colpo dove ha un buco: concetto senza pagine, senza quiz, con troppe poche domande per giudicarlo, mai verificato o debole.
Criterio: da Statistiche, in ≤ 2 tocchi, ogni concetto di una scheda mostra le 4 colonne e, dove c'è un buco, **un'azione**; nessun numero inventato (mai verificato ≠ 0%).

**Punto 5 (fase 3):** `IndicePagine.parole` tiene solo parole di ≥ 3 lettere a–z/0–9. Le formule e le sigle si perdono, quindi non aiutano né a trovare le pagine né ad assegnare le domande ai concetti.
Criterio: i concetti di Fisica (oggi 25/33 corretti, il più debole) salgono sullo stesso campione, senza perdere copertura sulla banca (≥ 60%, oggi 67,3%) né richiamo delle pagine.

## Già nel progetto
- `PadronanzaUI` (motore-studio.js): per materia «N di M concetti consolidati», barra a 5 stati, drill-down scheda → concetti con stato e motivo, pulsanti «Rifai il quiz», «Quiz sui punti deboli», «Quiz cumulativo». **Manca:** pagine e numero di domande per concetto.
- `Concetti`: assegna ogni domanda a un concetto (focus della scheda, BM25, margine 30%), `MIN_AFFIDABILE = 3` domande per giudicare un concetto. F5 del collaudo: alcuni concetti hanno solo 2 domande → non diventano mai affidabili, e oggi nessuna vista lo dice.
- Le domande della banca hanno `cit` (pagina del libro) → le pagine per concetto si ricavano gratis, senza PDF.
- `Copertura` (doppioni, lacune) gira solo sui piani AI; il Centro ha `pagineTrovate` per microstep (prima dell'import).
- **Misura fatta ora sulla banca (217 schede):** il `focus` contiene formule o sigle in **36 schede** (B 6/68, F 13/68, C 17/81). Quasi tutte si perdono in `parole()`: ΔG ×11, ΔH ×5, ΔE ×4, «F =» ×4, «P =» ×4, O₂ ×3, H⁺ ×2, ΔS ×2 (Δ non è a–z, la lettera che resta è < 3). È coerente con la Fisica più debole nel controllo dei concetti (S8).

## Come lo fanno le app e gli strumenti
| Chi | Soluzione | Punti forti | Punti deboli | Fonte [livello] |
|---|---|---|---|---|
| AMBOSS | risultati della Qbank per sistema/disciplina; «priorità» = rendimento × peso all'esame; domande etichettate per abilità | dice apertamente che non può giudicare gli argomenti non ancora fatti | nessuna vista obiettivo → pagine → quiz documentata | blog.amboss.com, support.amboss.com [C] |
| Khan Academy | «3 di 22 abilità a Proficient» per unità; Familiar/Proficient/Mastered; la percentuale conta solo Proficient+ | conteggio onesto, un solo numero per unità | nessun legame con le pagine del libro | support.khanacademy.org [C] |
| Mappe curricolari (università, NILOA) | griglia obiettivi × attività con codici I/R/M/A (introdotto, rinforzato, padroneggiato, verificato) | trova i buchi: obiettivi senza attività o senza verifica | strumento per docenti, a mano | Stony Brook, Georgia Tech, Hawaii [C] |
| Ricerca di formule (Approach0, MathWebSearch, MIaS) | le formule si indicizzano come alberi o sotto-formule, separate dal testo | trovano formule uguali scritte in modo diverso | pesanti; per motori dedicati, non per un'app offline | ECIR 2019, arXiv 1304.5475 [B/C] |
| Lucene/Elasticsearch (StandardAnalyzer) | tiene i token alfanumerici di qualsiasi lunghezza (pH, O2, H2O) | sigle e formule semplici restano cercabili | nessuna gestione di Δ o di «F = m·a» | conoscenza di Claude, doc ufficiale [C] |
| Ricerca nel codice (BM25 + identificatori) | indicizzare **sia** l'identificatore intero **sia** i suoi pezzi: 0,309 → 0,563 su un benchmark | lo stesso schema vale per «ΔG» → «deltag» + «g» | studio su codice, non su chimica | arXiv 2605.18561 (2026) [B, trasferibilità ?] |

## Cosa dice la ricerca
- **Dashboard da sole:** nessuna prova che migliorino il rendimento (revisione di 38 studi, Kaliisa & Saqr 2023) [A]; un RCT su 556 studenti: accesso alla dashboard, voto all'esame invariato (Hellings & Haelermans) [B]. Funzionano feedback, supporto e personalizzazione, non la semplice informazione (meta-analisi 2025 riassunte da ACU) [A, cifre non verificate sull'originale]. → La matrice ha senso **solo con l'azione nella riga**.
- **Accuratezza metacognitiva:** chi giudica di sapere smette di studiare troppo presto; i giudizi migliorano con il recupero ripetuto (Dunlosky & Rawson 2012) [B]. → «letto/pagine viste» non deve mai sembrare «verificato»: colonne separate.
- **Effetto del test:** g ≈ 0,50 (Rowland 2014) [A]. → un concetto con < 3 domande non si può verificare (MIN_AFFIDABILE): è un buco da mostrare, non un dettaglio.
- **Allineamento** obiettivo–attività–verifica (Biggs, constructive alignment) [D, teoria molto citata, poche prove sperimentali dirette].
- **Formule:** nessuno studio sull'effetto didattico di indicizzare i simboli; il beneficio è di **reperimento** (richiamo/precisione) e va misurato da noi [?].

## Valutazione
| Opzione | Efficacia [livello] | Costo | Peso | Rischi |
|---|---|---|---|---|
| **3A** Matrice dentro la vista padronanza: per scheda, una riga per concetto con 4 colonne (pagine da `cit` · domande N/3 · verificato · stato) e l'azione del buco (crea quiz nel Centro / quiz deboli / correggi concetto); in cima, per materia, «buchi: X concetti senza domande sufficienti, Y senza pagine» | utile solo per l'azione [A]; onestà sui non verificati [B] | ~150–200 righe, 2–3 h | motore-studio.js 24,4 → ~27 KB (tetto 30); 0 B in app.js | le domande della banca si caricano all'apertura della scheda (non all'avvio: budget Statistiche < 350 ms) |
| 3B Matrice anche nel Centro, prima dell'import (obiettivo → pagine → domande arrivate) | senza risultati: metà della catena | +80–120 righe | chunk creazione 90 → ~92 KB | due viste da tenere allineate |
| 3C Matrice a griglia completa (tutte le schede × colonne) | nessuna prova in più [A]; illeggibile a 360 px | ~250 righe | — | contrasto con il vincolo mobile |
| **5A** Token dei simboli in `parole()`: Δ→«delta», apici/pedici normalizzati (² → 2, ⁺ → +), sigle di 2 caratteri tenute se nel testo originale hanno maiuscola mista, cifra o segno (pH, O2, H+, Kb); formule «F = m·a» → token «f=ma» **e** i pezzi | reperimento [?, da misurare] | ~60–90 righe + misura, 1–1,5 h | ~+0,5 KB nel motore | cambia BM25 e quindi τ e l'assegnazione dei concetti: va rimisurato |
| 5B Glossario universale dei simboli come sinonimi (ΔG → energia libera) | aiuta se il libro scrive in parole ciò che il programma scrive in simboli | +40 righe, lista da curare | — | lista arbitraria; rischio di «costante per materia» |
| 5C nulla | — | 0 | 0 | Fisica resta il punto debole (25/33) |

## Proposta di fusione
- **Punto 3 = 3A.** Da Khan: il conteggio onesto per unità («N di M»). Da AMBOSS: dire chiaramente cosa non si può giudicare. Dalle mappe curricolari: le colonne servono a trovare i buchi, non a decorare. **Nostro:** ogni buco ha il suo pulsante, e la soglia delle domande è quella del motore (3), così F5 diventa visibile e correggibile dallo studente.
- **Punto 5 = 5A con cancello di misura.** Dalla ricerca nel codice: indicizzare l'intero **e** i pezzi. Da Lucene: i token brevi alfanumerici restano. Si tiene solo se la misura passa: Concetti sulla banca ≥ 60% di copertura e precisione Fisica sullo **stesso** campione di 33 domande > 25/33; richiamo delle pagine invariato sul pilota (lo script `test/pilota-pagine.mjs` gira sul PC dell'utente). 5B solo se 5A non basta.

## Piano e tattiche
1. (5, prima: cambia i dati che la matrice mostra) `IndicePagine.simboli()` + `parole()` estesa; test in `test/concetti.mjs` (ΔG, pH, O₂, «F = m·a», libro sintetico mai visto = generalità); rimisurare copertura sulla banca e le 33 domande di Fisica a mano; τ invariato se il richiamo sul pilota non cambia.
2. (3) Puro `Concetti.matrice(sk, domande, memoria)` → righe {concetto, pagine, n, verificate, stato, buco}; test in `test/concetti.mjs`.
3. (3) Vista: dentro il `details` della scheda in Padronanza, caricamento della banca al primo tocco; azioni: «Crea domande nel Centro», «Quiz sui deboli», «Correggi il concetto».
4. Verifiche: tsc, Concetti, Logica, prestazioni (tetto 30 KB del motore, Statistiche < 350 ms), E2E nuovo `matrice`, a11y a 375 px.

## Decisioni per l'utente
1. Punto 3: **3A** (consigliato) o 3A + 3B (anche nel Centro)?
2. Soglia del buco «domande insufficienti»: **< 3 = MIN_AFFIDABILE** (consigliato, coerente col motore) o un numero diverso?
3. Punto 5: **5A con cancello di misura** (consigliato) o 5A + 5B subito?
4. Ordine: **prima 5 poi 3** (consigliato: la matrice mostrerà assegnazioni migliori) o prima 3?

**Decise dall'utente (27/11):** 3A (matrice solo in Padronanza) · buco = meno di 3 domande (MIN_AFFIDABILE) · 5A con cancello di misura · prima 5, poi 3.

## Misura del punto 5 (27/11, dopo l'implementazione)
Il campione di 33 domande di Fisica di S8 non è nel repository (era nella scratchpad di quel container), quindi il cancello «Fisica > 25/33 sullo stesso campione» non si può rifare. Al suo posto un **confronto appaiato**: stessa banca (3.906 domande), assegnazione prima e dopo, e giudizio a mano solo delle domande che cambiano (le coppie discordanti sono le uniche che informano sulla differenza, come nel test di McNemar).
- Prima versione: 391 cambi; campione di 45 → saldo ~nullo (le assegnazioni corrette perse ≈ quelle guadagnate). Cause trovate su casi reali: «delta» comune a ΔG/ΔH/ΔS, sigle contate due volte (mRNA, pKa), numeri romani (II, IV) presi per sigle. Corrette tutte e tre.
- Versione finale: copertura 67,3% → **69,2%** (2.627 → 2.702); 287 cambi (159 ripiego → concetto, 84 concetto → ripiego, 44 concetto → altro concetto). Campione casuale stratificato di 45 (seme 2711): nuove assegnazioni corrette 12/15; perse che erano corrette 13/15; cambi di concetto migliori 11/15, peggiori 0/15.
- Estrapolato: ≈ **+86 assegnazioni corrette, −11 sbagliate**; corrette sul totale delle domande ≈ 55,8% → 58,0% (con la precisione 83% di S8 come base). Fisica: ≈ +32 corrette, −3 sbagliate.
- Limiti: 15 per strato (IC ampi, ±20 punti); giudice = Claude, non cieco alla versione; il richiamo delle pagine sul pilota (`test/pilota-pagine.mjs`) va rifatto sul PC dell'utente (τ invariato, i test del Centro e di IndicePagine passano).

## Fonti
- AMBOSS: https://blog.amboss.com/us/knowledge-profile · https://blog.amboss.com/us/study-with-personal-analysis · https://support.amboss.com/hc/en-us/articles/42885439769233
- Khan Academy: https://support.khanacademy.org/hc/en-us/articles/47078681852045 · https://support.khanacademy.org/hc/en-us/articles/48411237993357-How-is-my-mastery-percentage-calculated · https://support.khanacademy.org/hc/en-us/articles/115002552631
- Mappe curricolari: https://www.stonybrook.edu/commcms/provost/assessment/Degree_and_Certificate_Program_Assessment/Curriculum_Mapping · https://academiceffectiveness.gatech.edu/sites/default/files/2021-04/Curriculum%20Mapping%20Template.pdf · https://manoa.hawaii.edu/assessment/resources/how-to/curriculum-mapping-curriculum-matrix/
- Dashboard: Kaliisa & Saqr 2023, https://arxiv.org/abs/2312.15042 · Hellings & Haelermans, https://link.springer.com/doi/10.1007/s10734-020-00560-z · sintesi ACU: https://inspire.acu.edu.au/articles/learning-analytics
- Formule: Approach0 https://www.cs.rit.edu/~dprl/assets/files/Approach0_ECIR2019.pdf · https://arxiv.org/pdf/1304.5475 · BM25 e identificatori: https://arxiv.org/pdf/2605.18561
- Dunlosky & Rawson 2012 (Learning and Instruction 22:271–280) · Rowland 2014 (Psychol Bull 140:1432–1463) · Biggs 1996 (Higher Education 32:347–364) [conoscenza di Claude, non ricercati in questa sessione]

# 03 — (A) Sintesi: il "merging" delle ricerche in un'unica app
L'app non deve diventare cinque app incollate. Si fonde tutto attorno a **un ciclo** e a **un oggetto**.

## 1. Il ciclo (il cuore dell'app)
```
 PIANIFICA ──► STUDIA ──► RICHIAMA ──► VALUTA ──► RIPROGRAMMA
 (calendario)  (sessione)  (quiz/carte)  (sicurezza+esito)  (FSRS + pianificatore)
      ▲                                                          │
      └───────────────────── RIPOSA / DORMI ◄────────────────────┘
```
Ogni schermata serve una di queste fasi. Se una funzione non serve il ciclo, va nel file 09.

## 2. L'oggetto unico: l'"elemento da ricordare" (ER)
Oggi esistono schede quiz, errori, pagine, appunti separati. Da ora **tutto ciò che va ricordato** ha una **scheda di memoria** con lo stesso motore:
| Tipo di ER | Esempio | Come si richiama |
|---|---|---|
| `scheda` | quiz HTML "2.2.4 scheda 2/3" | apri il quiz → punteggio |
| `carta` | flashcard "Legge di Henry ::" | fronte/retro, completamento |
| `errore` | domanda sbagliata in un quiz | ridomanda (da nota o carta) |
| `pagine` | Bettelheim pp. 141–147 | "scrivi a memoria" (blurting) poi controlla |
| `microstep` | 2.2.4 | sintesi: padronanza = media degli ER figli |
Ogni ER ha: difficoltà, stabilità, prossima data, storico (FSRS). Il calendario riceve **un solo flusso**: "ripassi di oggi".

## 3. Architettura delle informazioni (schermate)
Barra in basso (mobile), 5 sezioni + pulsante centrale:
1. **Oggi** — rituale mattino; timeline del giorno (Structured) con eventi, blocchi studio, ripassi negli spazi liberi; "Questa sera"; serie gentile; prossimo esame.
2. **Calendario** — Giorno/Settimana/Mese/Agenda (esistenti) + strato "studio" attivabile; trascinamento.
3. **▶ Studia ora** (pulsante centrale, grande) — avvia la sessione migliore *adesso*: sceglie l'app tra ripassi scaduti, step del giorno, errori; durata scelta da te (15/30/50/90 min).
4. **Studio** — corsi, step, microstep (esistente) + **mappa di padronanza** (griglia colorata per microstep) + carte + errori.
5. **Progressi** — memoria (ritenzione prevista per materia), calibrazione, tempo, sonno, serie, previsione "pronto per l'esame".
6. **Altro** — impostazioni, notifiche, Drive, aspetto, dati.

## 4. Cosa entra, fuso (dalle 12 idee del file 01)
| Funzione | Da dove viene | Come si fonde |
|---|---|---|
| Motore FSRS unico | Anki | per tutti gli ER; ritenzione desiderata per corso (es. 0,90 normale, 0,95 nelle 2 settimane prima dell'esame) |
| Sicurezza prima della risposta | Brainscape | 3 livelli (Indovino / Credo / Sicuro) → alimenta calibrazione e ipercorrezione |
| 4 tasti con intervallo | Anki | per carte e pagine; per i quiz il punteggio si converte nel voto (es. <50% = Di nuovo, 50–69 Difficile, 70–89 Bene, ≥90 Facile) |
| Scala di difficoltà | Quizlet | una carta passa da scelta multipla → completamento → risposta libera man mano che la stabilità cresce |
| Padronanza che sale e scende | Khan | colore del microstep = recuperabilità media di oggi |
| Timeline con spazi liberi | Structured | vista Oggi |
| Rituali mattina/sera + sovraccarico | Sunsama | Oggi: 2 schermate brevi |
| Auto-pianificazione | Motion/Reclaim | F5: incastra step/ripassi nelle fasce libere, ripianifica in avanti |
| Fasce di energia | Lifestack | impostazione: fasce alta/media/bassa |
| Feedback immediato e celebrazioni sane | Duolingo | animazioni brevi, legate alla padronanza |
| Colore + forma per opzioni | Kahoot | quiz nativi e carte a scelta multipla |
| Carte da appunti e PDF | RemNote | `domanda :: risposta` nelle note; selezione nel PDF → carta |
| Micro-animazioni | Things 3 | file 07 |

## 5. Cosa NON entra (deciso)
- Classifiche, leghe, punti, cuori, valuta virtuale: premiano la quantità e la competizione, non l'apprendimento.
- Intelligenza artificiale dentro l'app (servirebbe un server/chiave a pagamento): le carte e i pacchetti li genera **Claude in chat** in formato JSON (come già i pacchetti studio), l'app li importa.
- Funzioni social/condivisione: l'app è solo dell'utente.

## 6. Principi di design (riassunto, dettagli nel file 07)
1. **Una cosa per schermo durante lo studio** (carico cognitivo).
2. **Il colore significa qualcosa**: materia (identità), stato della memoria (rosso→verde), mai decorazione.
3. **Movimento con uno scopo**: conferma, continuità, celebrazione breve; rispetta "Riduci movimento" di iOS.
4. **Onestà**: mostrare quanto ricordi davvero, anche quando è poco; tono incoraggiante, mai punitivo.
5. **Il pollice comanda**: azioni principali in basso, bersagli ≥ 44 pt.
6. **Funziona offline sempre**; la rete serve solo a sincronizzare e notificare.

## 7. Dati (aggiunte facoltative, compatibili con v0.6)
| Record | Campi principali |
|---|---|
| `memoria` (id `mem-<idER>`) | `er` (tipo+id), `d` difficoltà, `s` stabilità, `due` prossima data, `ultimo`, `n` ripassi, `lapsi`, `log` compatto `[[giorno, voto, sicurezza, secondi]]` (ultimi 50) |
| `carta` | `fronte`, `retro`, `tipo` (base/completamento/scelta/abbina), `opzioni?`, `img?`, `fonte` (nota/pdf+pagina/scheda), `m` materia, `micro?` |
| `sessione` (esistente) | + `tipo` (nuovo/ripasso/misto/simulazione), `voti[]`, `energia?`, `focus?` (1–5) |
| `giorno` (id `g-YYYY-MM-DD`) | `sonno?` ore, `energia?`, `piano?` (rituale mattino), `chiusura?` (rituale sera), `congelato?` (serie) |
| `impostazioni` | + `ritenzione`, `fasceEnergia`, `notifiche` (canale, topic, orari silenziosi), `blocchi` (25/5…), `serie` (regole) |

# BP1 rifinita — v0.50 «Pool IA multi-provider»

Sorgente: BP1 (Gemini 4 Hydrogen). Questa versione è stata riscritta confrontando ogni punto con il codice reale v0.44.1 (commit 3eeb12b) e con fatti verificati il 18/11/2026. Ogni algoritmo nuovo è stato simulato: `sim.mjs` → tutti i casi «R» passano; i 7 FAIL sono errori di BP1, corretti qui sotto.

---

## 0. Stato reale di partenza (non quello presunto da BP1)

| Cosa | Realtà v0.44.1 |
|---|---|
| Build | `node build.mjs` (tsc → `build-tmp/` → concatena in ordine di nome → `dist/app.js`). Niente `package.json`, niente `npm run build` |
| Test | Python Playwright `test/*.py`, lanciati da `bash test/tutti.sh` (32 gruppi, cerca «TUTTO OK»). Python **non è installato su questo PC** → test solo su macchina con Python |
| Typecheck | `npx -y -p typescript@5.6.3 tsc --noEmit -p tsconfig.json` → 0 errori oggi |
| Gateway IA | **tre**, non uno: `IA` (07-ia.ts: assistente, creaquiz), `Spiega.chat` (07-spiegazioni: aigen, appunti, audio), fetch Groq diretti (07-spiegazioni:73/105/129, 07-audio:20) |
| Chiavi | Gemini in `localStorage['imc-gemini-chiave']`; Groq via `Spiega.chiaveAI()`, sincronizzata in `dati/chiave-ai.json` `{groq, modello}` con controllo `/^gsk_/` |
| Merge | `Stato.unisci`: record intero, vince `updatedAt` maggiore |
| Lapidi | purgate solo per tipo `notifica` dopo 7 gg; **lapidi utente mai purgate** |
| Upload Drive | non atomico: scarica → unisce → carica, senza ricontrollo prima dell'upload; un solo timer `Drive.programma()` da 3000 ms |
| SW | `install` → `skipWaiting()`; `activate` → `clients.claim`; pdf.js lazy in cache `imc-lib`; nessuna UI di aggiornamento |
| FSRS | già limitato (`lim()`: d∈[1,10], s∈[0.1,36500], intervallo∈[1,365]) |
| Non esistono | MediaStore, IndiceGrafo, `normalizzaCanonico`, `tokenizzaAtomico`, `renderHtmlSicuro`, `imc-ai-keys`, sibling burying, `schemaVersion` |

---

## 1. Errata BP1 → realtà → correzione

| # | BP1 afferma | Realtà verificata | Correzione in v0.50 |
|---|---|---|---|
| E1 | Modelli Groq `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `gpt-oss-120b` | Free plan: `openai/gpt-oss-120b`, `openai/gpt-oss-20b` (prefisso `openai/` obbligatorio); i Llama sono Enterprise | Nessun ID fisso: scelta per **pattern** su `GET /models` (§4.3) |
| E2 | Visione Groq con Llama-4 scout/maverick | Unico modello visione: `qwen/qwen3.8-27b` (preview, max 20 MB). `VISIVI` in 07-spiegazioni contiene uno ID morto | Visione per pattern + capacità; rimuovere ID morti |
| E3 | `effettivoMaxInputTokens` Groq = 32 000 | Free: 8K TPM, 200K TPD, 30 RPM, 1K RPD → richiesta singola ≤ ~5,6K token input+output | Budget = 0,7 × TPM − maxOutput (§4.4) |
| E4 | — (non visto) | **Bug attuale**: `IA.chiedi` tronca Groq a 60 000 car ≈ 17K token > 8K TPM → 413 su creaquiz grandi | Corretto dal filtro pre-volo; fix rapido anche in 0.44.x (§9) |
| E5 | Gemini 2.5 Flash / 2.0 | Attuali: `gemini-4-hydrogen`, `gemini-3.8-flash`, 3.1 Flash-Lite, 3 Flash. Thinking non disattivabile su 3/4, si regola con `reasoning_effort` | Pattern `/flash/` con preferenza versione più alta; `reasoning_effort:'low'` per ruolo `veloce` |
| E6 | Gemini trascrive audio via `/audio/transcriptions` | Endpoint non disponibile da browser (TypeError); `input_audio` documentato solo `wav` | Trascrizione: Groq Whisper; fallback Gemini via chat con `input_audio` WAV 16 kHz (riusa il chunker esistente) |
| E7 | Pool: groq, gemini, cerebras, sambanova, nvidia, github, mistral, cohere, openrouter | Test CORS da origine esterna: **sambanova, nvidia, github (vecchio e nuovo) bloccati**; cerebras: GET ok, POST chat bloccato | Pool browser: groq, gemini, mistral, cohere, openrouter (`:free`), requesty. Gli altri esclusi (regola: niente proxy) |
| E8 | StatQ unito con `Math.max(n)` + debounce 8500 ms | Sim S2: base 3, +2 e +3 offline → 6 invece di 8. Debounce inutile: `Drive.programma` ha un solo timer da 3 s, qualsiasi salvataggio lo fa partire | **PN-counter per dispositivo** (§5.1) |
| E9 | «L'Undo 8000 ms dello StatQ» | L'annulla da 8 s esiste solo in `07-cattura.ts` (risultati quiz HTML catturati). StatQ non ha annulla | Annulla StatQ nuovo, implementato come contatore `x` (§5.1) |
| E10 | Estendere la retention delle lapidi a 30 gg | Nessuna retention per dati utente. Purgare a 30 gg → sim S3: dispositivo offline 60 gg fa **risorgere** il record | Nessun cambiamento: lapidi utente mai purgate |
| E11 | `schemaVersion` per record | I client 0.44 lo ignorano → protegge solo dal futuro, non dal passato | `schemaVersion` nell'involucro di `dati.json` accanto a `versione:1` + ricontrollo pre-upload (§5.2) |
| E12 | Banner «aggiornamento disponibile» | Impossibile finché `install` chiama `skipWaiting()` | Togliere `skipWaiting` dall'install; chiamarlo su messaggio dal banner (§6) |
| E13 | Pre-cache pdf.js in `install` | Se la CDN non risponde l'install fallisce → SW mai aggiornato | Best-effort fuori dal `waitUntil` critico, in `imc-lib` |
| E14 | `canvas.toBlob('image/webp')` | Safari può restituire PNG in silenzio | Controllare `blob.type`; se ≠ webp usare JPEG 0.85 |
| E15 | Hedging (2 provider in parallelo) | Brucia RPD free (1K/giorno Groq) per guadagni minimi | Eliminato |
| E16 | Cooldown fisso 45 s | Groq espone `retry-after` (solo su 429) e `x-ratelimit-reset-*` | Cooldown da header, altrimenti esponenziale 15→30→60→…→600 s |
| E17 | Parser JSON con whitelist di 14 comandi LaTeX | Sim S1: rompe `\times`, `\theta`, `\neq`, `\left` (errore), doppio escape, testo dopo il JSON | `parseJsonSicuro` R (§4.6), 13/13 casi |
| E18 | Checklist `npm run build`, `npm test`, test `.mjs` | Inesistenti | Checklist reale (§10) |
| E19 | Nuovo `07-mediastore.ts` | Nome ok: in ordine alfabetico cade tra `07-mano` e `07-memoria`; nessuna dipendenza da file successivi a caricamento | Confermato |

---

## 2. Obiettivi v0.50

1. **Un solo gateway**: `IA` diventa l'unico punto di uscita verso i provider (chat, visione, trascrizione). `Spiega.chat` e i fetch diretti diventano adattatori sottili su `IA`.
2. **Pool multi-provider** con chiavi dell'utente, chiamate dirette dal browser (nessun proxy, nessun reseller).
3. **Router onesto**: rispetta i limiti reali, legge gli header, non manda richieste destinate al 413/429.
4. **Correzioni dati**: StatQ concorrente, guardia di versione su `dati.json`, upload con ricontrollo.
5. **SW aggiornabile** con banner.

Fuori ambito (BP1 li cita ma non servono ora): MediaStore completo, IndiceGrafo, sibling burying.

---

## 3. Provider

| Provider | Base URL (OpenAI-compatibile) | CORS browser | Uso | Limiti free noti | Stato verifica |
|---|---|---|---|---|---|
| Groq | `https://api.groq.com/openai/v1` | ✅ chat, models, audio | chat veloce, Whisper, visione | 30 RPM · 1K RPD · 8K TPM · 200K TPD; Whisper 20 RPM · 2K RPD · 7,2K ASH, file ≤ 100 MB | ✅ doc ufficiale 18/11 |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | ✅ chat, models · ❌ audio/transcriptions | contesti lunghi, visione, audio via chat | da leggere da header/429 | ⚠️ limiti free non confermati |
| Mistral | `https://api.mistral.ai/v1` | ✅ | ripiego generale | piano «Experiment» | ⚠️ da confermare |
| Cohere | `https://api.cohere.ai/compatibility/v1` | ✅ | ripiego | trial key | ⚠️ da confermare |
| OpenRouter | `https://openrouter.ai/api/v1` | ✅ | solo modelli `:free` | per-modello | ⚠️ da confermare |
| Requesty | `https://router.requesty.ai/v1` | ✅ | opzionale | — | ⚠️ da confermare |
| Cerebras, SambaNova, NVIDIA, GitHub Models | — | ❌ | **esclusi** | — | ✅ test CORS |

Conseguenza: i limiti non vanno scritti nel codice come verità. Il router parte da valori **prudenti** (tabella `LIMITI_INIZIALI`) e li **corregge** con gli header `x-ratelimit-limit-*` / `x-ratelimit-remaining-*` letti a ogni risposta.

---

## 4. Contratti

### 4.1 Chiavi — `IA.chiavi`

```ts
type Prov = 'groq'|'gemini'|'mistral'|'cohere'|'openrouter'|'requesty';
interface ChiaviIA { v: 2; chiavi: Partial<Record<Prov, string>>; disattivi?: Prov[]; }
// localStorage['imc-ai-keys'] = JSON ChiaviIA
```

- **Migrazione (una tantum, idempotente)**: se `imc-ai-keys` manca → leggere `imc-gemini-chiave` e `Spiega.chiaveAI()` → scrivere `imc-ai-keys`. **Non cancellare le vecchie chiavi** per una versione (rollback a 0.44 resta funzionante).
- **Drive** `dati/chiave-ai.json`: scrivere `{ groq, modello, v:2, chiavi:{…} }` — i campi `groq` e `modello` restano per i client 0.44 (compatibilità all'indietro). Lettura: se c'è `chiavi` usarlo, altrimenti `{groq}`.
- Validazione formato (solo avviso, non blocco tranne Groq che oggi già blocca): groq `/^gsk_/`, gemini `/^AIza/`, openrouter `/^sk-or-/`.
- Le chiavi non entrano mai in URL salvo il fallback Gemini `?key=` già esistente (ultimo tentativo).

### 4.2 API pubblica di `IA`

```ts
type Ruolo = 'genera'|'revisiona'|'veloce'|'visione'|'lungo';
interface Opz { temp?: number; maxOut?: number; json?: boolean; evita?: Prov[]; segnale?: AbortSignal; }
IA.chiedi(msgs: Msg[], r: Ruolo, o?: Opz): Promise<{ testo: string; prov: Prov; modello: string }>;
IA.json<T>(msgs, r, o?): Promise<T>;           // chiedi + parseJsonSicuro + 1 riprova con «solo JSON valido»
IA.trascrivi(blob: Blob, lingua='it'): Promise<string>;
IA.stato(): Record<Prov, { ok: boolean; finoA?: number; motivo?: string }>;  // per la UI impostazioni
```

`Spiega.chat(msgs, opz)` → `IA.chiedi(msgs, opz.immagini ? 'visione' : 'genera', …).then(x => x.testo)` — firma esterna invariata, nessun chiamante da toccare.

### 4.3 Scelta modello (discovery)

- `GET {base}/models` con cache 12 h in `localStorage['imc-modelli-'+prov]` (come oggi).
- Ogni ruolo ha una lista di **pattern** ordinati, non ID:

```ts
const PATTERN: Record<Prov, Partial<Record<Ruolo, RegExp[]>>> = {
  groq:   { genera:[/gpt-oss-120b/], revisiona:[/gpt-oss-120b/], veloce:[/gpt-oss-20b/, /gpt-oss/], visione:[/qwen.*\d+b/, /scout|vision/] },
  gemini: { genera:[/gemini-\d.*flash(?!-lite)/], veloce:[/flash-lite/, /flash/], lungo:[/gemini-\d.*flash/, /pro/], visione:[/flash/] , revisiona:[/hydrogen|pro/, /flash/] },
  // mistral/cohere/openrouter: pattern generici; openrouter filtra SOLO id che finiscono con ':free'
};
```

- A parità di pattern vince la **versione numerica più alta** (`gemini-3.8-flash` > `gemini-3-flash`); esclusi id con `preview|exp` se esiste una alternativa stabile, tranne per la visione Groq (unico modello è preview).
- Se `/models` fallisce → ultimo elenco in cache, anche scaduto. Se non c'è cache → provider saltato per quel ruolo.

### 4.4 Router — filtro pre-volo e cooldown

```
tok(stima) = ceil(caratteri / 3.5)   // italiano: prudente
per ogni prov nella catena del ruolo, nell'ordine:
  salta se manca la chiave, se disattivo, se in cooldown (finoA > now)
  budget = min(contestoModello, 0.7 * TPM_noto) - maxOut
  se tok(prompt) > budget:
     se ruolo ammette troncamento (assistente) → tronca al budget
     altrimenti → salta il provider
  invia
  esito 429      → cooldown = retry-after || x-ratelimit-reset-* || esponenziale(15s·2^k, max 600s)
  esito 413      → registra TPM_noto = min(TPM_noto, tok*0.9); riprova sul successivo
  esito 401/403  → stato 'chiave non valida', nessun retry, mostra in impostazioni
  esito 400 con response_format → riprova una volta senza (comportamento attuale)
  esito 5xx / rete → cooldown 30 s, successivo
```

- Catene per ruolo (default): `veloce` groq→gemini→mistral→openrouter; `genera` gemini→groq→mistral→cohere→openrouter; `lungo` gemini→mistral; `visione` gemini→groq; trascrizione groq→gemini(chat WAV).
- Nessun hedging. Nessuna richiesta parallela allo stesso provider oltre 2.
- Sim S4: con questo filtro Groq non riceve più richieste da 4K+ token che oggi danno 413.

### 4.5 Header letti

`retry-after`, `x-ratelimit-limit-requests`, `x-ratelimit-limit-tokens`, `x-ratelimit-remaining-tokens`, `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens` (formato tipo `7.66s`, `2m59.56s` → parse in ms). Se un header non è esposto via CORS, `headers.get` restituisce `null`: il router deve funzionare anche senza.

### 4.6 `parseJsonSicuro`

1. Rimuovere `<think>…</think>` e anche un prefisso fino a `</think>` senza apertura (gpt-oss troncato).
2. Rimuovere i fence ```` ```json ````.
3. Estrarre il **primo JSON bilanciato** contando `{[`/`]}` **fuori dalle stringhe** (non «dal primo `{` all'ultimo `}`», che ingloba testo dopo).
4. Riparare il LaTeX **solo dentro le stringhe JSON**: `\\` già doppi intatti; `\uXXXX` intatto; comando LaTeX noto (set ampio: frac, times, theta, neq, left, right, ce, …) → raddoppia; sequenza che inizia con `b f n r t` e non è un comando noto → è un vero escape JSON; qualunque altro `\lettera` → raddoppia (sarebbe JSON invalido comunque).
5. `JSON.parse`. In caso di errore: `IA.json` fa **una** riprova con il messaggio «Rispondi solo con JSON valido».

Limite noto e accettato: `\nu`, `\tau`, `\rho`, `\beta`, `\theta` sono nel set e vengono trattati come LaTeX anche se il modello intendeva `\n`+«u…». Rischio basso (un «a capo» seguito da «u» senza spazio), effetto solo estetico.

---

## 5. Dati e sincronizzazione

### 5.1 StatQ come PN-counter (sostituisce E8, E9)

```ts
interface StatQ { type:'statq'; sk; ultima; esito; scelte?;
  n: number; ok: number;                                   // legacy, ricalcolati: restano per i client 0.44
  c?: Record<string /*dispositivoId*/, { n:number; ok:number; xn:number; xok:number }>;
}
```

- `dispositivoId`: `localStorage['imc-dispositivo']`, generato una volta (`crypto.randomUUID()`).
- Risposta: `c[me].n++`, `ok` se corretta. Annulla (toast 8 s, stesso componente di `cattura`): `c[me].xn++`, `xok++` se era corretta.
- Merge **solo per `type==='statq'`** in `Stato.unisci`: per chiave dispositivo e per campo `max`; poi `n = Σ(n−xn)`, `ok = Σ(ok−xok)`; `updatedAt = max`. Tutti gli altri tipi restano LWW come oggi.
- Migrazione: record senza `c` → `c = { legacy: { n, ok, xn:0, xok:0 } }` al primo tocco.
- Client 0.44 che sovrascrive con LWW: perde `c` → il 0.50 lo ricrea da `legacy`; peggior caso = comportamento attuale, non peggio.
- Il debounce dedicato 8500 ms di BP1 **non** si implementa.

### 5.2 Guardia di versione e upload con ricontrollo (E11)

Involucro `dati.json`:
```json
{ "formato":"il-mio-calendario", "versione":1, "schemaVersion":2, "salvatoIl":…, "records":[…] }
```
- `versione` resta 1 (i client 0.44 continuano a leggere). `schemaVersion` nuovo.
- Se `schemaVersion` remoto > locale supportato → **solo lettura**: niente upload, banner «Aggiorna l'app».
- Upload: prima di caricare, leggere i metadati del file (`modifiedTime`/`version` Drive); se diverso da quello scaricato all'inizio di `sincronizza()` → ripetere scarica-unisci (max 3 volte) e solo allora caricare. Elimina la corsa tra due dispositivi.
- Filtro `acc` invariato: nessun record di altro account entra mai nel merge.

### 5.3 Lapidi

Nessun cambiamento (E10). `TIPI_SERVIZIO` resta l'unica eccezione.

---

## 6. Service worker (E12, E13)

- `install`: pre-cache shell (come oggi), **senza** `skipWaiting()`. pdf.js: `caches.open('imc-lib').then(c => c.add(url)).catch(()=>{})` **fuori** dalla promise passata a `waitUntil`.
- `message`: `if (e.data === 'salta') self.skipWaiting()`.
- `09-main.ts`: alla registrazione, se `reg.waiting` o `updatefound` → banner «Nuova versione pronta · Aggiorna». Click → `reg.waiting.postMessage('salta')`; `controllerchange` → `location.reload()` (una sola volta, flag).
- Prima installazione (nessun controller): `clients.claim` resta, nessun banner.

---

## 7. Media (minimo utile, E14)

`07-mediastore.ts` solo con `comprimiImmagine(file, maxLato=1600)`: canvas → `toBlob('image/webp', 0.82)`; se `blob.type !== 'image/webp'` → `toBlob('image/jpeg', 0.85)`. Limite visione Groq 20 MB, Gemini inline ~20 MB: oltre → errore chiaro, nessun invio.

Audio: il chunker WAV 16 kHz esistente resta; soglia di split portata da 25 MB a **24 MB** (margine) — Groq accetterebbe 100 MB ma il free ASH è 7,2K s/ora: chunk più piccoli = cooldown più gestibili.

---

## 8. Invarianti (da testare)

1. Nessuna chiamata a domini provider fuori da `07-ia.ts` (grep in test: `api.groq.com|generativelanguage|api.mistral|cohere|openrouter|requesty` solo in 07-ia).
2. Ogni richiesta inviata ha `tok(prompt)+maxOut ≤ budget(prov)`.
3. Su 401/403 un provider non viene ritentato nella stessa sessione finché la chiave non cambia.
4. Mai record con `acc` diverso nel merge; mai scrittura su calendari ≠ `gcalMirrorCalendarId`.
5. Id card `<materia>-<microstep>-<k>` invariati.
6. `dati.json` scritto da 0.50 è leggibile da 0.44.1 (stesso `formato`, `versione:1`, campi legacy `n/ok`, `chiave-ai.json` con `groq`).
7. StatQ: merge commutativo, associativo, idempotente (test con 3 dispositivi in ordini diversi).
8. Nessun file Drive cancellato: solo spostamenti in `_cestino app`.

---

## 9. Piano a tappe (ognuna rilasciabile)

| Tappa | Contenuto | Rischio |
|---|---|---|
| **0.44.2** (fix subito) | Budget Groq: troncare a ~16 000 car (≈4,5K token) invece di 60 000; rimuovere ID visione morto da `VISIVI` | minimo |
| 0.45 | `parseJsonSicuro` R + test unit | basso |
| 0.46 | Gateway unico: `Spiega.chat`, fetch diretti, audio → `IA`; chiavi `imc-ai-keys` + migrazione; discovery per pattern | medio |
| 0.47 | Router: filtro pre-volo, header, cooldown, stato provider in impostazioni; aggiunta mistral/cohere/openrouter/requesty | medio |
| 0.48 | StatQ PN-counter + annulla | medio (dati) |
| 0.49 | `schemaVersion` + upload con ricontrollo | medio (dati) |
| 0.50 | SW con banner; `comprimiImmagine` | basso |

---

## 10. Checklist per tappa

```bash
npx -y -p typescript@5.6.3 tsc --noEmit -p tsconfig.json
node build.mjs
bash test/tutti.sh          # su macchina con Python + Playwright
```

- Nuovi test Python: `test/v045_json.py` (13 casi di S1), `test/v046_gateway.py` (invariante 1, migrazione chiavi con e senza vecchie chiavi), `test/v047_router.py` (fetch mockato: 429 con/senza `retry-after`, 413, 401), `test/v048_statq.py` (S2 con 3 dispositivi + annulla dopo upload), `test/v049_versione.py` (remoto `schemaVersion:3` → sola lettura; corsa due upload).
- Aggiungere ogni nuovo gruppo a `test/tutti.sh`.
- Bump `VERSIONE` in `src/09-main.ts`; `git fetch` prima di pubblicare.

---

## 11. Punti ancora aperti (non bloccanti)

- Limiti free effettivi di Gemini, Mistral, Cohere, OpenRouter `:free`, Requesty: non confermati dalle pagine ufficiali in questa sessione. Il router è progettato per non dipenderne (valori prudenti + header + 413/429 adattivi).
- Esposizione CORS degli header `x-ratelimit-*` per provider diversi da Groq: da osservare al primo uso reale.
- Test Python non eseguibili su questo PC finché Python non è installato.

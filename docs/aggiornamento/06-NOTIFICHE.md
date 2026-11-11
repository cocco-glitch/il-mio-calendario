# 06 — Notifiche gratuite (semplici ma fattibili)
## Il problema
Un'app web, da sola, non può far suonare l'iPhone a un orario preciso: quando è chiusa non gira. Serve **qualcuno fuori dal telefono** che, all'ora giusta, mandi la notifica. Oggi l'app ha: avvisi solo ad app aperta + specchio su Google Calendar (funziona, ma gli avvisi arrivano dall'app Google Calendar e solo per eventi/task con ora).

Buona notizia verificata: le web app aggiunte alla Home **funzionano anche in Italia/UE** (Apple aveva annunciato di toglierle con iOS 17.4 ma ha fatto marcia indietro; notifiche e funzionamento offline restano). Le notifiche web su iPhone richiedono iOS 16.4 o successivo e l'app aggiunta alla Home da Safari.

## Soluzione consigliata — 3 livelli (si sommano)

### Livello A — ntfy (gratis, nessun server tuo, 1 sessione di lavoro) ★ CONSIGLIATO SUBITO
**Cos'è**: ntfy.sh è un servizio open source e gratuito: chiunque invii un messaggio a un "argomento" (topic) lo fa arrivare come notifica a chi è iscritto, tramite l'app gratuita **ntfy** per iPhone (che usa i server Apple, quindi arriva anche a telefono bloccato). Supporta la **consegna programmata**: si manda il messaggio adesso con l'orario di consegna, e il server lo consegna all'ora giusta. Limiti su ntfy.sh: consegna programmabile da 10 secondi a **massimo 3 giorni** nel futuro.

**Come lo usa l'app**:
1. In Altro → Notifiche, l'app genera un topic segreto lungo (es. `imc-7f3k9…`, 40 caratteri casuali: su ntfy "il topic è la password").
2. Tu installi **ntfy** dall'App Store, tocchi "+", incolli il topic (o inquadri un QR che l'app mostra). Fine.
3. A ogni salvataggio e a ogni apertura, l'app ricalcola le notifiche delle **prossime 72 ore** e le invia a ntfy con l'intestazione `At:` (orario di consegna), `Title:`, `Tags:` (emoji), `Click:` (link che apre l'app nel punto giusto) e `Priority:`.
4. Per poter **annullare o spostare** una notifica già programmata: ogni notifica ha un ID stabile; quando un evento cambia, l'app invia un aggiornamento/annullamento (ntfy supporta l'aggiornamento e la cancellazione dei messaggi tramite ID nelle versioni recenti: **da verificare nello spike di F1**; se non disponibile, l'app tiene in memoria cosa ha programmato e, in caso di modifica, la notifica vecchia viene "neutralizzata" programmando solo da adesso e mettendo nel testo l'orario, così una notifica superata si riconosce).
5. **Finestra mobile**: se non apri l'app per 3 giorni, le notifiche oltre quella finestra non sono programmate. Contromisure: (a) ogni giorno alle 8:00 una notifica "Ripassi di oggi" programmata già 3 giorni prima, che invita ad aprire l'app (e aprendola si riprogramma tutto); (b) lo specchio Google Calendar resta attivo per eventi lontani.

**Cosa notificare (predefinito, tutto disattivabile)**:
| Notifica | Quando | Esempio |
|---|---|---|
| Promemoria eventi/task | come impostato | "Chimica 3.1 tra 15 min" |
| Ripassi di oggi | 8:00 | "📚 12 ripassi · 25 min" |
| Blocco di studio | all'inizio | "▶ 15:00 Fisica 3.2 — tocca per iniziare" |
| Fine blocco / pausa | timer | "☕ Pausa 5 min" |
| Questa sera | 21:30 | "🌙 10 min di richiamo prima di dormire" |
| Esame vicino | 7, 3, 1 giorni prima | "Mancano 3 giorni: modalità ripasso attiva" |
**Orari silenziosi** (es. 23:00–7:30): nessuna notifica, quelle cadute dentro vengono spostate o saltate.

**Privacy**: i testi passano dai server di ntfy.sh (non cifrati di default). L'app manda solo testi brevi (niente note, niente nomi di persone); opzione "testo generico" ("Hai un promemoria"). Il topic è segreto e rigenerabile.

**Codice (indicazione per F1)**: richiesta dal browser `fetch('https://ntfy.sh/', { method: 'POST', body: JSON.stringify({ topic, title, message, tags, click, delay: '<timestamp>', id }) })`. Il formato JSON ufficiale accetta `topic`, `message`, `title`, `tags`, `priority`, `click`, `delay`. **Spike F1**: verificare dal sito pubblicato (GitHub Pages) che ntfy accetti richieste dal browser (CORS) e la gestione di aggiornamento/cancellazione; documentazione: docs.ntfy.sh/publish.

**Costo**: 0. **Lavoro**: 1 sessione. **Affidabilità**: buona (server pubblico "best effort", senza garanzia di uptime).

### Livello B — Web Push nativo (gratis, più lavoro, notifiche "dell'app") · facoltativo
**Cos'è**: le notifiche arrivano con l'icona di "Il mio calendario" e toccandole si apre direttamente l'app. Serve un piccolo programma sempre acceso che, all'ora giusta, mandi il messaggio push.
**Come (tutto su piani gratuiti)**:
1. **Cloudflare Worker** gratuito (100.000 richieste/giorno; fino a 5 "cron trigger" per account, anche ogni minuto): riceve dall'app l'elenco delle notifiche future e la "iscrizione push" del telefono; le salva in KV/D1 (gratuiti).
2. Un cron ogni minuto legge le notifiche scadute e le invia con il protocollo Web Push (chiavi VAPID generate una volta).
3. Nell'app: `manifest` con `display: standalone` (già c'è), richiesta permesso dopo un tocco dell'utente, `pushManager.subscribe`, gestore `push` e `notificationclick` nel service worker.
**Attenzioni**: il piano gratuito dà ~10 ms di CPU per esecuzione: la cifratura dei messaggi push può avvicinarsi al limite → inviare pochi messaggi per minuto (sono comunque pochi) o usare "Declarative Web Push" (Safari 18.4+) che semplifica il lato telefono. Proteggere il Worker con un segreto condiviso. Su iOS le iscrizioni push a volte "scadono": l'app le rinnova a ogni apertura.
**Costo**: 0. **Lavoro**: 2 sessioni + 10 minuti tuoi per creare l'account Cloudflare. **Quando**: se il Livello A ti sembra scomodo (due app) o vuoi le notifiche con l'icona dell'app.

### Livello C — Specchio Google Calendar (già fatto) · rete di sicurezza
Resta attivo per eventi e promemoria con ora, anche lontani nel tempo. Le notifiche arrivano dall'app Google Calendar/Calendario iOS. Nessun lavoro.

## Alternative valutate e scartate
| Opzione | Perché no (per ora) |
|---|---|
| Pushover | a pagamento (una tantum) |
| Bot Telegram | gratuito ma serve un server sempre acceso per programmare gli orari; testo su Telegram |
| GitHub Actions a orario | gratuito, ma ritardi frequenti di vari minuti e non legge i dati privati del Drive senza credenziali |
| Email programmata (Gmail) | poco immediata, si perde tra le mail |
| Promemoria iOS creati da Claude | funziona solo quando sei in chat con Claude, non dall'app |
| App nativa iOS | Mac + 99 €/anno |

## Passi per l'utente (Livello A, 3 minuti)
1. App Store → installa **ntfy** (gratis).
2. Nell'app calendario: Altro → Notifiche → "Attiva sul telefono" → copia il codice.
3. In ntfy: "+" → incolla il codice → Iscriviti. Consenti le notifiche.
4. Tocca "Prova" nell'app calendario: deve arrivare "✅ Notifiche attive" entro pochi secondi.

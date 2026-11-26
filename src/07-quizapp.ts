// 07-quizapp.ts — Quiz Studio Q0+Q1 (v0.22): banca domande e quiz nativo.
//
// Banca (Q0): studio/banca/banca-step-N.json, generata dai sorgenti delle schede (quiz/build/banca.js):
// { schede: {sk: info}, immagini: {id: svg}, domande: [DomB] }. Le schede che non sono nella banca
// (Step 1, 2.1: solo HTML su Drive) si estraggono al volo: il quiz HTML gira in un iframe isolato e
// nascosto con `var q=` reso visibile, e manda le domande al genitore. Il risultato resta in
// localStorage ('imc-banca-<sk>') per non riscaricarlo.
// Quiz nativo (Q1): disegnato dall'app, stesse funzioni delle schede (suggerimento, spiegazione dalle
// fonti, correzione passo-passo, perché le altre sono sbagliate, ✨ AI, rifai gli errori) più le
// statistiche per domanda: record 'statq' (id 'sq-<id domanda>') con tentativi, giuste e distrattori
// scelti — è la base di Q4 (regole che imparano dall'esperienza).
// Il risultato finale passa da Cattura.salva come per le schede HTML (progresso, ripassi, errori).

interface CitB { t: string; f: string; l?: string; }
// v0.52 (BP2): tipi universali (sequenza, abbinamento, risposta aperta con rubrica) e archetipo — campi facoltativi
interface DomB { schedaQuiz?: number; applicazione?: string; id: string; sk: string; t: 'mcq' | 'fill' | 'sequenza' | 'abbinamento' | 'risposta_aperta_rubrica'; lv: string;
  archetipo?: string; sequenzaOk?: string[]; coppieOk?: Array<[string, string]>; rubricaPunti?: string[]; linguaCodice?: string; q: string; o?: string[]; a?: string[]; show?: string; e: string | string[]; ew?: string[]; r?: string; cit?: CitB[]; cl?: string; img?: { i: string; cap: string; f?: string }[]; mod?: boolean; nuova?: boolean; gen?: boolean; dk?: string[];
  // v0.54 (BP3 §1.1): metadati neuro-cognitivi, tutti facoltativi (i quiz v0.51–v0.53 restano validi così come sono)
  bloomLevel?: BloomN; distractorTypes?: Record<number, TipoDistr>; confidenceLog?: TentativoN[]; sourceRef?: SourceRefN; subtopic?: string; stepId?: string;
  spiegazione?: string; spiegazioneDistrattori?: Record<number, string> | string[];
  erroreTipico?: string;
  /** blocco 6: concetto della domanda (contratto AI, lista della scheda); assente nella banca storica: lo assegna Concetti. */ concetto?: string; }   // v0.59.2: l'errore di ragionamento dietro il distrattore principale (quiz da Gemini)
interface BancaFile { step: number; schede: Record<string, { titolo: string; materia: string; microstep: string; k: number; n: number; fonti?: string; focus?: string }>; immagini: Record<string, string>; domande: DomB[]; }
interface ModQ extends Rec { type: 'modq'; qid: string; sk: string; campi?: Partial<DomB>; nascosta?: boolean; nuova?: boolean; originale?: Partial<DomB>; }
interface StatQ extends Rec { type: 'statq'; sk: string; n: number; ok: number; ultima: string; esito: boolean; scelte?: Record<string, number>; c?: Record<string, ContoQ>;
  /** v0.54 (BP3): SRS per singola domanda secondo la matrice certezza × correttezza, e ultimi tentativi. */
  neuro?: SrsN; confidenceLog?: TentativoN[];
  /** v0.64: l'ultima risposta aperta ha un voto cambiato dall'utente rispetto a quello proposto dalla rubrica. */ auto?: boolean; }

const Banca = (() => {
  const file = new Map<string, Promise<BancaFile | null>>();
  const scarica = (nome: string) => fetch('studio/banca/' + nome + '.json').then(r => r.ok ? r.json() : null).catch(() => null);
  /** v0.37: con la materia scarica solo la sua parte (banca-step-N-C.json, ~1/3), altrimenti il file intero. */
  function carica(step: number, mat?: string): Promise<BancaFile | null> {
    const k = step + '-' + (mat || '');
    if (!file.has(k)) file.set(k, mat ? scarica('banca-step-' + step + '-' + mat).then(b => b || carica(step)) : scarica('banca-step-' + step));
    return file.get(k)!;
  }
  const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const norm = (s: string) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

  /** Estrae le domande da un quiz HTML (qualsiasi versione del motore) in un iframe isolato. */
  function estraiDaHtml(html: string, sk: string): Promise<{ domande: DomB[]; immagini: Record<string, string> }> {
    return new Promise((ok, ko) => {
      if (!/var q\s*=\s*\{\s*questions/.test(html)) { ko(new Error('Formato del quiz non riconosciuto.')); return; }
      const spia = '<script>setTimeout(function(){try{var q=window.__q,I=window.__img||{};parent.postMessage({imc:"banca-estratta",q:JSON.parse(JSON.stringify(q)),img:JSON.parse(JSON.stringify(I))},"*")}catch(e){parent.postMessage({imc:"banca-estratta",errore:String(e)},"*")}},50)<\/script>';
      const src = html.replace(/var q\s*=\s*\{\s*questions/, 'var q=window.__q={questions').replace(/var IMG\s*=/, 'var IMG=window.__img=')
        .replace(/<\/body>(?![\s\S]*<\/body>)/i, spia + '</body>');
      const fr = h('iframe', { sandbox: 'allow-scripts', srcdoc: /<\/body>/i.test(html) ? src : src + spia, style: { display: 'none' } }) as HTMLIFrameElement;
      const t = setTimeout(() => { fine(); ko(new Error('Estrazione non riuscita (tempo scaduto).')); }, 8000);
      const ascolta = (e: MessageEvent) => {
        if (e.source !== fr.contentWindow || !e.data || e.data.imc !== 'banca-estratta') return;
        fine();
        if (e.data.errore || !e.data.q || !e.data.q.questions) { ko(new Error('Estrazione non riuscita.')); return; }
        const imm: Record<string, string> = {};
        const visti = new Set<string>();
        const domande: DomB[] = e.data.q.questions.map((q: any, i: number) => {
          let id = 'q-' + hash(sk + '|' + norm(q.q)); if (visti.has(id)) id += '-' + i; visti.add(id);
          const x = q.x || {};
          const d: DomB = { id, sk, t: q.t, lv: q.lv, q: q.q, e: q.e };
          if (q.t === 'mcq') { const c = q.c || 0; d.o = [q.o[c]].concat(q.o.filter((_: string, k: number) => k !== c)); if (q.ew) d.ew = q.ew; }
          else { d.a = q.a; d.show = q.show; if (q.ew) d.ew = q.ew; }
          if (q.r) d.r = q.r;
          if (x.cit) d.cit = x.cit; if (x.cl) d.cl = x.cl;
          if (q.img && e.data.img) d.img = q.img.map((g: any) => { const svg = e.data.img[g.s]; if (!svg) return null; const k = 'i-' + hash(svg); imm[k] = svg; return { i: k, cap: g.cap, f: g.f }; }).filter(Boolean);
          return d;
        });
        ok({ domande, immagini: imm });
      };
      const fine = () => { clearTimeout(t); window.removeEventListener('message', ascolta); fr.remove(); };
      window.addEventListener('message', ascolta);
      document.body.appendChild(fr);
    });
  }

  /** Q2: applica le modifiche dell'utente (record 'modq'): campi cambiati, domande nascoste, domande nuove. */
  function applica(domande: DomB[], sk: string): DomB[] {
    const mod = new Map<string, ModQ>(); for (const r of Stato.tutti<ModQ>('modq')) if (r.sk === sk && !r.deleted) mod.set(r.qid, r);
    const out = domande.map(d => { const r = mod.get(d.id); return r ? (r.nascosta ? null : { ...d, ...r.campi, id: d.id, sk, mod: true } as DomB) : d; }).filter(Boolean) as DomB[];
    for (const r of mod.values()) if (r.nuova && !r.nascosta && r.campi) out.push({ ...(r.campi as DomB), id: r.qid, sk, mod: true, nuova: true });
    return out;
  }
  /** Domande nascoste di una scheda (per poterle ripristinare). */
  function nascoste(sk: string): ModQ[] { return Stato.tutti<ModQ>('modq').filter(r => r.sk === sk && r.nascosta && !r.deleted); }

  // v0.57 (BP6): tetto alle copie locali delle schede estratte (localStorage è piccolo e condiviso con tutta l'app).
  // LRU: indice «imc-banca-uso» (chiave → ultimo uso); oltre MAX_COPIE o MAX_BYTE si tolgono le meno usate.
  const USO = 'imc-banca-uso', MAX_COPIE = 40, MAX_BYTE = 1.5 * 1024 * 1024;
  function indiceUso(): Record<string, number> {
    let u: Record<string, number> = {};
    try { u = JSON.parse(localStorage.getItem(USO) || '{}') || {}; } catch (e) { console.warn('Banca: indice LRU illeggibile', e); }
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('imc-banca-') && k !== USO && !(k in u)) u[k] = 0; }
    return u;
  }
  function scriviUso(u: Record<string, number>): void { try { localStorage.setItem(USO, JSON.stringify(u)); } catch (e) { console.warn('Banca: indice LRU non salvato', e); } }
  function usaCopia(k: string): void { const u = indiceUso(); u[k] = Date.now(); scriviUso(u); }
  /** Toglie le copie meno usate finché restano ≤ maxCopie e ≤ maxByte (escluso «tieni»). Ritorna quante ne ha tolte. */
  function potaCopie(tieni = '', maxCopie = MAX_COPIE, maxByte = MAX_BYTE): number {
    const u = indiceUso(), ch = Object.keys(u).filter(k => localStorage.getItem(k) !== null).sort((a, b) => u[a] - u[b]);
    let byte = ch.reduce((t, k) => t + (localStorage.getItem(k) || '').length * 2, 0), n = 0;
    for (const k of ch) {
      if (ch.length - n <= maxCopie && byte <= maxByte) break;
      if (k === tieni) continue;
      byte -= (localStorage.getItem(k) || '').length * 2; localStorage.removeItem(k); delete u[k]; n++;
    }
    for (const k of Object.keys(u)) if (localStorage.getItem(k) === null) delete u[k];
    scriviUso(u);
    return n;
  }
  function salvaCopia(k: string, v: string): void {
    for (let prova = 0; prova < 2; prova++) {
      try { localStorage.setItem(k, v); usaCopia(k); potaCopie(k); return; }
      catch (e) { if (prova) { console.warn('Banca: spazio esaurito, la scheda si riestrae la prossima volta', e); return; } potaCopie(k, MAX_COPIE / 2, MAX_BYTE / 2); }
    }
  }

  /** Domande di una scheda: dalla banca pubblicata, dalla copia locale o estraendole dal quiz su Drive. */
  async function scheda(pk: PkStep, m: string, micro: string, s: SchedaS): Promise<{ domande: DomB[]; immagini: Record<string, string>; fonte: string; focus?: string }> {
    const imc = Dominio.domandeDi(s.id);   // v0.52: domande importate da un pacchetto .imcpack (record 'bancaimc')
    if (imc) return { domande: applica(imc.map(d => ({ ...d })), s.id), immagini: {}, fonte: 'imcpack' };
    const B = await carica(parseInt(micro, 10), /^[CBF]-/.test(s.id) ? s.id[0] : undefined);
    if (B && B.schede[s.id]) return { domande: applica(B.domande.filter(d => d.sk === s.id), s.id), immagini: B.immagini, fonte: 'banca', focus: B.schede[s.id].focus };
    const K = 'imc-banca-' + s.id;
    try { const c = localStorage.getItem(K); if (c) { const j = JSON.parse(c); usaCopia(K); return { domande: applica(j.domande, s.id), immagini: j.immagini || {}, fonte: 'copia' }; } } catch (e) { console.warn('Banca: copia locale illeggibile', e); }
    if (!Drive.pronto) throw new Error('Questa scheda non è ancora nella banca: accedi a Google per estrarla dal quiz.');
    const html = await Drive.scaricaTesto(await Studio.idQuiz(pk, m, micro, s));
    const r = await estraiDaHtml(html, s.id);
    salvaCopia(K, JSON.stringify(r));
    return { domande: applica(r.domande, s.id), immagini: r.immagini, fonte: 'estratta' };
  }
  return { carica, scheda, estraiDaHtml, applica, nascoste, potaCopie, salvaCopia };
})();

const QuizApp = (() => {
  const L = ['A', 'B', 'C', 'D', 'E'], LIVELLI = ['Sbarramento', 'Applicativo', 'Trabocchetto', 'Problema', 'Completamento'];
  const esc = (s: any) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');   // v0.56.2: anche negli attributi
  const fmt = (s: any) => esc(s).replace(/_\{([^}]*)\}/g, '<sub>$1</sub>').replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>');
  const fmtQ = (s: string) => fmt(s).replace(/(…+|\.\.\.\.+)/g, '<span class="qz-buco">________</span>');
  const normR = (s: string) => { let t = String(s).toLowerCase(); if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); return t.replace(/\s+/g, ' ').trim().replace(/[.;:!]+$/, '').replace(/,/g, '.'); };
  function giusta(v: string, a: string[]): boolean {
    const x = normR(v); if (!x) return false;
    return a.some(r => { const y = normR(r); if (x === y) return true; if (/^-?\d+(\.\d+)?$/.test(y)) { const m = x.match(/^(-?\d+(?:\.\d+)?)\s*[a-z%/]*$/); return !!m && Number(m[1]) === Number(y); } return false; });
  }
  const mescola = <T>(a: T[]) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  interface Voce { d: DomB; ord: number[]; picked: number | string | null; ok: boolean | null; hid: number[]; avv?: string; sel?: number[]; voto?: { coperti: string[]; mancanti: string[] }; ai?: { l: string; testo?: string; errore?: string; attesa?: boolean; modello?: string };
    /** v0.54: inizio della domanda, tempo di risposta, certezza dichiarata e caso della matrice. */
    t0?: number; ms?: number; cert?: Certezza | null; caso?: CasoN; srs?: SrsN & { contrastivo: boolean; rimando: boolean };
    /** v0.64: risposta aperta in attesa di «Era giusta / Era sbagliata»; voto proposto dalla rubrica; voto cambiato dall'utente. */
    daConf?: boolean; prop?: boolean; auto?: boolean; }

  /** Registra la risposta (v0.48: nel contatore di questo dispositivo) e restituisce la funzione per annullarla. */
  function registraStat(v: Voce): () => void {
    const id = 'sq-' + v.d.id, p = Stato.prendi<StatQ>(id), dev = Privacy.idDispositivo(), giusta = !!v.ok;
    const r: StatQ = p && !p.deleted ? p : { id, type: 'statq', updatedAt: 0, sk: v.d.sk, n: 0, ok: 0, ultima: '', esito: false, c: {} };
    const esitoPrima = r.esito, ultimaPrima = r.ultima;
    const x = StatQC.mio(r, dev); x.n++; if (giusta) x.ok++; StatQC.ricalcola(r);
    r.ultima = ymd(new Date()); r.esito = giusta;
    // v0.54 (BP3 §1.2): calibrazione metacognitiva (solo se lo studente ha dichiarato la certezza)
    const neuroPrima = r.neuro ? { ...r.neuro } : undefined, logPrima = r.confidenceLog ? r.confidenceLog.slice() : undefined, autoPrima = r.auto;
    if (v.auto) r.auto = true; else delete r.auto;
    if (v.cert) {
      const t: TentativoN = { ts: new Date().toISOString(), corretto: giusta, livelloCertezza: v.cert, tempoRispostaMs: Math.max(0, Math.round(v.ms || 0)) };
      r.confidenceLog = Neuro.aggiungiTentativo(r.confidenceLog, t);
      const p = Neuro.pianifica(r.neuro, v.cert, giusta, r.ultima, Ripassi.ritenzione(r.ultima));   // blocco 3: FSRS unico
      v.srs = p; v.caso = p.ultimoCaso;
      r.neuro = { iv: p.iv, ease: p.ease, due: p.due, reps: p.reps, ultimoCaso: p.ultimoCaso, d: p.d, s: p.s, ultimo: p.ultimo };
      if (p.tag && p.tag.length) r.neuro.tag = p.tag; if (p.daConsolidare) r.neuro.daConsolidare = true;
    }
    let scelta = '';
    if (!v.ok && v.d.t === 'mcq' && typeof v.picked === 'number') { const oi = v.ord[v.picked], o = v.d.dk ? v.d.dk[oi - 1] : v.d.o![oi]; scelta = o; r.scelte = Object.assign({}, r.scelte); r.scelte[o] = (r.scelte[o] || 0) + 1; }
    Stato.salva(r, true);
    // v0.55 (BP4 Stadio 5): illusione di competenza / risposta fortunata → anticipo L3/L4 nei piani ai_neuro (0 token)
    let annullaPiani: (() => void) | null = null, annullaFatica: (() => void) | null = null, carteNuove: string[] = [];
    if (v.caso === 'illusione_competenza' || v.caso === 'lucky_guess') try { annullaPiani = PianiAI.dopoQuiz(v.d.sk, v.caso); } catch (e) { console.warn('dopoQuiz', e); }
    // v0.56 (BP5 §4.2): dopo un errore, Burnout Circuit Breaker sui piani con intensità (0 token)
    if (!giusta) try { annullaFatica = PianiAI.controllaFatica(); } catch (_) { /* il quiz non si blocca */ }
    const annulla = () => {
      const q = Stato.prendi<StatQ>(id); if (!q) return;
      const y = StatQC.mio(q, dev); y.xn++; if (giusta) y.xok++; StatQC.ricalcola(q);
      if (v.cert) { if (neuroPrima) q.neuro = neuroPrima; else delete q.neuro; if (logPrima) q.confidenceLog = logPrima; else delete q.confidenceLog; }
      q.esito = esitoPrima; q.ultima = ultimaPrima;
      if (autoPrima) q.auto = true; else delete q.auto;
      if (scelta && q.scelte && q.scelte[scelta]) { q.scelte = Object.assign({}, q.scelte); q.scelte[scelta]--; if (!q.scelte[scelta]) delete q.scelte[scelta]; }
      Stato.salva(q, true);
      // v0.57.1 (Q3): annulla anche la carta «trappola» appena creata e l'anticipo nei piani ai_neuro
      for (const c of carteNuove) Stato.elimina(c);
      if (annullaPiani) try { annullaPiani(); } catch (e) { console.warn('annulla piani', e); }
      if (annullaFatica) try { annullaFatica(); } catch (e) { console.warn('annulla fatica', e); }
    };
    // v0.37: un distrattore scelto 2 volte diventa una flashcard «trappola» (domanda → giusta + perché quella sbagliata non va)
    if (!v.ok && v.d.t === 'mcq' && typeof v.picked === 'number' && !v.d.gen) {
      const oi = v.ord[v.picked], o = v.d.dk ? v.d.dk[oi - 1] : v.d.o![oi];
      if (r.scelte && r.scelte[o] === 2) {
        const perche = v.d.ew && v.d.ew[oi - 1] ? v.d.ew[oi - 1] : '';
        const n = Carte.daErrori([{ schedaId: v.d.sk, q: testoPiano(v.d.q) + '\n\nTrappola in cui sei caduto 2 volte: «' + testoPiano(v.d.o![oi]) + '»', giusta: testoPiano(v.d.o![0]), spieg: perche ? 'Perché «' + testoPiano(v.d.o![oi]) + '» è sbagliata: ' + perche : '' }]);
        carteNuove = n;
        if (n.length) avviso('🪤 Stessa trappola per la seconda volta: aggiunta alle flashcard degli errori.', 5000);
      }
    }
    return annulla;
  }
  let toastAnnulla: Element | null = null;

  // ---- v0.54 (BP3): modalità Allenamento Neuro / Simulazione Esame ----
  type ModoQ = 'neuro' | 'esame';
  const K_MODO = 'imc-quiz-modo';
  /** Predefinita secondo il profilo cognitivo (hypercorrection attiva → neuro); la scelta dell'utente resta. */
  function modo(): ModoQ {
    try { const v = localStorage.getItem(K_MODO); if (v === 'neuro' || v === 'esame') return v; } catch (_) { /* niente */ }
    return Dominio.profilo().attivaHypercorrection === false ? 'esame' : 'neuro';
  }
  const impostaModo = (m: ModoQ) => { try { localStorage.setItem(K_MODO, m); } catch (_) { /* niente */ } };
  const NOMI_CERT: Record<Certezza, string> = { 1: 'Tiro a indovinare', 2: 'Abbastanza sicuro', 3: 'Certo al 100%' };
  const statPer = (domande: DomB[]) => { const o: Record<string, StatQ | undefined> = {}; for (const d of domande) { const s = Stato.prendi<StatQ>('sq-' + d.id); o[d.id] = s && !s.deleted ? s : undefined; } return o; };
  /** Export 1 click (BP3 §3.1): testo compatto negli appunti + file .imcpack.json. */
  async function esporta(domande: DomB[], f: 'errori' | 'illusione' | 'bloom3' | 'tutti', titolo: string, archetipo: string): Promise<number> {
    const sel = Neuro.daEsportare(domande, statPer(domande), f);
    if (!sel.length) { avviso(f === 'illusione' ? 'Nessuna illusione di competenza registrata.' : f === 'errori' ? 'Nessun errore da esportare.' : 'Nessuna domanda da esportare.'); return 0; }
    try { await navigator.clipboard.writeText(Neuro.compatto(sel)); } catch (_) { /* appunti non disponibili: resta il file */ }
    const j = Neuro.pacchetto(sel, { titolo: titolo + ' · ' + ({ errori: 'errori', illusione: 'illusioni', bloom3: 'Bloom 3-4', tutti: 'tutte' } as any)[f], archetipo, modalita: Dominio.profilo().modalita, oggi: ymd(new Date()) });
    const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(j, null, 1)], { type: 'application/json' })), download: (titolo || 'quiz').replace(/[\\/:*?"<>|]+/g, '_') + '-' + f + '.imcpack.json' }) as HTMLAnchorElement;
    document.body.appendChild(a); a.click(); a.remove();
    avviso(sel.length + ' domande: testo compatto copiato e pacchetto .imcpack scaricato.', 5000);
    return sel.length;
  }

  /** gen: Q3, esercizi generati (nessun salvataggio sulla scheda, «Rifai tutto» = numeri nuovi).
   *  info.prova (v0.63, Centro di creazione): prova della scheda prima dell'import — nessuno statq, nessuna sessione, nessuna carta. */
  async function apri(pk: PkStep, m: string, micro: string, s: SchedaS, gen?: () => DomB[], info?: { occh: string; titolo: string; chiudi?: () => void; immagini?: Record<string, string>; modo?: ModoQ; prova?: boolean }): Promise<void> {
    const prova = !!(info && info.prova);
    const v = info ? visore('✨ ' + info.titolo, info.chiudi || (() => { /* */ })) : visore((gen ? '🎲 ' : '🧩 ') + micro + (gen ? ' · esercizi nuovi' : ' · scheda ' + s.k + '/' + s.n), () => apriScheda(pk, m, micro, s));
    v.corpo.classList.add('qz');
    v.corpo.appendChild(h('div.vuoto.centro', null, 'Preparo le domande…'));
    let dati: { domande: DomB[]; immagini: Record<string, string>; fonte: string; focus?: string };
    try { dati = gen ? { domande: gen(), immagini: (info && info.immagini) || {}, fonte: 'gen' } : await Banca.scheda(pk, m, micro, s); }
    catch (e: any) { svuota(v.corpo); v.corpo.appendChild(h('div.vuoto.centro', null, String(e.message || e))); return; }
    if (!dati.domande.length) { svuota(v.corpo); v.corpo.appendChild(h('div.vuoto.centro', null, 'Nessuna domanda trovata.')); return; }
    const app = h('div.qz-app'); svuota(v.corpo);
    if (info) v.corpo.appendChild(h('div.qz-testa', null, h('div.qz-occhiello', null, info.occh), h('h1.qz-h1', null, info.titolo)));
    else v.corpo.appendChild(h('div.qz-testa', null, h('div.qz-occhiello', null, (mat0(pk, m).nome || m) + ' · ' + micro + (gen ? ' · esercizi generati' : ' · scheda ' + s.k + ' di ' + s.n)), h('h1.qz-h1', null, gen ? 'Esercizi nuovi: ' + (Generatori.titoloMicro(pk, m, micro) || s.titolo) : s.titolo)));
    v.corpo.appendChild(app);
    let P: Voce[] = [], cur = 0, ripasso = false, apertaX = false, finito = false;
    // v0.54 (BP3): certezza prima della risposta (modo neuro), tempi per la fatica attentiva (zero token)
    let mq: ModoQ = info?.modo || modo(), storia: { ms: number; ok: boolean }[] = [], faticaOn = false, faticaZitta = 0;
    const archM = Dominio.archetipoMateria(m);
    // v0.52 (BP2): sequenza (ordine da ricostruire), abbinamento (coppie) e risposta aperta valutata con una rubrica locale
    const NOMI_TIPO: Record<string, string> = { mcq: 'Risposta multipla', fill: 'A completamento', sequenza: 'Metti in ordine', abbinamento: 'Abbinamento', risposta_aperta_rubrica: 'Risposta aperta' };
    const codice = (d: DomB) => d.t === 'risposta_aperta_rubrica' && !!d.linguaCodice;
    const nuovoTipo = (d: DomB) => d.t === 'sequenza' || d.t === 'abbinamento' || d.t === 'risposta_aperta_rubrica';
    function ordineIniziale(d: DomB): number[] {
      if (d.t === 'mcq') return mescola(d.o!.map((_, k) => k));
      const n = d.t === 'sequenza' ? (d.sequenzaOk || []).length : d.t === 'abbinamento' ? (d.coppieOk || []).length : 0;
      let o = mescola(Array.from({ length: n }, (_, k) => k));
      for (let t = 0; t < 5 && n > 1 && o.every((v, k) => v === k); t++) o = mescola(o);   // mai già in ordine
      return o;
    }
    const leggiLista = (v: any): string[] => { try { const j = JSON.parse(String(v)); return Array.isArray(j) ? j : []; } catch (_) { return []; } };
    function areaNuoviTipi(x: Voce, a: boolean): string {
      const d = x.d;
      if (d.t === 'sequenza') {
        const seq = d.sequenzaOk || [], sel = x.sel || [];
        if (a) { const sc = leggiLista(x.picked);
          return '<ol class="qz-seq">' + sc.map((t, k) => '<li class="' + (t === seq[k] ? 'ok' : 'ko') + '">' + fmt(t) + (t === seq[k] ? '' : ' <span class="tenue piccolo">(al posto ' + (k + 1) + ' va «' + fmt(seq[k]) + '»)</span>') + '</li>').join('') + '</ol>'; }
        return '<ol class="qz-seq">' + sel.map(i => '<li>' + fmt(seq[i]) + '</li>').join('') + '</ol>'
          + '<div class="qz-opz">' + x.ord.filter(i => !sel.includes(i)).map(i => '<button type="button" class="qz-opz-b" data-seq="' + i + '"><span>' + fmt(seq[i]) + '</span></button>').join('') + '</div>'
          + (sel.length ? '<div class="chips"><button type="button" class="chip" data-az="seqreset">↺ Ricomincia l\'ordine</button></div>' : '<p class="tenue piccolo">Tocca gli elementi nell\'ordine giusto.</p>');
      }
      if (d.t === 'abbinamento') {
        const cp = d.coppieOk || [], sc = a ? leggiLista(x.picked) : [];
        return '<form class="qz-abb" autocomplete="off">' + cp.map((c, k) => '<label class="qz-abb-r"><span>' + fmt(c[0]) + '</span>'
          + (a ? '<span class="' + (sc[k] === c[1] ? 'ok' : 'ko') + '">' + fmt(sc[k] || '—') + (sc[k] === c[1] ? '' : ' → ' + fmt(c[1])) + '</span>'
            : '<select data-abb="' + k + '"><option value="">Scegli…</option>' + x.ord.map(i => '<option value="' + esc(cp[i][1]) + '">' + esc(cp[i][1]) + '</option>').join('') + '</select>') + '</label>').join('')
          + (a ? '' : '<button type="submit" class="btn">Verifica</button>') + '</form>';
      }
      // v0.64: codice in monospazio senza correttore; dopo «Verifica» la rubrica propone il voto e decide l'utente
      const cod = codice(d), chiusa = a || !!x.daConf, ta = cod ? ' class="qz-codice' + (a ? ' ' + (x.ok ? 'ok' : 'ko') : '') + '" spellcheck="false" autocapitalize="off" autocorrect="off" placeholder="Scrivi il codice (' + esc(d.linguaCodice) + ')"'
        : ' placeholder="Scrivi la tua risposta con parole tue"' + (a ? ' class="' + (x.ok ? 'ok' : 'ko') + '"' : '');
      let o = '<form class="qz-fill qz-rub" autocomplete="off"><textarea id="qz-ans" rows="' + (cod ? 8 : 5) + '"' + ta + (chiusa ? ' disabled' : '') + '>' + (chiusa ? esc(x.picked) : '') + '</textarea>'
        + (chiusa ? '' : '<button type="submit" class="btn">Verifica</button><p class="tenue piccolo">Valutata sui punti chiave, senza AI: poi confermi tu il voto.</p>') + '</form>';
      if (x.daConf && x.voto) { const k = x.voto.coperti.length, n = k + x.voto.mancanti.length;
        o += '<div class="qz-box qz-voto" role="group" aria-label="Conferma il voto"><p><b>Coperti ' + k + '/' + n + ' punti chiave</b> · proposta: ' + (x.prop ? 'giusta' : 'sbagliata') + '</p>'
          + (x.voto.mancanti.length ? '<p class="tenue piccolo">Non trovati: ' + x.voto.mancanti.map(fmt).join('; ') + '</p>' : '')
          + '<p class="tenue piccolo">Confronta con la risposta modello e decidi tu:</p><p class="' + (cod ? 'qz-codice' : '') + '">' + (cod ? esc(d.show) : fmt(d.show)) + '</p>'
          + '<div class="chips"><button type="button" class="chip' + (x.prop ? ' on' : '') + '" data-voto="1">✓ Era giusta</button><button type="button" class="chip' + (x.prop ? '' : ' on') + '" data-voto="0">✗ Era sbagliata</button></div></div>'; }
      return o;
    }
    const annulli = new Map<Voce, () => void>();
    let registrato = false;
    const nuovo = (idx: number[], rip: boolean) => {
      P = idx.map(i => { const d = dati.domande[i]; return { d, ord: ordineIniziale(d), picked: null, ok: null, hid: [], sel: [], cert: null }; });
      annulli.clear(); registrato = false;
      storia = []; faticaOn = false; faticaZitta = 0;
      cur = 0; ripasso = rip; apertaX = false; finito = false; disegnaQ(); v.corpo.scrollTop = 0;
    };
    const fatta = (x: Voce) => x.picked !== null && !x.daConf;
    const punti = () => P.filter(x => x.ok).length;
    const corretta = (x: Voce) => x.ord.indexOf(0);
    const passi = (e: string | string[]) => '<ol class="qz-passi">' + (Array.isArray(e) ? e : [e]).map(t => { const m2 = String(t).match(/^([^:]{2,80}):\s([\s\S]*)$/); return '<li>' + (m2 ? '<b>' + fmt(m2[1]) + ':</b> ' + fmt(m2[2]) : fmt(t)) + '</li>'; }).join('') + '</ol>';
    /** v0.59.2: confutazioni per opzione nell'ordine di o[1..3]; i quiz da Drive/Gemini le hanno in spiegazioneDistrattori, non in ew. */
    const ewDi = (d: DomB): string[] => {
      if (d.ew && d.ew.length) return d.ew;
      const sd = d.spiegazioneDistrattori;
      if (!sd || d.t !== 'mcq') return [];
      return Array.isArray(sd) ? sd.slice(0, 3).map(String) : [1, 2, 3].map(k => sd[k] || '');
    };
    /** v0.59.2: spiegazione lunga a sezioni (COSA CHIEDE / CONCETTO… / IN SINTESI) → un passo per sezione. Le opzioni sono
     *  mescolate, quindi con le confutazioni per opzione le sezioni con le lettere A–D originali vengono omesse (le lettere a video sono altre). */
    const passiDi = (d: DomB, conConfutazioni: boolean): string => {
      const sez = typeof d.e === 'string' ? sezioniSpiegazione(d.e) : [];
      if (sez.length < 2) return passi(d.e);
      const tieni = sez.filter(x => !(conConfutazioni && /^(RISPOSTA ESATTA|PERCH)/.test(x.etichetta)));
      return passi(tieni.map(x => x.etichetta ? x.etichetta.charAt(0) + x.etichetta.slice(1).toLowerCase() + ': ' + x.testo : x.testo));
    };
    const spiegFonti = (d: DomB) => '<div class="qz-box"><span class="qz-etich">Spiegazione dalle fonti</span>'
      + (d.cit || []).map(c => '<blockquote>«' + esc(c.t) + '»<span class="qz-chi">' + esc(c.f) + (c.l ? ' · <a href="' + esc(c.l) + '" target="_blank" rel="noopener">apri la pagina</a>' : '') + '</span></blockquote>').join('')
      + (d.cl ? '<div class="qz-mia"><b>Spiegazione di Claude</b> ' + esc(d.cl) + '</div>' : '') + (!d.cit && !d.cl ? '<p>' + fmt(Array.isArray(d.e) ? d.e.join(' ') : d.e) + '</p>' : '') + '</div>';
    function correzione(x: Voce): string {
      const d = x.d, ew = ewDi(d), mc = d.t === 'mcq';
      let s2 = bannerCaso(x) + (x.avv ? '<div class="qz-avviso">' + fmt(x.avv) + '</div>' : '') + '<div class="qz-box" id="qz-why"><span class="qz-etich">Correzione passo-passo</span><p class="qz-verdetto ' + (x.ok ? 'ok' : 'ko') + '">'
        + (x.ok ? 'Corretto.' : mc ? 'Non corretto: la risposta giusta è ' + L[corretta(x)] + '.' : 'Non corretto: la risposta attesa è «' + fmt(d.show) + '».') + '</p>' + passiDi(d, mc && ew.some(Boolean));
      if (!x.ok && mc && typeof x.picked === 'number' && ew[x.ord[x.picked] - 1]) s2 += '<div class="qz-perche"><b>Perché la tua risposta è sbagliata</b><p>Hai scelto «' + fmt(d.o![x.ord[x.picked]]) + '»: ' + fmt(ew[x.ord[x.picked] - 1]) + '</p></div>';
      if (!x.ok && d.erroreTipico) s2 += '<div class="qz-perche"><b>Errore tipico</b><p>' + fmt(d.erroreTipico) + '</p></div>';
      if (x.voto) s2 += '<div class="qz-perche"><b>Punti chiave: ' + x.voto.coperti.length + ' su ' + (x.voto.coperti.length + x.voto.mancanti.length) + '</b>' + (x.voto.mancanti.length ? '<p>Mancano: ' + x.voto.mancanti.map(fmt).join('; ') + '</p>' : '') + (x.auto ? '<p class="tenue piccolo">Voto deciso da te: la rubrica proponeva «' + (x.prop ? 'giusta' : 'sbagliata') + '».</p>' : '') + '</div>';
      if (!x.ok && mc) { /* già sopra */ } else if (!x.ok && !mc && ew[0]) s2 += '<div class="qz-perche"><b>Perché la tua risposta è sbagliata</b><p>' + (x.picked && (d.t === 'fill' || d.t === 'risposta_aperta_rubrica') ? 'Hai scritto «' + esc(x.picked) + '». ' : '') + fmt(ew[0]) + '</p></div>';
      const tua = !x.ok && typeof x.picked === 'number' ? x.ord[x.picked] : -1;   // v0.59.2: anche dopo un errore, le confutazioni delle ALTRE opzioni
      if (mc && ew.some(Boolean)) s2 += '<details class="qz-altre"><summary>Perché le altre opzioni sono sbagliate</summary>' + ew.map((t, k) => ({ t, k, pos: x.ord.indexOf(k + 1) })).filter(z => z.t && z.k + 1 !== tua).sort((a, b) => a.pos - b.pos)
        .map(z => '<p><b>' + L[z.pos] + ') «' + fmt(d.o![z.k + 1]) + '»</b> — ' + fmt(z.t) + '</p>').join('') + '</details>';
      return s2 + '</div>';
    }
    /** v0.54 (BP3 §1.2): esito della matrice certezza × correttezza; per l'illusione il confronto è obbligatorio. */
    function bannerCaso(x: Voce): string {
      if (!x.caso || x.caso === 'standard') return '';
      const d = x.d, mc = d.t === 'mcq', oi = mc && typeof x.picked === 'number' ? x.ord[x.picked] : null;
      const giustaT = mc ? d.o![0] : String(d.show || (d.a || [''])[0]), tuaT = oi != null ? d.o![oi] : String(x.picked || '');
      const rif = d.sourceRef ? [d.sourceRef.libro, d.sourceRef.capitolo && 'cap. ' + d.sourceRef.capitolo, d.sourceRef.pagina && 'p. ' + d.sourceRef.pagina].filter(Boolean).join(', ') : '';
      const dove = rif || d.r || Neuro.stepDi(d) || '';
      if (x.caso === 'illusione_competenza') {
        const l1 = Neuro.prontaL1(d, oi), tipo = oi != null ? Neuro.tipoDistrattore(d, oi) : null;
        return '<div class="qz-neuro ko"><b>⚠️ Illusione di competenza</b> — eri certo, ma la risposta è sbagliata. La rivedrai già oggi.'
          + '<div class="qz-contrasto"><p><span class="qz-tag">La tua</span> ' + fmt(tuaT) + '</p><p><span class="qz-tag">Corretta</span> ' + fmt(giustaT) + '</p>'
          + (tipo ? '<p class="tenue piccolo">Tipo di trappola: ' + esc(Neuro.NOMI_DISTR[tipo]) + '</p>' : '')
          + (l1 ? '<p>' + fmt(l1) + '</p>' : '<p class="tenue piccolo">Confronta i due enunciati: cosa cambia? Poi chiedi «🎯 Perché ho sbagliato».</p>') + '</div></div>';
      }
      if (x.caso === 'lucky_guess') return '<div class="qz-neuro">🍀 <b>Risposta fortunata</b> — giusta ma tirata a indovinare: non la considero imparata, torna entro domani.</div>';
      if (x.caso === 'padronanza') return '<div class="qz-neuro ok">🎯 <b>Padronanza</b> — certa e corretta: il prossimo ripasso si allontana (×1,25).</div>';
      return '<div class="qz-neuro">📌 <b>Lacuna nota</b> — sapevi di non saperlo: ripasso domani' + (dove ? '. Torna alla teoria: <b>' + esc(dove) + '</b>' : ' e rileggi la scheda di teoria') + '.</div>';
    }
    function riquadroAI(x: Voce): string {
      const nessunaAI = Dominio.senzaAI();   // v0.52: modalità «100% senza AI» → solo la spiegazione breve locale (se c'è)
      if (nessunaAI && !Locale.spiegazioneBreve(x.d.e)) return '';
      const a = x.ai, b = (l: string, n: string) => '<button type="button" class="chip' + (a && a.l === l ? ' on' : '') + '" data-ai="' + l + '">' + n + '</button>';
      let o = '';
      if (a) o = a.attesa ? '<p class="tenue">Genero la spiegazione…</p>' : a.errore ? '<p class="tenue">⚠️ ' + esc(a.errore) + '</p>'
        : '<div class="qz-ai-testo">' + esc(a.testo) + '</div><div class="qz-ai-piede"><span>' + esc(a.modello || '') + '</span><button type="button" class="chip" data-ai="' + a.l + '" data-forza="1">↻ Rigenera</button></div>';
      return '<div class="qz-box qz-ai"><span class="qz-etich">✨ Spiegazione AI</span><div class="chips">' + (!x.ok && x.picked !== null ? b('perche', '🎯 Perché ho sbagliato') : '') + b('breve', 'Breve') + (nessunaAI ? '' : b('media', 'Media') + b('dettagliata', 'Dettagliata')) + '</div>' + (nessunaAI ? o.replace(/<button[^>]*data-forza[^>]*>[^<]*<\/button>/, '') : o) + '</div>';
    }
    function disegnaQ(): void {
      if (finito) { risultato(); return; }
      const x = P[cur], d = x.d, a = fatta(x), mc = d.t === 'mcq';
      if (!a && !x.t0) x.t0 = Date.now();
      const neuroQ = mq === 'neuro';
      let s2 = (faticaOn ? '<div class="qz-neuro qz-fatica" role="status">😮‍💨 ' + esc(Neuro.TESTO_FATICA) + '<div class="chips"><button type="button" class="chip" data-az="pausa">⏸ Pausa 3 minuti</button><button type="button" class="chip" data-az="continua">Continua</button><button type="button" class="chip" data-az="chiudisess">Chiudi la sessione</button></div></div>' : '')
        + '<div class="qz-metro" style="--n:' + P.length + '">' + P.map((y, k) => '<span class="' + (y.ok === null ? (k === cur ? 'ora' : '') : y.ok ? 'ok' : 'ko') + '"></span>').join('') + '</div>'
        + '<div class="qz-stat"><span>Domanda <b>' + (cur + 1) + '</b> di ' + P.length + (ripasso ? ' · ripasso errori' : '') + '</span><span><button type="button" class="chip piccolo" data-az="modo" title="Cambia modalità">' + (neuroQ ? '🧠 Allenamento neuro' : '📝 Simulazione esame') + '</button> Punteggio <b>' + punti() + '</b></span></div>'
        + '<section class="qz-carta"><div class="qz-qtesta"><span class="qz-liv lv-' + esc(d.lv) + '">' + esc(d.lv) + '</span><span>' + (NOMI_TIPO[d.t] || NOMI_TIPO.fill) + '</span></div>';
      for (const g of d.img || []) if (dati.immagini[g.i]) s2 += '<figure class="qz-fig"><button type="button" class="qz-zoom-b" data-zoom="' + esc(g.i) + '" aria-label="Ingrandisci immagine">' + svgSicuro(dati.immagini[g.i]) + '</button><figcaption>' + esc(g.cap) + (g.f ? ' · ' + esc(g.f) : '') + '</figcaption></figure>';
      s2 += '<p class="qz-domanda">' + (d.t === 'fill' ? fmtQ(d.q) : fmt(d.q)) + '</p><div class="chips">';
      if (mc) { const rest = 2 - x.hid.length; s2 += '<button type="button" class="chip" data-az="aiuto"' + (a || rest <= 0 ? ' disabled' : '') + '>💡 Suggerimento (' + rest + ')</button>'; }
      s2 += '<button type="button" class="chip' + (apertaX ? ' on' : '') + '" data-az="fonti">📖 Spiegazione</button>' + (d.gen || nuovoTipo(d) ? '' : '<button type="button" class="chip" data-az="modifica">✏️ Modifica</button>') + (d.mod ? '<span class="qz-mod">modificata</span>' : '') + '</div>';
      if (apertaX) s2 += spiegFonti(d);
      if (neuroQ && !a) s2 += '<div class="qz-cert" role="group" aria-label="Quanto sei sicuro?"><span class="tenue piccolo">Quanto sei sicuro? (tasti 1–3)</span><div class="chips">'
        + ([1, 2, 3] as Certezza[]).map(c => '<button type="button" class="chip' + (x.cert === c ? ' on' : '') + '" data-cert="' + c + '">' + c + ' · ' + NOMI_CERT[c] + '</button>').join('') + '</div></div>';
      if (mc) {
        s2 += '<div class="qz-opz">' + x.ord.map((oi, k) => {
          let c = 'qz-opz-b', tag = ''; const off = x.hid.includes(k);
          if (a) { if (oi === 0) { c += ' ok'; tag = '<span class="qz-tag">Risposta corretta</span>'; } else if (k === x.picked) { c += ' ko'; tag = '<span class="qz-tag">La tua risposta</span>'; } else c += ' spento'; }
          if (off && !(a && oi === 0)) c += ' escluso';
          return '<button type="button" class="' + c + '" data-k="' + k + '"' + (a || off ? ' disabled' : '') + '><span class="qz-lett">' + L[k] + '</span><span>' + fmt(d.o![oi]) + tag + '</span></button>';
        }).join('') + '</div>';
      } else if (nuovoTipo(d)) s2 += areaNuoviTipi(x, a);
      else s2 += '<form class="qz-fill" autocomplete="off"><input id="qz-ans" type="text" enterkeyhint="done" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="La tua risposta"' + (a ? ' disabled class="' + (x.ok ? 'ok' : 'ko') + '" value="' + esc(x.picked) + '"' : '') + '>' + (a ? '' : '<button type="submit" class="btn">Verifica</button><p class="tenue piccolo">Maiuscole e accenti non contano.</p>') + '</form>';
      if (a) s2 += correzione(x) + riquadroAI(x);
      const ultima = cur === P.length - 1;
      s2 += '<div class="qz-nav"><button type="button" class="btn neutro" data-az="prec"' + (cur === 0 ? ' disabled' : '') + '>◀ Indietro</button><button type="button" class="btn' + (a ? '' : ' neutro') + '" data-az="avanti">' + (ultima ? 'Vedi il risultato' : a ? 'Avanti ▶' : 'Salta ▶') + '</button></div></section>';
      app.innerHTML = s2;
      if (!a && d.t === 'fill') { const i = app.querySelector('#qz-ans') as HTMLInputElement; if (i && matchMedia('(hover:hover)').matches) i.focus({ preventScroll: true }); }
    }
    function rispondi(val: number | string): void {
      const x = P[cur]; if (fatta(x) || x.daConf) return;
      if (mq === 'neuro' && !x.cert) { avviso('Prima dimmi quanto sei sicuro (1, 2 o 3).'); const c = app.querySelector('.qz-cert'); if (c) c.scrollIntoView({ block: 'nearest' }); return; }
      if (mq !== 'neuro') x.cert = null;
      x.ms = x.t0 ? Date.now() - x.t0 : 0;
      if (typeof val === 'number') { x.picked = val; x.ok = x.ord[val] === 0; }
      else {
        if (!normR(val)) { avviso('Scrivi una risposta.'); return; }
        const d = x.d; x.picked = val.trim();
        if (d.t === 'sequenza') { const sc = leggiLista(val); x.ok = sc.length === (d.sequenzaOk || []).length && sc.every((t, k) => t === d.sequenzaOk![k]); }
        else if (d.t === 'abbinamento') { const sc = leggiLista(val); x.ok = (d.coppieOk || []).every((c, k) => sc[k] === c[1]); }
        else if (d.t === 'risposta_aperta_rubrica') {   // v0.64: proposta della rubrica; il voto lo conferma l'utente (confermaVoto)
          const r = Locale.rubrica(val, d.rubricaPunti || []); x.voto = { coperti: r.coperti, mancanti: r.mancanti }; x.prop = r.punteggio >= 0.6; x.daConf = true; x.ok = null;
          disegnaQ(); return;
        }
        else x.ok = giusta(val, d.a || []);
      }
      chiudi(x);
    }
    /** v0.64: voto confermato → FSRS e statq; auto:true solo se diverso da quello proposto. */
    function confermaVoto(x: Voce, ok: boolean): void {
      if (!x.daConf) return;
      x.daConf = false; x.ok = ok; x.auto = ok !== x.prop;
      chiudi(x);
    }
    function chiudi(x: Voce): void {
      const annulla = prova ? null : registraStat(x);
      if (annulla) annulli.set(x, annulla);
      // v0.54 (BP3 §1.3): fatica attentiva — banner non bloccante, al massimo una volta ogni 5 risposte
      storia.push({ ms: x.ms || 0, ok: !!x.ok });
      if (faticaZitta > 0) faticaZitta--;
      else if (Neuro.fatica(storia.map(z => z.ms), storia.map(z => z.ok)).allarme) { faticaOn = true; faticaZitta = 5; }
      // v0.48: annulla la risposta (tocco sbagliato) per 8 s; un solo avviso alla volta
      if (toastAnnulla) toastAnnulla.remove();
      if (annulla) avviso('Risposta registrata · tocca per annullare', 8000, () => { if (finito || !annulli.delete(x)) return; annulla(); x.picked = null; x.ok = null; x.avv = undefined; x.sel = []; x.voto = undefined; x.daConf = false; x.prop = undefined; x.auto = undefined; x.caso = undefined; x.srs = undefined; x.t0 = Date.now(); storia.pop(); disegnaQ(); avviso('Risposta annullata: puoi rispondere di nuovo.'); });
      toastAnnulla = document.querySelector('#avvisi .avviso:last-child');
      if (!x.ok) { const dk = x.d.dk && typeof x.picked === 'number' && x.ord[x.picked] > 0 ? x.d.dk[x.ord[x.picked] - 1] : null; x.avv = Regole.avvisoRisposta(x.d, dk);
        // v0.52 (BP2 §3): diagnostica locale secondo l'archetipo della materia (zero token)
        if (x.d.t === 'mcq' || x.d.t === 'fill') {
          const sc = typeof x.picked === 'number' ? x.d.o![x.ord[x.picked]] : String(x.picked || ''), gi = x.d.t === 'mcq' ? x.d.o![0] : (x.d.a || [x.d.show || ''])[0];
          const dg = Locale.diagnosticaPerArchetipo(x.d.archetipo || Dominio.archetipoMateria(m), { scelta: sc, corretta: gi, domanda: x.d.q, opzioni: x.d.o });
          if (dg && dg !== x.avv) x.avv = x.avv ? x.avv + ' · ' + dg : dg;
        }
      }
      disegnaQ();
      const w = app.querySelector('#qz-why'); if (w) w.scrollIntoView({ block: 'nearest' });
    }
    async function chiediAI(l: string, forza: boolean): Promise<void> {
      const x = P[cur], d = x.d, mc = d.t === 'mcq';
      const dd: DatiDomanda = { q: d.q, opts: mc ? x.ord.map(i => d.o![i]) : [], corretta: mc ? d.o![0] : (d.show || (d.a || [''])[0]),
        scelta: x.ok ? '' : mc ? (typeof x.picked === 'number' ? d.o![x.ord[x.picked]] : '') : String(x.picked || ''),
        cit: (d.cit || []).map(c => c.t).join('\n'), passi: (Array.isArray(d.e) ? d.e : [d.e]).join(' '), titolo: (mat0(pk, m).nome || m) + ' — ' + s.titolo,
        archetipo: d.archetipo || Dominio.archetipoMateria(m), nomeMateria: Stato.prendi<MateriaRec>('mat-' + m) ? undefined : (mat0(pk, m).nome || nomeMateria(m)) };
      const id = Spiega.idDi(dd, l), c = Stato.prendi<Spiegazione>(id);
      // v0.54 (BP3 §2): imbuto AI — livello 0 locale → livello 1 spiegazione già pronta / salvata → livello 2 micro-chiamata (≤350 token)
      if (l === 'perche' || l === 'breve') {
        const oi = mc && typeof x.picked === 'number' ? x.ord[x.picked] : null;
        x.ai = { l, attesa: true }; disegnaQ();
        try {
          const r = await Neuro.imbuto(d, l === 'perche' ? oi : null, {
            forza, senzaAI: Dominio.senzaAI(),
            locale: () => l === 'breve' ? Locale.spiegazioneBreve(d.e) : null,
            cache: () => c && !c.deleted ? c.testo : null,
            micro: async () => {
              const tipo = oi != null ? Neuro.tipoDistrattore(d, oi) : null;
              const p = Neuro.promptMicro({ q: testoPiano(d.q), corretta: testoPiano(dd.corretta), scelta: testoPiano(dd.scelta || ''), archetipo: dd.archetipo, tono: Dominio.profilo().tonoSpiegazioneAI, tipoDistr: tipo });
              const g = await IA.testo([{ role: 'user', content: p }], 'micro', { maxOut: Neuro.MAX_TOKEN_MICRO, temp: 0.3, archetipo: dd.archetipo });
              Stato.salva({ id, type: 'spiegazione', updatedAt: 0, q: dd.q, giusta: dd.corretta, livello: l, testo: g.testo, modello: g.modello, quiz: dd.titolo } as Spiegazione, true);
              return { testo: g.testo, modello: g.modello };
            },
          });
          x.ai = r ? { l, testo: r.testo, modello: r.modello + (r.livello < 2 ? '' : ' · micro') } : { l, errore: 'Nessuna spiegazione pronta e AI disattivata.' };
        } catch (e: any) { x.ai = { l, errore: String(e.message || e) }; }
        if (P[cur] === x) disegnaQ();
        return;
      }
      if (c && !c.deleted && !forza) { x.ai = { l, testo: c.testo, modello: c.modello + ' · salvata' }; disegnaQ(); return; }
      // v0.43 memoria: se dopo una spiegazione più corta ne chiede una più lunga, la corta non bastava → lezione
      if (x.ai && x.ai.testo && (l === 'dettagliata' || (l === 'media' && x.ai.l === 'breve')) && x.ai.l !== l) MemoriaIA.nota('spiegazioni', 'lezione', 'piu-passaggi-' + norm(mat0(pk, m).nome || m), 'In ' + (mat0(pk, m).nome || m) + ' lo studente chiede spesso più dettagli: anche nelle spiegazioni brevi non saltare i passaggi intermedi.');
      x.ai = { l, attesa: true }; disegnaQ();
      try {
        const g = await Spiega.genera(dd, l);
        Stato.salva({ id, type: 'spiegazione', updatedAt: 0, q: dd.q, giusta: dd.corretta, livello: l, testo: g.testo, modello: g.modello, quiz: dd.titolo } as Spiegazione, true);
        x.ai = { l, testo: g.testo, modello: g.modello };
      } catch (e: any) { x.ai = { l, errore: String(e.message || e) }; }
      if (P[cur] === x) disegnaQ();
    }
    function risultato(): void {
      const tot = P.length, ok = punti(), pct = Math.round(ok * 100 / tot);
      const liv: [string, number, number][] = LIVELLI.map(lv => { const q2 = P.filter(x => x.d.lv === lv); return [lv, q2.filter(x => x.ok).length, q2.length] as [string, number, number]; }).filter(z => z[2]);
      let deb: [string, number, number] | null = null;
      for (const z of liv) { const err = z[2] - z[1]; if (err && (!deb || err / z[2] > (deb[2] - deb[1]) / deb[2])) deb = z; }
      const sb = P.filter(x => !x.ok);
      let s2 = '<section class="qz-carta"><div class="qz-punti">' + ok + '<small> / ' + tot + '</small></div><div class="tenue">' + pct + '% di risposte corrette</div>'
        + '<div class="qz-livelli">' + liv.map(z => '<div class="qz-lvriga"><span>' + z[0] + '</span><span class="qz-barra"><span style="width:' + Math.round(z[1] * 100 / z[2]) + '%"></span></span><span>' + z[1] + '/' + z[2] + '</span></div>').join('') + '</div>'
        + (deb ? '<p><b>Punto debole:</b> ' + deb[0] + '</p>' : '<p><b>Nessun punto debole.</b></p>');
      // v0.54 (BP3 §1.2): illusioni di competenza della sessione, in testa
      const ill = P.filter(x => x.caso === 'illusione_competenza'), fort = P.filter(x => x.caso === 'lucky_guess').length;
      if (ill.length) s2 += '<div class="qz-neuro ko"><b>⚠️ Illusioni di competenza: ' + ill.length + '</b> — eri certo ma era sbagliato. Tornano già oggi in cima al ripasso.<ul>' + ill.map(x => '<li>' + fmt(testoPiano(x.d.q).slice(0, 140)) + '</li>').join('') + '</ul></div>';
      if (fort) s2 += '<p class="tenue piccolo">🍀 ' + fort + (fort === 1 ? ' risposta fortunata' : ' risposte fortunate') + ': da consolidare entro domani.</p>';
      if (sb.length) s2 += '<h3>Da rivedere (' + sb.length + ')</h3>' + sb.map(x => '<details class="qz-altre"><summary>' + fmt(x.d.q) + '</summary><p><b>Risposta corretta:</b> ' + fmt(x.d.t === 'mcq' ? x.d.o![0] : x.d.show) + '</p>' + passi(x.d.e) + (x.d.r ? '<p class="tenue piccolo">Ripassa: ' + esc(x.d.r) + '</p>' : '') + '</details>').join('');
      s2 += '<div class="chips qz-export"><span class="tenue piccolo">Esporta (appunti + .imcpack):</span><button type="button" class="chip" data-exp="errori">Errori</button><button type="button" class="chip" data-exp="illusione">Illusioni</button><button type="button" class="chip" data-exp="bloom3">Bloom ≥ 3</button></div>';
      s2 += '<div class="qz-nav">' + (sb.length ? '<button type="button" class="btn" data-az="errori">Rifai solo gli errori</button>' : '') + '<button type="button" class="btn neutro" data-az="tutto">' + (gen && !prova ? '🎲 Numeri nuovi' : 'Rifai tutto') + '</button></div>'
        + (gen ? '' : '<div class="chips"><button type="button" class="chip" data-az="nuova">➕ Aggiungi una domanda</button>' + (Banca.nascoste(s.id).length ? '<button type="button" class="chip" data-az="ripristina">↩︎ Ripristina le domande nascoste (' + Banca.nascoste(s.id).length + ')</button>' : '') + '</div>') + '</section>';
      app.innerHTML = s2; v.corpo.scrollTop = 0;
      const r: RisultatoQuiz = { domandeSvolte: P.map(x => x.d.q), imc: 'quiz-risultato', pct, giuste: ok, totale: tot, livelli: liv, debole: deb ? deb[0] : null, errori: ripasso,
        sbagliate: sb.map(x => [x.d.q, x.d.t === 'mcq' ? x.d.o![0] : String(x.d.show || ''), (Array.isArray(x.d.e) ? x.d.e.join(' ') : x.d.e)] as [string, string, string]) };
      // blocco 5: dettagli per il riquadro «Consolida»; blocco 6: tutte le risposte, per la padronanza per concetto (esercizi a numeri esclusi)
      r.titoloScheda = s.titolo; if (dati.focus) r.focus = dati.focus;
      r.dettagli = P.filter(x => !x.d.gen && x.ok != null).map(x => {
        const oi = !x.ok && x.d.t === 'mcq' && typeof x.picked === 'number' ? x.ord[x.picked] : 0;
        return { id: x.d.id, q: x.d.q, giusta: x.d.t === 'mcq' ? x.d.o![0] : String(x.d.show || ''), spieg: Array.isArray(x.d.e) ? x.d.e.join(' ') : x.d.e, ok: !!x.ok, caso: x.caso,
          ...(x.d.concetto ? { concetto: x.d.concetto } : {}),
          ...(oi ? { scelta: x.d.o![oi], perche: ewDi(x.d)[oi - 1] || undefined } : {}) };
      });
      if (registrato) return;
      registrato = true;
      if (!gen && !prova) Cattura.salva(s.id, r);
      if (gen && !prova && Stato.prendi<QCreato>(s.id)?.type === 'qcreato') {
        toastAnnulla?.remove();
        const ritira = Array.from(annulli.values()).reverse();
        Cattura.salva(s.id, r, () => ritira.forEach(fn => fn()));
      }
    }
    app.addEventListener('click', ev => {
      const b = (ev.target as Element).closest('button') as HTMLButtonElement | null; if (!b || b.disabled) return;
      if (b.dataset.zoom) {
        const z = h('div.qz-zoom', { onclick: () => z.remove() }); z.innerHTML = '<div class="qz-zoom-box">' + svgSicuro(dati.immagini[b.dataset.zoom] || '') + '</div><div class="qz-zoom-x">Tocca per chiudere</div>';
        v.corpo.appendChild(z); return;
      }
      if (b.dataset.k != null) { rispondi(parseInt(b.dataset.k, 10)); return; }
      if (b.dataset.seq != null) {   // v0.52: sequenza, un tocco per elemento; completata → si verifica
        const x = P[cur], seq = x.d.sequenzaOk || []; x.sel = (x.sel || []).concat(parseInt(b.dataset.seq, 10));
        if (x.sel.length >= seq.length) rispondi(JSON.stringify(x.sel.map(i => seq[i]))); else disegnaQ();
        return;
      }
      if (b.dataset.voto) { confermaVoto(P[cur], b.dataset.voto === '1'); return; }
      if (b.dataset.ai) { chiediAI(b.dataset.ai, !!b.dataset.forza); return; }
      if (b.dataset.cert) { const x = P[cur]; if (!fatta(x)) { x.cert = +b.dataset.cert as Certezza; disegnaQ(); } return; }
      if (b.dataset.exp) { esporta(dati.domande, b.dataset.exp as any, info ? info.titolo : s.titolo, archM); return; }
      const az = b.dataset.az, x = P[cur];
      if (az === 'aiuto') { const lib = x.ord.map((oi, k) => oi !== 0 && !x.hid.includes(k) ? k : -1).filter(k => k >= 0); if (lib.length) x.hid.push(lib[Math.floor(Math.random() * lib.length)]); disegnaQ(); }
      else if (az === 'fonti') { apertaX = !apertaX; disegnaQ(); }
      else if (az === 'modo') { mq = mq === 'neuro' ? 'esame' : 'neuro'; impostaModo(mq); avviso(mq === 'neuro' ? '🧠 Allenamento neuro: prima di rispondere dici quanto sei sicuro.' : '📝 Simulazione esame: niente certezza, come all\'esame.'); disegnaQ(); }
      else if (az === 'continua') { faticaOn = false; disegnaQ(); }
      else if (az === 'pausa') { faticaOn = false; disegnaQ(); avviso('⏸ Pausa: alzati, bevi un bicchiere d\'acqua, guarda lontano. Riprendi tra 3 minuti.', 8000); }
      else if (az === 'chiudisess') { faticaOn = false; finito = true; disegnaQ(); }
      else if (az === 'seqreset') { x.sel = []; disegnaQ(); }
      else if (az === 'prec') { if (cur > 0) { cur--; apertaX = false; disegnaQ(); v.corpo.scrollTop = 0; } }
      else if (az === 'avanti') { if (cur < P.length - 1) { cur++; apertaX = false; disegnaQ(); v.corpo.scrollTop = 0; } else { const senza = P.filter(y => !fatta(y)).length; if (senza) chiedi('Vedere il risultato?', [{ testo: 'Vedi il risultato', valore: 'si' }, { testo: 'Torna al quiz', valore: 'no' }], senza + (senza === 1 ? ' domanda senza risposta: conta come errata.' : ' domande senza risposta: contano come errate.')).then(si => { if (si === 'si') { finito = true; disegnaQ(); } }); else { finito = true; disegnaQ(); } } }
      else if (az === 'errori') nuovo(P.map((y, k) => y.ok ? -1 : dati.domande.indexOf(y.d)).filter(k => k >= 0), true);
      else if (az === 'tutto') { if (gen) dati.domande = gen(); nuovo(dati.domande.map((_, k) => k), false); }
      else if (az === 'modifica') Editor.apri(x.d, s.id, nd => {
        const k = dati.domande.indexOf(x.d);
        if (!nd) { if (k >= 0) dati.domande.splice(k, 1); P.splice(cur, 1); if (!P.length) { finito = true; } else if (cur >= P.length) cur = P.length - 1; disegnaQ(); return; }
        if (k >= 0) dati.domande[k] = nd;
        const fattaPrima = fatta(x); x.d = nd;
        if (nd.t === 'mcq') { if (x.ord.length !== nd.o!.length) x.ord = mescola(nd.o!.map((_, j) => j)); x.hid = []; }
        if (!fattaPrima) { x.picked = null; x.ok = null; }
        disegnaQ();
      });
      else if (az === 'nuova') Editor.apri(null, s.id, nd => { if (nd) { dati.domande.push(nd); avviso('Domanda aggiunta: comparirà quando rifai il quiz.'); } });
      else if (az === 'ripristina') Editor.ripristina(s.id, () => avviso('Ripristinate: rifai il quiz per vederle.'));
    });
    app.addEventListener('submit', ev => {
      ev.preventDefault();
      const sel = Array.from(app.querySelectorAll('select[data-abb]')) as HTMLSelectElement[];
      if (sel.length) { if (sel.some(x => !x.value)) { avviso('Completa tutti gli abbinamenti.'); return; } rispondi(JSON.stringify(sel.map(x => x.value))); return; }
      const i = app.querySelector('#qz-ans') as HTMLInputElement | HTMLTextAreaElement; if (i) rispondi(i.value);
    });
    const tasti = (e: KeyboardEvent) => {
      if (!document.body.contains(app)) { document.removeEventListener('keydown', tasti); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName) || finito) return;
      const x = P[cur]; if (!x) return;
      // v0.54: in modo neuro 1–3 = certezza e a–e = risposta; in simulazione esame resta 1–5 / a–e
      if (mq === 'neuro' && !fatta(x) && /^[1-3]$/.test(e.key)) { x.cert = +e.key as Certezza; disegnaQ(); return; }
      if (x.d.t === 'mcq' && !fatta(x)) { let k = 'abcde'.indexOf(e.key.toLowerCase()); if (k < 0 && mq !== 'neuro' && /^[1-5]$/.test(e.key)) k = +e.key - 1; if (k >= 0 && !x.hid.includes(k)) { rispondi(k); return; } }
      if (e.key === 'ArrowRight' || (e.key === 'Enter' && fatta(x))) (app.querySelector('[data-az=avanti]') as HTMLElement).click();
      else if (e.key === 'ArrowLeft') (app.querySelector('[data-az=prec]') as HTMLElement).click();
    };
    document.addEventListener('keydown', tasti);
    // v0.54 (BP3 §1.3): interleaving — mai più di 2 di fila sullo stesso micro-argomento; Bloom alternato tranne alle medie/biennio
    nuovo(gen ? dati.domande.map((_, k) => k) : Neuro.interleave(dati.domande, Regole.ordina(dati.domande), { alterna: Dominio.profilo().modalita !== 'medie_biennio' }), false);
  }

  /** Statistiche per domanda (per Q4 e per la vista Errori). */
  function stat(sk?: string): StatQ[] { return Stato.tutti<StatQ>('statq').filter(r => !sk || r.sk === sk); }
  return { apri, stat, esporta, modo };
})();

/** Q2: editor di una domanda (modifica, nascondi, ripristina l'originale, nuova). */
const Editor = (() => {
  const LIV = ['Sbarramento', 'Applicativo', 'Trabocchetto', 'Problema', 'Completamento'];
  const area = (v: string, righe = 2, ph = '') => h('textarea', { rows: righe, value: v, placeholder: ph }) as HTMLTextAreaElement;
  const pulisci = (d: DomB): Partial<DomB> => { const c: any = { ...d }; delete c.id; delete c.sk; delete c.mod; delete c.nuova; return c; };

  function apri(d0: DomB | null, sk: string, fatto: (d: DomB | null) => void, inBozza = false): void {
    const nuova = !d0;
    const d: DomB = d0 ? JSON.parse(JSON.stringify(d0)) : { id: 'q-u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), sk, t: 'mcq', lv: 'Applicativo', q: '', o: ['', '', '', '', ''], ew: ['', '', '', ''], e: '' };
    const recId = 'mq-' + d.id, r0 = Stato.prendi<ModQ>(recId);
    const tipo = h('select', null, [['mcq', 'Risposta multipla'], ['fill', 'Completamento']].map(([v, n]) => h('option', { value: v, selected: d.t === v }, n))) as HTMLSelectElement;
    tipo.disabled = !nuova;
    const liv = h('select', null, LIV.map(l => h('option', { value: l, selected: d.lv === l }, l))) as HTMLSelectElement;
    const testo = area(d.q, 3, 'Testo della domanda (per il completamento usa …… dove va la risposta)');
    const o = (d.o || ['', '', '', '', '']).concat(['', '', '', '', '']).slice(0, 5);
    const ew = (d.ew || []).concat(['', '', '', '']).slice(0, 4);
    const opz = o.map((v, k) => h('input', { type: 'text', value: v, placeholder: k ? 'Distrattore ' + k : 'Risposta corretta' }) as HTMLInputElement);
    const perche = ew.map((v, k) => area(v, 2, 'Perché il distrattore ' + (k + 1) + ' è sbagliato'));
    const acc = h('input', { type: 'text', value: (d.a || []).join(' | '), placeholder: 'Risposte accettate, separate da |' }) as HTMLInputElement;
    const mostra = h('input', { type: 'text', value: d.show || '', placeholder: 'Risposta da mostrare' }) as HTMLInputElement;
    const ewFill = area(d.t === 'fill' ? (d.ew || [''])[0] : '', 2, 'Errore più probabile e perché');
    const passi = area((Array.isArray(d.e) ? d.e : [d.e]).join('\n'), 4, 'Correzione: un passaggio per riga (es. «Formula: …»)');
    const nota = h('div.tenue.piccolo');
    const blocco = h('div');
    const controlla = () => {
      if (tipo.value !== 'mcq') { nota.textContent = ''; return; }
      const g = opz[0].value.trim().length, max = Math.max(...opz.slice(1).map(x => x.value.trim().length));
      const doppie = new Set(opz.map(x => x.value.trim().toLowerCase())).size < 5;
      nota.textContent = doppie ? '⚠️ Due opzioni sono uguali.' : g > max ? '⚠️ La risposta corretta è più lunga di tutti i distrattori: si riconosce a colpo d\'occhio.' : '';
    };
    opz.forEach(x => x.addEventListener('input', controlla));
    const disegnaTipo = () => {
      svuota(blocco);
      if (tipo.value === 'mcq') blocco.appendChild(h('div.gruppo', null, h('div.gruppo-titolo', null, 'Opzioni (la prima è la corretta)'),
        opz.map((x, k) => h(k ? 'div.ed-opz' : 'div.ed-opz.ed-giusta', null, x, k ? perche[k - 1] : null)), nota));
      else blocco.appendChild(h('div.gruppo', null, h('div.gruppo-titolo', null, 'Risposta'), acc, mostra, ewFill));
      controlla();
    };
    tipo.onchange = disegnaTipo; disegnaTipo();
    const leggi = (): DomB | null => {
      const n: DomB = { ...d, t: tipo.value as any, lv: liv.value, q: testo.value.trim() };
      const righe = passi.value.split('\n').map(x => x.trim()).filter(Boolean);
      n.e = righe.length > 1 ? righe : (righe[0] || '');
      if (!n.q) { avviso('Scrivi il testo della domanda.'); return null; }
      if (n.t === 'mcq') {
        n.o = opz.map(x => x.value.trim()); n.ew = perche.map(x => x.value.trim()); delete n.a; delete n.show;
        if (n.o.some(x => !x)) { avviso('Servono la risposta corretta e 4 distrattori.'); return null; }
        if (new Set(n.o.map(x => x.toLowerCase())).size < 5) { avviso('Due opzioni sono uguali.'); return null; }
      } else {
        n.a = acc.value.split('|').map(x => x.trim()).filter(Boolean); n.show = mostra.value.trim() || n.a[0]; n.ew = ewFill.value.trim() ? [ewFill.value.trim()] : []; delete n.o;
        if (!n.a.length) { avviso('Scrivi almeno una risposta accettata.'); return null; }
        if (!/…|\.\.\.\./.test(n.q)) { avviso('Nel completamento metti …… dove va la risposta.'); return null; }
      }
      return n;
    };
    const salvaRec = (r: Partial<ModQ>) => {
      const base: ModQ = r0 && !r0.deleted ? r0 : { id: recId, type: 'modq', updatedAt: 0, qid: d.id, sk };
      if (!base.originale && d0 && !d0.nuova) base.originale = pulisci(d0);
      Stato.salva(Object.assign(base, r), true);
    };
    const f = foglio({
      titolo: nuova ? 'Nuova domanda' : 'Modifica domanda',
      corpo: h('div.modulo', null,
        h('div.gruppo', null, riga('Tipo', tipo), riga('Livello', liv)),
        h('div.gruppo', null, h('div.gruppo-titolo', null, 'Domanda'), testo),
        blocco,
        h('div.gruppo', null, h('div.gruppo-titolo', null, 'Correzione passo-passo'), passi),
        h('div.tenue.piccolo', null, 'Le modifiche si salvano con i tuoi dati su Drive; l\'originale resta e puoi ripristinarlo. Statistiche e spiegazioni AI della domanda restano collegate.'),
        nuova || inBozza ? null : h('div.bottoni', null,
          d0 && d0.mod && !d0.nuova ? h('button.btn.neutro', { onclick: () => { const orig = r0 && r0.originale; if (r0) Stato.elimina(recId); f.chiudi(); fatto({ ...(orig || {}), id: d.id, sk } as DomB); avviso('Ripristinato l\'originale.'); } }, '↩︎ Ripristina originale') : null,
          h('button.btn.pericolo', { onclick: async () => {
            const x = await chiedi('Nascondere questa domanda?', [{ testo: 'Nascondi', valore: 'si', pericolo: true }, { testo: 'Annulla', valore: 'no' }], 'Non comparirà più nel quiz. Puoi ripristinarla dalla schermata del risultato.');
            if (x !== 'si') return;
            salvaRec({ nascosta: true }); f.chiudi(); fatto(null); avviso('Domanda nascosta.');
          } }, d0 && d0.nuova ? 'Elimina domanda' : 'Nascondi domanda'))),
      etichettaSalva: 'Salva',
      salva: () => {
        const n = leggi(); if (!n) return false;
        if (inBozza) { fatto(n); return; }
        if (nuova || (d0 && d0.nuova)) salvaRec({ nuova: true, campi: pulisci(n), nascosta: false });
        else salvaRec({ campi: pulisci(n), nascosta: false });
        fatto({ ...n, mod: true, nuova: nuova || !!(d0 && d0.nuova) });
        avviso(nuova ? 'Domanda creata.' : 'Modifica salvata.');
      },
    });
  }
  /** Rende di nuovo visibili le domande nascoste di una scheda. */
  function ripristina(sk: string, fatto: () => void): void {
    for (const r of Banca.nascoste(sk)) { if (r.campi || r.nuova) Stato.salva(Object.assign(r, { nascosta: false }), true); else Stato.elimina(r.id); }
    fatto();
  }
  return { apri, ripristina };
})();

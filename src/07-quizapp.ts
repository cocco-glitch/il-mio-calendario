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
interface DomB { id: string; sk: string; t: 'mcq' | 'fill'; lv: string; q: string; o?: string[]; a?: string[]; show?: string; e: string | string[]; ew?: string[]; r?: string; cit?: CitB[]; cl?: string; img?: { i: string; cap: string; f?: string }[]; mod?: boolean; nuova?: boolean; }
interface BancaFile { step: number; schede: Record<string, { titolo: string; materia: string; microstep: string; k: number; n: number; fonti?: string; focus?: string }>; immagini: Record<string, string>; domande: DomB[]; }
interface ModQ extends Rec { type: 'modq'; qid: string; sk: string; campi?: Partial<DomB>; nascosta?: boolean; nuova?: boolean; originale?: Partial<DomB>; }
interface StatQ extends Rec { type: 'statq'; sk: string; n: number; ok: number; ultima: string; esito: boolean; scelte?: Record<string, number>; }

const Banca = (() => {
  const file = new Map<number, Promise<BancaFile | null>>();
  function carica(step: number): Promise<BancaFile | null> {
    if (!file.has(step)) file.set(step, fetch('studio/banca/banca-step-' + step + '.json').then(r => r.ok ? r.json() : null).catch(() => null));
    return file.get(step)!;
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

  /** Domande di una scheda: dalla banca pubblicata, dalla copia locale o estraendole dal quiz su Drive. */
  async function scheda(pk: PkStep, m: string, micro: string, s: SchedaS): Promise<{ domande: DomB[]; immagini: Record<string, string>; fonte: string }> {
    const B = await carica(parseInt(micro, 10));
    if (B && B.schede[s.id]) return { domande: applica(B.domande.filter(d => d.sk === s.id), s.id), immagini: B.immagini, fonte: 'banca' };
    const K = 'imc-banca-' + s.id;
    try { const c = localStorage.getItem(K); if (c) { const j = JSON.parse(c); return { domande: applica(j.domande, s.id), immagini: j.immagini || {}, fonte: 'copia' }; } } catch (_) { /* niente */ }
    if (!Drive.pronto) throw new Error('Questa scheda non è ancora nella banca: accedi a Google per estrarla dal quiz.');
    const html = await Drive.scaricaTesto(await Studio.idQuiz(pk, m, micro, s));
    const r = await estraiDaHtml(html, s.id);
    try { localStorage.setItem(K, JSON.stringify(r)); } catch (_) { /* spazio esaurito: la riestraggo la prossima volta */ }
    return { domande: applica(r.domande, s.id), immagini: r.immagini, fonte: 'estratta' };
  }
  return { carica, scheda, estraiDaHtml, applica, nascoste };
})();

const QuizApp = (() => {
  const L = ['A', 'B', 'C', 'D', 'E'], LIVELLI = ['Sbarramento', 'Applicativo', 'Trabocchetto', 'Problema', 'Completamento'];
  const esc = (s: any) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = (s: any) => esc(s).replace(/_\{([^}]*)\}/g, '<sub>$1</sub>').replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>');
  const fmtQ = (s: string) => fmt(s).replace(/(…+|\.\.\.\.+)/g, '<span class="qz-buco">________</span>');
  const normR = (s: string) => { let t = String(s).toLowerCase(); if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); return t.replace(/\s+/g, ' ').trim().replace(/[.;:!]+$/, '').replace(/,/g, '.'); };
  function giusta(v: string, a: string[]): boolean {
    const x = normR(v); if (!x) return false;
    return a.some(r => { const y = normR(r); if (x === y) return true; if (/^-?\d+(\.\d+)?$/.test(y)) { const m = x.match(/^(-?\d+(?:\.\d+)?)\s*[a-z%/]*$/); return !!m && Number(m[1]) === Number(y); } return false; });
  }
  const mescola = <T>(a: T[]) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  interface Voce { d: DomB; ord: number[]; picked: number | string | null; ok: boolean | null; hid: number[]; ai?: { l: string; testo?: string; errore?: string; attesa?: boolean; modello?: string }; }

  function registraStat(v: Voce): void {
    const id = 'sq-' + v.d.id, p = Stato.prendi<StatQ>(id);
    const r: StatQ = p && !p.deleted ? p : { id, type: 'statq', updatedAt: 0, sk: v.d.sk, n: 0, ok: 0, ultima: '', esito: false };
    r.n++; if (v.ok) r.ok++; r.ultima = ymd(new Date()); r.esito = !!v.ok;
    if (!v.ok && v.d.t === 'mcq' && typeof v.picked === 'number') { const o = v.d.o![v.ord[v.picked]]; r.scelte = Object.assign({}, r.scelte); r.scelte[o] = (r.scelte[o] || 0) + 1; }
    Stato.salva(r, true);
  }

  async function apri(pk: PkStep, m: string, micro: string, s: SchedaS): Promise<void> {
    const v = visore('🧩 ' + micro + ' · scheda ' + s.k + '/' + s.n, () => apriScheda(pk, m, micro, s));
    v.corpo.classList.add('qz');
    v.corpo.appendChild(h('div.vuoto.centro', null, 'Preparo le domande…'));
    let dati: { domande: DomB[]; immagini: Record<string, string>; fonte: string };
    try { dati = await Banca.scheda(pk, m, micro, s); }
    catch (e: any) { svuota(v.corpo); v.corpo.appendChild(h('div.vuoto.centro', null, String(e.message || e))); return; }
    if (!dati.domande.length) { svuota(v.corpo); v.corpo.appendChild(h('div.vuoto.centro', null, 'Nessuna domanda trovata.')); return; }
    const app = h('div.qz-app'); svuota(v.corpo);
    v.corpo.appendChild(h('div.qz-testa', null, h('div.qz-occhiello', null, (mat0(pk, m).nome || m) + ' · ' + micro + ' · scheda ' + s.k + ' di ' + s.n), h('h1.qz-h1', null, s.titolo)));
    v.corpo.appendChild(app);
    let P: Voce[] = [], cur = 0, ripasso = false, apertaX = false, finito = false;
    const nuovo = (idx: number[], rip: boolean) => {
      P = idx.map(i => { const d = dati.domande[i]; return { d, ord: d.t === 'mcq' ? mescola(d.o!.map((_, k) => k)) : [], picked: null, ok: null, hid: [] }; });
      cur = 0; ripasso = rip; apertaX = false; finito = false; disegnaQ(); v.corpo.scrollTop = 0;
    };
    const fatta = (x: Voce) => x.picked !== null;
    const punti = () => P.filter(x => x.ok).length;
    const corretta = (x: Voce) => x.ord.indexOf(0);
    const passi = (e: string | string[]) => '<ol class="qz-passi">' + (Array.isArray(e) ? e : [e]).map(t => { const m2 = String(t).match(/^([^:]{2,80}):\s([\s\S]*)$/); return '<li>' + (m2 ? '<b>' + fmt(m2[1]) + ':</b> ' + fmt(m2[2]) : fmt(t)) + '</li>'; }).join('') + '</ol>';
    const spiegFonti = (d: DomB) => '<div class="qz-box"><span class="qz-etich">Spiegazione dalle fonti</span>'
      + (d.cit || []).map(c => '<blockquote>«' + esc(c.t) + '»<span class="qz-chi">' + esc(c.f) + (c.l ? ' · <a href="' + esc(c.l) + '" target="_blank" rel="noopener">apri la pagina</a>' : '') + '</span></blockquote>').join('')
      + (d.cl ? '<div class="qz-mia"><b>Spiegazione di Claude</b> ' + esc(d.cl) + '</div>' : '') + (!d.cit && !d.cl ? '<p>' + fmt(Array.isArray(d.e) ? d.e.join(' ') : d.e) + '</p>' : '') + '</div>';
    function correzione(x: Voce): string {
      const d = x.d, ew = d.ew || [], mc = d.t === 'mcq';
      let s2 = '<div class="qz-box" id="qz-why"><span class="qz-etich">Correzione passo-passo</span><p class="qz-verdetto ' + (x.ok ? 'ok' : 'ko') + '">'
        + (x.ok ? 'Corretto.' : mc ? 'Non corretto: la risposta giusta è ' + L[corretta(x)] + '.' : 'Non corretto: la risposta attesa è «' + fmt(d.show) + '».') + '</p>' + passi(d.e);
      if (!x.ok && mc && typeof x.picked === 'number' && ew[x.ord[x.picked] - 1]) s2 += '<div class="qz-perche"><b>Perché la tua risposta è sbagliata</b><p>Hai scelto «' + fmt(d.o![x.ord[x.picked]]) + '»: ' + fmt(ew[x.ord[x.picked] - 1]) + '</p></div>';
      else if (!x.ok && !mc && ew[0]) s2 += '<div class="qz-perche"><b>Perché la tua risposta è sbagliata</b><p>' + (x.picked ? 'Hai scritto «' + esc(x.picked) + '». ' : '') + fmt(ew[0]) + '</p></div>';
      if (mc && ew.length && (x.ok || x.picked === null)) s2 += '<details class="qz-altre"><summary>Perché le altre opzioni sono sbagliate</summary>' + ew.map((t, k) => '<p><b>«' + fmt(d.o![k + 1]) + '»</b> — ' + fmt(t) + '</p>').join('') + '</details>';
      return s2 + '</div>';
    }
    function riquadroAI(x: Voce): string {
      const a = x.ai, b = (l: string, n: string) => '<button type="button" class="chip' + (a && a.l === l ? ' on' : '') + '" data-ai="' + l + '">' + n + '</button>';
      let o = '';
      if (a) o = a.attesa ? '<p class="tenue">Genero la spiegazione…</p>' : a.errore ? '<p class="tenue">⚠️ ' + esc(a.errore) + '</p>'
        : '<div class="qz-ai-testo">' + esc(a.testo) + '</div><div class="qz-ai-piede"><span>' + esc(a.modello || '') + '</span><button type="button" class="chip" data-ai="' + a.l + '" data-forza="1">↻ Rigenera</button></div>';
      return '<div class="qz-box qz-ai"><span class="qz-etich">✨ Spiegazione AI</span><div class="chips">' + b('breve', 'Breve') + b('media', 'Media') + b('dettagliata', 'Dettagliata') + '</div>' + o + '</div>';
    }
    function disegnaQ(): void {
      if (finito) { risultato(); return; }
      const x = P[cur], d = x.d, a = fatta(x), mc = d.t === 'mcq';
      let s2 = '<div class="qz-metro" style="--n:' + P.length + '">' + P.map((y, k) => '<span class="' + (y.ok === null ? (k === cur ? 'ora' : '') : y.ok ? 'ok' : 'ko') + '"></span>').join('') + '</div>'
        + '<div class="qz-stat"><span>Domanda <b>' + (cur + 1) + '</b> di ' + P.length + (ripasso ? ' · ripasso errori' : '') + '</span><span>Punteggio <b>' + punti() + '</b></span></div>'
        + '<section class="qz-carta"><div class="qz-qtesta"><span class="qz-liv lv-' + esc(d.lv) + '">' + esc(d.lv) + '</span><span>' + (mc ? 'Risposta multipla' : 'A completamento') + '</span></div>';
      for (const g of d.img || []) if (dati.immagini[g.i]) s2 += '<figure class="qz-fig">' + dati.immagini[g.i] + '<figcaption>' + esc(g.cap) + (g.f ? ' · ' + esc(g.f) : '') + '</figcaption></figure>';
      s2 += '<p class="qz-domanda">' + (mc ? fmt(d.q) : fmtQ(d.q)) + '</p><div class="chips">';
      if (mc) { const rest = 2 - x.hid.length; s2 += '<button type="button" class="chip" data-az="aiuto"' + (a || rest <= 0 ? ' disabled' : '') + '>💡 Suggerimento (' + rest + ')</button>'; }
      s2 += '<button type="button" class="chip' + (apertaX ? ' on' : '') + '" data-az="fonti">📖 Spiegazione</button><button type="button" class="chip" data-az="modifica">✏️ Modifica</button>' + (d.mod ? '<span class="qz-mod">modificata</span>' : '') + '</div>';
      if (apertaX) s2 += spiegFonti(d);
      if (mc) {
        s2 += '<div class="qz-opz">' + x.ord.map((oi, k) => {
          let c = 'qz-opz-b', tag = ''; const off = x.hid.includes(k);
          if (a) { if (oi === 0) { c += ' ok'; tag = '<span class="qz-tag">Risposta corretta</span>'; } else if (k === x.picked) { c += ' ko'; tag = '<span class="qz-tag">La tua risposta</span>'; } else c += ' spento'; }
          if (off && !(a && oi === 0)) c += ' escluso';
          return '<button type="button" class="' + c + '" data-k="' + k + '"' + (a || off ? ' disabled' : '') + '><span class="qz-lett">' + L[k] + '</span><span>' + fmt(d.o![oi]) + tag + '</span></button>';
        }).join('') + '</div>';
      } else s2 += '<form class="qz-fill" autocomplete="off"><input id="qz-ans" type="text" enterkeyhint="done" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="La tua risposta"' + (a ? ' disabled class="' + (x.ok ? 'ok' : 'ko') + '" value="' + esc(x.picked) + '"' : '') + '>' + (a ? '' : '<button type="submit" class="btn">Verifica</button><p class="tenue piccolo">Maiuscole e accenti non contano.</p>') + '</form>';
      if (a) s2 += correzione(x) + riquadroAI(x);
      const ultima = cur === P.length - 1;
      s2 += '<div class="qz-nav"><button type="button" class="btn neutro" data-az="prec"' + (cur === 0 ? ' disabled' : '') + '>◀ Indietro</button><button type="button" class="btn' + (a ? '' : ' neutro') + '" data-az="avanti">' + (ultima ? 'Vedi il risultato' : a ? 'Avanti ▶' : 'Salta ▶') + '</button></div></section>';
      app.innerHTML = s2;
      if (!a && !mc) { const i = app.querySelector('#qz-ans') as HTMLInputElement; if (i && matchMedia('(hover:hover)').matches) i.focus({ preventScroll: true }); }
    }
    function rispondi(val: number | string): void {
      const x = P[cur]; if (fatta(x)) return;
      if (typeof val === 'number') { x.picked = val; x.ok = x.ord[val] === 0; }
      else { if (!normR(val)) { avviso('Scrivi una risposta.'); return; } x.picked = val.trim(); x.ok = giusta(val, x.d.a || []); }
      registraStat(x); disegnaQ();
      const w = app.querySelector('#qz-why'); if (w) w.scrollIntoView({ block: 'nearest' });
    }
    async function chiediAI(l: string, forza: boolean): Promise<void> {
      const x = P[cur], d = x.d, mc = d.t === 'mcq';
      const dd: DatiDomanda = { q: d.q, opts: mc ? x.ord.map(i => d.o![i]) : [], corretta: mc ? d.o![0] : (d.show || (d.a || [''])[0]),
        scelta: x.ok ? '' : mc ? (typeof x.picked === 'number' ? d.o![x.ord[x.picked]] : '') : String(x.picked || ''),
        cit: (d.cit || []).map(c => c.t).join('\n'), passi: (Array.isArray(d.e) ? d.e : [d.e]).join(' '), titolo: (mat0(pk, m).nome || m) + ' — ' + s.titolo };
      const id = Spiega.idDi(dd, l), c = Stato.prendi<Spiegazione>(id);
      if (c && !c.deleted && !forza) { x.ai = { l, testo: c.testo, modello: c.modello + ' · salvata' }; disegnaQ(); return; }
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
      if (sb.length) s2 += '<h3>Da rivedere (' + sb.length + ')</h3>' + sb.map(x => '<details class="qz-altre"><summary>' + fmt(x.d.q) + '</summary><p><b>Risposta corretta:</b> ' + fmt(x.d.t === 'mcq' ? x.d.o![0] : x.d.show) + '</p>' + passi(x.d.e) + (x.d.r ? '<p class="tenue piccolo">Ripassa: ' + esc(x.d.r) + '</p>' : '') + '</details>').join('');
      s2 += '<div class="qz-nav">' + (sb.length ? '<button type="button" class="btn" data-az="errori">Rifai solo gli errori</button>' : '') + '<button type="button" class="btn neutro" data-az="tutto">Rifai tutto</button></div>'
        + '<div class="chips"><button type="button" class="chip" data-az="nuova">➕ Aggiungi una domanda</button>' + (Banca.nascoste(s.id).length ? '<button type="button" class="chip" data-az="ripristina">↩︎ Ripristina le domande nascoste (' + Banca.nascoste(s.id).length + ')</button>' : '') + '</div></section>';
      app.innerHTML = s2; v.corpo.scrollTop = 0;
      const r: RisultatoQuiz = { imc: 'quiz-risultato', pct, giuste: ok, totale: tot, livelli: liv, debole: deb ? deb[0] : null, errori: ripasso,
        sbagliate: sb.map(x => [x.d.q, x.d.t === 'mcq' ? x.d.o![0] : String(x.d.show || ''), (Array.isArray(x.d.e) ? x.d.e.join(' ') : x.d.e)] as [string, string, string]) };
      Cattura.salva(s.id, r);
    }
    app.addEventListener('click', ev => {
      const b = (ev.target as Element).closest('button') as HTMLButtonElement | null; if (!b || b.disabled) return;
      if (b.dataset.k != null) { rispondi(parseInt(b.dataset.k, 10)); return; }
      if (b.dataset.ai) { chiediAI(b.dataset.ai, !!b.dataset.forza); return; }
      const az = b.dataset.az, x = P[cur];
      if (az === 'aiuto') { const lib = x.ord.map((oi, k) => oi !== 0 && !x.hid.includes(k) ? k : -1).filter(k => k >= 0); if (lib.length) x.hid.push(lib[Math.floor(Math.random() * lib.length)]); disegnaQ(); }
      else if (az === 'fonti') { apertaX = !apertaX; disegnaQ(); }
      else if (az === 'prec') { if (cur > 0) { cur--; apertaX = false; disegnaQ(); v.corpo.scrollTop = 0; } }
      else if (az === 'avanti') { if (cur < P.length - 1) { cur++; apertaX = false; disegnaQ(); v.corpo.scrollTop = 0; } else { const senza = P.filter(y => !fatta(y)).length; if (senza) chiedi('Vedere il risultato?', [{ testo: 'Vedi il risultato', valore: 'si' }, { testo: 'Torna al quiz', valore: 'no' }], senza + (senza === 1 ? ' domanda senza risposta: conta come errata.' : ' domande senza risposta: contano come errate.')).then(si => { if (si === 'si') { finito = true; disegnaQ(); } }); else { finito = true; disegnaQ(); } } }
      else if (az === 'errori') nuovo(P.map((y, k) => y.ok ? -1 : dati.domande.indexOf(y.d)).filter(k => k >= 0), true);
      else if (az === 'tutto') nuovo(dati.domande.map((_, k) => k), false);
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
    app.addEventListener('submit', ev => { ev.preventDefault(); const i = app.querySelector('#qz-ans') as HTMLInputElement; if (i) rispondi(i.value); });
    const tasti = (e: KeyboardEvent) => {
      if (!document.body.contains(app)) { document.removeEventListener('keydown', tasti); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).tagName === 'INPUT' || finito) return;
      const x = P[cur]; if (!x) return;
      if (x.d.t === 'mcq' && !fatta(x)) { let k = 'abcde'.indexOf(e.key.toLowerCase()); if (k < 0 && /^[1-5]$/.test(e.key)) k = +e.key - 1; if (k >= 0 && !x.hid.includes(k)) { rispondi(k); return; } }
      if (e.key === 'ArrowRight' || (e.key === 'Enter' && fatta(x))) (app.querySelector('[data-az=avanti]') as HTMLElement).click();
      else if (e.key === 'ArrowLeft') (app.querySelector('[data-az=prec]') as HTMLElement).click();
    };
    document.addEventListener('keydown', tasti);
    nuovo(dati.domande.map((_, k) => k), false);
  }

  /** Statistiche per domanda (per Q4 e per la vista Errori). */
  function stat(sk?: string): StatQ[] { return Stato.tutti<StatQ>('statq').filter(r => !sk || r.sk === sk); }
  return { apri, stat };
})();

/** Q2: editor di una domanda (modifica, nascondi, ripristina l'originale, nuova). */
const Editor = (() => {
  const LIV = ['Sbarramento', 'Applicativo', 'Trabocchetto', 'Problema', 'Completamento'];
  const area = (v: string, righe = 2, ph = '') => h('textarea', { rows: righe, value: v, placeholder: ph }) as HTMLTextAreaElement;
  const pulisci = (d: DomB): Partial<DomB> => { const c: any = { ...d }; delete c.id; delete c.sk; delete c.mod; delete c.nuova; return c; };

  function apri(d0: DomB | null, sk: string, fatto: (d: DomB | null) => void): void {
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
        nuova ? null : h('div.bottoni', null,
          d0 && d0.mod && !d0.nuova ? h('button.btn.neutro', { onclick: () => { const orig = r0 && r0.originale; if (r0) Stato.elimina(recId); f.chiudi(); fatto({ ...(orig || {}), id: d.id, sk } as DomB); avviso('Ripristinato l\'originale.'); } }, '↩︎ Ripristina originale') : null,
          h('button.btn.pericolo', { onclick: async () => {
            const x = await chiedi('Nascondere questa domanda?', [{ testo: 'Nascondi', valore: 'si', pericolo: true }, { testo: 'Annulla', valore: 'no' }], 'Non comparirà più nel quiz. Puoi ripristinarla dalla schermata del risultato.');
            if (x !== 'si') return;
            salvaRec({ nascosta: true }); f.chiudi(); fatto(null); avviso('Domanda nascosta.');
          } }, d0 && d0.nuova ? 'Elimina domanda' : 'Nascondi domanda'))),
      etichettaSalva: 'Salva',
      salva: () => {
        const n = leggi(); if (!n) return false;
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

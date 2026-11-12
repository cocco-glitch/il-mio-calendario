// 07-carte.ts — Flashcard (v0.18, F3).
//
// Ispirazione (ricerca 12/11): Anki (FSRS, 4 tasti con l'intervallo scritto, import da testo con
// intestazioni "#separator:tab"), Quizlet (export "termine TAB definizione", una carta per riga; modalità
// scelta multipla e scrivi), Mochi (Markdown con "---" tra i lati, completamenti {{…}}, una cartella di
// file = un mazzo), Kahoot (opzioni con colore + forma), app moderne (tocca per girare, scorri per giudicare,
// ma sempre anche i pulsanti).
//
// Dati: 'mazzo' (id 'mz-…', nome, padre?, sub? = sotto-step collegato, micro?, fonte Drive?) e 'carta'
// (id 'cr-<hash mazzo+fronte>' così una reimportazione non perde i ripassi). Memoria FSRS per carta (e per
// il verso inverso) in record 'memoria' con id 'mem-cr-<id>' / 'mem-cr-<id>-r'.
//
// Formati importati (file dal telefono, file Drive, cartella Drive = mazzo con sotto-mazzi):
//  - testo / CSV / TSV: "fronte<sep>retro[<sep>tag]" per riga; separatore tab, ";" o "," (rilevato o da
//    "#separator:"); righe che iniziano con "#" ignorate; cloze di Anki {{c1::testo}} → {{testo}};
//  - Markdown: carte separate da una riga "===" (o "***"), lati separati da "---"; oppure righe
//    "domanda :: risposta"; un file .md senza "===" e con un solo "---" = una carta (stile Mochi);
//  - JSON: { "tipo": "carte", "mazzo": "…", "micro": "2.2.4", "carte": [ { "f": "…", "r": "…" } ] } o un array.
// Immagini: "![testo](nome.png)" se nome.png è nella cartella Drive importata → "![testo](drive:ID)".

interface Mazzo extends Rec { type: 'mazzo'; nome: string; padre?: string; sub?: string; micro?: string; fonte?: { id: string; tipo: 'file' | 'cartella'; agg?: string }; }
interface Carta extends Rec { type: 'carta'; mazzo: string; f: string; r: string; tipo: 'base' | 'cloze'; inversa?: boolean; tag?: string; }
type ModoCarte = 'gira' | 'scelta' | 'scrivi';

const Carte = (() => {
  function hash(s: string): string { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  const mazzi = () => Stato.tutti<Mazzo>('mazzo').sort((a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true }));
  const carte = () => Stato.tutti<Carta>('carta');
  const figli = (id: string) => mazzi().filter(m => m.padre === id);
  /** Il mazzo e tutti i suoi sotto-mazzi. */
  function albero(id: string): string[] { const out = [id]; for (const f of figli(id)) out.push(...albero(f.id)); return out; }
  const carteDi = (idMazzo: string) => { const set = new Set(albero(idMazzo)); return carte().filter(c => set.has(c.mazzo)); };

  // ---------- Lettura dei formati ----------
  const isCloze = (s: string) => /\{\{[^}]+\}\}/.test(s);
  const pulisciCloze = (s: string) => s.replace(/\{\{c\d+::([^}]*?)(?:::[^}]*)?\}\}/g, '{{$1}}');
  function csvRiga(riga: string, sep: string): string[] {
    if (sep === '\t' || !riga.includes('"')) return riga.split(sep);
    const out: string[] = []; let cur = '', q = false;
    for (let i = 0; i < riga.length; i++) {
      const ch = riga[i];
      if (q) { if (ch === '"' && riga[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur); return out;
  }
  function daTesto(txt: string): { f: string; r: string; tag?: string }[] {
    const righe = txt.replace(/^﻿/, '').split(/\r?\n/);
    let sep = '', colTag = -1;
    for (const r of righe) {
      const m = /^#separator:(.+)$/i.exec(r.trim());
      if (m) { const v = m[1].trim().toLowerCase(); sep = v === 'tab' ? '\t' : v === 'comma' ? ',' : v === 'semicolon' ? ';' : v === 'pipe' ? '|' : v.length === 1 ? v : sep; }
      const t = /^#tags column:(\d+)/i.exec(r.trim()); if (t) colTag = +t[1] - 1;
    }
    const dati = righe.filter(r => r.trim() && !r.startsWith('#'));
    if (!sep) sep = dati.some(r => r.includes('\t')) ? '\t' : dati.filter(r => r.includes(';')).length >= dati.length / 2 ? ';' : ',';
    const out: { f: string; r: string; tag?: string }[] = [];
    for (const r of dati) {
      const c = csvRiga(r, sep).map(x => x.trim());
      if (c.length < 2 && !isCloze(pulisciCloze(c[0] || ''))) continue;
      out.push({ f: pulisciCloze(c[0]), r: c[1] || '', tag: colTag >= 0 ? c[colTag] : c[2] });
    }
    return out;
  }
  function daMarkdown(txt: string): { f: string; r: string }[] {
    const t = txt.replace(/\r/g, '').trim();
    if (/^.+\s::\s.+$/m.test(t) && !/^\s*---\s*$/m.test(t)) // stile RemNote: "domanda :: risposta"
      return t.split('\n').map(r => /^(.+?)\s::\s(.+)$/.exec(r.trim())).filter(Boolean).map(m => ({ f: m![1].trim(), r: m![2].trim() }));
    const blocchi = /^\s*(===+|\*\*\*+)\s*$/m.test(t) ? t.split(/^\s*(?:===+|\*\*\*+)\s*$/m) : [t];
    return blocchi.map(b => b.trim()).filter(Boolean).map(b => {
      const lati = b.split(/^\s*---+\s*$/m).map(x => x.trim());
      return { f: pulisciCloze(lati[0] || ''), r: lati.slice(1).join('\n\n') };
    }).filter(x => x.f);
  }
  function daJson(txt: string): { nome?: string; micro?: string; carte: { f: string; r: string; tag?: string }[] } {
    const d = JSON.parse(txt);
    const arr = Array.isArray(d) ? d : (d.carte || d.cards || []);
    return { nome: d.mazzo || d.nome, micro: d.micro, carte: arr.map((x: any) => ({ f: pulisciCloze(String(x.f ?? x.fronte ?? x.front ?? x.term ?? '')), r: String(x.r ?? x.retro ?? x.back ?? x.definition ?? ''), tag: x.tag })).filter((x: any) => x.f) };
  }
  /** Legge un file qualsiasi (dal nome capisce il formato). */
  function leggi(nome: string, txt: string): { nome?: string; micro?: string; carte: { f: string; r: string; tag?: string }[] } {
    if (/\.json$/i.test(nome)) return daJson(txt);
    if (/\.(md|markdown)$/i.test(nome)) return { carte: daMarkdown(txt) };
    return { carte: daTesto(txt) };
  }

  /** Collega un mazzo a un microstep/sotto-step dal nome (es. "2.2.4 Calore" o "Chimica 2.2"). */
  function collega(nome: string, percorso = ''): { sub?: string; micro?: string } {
    const m = /(?:^|\s)(\d+\.\d+(?:\.\d+)?)(?=\s|$|[-_·])/.exec(nome); if (!m) return {};
    const testo = norm(percorso + ' ' + nome);
    const mat = /\bchim|\bchi\b|^c\s/.test(testo) ? 'C' : /\bbio/.test(testo) ? 'B' : /\bfis/.test(testo) ? 'F' : '';
    const cand: { sub: string; micro?: string }[] = [];
    for (const pk of Studio.pkStep()) for (const ma of pk.materie) for (const s of ma.sottostep) {
      if (mat && ma.m !== mat) continue;
      if (s.k === ma.m + m[1]) cand.push({ sub: s.k });
      for (const mi of s.microstep) if (mi.n === m[1]) cand.push({ sub: s.k, micro: mi.n });
    }
    return cand.length === 1 ? cand[0] : {};
  }

  /** Crea/aggiorna le carte di un mazzo. Stessa domanda = stessa carta (i ripassi restano). */
  function riempi(idMazzo: string, lista: { f: string; r: string; tag?: string }[], immagini?: Map<string, string>): number {
    let n = 0;
    for (const x of lista) {
      let f = x.f, r = x.r;
      if (immagini) { const sost = (s: string) => s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (tutto, alt, src) => immagini.has(src) ? '![' + alt + '](drive:' + immagini.get(src) + ')' : tutto); f = sost(f); r = sost(r); }
      const id = 'cr-' + hash(idMazzo + '|' + norm(f));
      const prima = Stato.prendi<Carta>(id);
      if (prima && prima.f === f && prima.r === r) continue;
      Stato.salva({ id, type: 'carta', updatedAt: 0, mazzo: idMazzo, f, r, tipo: isCloze(f) ? 'cloze' : 'base', inversa: prima ? prima.inversa : undefined, tag: x.tag || undefined } as Carta, true);
      n++;
    }
    Stato.notifica();
    return n;
  }
  function nuovoMazzo(nome: string, padre?: string, extra: Partial<Mazzo> = {}): Mazzo {
    const pa = padre ? Stato.prendi<Mazzo>(padre) : undefined, eredita = pa && pa.sub ? { sub: pa.sub, micro: pa.micro } : {};
    const m: Mazzo = { id: 'mz-' + uid(), type: 'mazzo', updatedAt: 0, nome, padre, ...eredita, ...collega(nome), ...extra };
    if (!m.sub && pa && pa.sub) { m.sub = pa.sub; m.micro = pa.micro; }   // il sotto-mazzo eredita il collegamento
    Stato.salva(m, true); return m;
  }

  /** Importa un file Drive come mazzo (o aggiorna il mazzo che già lo rappresenta). */
  async function importaFileDrive(id: string, nome: string, padre?: string, immagini?: Map<string, string>, percorso = ''): Promise<number> {
    const txt = await Drive.scaricaTesto(id);
    const d = leggi(nome, txt);
    let m = mazzi().find(x => x.fonte && x.fonte.id === id);
    const nomeM = d.nome || nome.replace(/\.(txt|csv|tsv|md|markdown|json)$/i, '');
    if (!m) m = nuovoMazzo(nomeM, padre, { fonte: { id, tipo: 'file' }, ...(d.micro ? collega(d.micro + ' ' + nomeM, percorso) : collega(nomeM, percorso)) });
    return riempi(m.id, d.carte, immagini);
  }
  /** Importa una cartella Drive: la cartella è un mazzo, le sottocartelle sotto-mazzi, ogni file un mazzo. */
  async function importaCartellaDrive(id: string, nome: string, padre?: string, percorso = ''): Promise<{ mazzi: number; carte: number }> {
    let m = mazzi().find(x => x.fonte && x.fonte.id === id);
    if (!m) m = nuovoMazzo(nome, padre, { fonte: { id, tipo: 'cartella' }, ...collega(nome, percorso) });
    const voci = await Drive.elencaCompleti(id);
    const immagini = new Map<string, string>();
    for (const v of voci) if (/^image\//.test(v.mimeType)) immagini.set(v.name, v.id);
    let tot = { mazzi: 1, carte: 0 };
    for (const v of voci) {
      if (v.mimeType === 'application/vnd.google-apps.folder') { const r = await importaCartellaDrive(v.id, v.name, m.id, percorso + ' ' + nome); tot.mazzi += r.mazzi; tot.carte += r.carte; }
      else if (/\.(txt|csv|tsv|md|markdown|json)$/i.test(v.name)) { tot.carte += await importaFileDrive(v.id, v.name, m.id, immagini, percorso + ' ' + nome); tot.mazzi++; }
    }
    m.fonte = { id, tipo: 'cartella', agg: ymd(new Date()) }; Stato.salva(m);
    return tot;
  }
  async function aggiornaDaDrive(m: Mazzo): Promise<number> {
    if (!m.fonte) return 0;
    if (m.fonte.tipo === 'cartella') return (await importaCartellaDrive(m.fonte.id, m.nome, m.padre)).carte;
    return importaFileDrive(m.fonte.id, m.nome + '.txt', m.padre);
  }

  // ---------- Ripasso (FSRS, stesso motore dei sotto-step) ----------
  interface Voce { c: Carta; rev: boolean; }
  const idMem = (v: Voce) => 'mem-cr-' + v.c.id + (v.rev ? '-r' : '');
  const giorni = (a: string, b: string) => Math.round((inizioGiorno(daDt(b)).getTime() - inizioGiorno(daDt(a)).getTime()) / 86400000);
  function voci(ids?: string[]): Voce[] {
    const set = ids ? new Set(ids.flatMap(albero)) : null;
    const out: Voce[] = [];
    for (const c of carte()) if (!set || set.has(c.mazzo)) { out.push({ c, rev: false }); if (c.inversa && c.tipo === 'base') out.push({ c, rev: true }); }
    return out;
  }
  function mem(v: Voce): Memoria | undefined { return Stato.prendi<Memoria>(idMem(v)); }
  const nuovePerGiorno = () => (imp() as any).carteNuove || 20;
  const ripassiPerGiorno = () => (imp() as any).carteRipassi || 150;
  /** Coda di oggi: carte scadute (prima le più a rischio) + nuove fino al limite, mescolate tra mazzi. */
  function coda(ids?: string[], oggiK = ymd(new Date())): Voce[] {
    const tutte = voci(ids);
    const scad = tutte.map(v => ({ v, m: mem(v) })).filter(x => x.m && x.m.due <= oggiK && x.m.ultimo !== oggiK)
      .map(x => ({ v: x.v, r: Ripassi.recuperabilita(Math.max(0, giorni(x.m!.ultimo!, oggiK)), x.m!.s) })).sort((a, b) => a.r - b.r).slice(0, ripassiPerGiorno()).map(x => x.v);
    const giaNuove = Stato.tutti<Memoria>('memoria').filter(m => m.er.startsWith('carta:') && m.log && m.log[0] && m.log[0][0] === oggiK).length;
    const nuove = tutte.filter(v => !mem(v)).slice(0, Math.max(0, nuovePerGiorno() - giaNuove));
    // alternanza: una nuova ogni 3 ripassi; mai due carte di fila dello stesso mazzo se evitabile
    const out: Voce[] = []; let i = 0, j = 0;
    while (i < scad.length || j < nuove.length) { for (let k = 0; k < 3 && i < scad.length; k++) out.push(scad[i++]); if (j < nuove.length) out.push(nuove[j++]); }
    for (let k = 1; k < out.length - 1; k++) if (out[k].c.mazzo === out[k - 1].c.mazzo) { const s = out.findIndex((x, q) => q > k && x.c.mazzo !== out[k - 1].c.mazzo); if (s > 0) [out[k], out[s]] = [out[s], out[k]]; }
    return out;
  }
  function conta(ids?: string[]): { nuove: number; ripasso: number; totale: number } {
    const oggiK = ymd(new Date()), tutte = voci(ids);
    let nuove = 0, ripasso = 0;
    for (const v of tutte) { const m = mem(v); if (!m) nuove++; else if (m.due <= oggiK && m.ultimo !== oggiK) ripasso++; }
    return { nuove: Math.min(nuove, nuovePerGiorno()), ripasso: Math.min(ripasso, ripassiPerGiorno()), totale: tutte.length };
  }
  /** Prossimo intervallo (giorni) per ogni voto, da scrivere sui tasti. */
  function anteprima(v: Voce): number[] {
    const m = mem(v), oggiK = ymd(new Date()), t = m && m.ultimo ? giorni(m.ultimo, oggiK) : 0;
    return [1, 2, 3, 4].map(g => g === 1 ? 0 : Ripassi.intervallo(Ripassi.passo(m && m.ultimo ? { d: m.d, s: m.s } : null, g, t).s, Ripassi.ritenzione(oggiK)));
  }
  function valuta(v: Voce, g: number, sec?: number): void {
    const oggiK = ymd(new Date()), m = mem(v), t = m && m.ultimo ? giorni(m.ultimo, oggiK) : 0;
    const st = Ripassi.passo(m && m.ultimo ? { d: m.d, s: m.s } : null, g, t);
    const iv = g === 1 ? 0 : Ripassi.intervallo(st.s, Ripassi.ritenzione(oggiK));
    const d = daDt(oggiK); d.setDate(d.getDate() + iv);
    Stato.salva({ id: idMem(v), type: 'memoria', updatedAt: 0, er: 'carta:' + v.c.id + (v.rev ? ':r' : ''), d: st.d, s: st.s, due: ymd(d), ultimo: oggiK,
      n: (m ? m.n : 0) + 1, lapsi: (m ? m.lapsi : 0) + (m && g === 1 ? 1 : 0), log: ((m && m.log) || []).concat([[oggiK, g, undefined, sec]] as any).slice(-50) } as Memoria, true);
  }
  return { mazzi, carte, figli, albero, carteDi, leggi, daTesto, daMarkdown, daJson, collega, riempi, nuovoMazzo, importaFileDrive, importaCartellaDrive, aggiornaDaDrive, coda, conta, anteprima, valuta, mem, voci, isCloze, hash };
})();

// ---------- Rendering di una faccia (Markdown minimale, completamenti, immagini da Drive) ----------
const immaginiDrive = new Map<string, string>();
function htmlCarta(s: string, cloze: 'nascondi' | 'mostra' | 'no' = 'no'): string {
  let x = md(s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '\u0001$2\u0002$1\u0003'));
  x = x.replace(/\u0001([^\u0002]+)\u0002([^\u0003]*)\u0003/g, (_t, src, alt) => {
    const sorg = src.startsWith('drive:') ? (immaginiDrive.get(src.slice(6)) || '') : /^https:\/\//.test(src) ? src : '';
    return '<img class="carta-img" alt="' + alt + '"' + (src.startsWith('drive:') ? ' data-drive="' + esc(src.slice(6)) + '"' : '') + (sorg ? ' src="' + esc(sorg) + '"' : '') + '>';
  });
  if (cloze !== 'no') x = x.replace(/\{\{([^}]+)\}\}/g, (_t, c) => cloze === 'nascondi' ? '<span class="cloze-buco">[ … ]</span>' : '<span class="cloze-vista">' + c + '</span>');
  return x;
}
/** Carica le immagini Drive mancanti dentro un elemento. */
function caricaImmagini(el: HTMLElement): void {
  el.querySelectorAll<HTMLImageElement>('img[data-drive]:not([src])').forEach(async img => {
    const id = img.dataset.drive!;
    try { if (!immaginiDrive.has(id)) immaginiDrive.set(id, URL.createObjectURL(await Drive.scaricaBlob(id))); img.src = immaginiDrive.get(id)!; } catch (_) { img.alt = '🖼 immagine non disponibile offline'; }
  });
}
const rispostaDi = (c: Carta, rev: boolean) => c.tipo === 'cloze' ? (c.f.match(/\{\{([^}]+)\}\}/g) || []).map(x => x.slice(2, -2)).join(' · ') : rev ? c.f : c.r;
const domandaDi = (c: Carta, rev: boolean) => c.tipo === 'cloze' ? htmlCarta(c.f, 'nascondi') : htmlCarta(rev ? c.r : c.f);
const testoPiano = (s: string) => s.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
const normRisp = (s: string) => norm(testoPiano(s)).replace(/[.;:!?]+$/, '').replace(/,/g, '.').replace(/\s+/g, ' ').trim();

// ---------- Sessione di ripasso ----------
function avviaCarte(ids?: string[], titolo = 'Flashcard'): void {
  const coda = Carte.coda(ids);
  if (!coda.length) { avviso('Nessuna carta da ripassare oggi. 🎉'); return; }
  let modo: ModoCarte = ((imp() as any).modoCarte as ModoCarte) || 'gira';
  let i = 0, giuste = 0, fatte = 0, girata = false, t0 = Date.now(), ripetute = new Map<string, number>();
  const v = visore('🃏 ' + titolo, () => disegna());
  const contatore = h('span.carte-contatore');
  const sceltaModo = h('div.segmenti.carte-modi', null, ([['gira', 'Gira'], ['scelta', 'Scelta'], ['scrivi', 'Scrivi']] as [ModoCarte, string][]).map(([m, t]) =>
    h('button' + (m === modo ? '.attivo' : ''), { onclick: (e: Event) => { modo = m; const i2 = imp() as any; i2.modoCarte = m; Stato.salva(i2, true); sceltaModo.querySelectorAll('button').forEach(b => b.classList.toggle('attivo', b === e.target)); mostra(); } }, t)));
  v.barra.appendChild(contatore);
  const area = h('div.carte-area');
  v.corpo.append(h('div.carte-testa', null, sceltaModo), area);

  const avanti = (g: number) => {
    const x = coda[i]; Carte.valuta(x, g, Math.round((Date.now() - t0) / 1000));
    fatte++; if (g >= 3) giuste++;
    if (g === 1) { const n = (ripetute.get(x.c.id) || 0) + 1; ripetute.set(x.c.id, n); if (n <= 2) coda.splice(Math.min(coda.length, i + 4), 0, x); }
    i++; mostra();
  };
  function mostra(): void {
    svuota(area); girata = false; t0 = Date.now();
    contatore.textContent = Math.min(i + 1, coda.length) + '/' + coda.length;
    if (i >= coda.length) {
      area.append(h('div.carte-fine', null, h('div.carte-fine-num', null, giuste + '/' + fatte), h('div', null, 'carte ricordate al primo colpo o dopo il ripasso'),
        h('div.tenue.piccolo', null, 'Le sbagliate torneranno domani: la fatica di ricordare è ciò che le fissa.'),
        h('div.bottoni', null, h('button.btn', { onclick: v.chiudi }, 'Fine'))));
      if (giuste === fatte && fatte >= 5) festa();
      return;
    }
    const x = coda[i], c = x.c, mz = Stato.prendi<Mazzo>(c.mazzo);
    const fronte = h('div.carta-faccia.fronte'), retro = h('div.carta-faccia.retro');
    fronte.innerHTML = domandaDi(c, x.rev);
    retro.innerHTML = c.tipo === 'cloze' ? htmlCarta(c.f, 'mostra') + (c.r ? '<hr>' + htmlCarta(c.r) : '') : htmlCarta(x.rev ? c.f : c.r);
    const carta = h('div.carta', { role: 'button', tabindex: '0', 'aria-label': 'Gira la carta' }, h('div.carta-interno', null, fronte, retro));
    const etich = h('div.tenue.piccolo.carta-mazzo', null, (mz ? mz.nome : '') + (x.rev ? ' · inversa' : '') + (Carte.mem(x) ? '' : ' · nuova'));
    area.append(etich, carta);
    caricaImmagini(carta);
    const gira = () => { if (girata) return; girata = true; carta.classList.add('girata'); };
    const voti = () => {
      const iv = Carte.anteprima(x), nomi = ['Di nuovo', 'Difficile', 'Bene', 'Facile'];
      const testoIv = (d: number) => d === 0 ? '<10 min' : d < 30 ? d + ' g' : d < 365 ? Math.round(d / 30) + ' mesi' : '1 anno+';
      return h('div.carte-voti', null, [1, 2, 3, 4].map(g => h('button.voto.voto-' + g, { onclick: () => avanti(g) }, h('b', null, nomi[g - 1]), h('small', null, testoIv(iv[g - 1])))));
    };
    const giustaS = rispostaDi(c, x.rev);
    const altreS = modo === 'scelta' ? Array.from(new Set(Carte.voci([c.mazzo]).concat(Carte.voci()).filter(y => y.c.id !== c.id).map(y => rispostaDi(y.c, x.rev)).filter(r => r && normRisp(r) !== normRisp(giustaS)))) : [];
    const modoQui: ModoCarte = modo === 'scelta' && altreS.length < 2 ? 'gira' : modo;   // poche carte simili: questa si gira
    if (modoQui === 'gira') {
      const sotto = h('div.carte-sotto', null, h('button.btn.carte-mostra', { onclick: () => { gira(); svuota(sotto); sotto.appendChild(voti()); } }, 'Mostra risposta'));
      carta.addEventListener('click', () => { if (!girata) { gira(); svuota(sotto); sotto.appendChild(voti()); } });
      // scorri: destra = Bene, sinistra = Di nuovo (dopo aver girato)
      let x0 = 0, dx = 0;
      carta.addEventListener('pointerdown', e => { x0 = e.clientX; dx = 0; });
      carta.addEventListener('pointermove', e => { if (!girata || !x0) return; dx = e.clientX - x0; carta.style.transform = 'translateX(' + dx + 'px) rotate(' + dx / 25 + 'deg)'; carta.classList.toggle('verso-ok', dx > 60); carta.classList.toggle('verso-ko', dx < -60); });
      const rilascia = () => { if (!x0) return; x0 = 0; carta.style.transform = ''; carta.classList.remove('verso-ok', 'verso-ko'); if (girata && Math.abs(dx) > 90) avanti(dx > 0 ? 3 : 1); };
      carta.addEventListener('pointerup', rilascia); carta.addEventListener('pointercancel', rilascia);
      area.appendChild(sotto);
    } else if (modoQui === 'scelta') {
      const giusta = giustaS, altre = altreS;
      const stesso = new Set(Carte.voci([c.mazzo]).map(y => rispostaDi(y.c, x.rev)));
      const opz = altre.sort((p, q) => (stesso.has(q) ? 1 : 0) - (stesso.has(p) ? 1 : 0) || Math.random() - .5).slice(0, 3).concat([giusta]).sort(() => Math.random() - .5);
      const forme = ['▲', '◆', '●', '■'];
      const lista = h('div.carte-opzioni', null, opz.map((o, k) => h('button.opzione.op-' + k, { onclick: (e: Event) => {
        const ok = o === giusta; lista.querySelectorAll('button').forEach((b, q) => { (b as HTMLButtonElement).disabled = true; if (opz[q] === giusta) b.classList.add('giusta'); });
        if (!ok) (e.currentTarget as HTMLElement).classList.add('sbagliata');
        gira(); area.appendChild(h('div.bottoni', null, h('button.btn', { onclick: () => avanti(ok ? 3 : 1) }, ok ? '✓ Avanti' : '✗ Avanti (la rivedrai)')));
      } }, h('span.forma', null, forme[k]), h('span', null, testoPiano(o)))));
      area.appendChild(lista);
    } else {
      const giusta = rispostaDi(c, x.rev);
      const campo = h('input.carte-campo', { type: 'text', placeholder: 'Scrivi la risposta…', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' }) as HTMLInputElement;
      const verifica = () => {
        if (girata) return;
        const ok = normRisp(campo.value) === normRisp(giusta) || (normRisp(giusta).length > 12 && normRisp(giusta).includes(normRisp(campo.value)) && normRisp(campo.value).length >= normRisp(giusta).length * .6);
        gira(); campo.disabled = true; campo.classList.add(ok ? 'giusta' : 'sbagliata');
        area.appendChild(h('div.bottoni', null,
          h('button.btn', { onclick: () => avanti(ok ? 3 : 1) }, ok ? '✓ Avanti' : '✗ Avanti'),
          ok ? null : h('button.btn.neutro', { onclick: () => avanti(3) }, 'Era giusta')));
      };
      const form = h('form.carte-scrivi', { onsubmit: (e: Event) => { e.preventDefault(); verifica(); } }, campo, h('button.btn', { type: 'submit' }, 'Verifica'));
      area.appendChild(form); setTimeout(() => campo.focus(), 50);
    }
  }
  mostra();
}

/** Piccola celebrazione (rispetta "riduci movimento"). */
function festa(): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = h('canvas.festa') as HTMLCanvasElement; document.body.appendChild(cv);
  cv.width = innerWidth; cv.height = innerHeight; const g = cv.getContext('2d')!;
  const col = ['#6c8cff', '#2f9e44', '#f59f00', '#e8590c', '#7048e8'];
  const p = Array.from({ length: 60 }, () => ({ x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - .5) * 9, vy: -Math.random() * 9 - 3, c: col[Math.floor(Math.random() * 5)], r: Math.random() * 6 + 3 }));
  let t = 0; const passo = () => { g.clearRect(0, 0, cv.width, cv.height); for (const q of p) { q.x += q.vx; q.y += q.vy; q.vy += .35; g.fillStyle = q.c; g.fillRect(q.x, q.y, q.r, q.r * .6); } if (++t < 55) requestAnimationFrame(passo); else cv.remove(); };
  requestAnimationFrame(passo);
}

// ---------- Viste ----------
function editorCarta(idMazzo: string, c?: Carta): void {
  const f = h('textarea.campo', { rows: 3, placeholder: 'Fronte (domanda). Completamento: scrivi {{parola}} per nasconderla.' }, c ? c.f : '') as HTMLTextAreaElement;
  const r = h('textarea.campo', { rows: 3, placeholder: 'Retro (risposta). Immagini: ![](https://…)' }, c ? c.r : '') as HTMLTextAreaElement;
  const inv = h('input', { type: 'checkbox', checked: !!(c && c.inversa) }) as HTMLInputElement;
  foglio({ titolo: c ? 'Modifica carta' : 'Nuova carta', corpo: h('div.modulo', null, f, r,
    h('label.widget-riga', null, h('span.nome', null, 'Crea anche la carta inversa', h('div.tenue.piccolo', null, 'Studi anche dal retro al fronte (utile per termini e definizioni).')), h('span.interruttore', null, inv, h('span')))),
    elimina: c ? () => { Stato.elimina(c.id); } : undefined,
    salva: () => {
      if (!f.value.trim()) return;
      if (c && Carte.hash(idMazzo + '|' + norm(c.f)) !== Carte.hash(idMazzo + '|' + norm(f.value))) { Object.assign(c, { f: f.value.trim(), r: r.value.trim(), tipo: Carte.isCloze(f.value) ? 'cloze' : 'base', inversa: inv.checked || undefined }); Stato.salva(c); return; }
      Carte.riempi(idMazzo, [{ f: f.value.trim(), r: r.value.trim() }]);
      const id = 'cr-' + Carte.hash(idMazzo + '|' + norm(f.value.trim())), nc = Stato.prendi<Carta>(id);
      if (nc) { nc.inversa = inv.checked || undefined; Stato.salva(nc); }
      if (!c) setTimeout(() => editorCarta(idMazzo), 50);   // pronta la prossima (creare deve essere veloce)
    } });
}

async function importaCarte(padre?: string): Promise<void> {
  const fileLocale = h('input', { type: 'file', accept: '.txt,.csv,.tsv,.md,.markdown,.json,text/*,application/json', style: { display: 'none' }, onchange: async () => {
    const fl = (fileLocale as HTMLInputElement).files; if (!fl || !fl.length) return;
    let n = 0;
    for (const file of Array.from(fl)) { const d = Carte.leggi(file.name, await file.text()); const m = Carte.nuovoMazzo(d.nome || file.name.replace(/\.[^.]+$/, ''), padre, d.micro ? Carte.collega(d.micro) : {}); n += Carte.riempi(m.id, d.carte); }
    fs.chiudi(); avviso('Importate ' + n + ' carte.'); disegna();
  } }) as HTMLInputElement;
  const fs = foglio({ titolo: 'Importa flashcard', corpo: h('div.modulo', null,
    h('div.tenue.piccolo', null, 'Formati: testo/CSV «fronte TAB retro» (export di Quizlet o di Anki «Note in testo semplice»), Markdown («---» tra fronte e retro, «===» tra le carte, oppure «domanda :: risposta»), JSON. Il file .apkg di Anki non si legge: da Anki esporta come testo.'),
    h('div.gruppo', null,
      h('button.voce-lista', { onclick: () => fileLocale.click() }, h('span.voce-corpo', null, h('span.voce-titolo', null, '📱 File dal telefono o dal PC'), h('span.voce-sotto', null, 'uno o più file: ogni file diventa un mazzo'))),
      h('button.voce-lista', { onclick: async () => { if (serveGoogle()) return; const sc = await scegliFileDrive({ titolo: 'File di flashcard su Drive', multi: true }); if (!sc.length) return; fs.chiudi(); avviso('Importo…');
        let n = 0; for (const x of sc) n += await Carte.importaFileDrive(x.id, x.name, padre); avviso('Importate ' + n + ' carte da ' + sc.length + ' file.'); disegna(); } },
        h('span.voce-corpo', null, h('span.voce-titolo', null, '📄 File su Drive'), h('span.voce-sotto', null, 'restano collegati: «Aggiorna da Drive» rilegge le modifiche'))),
      h('button.voce-lista', { onclick: async () => { if (serveGoogle()) return; const sc = await scegliFileDrive({ titolo: 'Cartella di flashcard su Drive', mime: 'application/vnd.google-apps.folder' }); if (!sc.length) return; fs.chiudi(); avviso('Importo la cartella…', 4000);
        try { const r = await Carte.importaCartellaDrive(sc[0].id, sc[0].name, padre); avviso('Importati ' + r.mazzi + ' mazzi, ' + r.carte + ' carte.'); } catch (e: any) { avviso('Import non riuscito: ' + (e.message || e), 8000); } disegna(); } },
        h('span.voce-corpo', null, h('span.voce-titolo', null, '📁 Cartella su Drive'), h('span.voce-sotto', null, 'cartella = mazzo, sottocartelle = sotto-mazzi; le immagini della cartella si usano con ![](nome.png)')))),
    fileLocale) });
}

function esportaMazzo(m: Mazzo): void {
  const righe = ['#separator:tab', '#html:false', '#columns:Fronte\tRetro'].concat(Carte.carteDi(m.id).map(c => [c.f, c.r].map(x => x.replace(/[\t\r\n]+/g, ' ')).join('\t')));
  const a = h('a', { href: URL.createObjectURL(new Blob([righe.join('\n')], { type: 'text/plain' })), download: m.nome + '.txt' }) as HTMLAnchorElement;
  a.click();
}

function opzioniMazzo(m: Mazzo): void {
  chiedi(m.nome, [
    { testo: '➕ Aggiungi carta', valore: 'carta' }, { testo: '📂 Sotto-mazzo', valore: 'sotto' },
    ...(m.fonte ? [{ testo: '🔄 Aggiorna da Drive', valore: 'agg' }] : []),
    { testo: '✏️ Rinomina', valore: 'nome' }, { testo: '📤 Esporta (Anki/Quizlet)', valore: 'esp' },
    { testo: '🗑 Elimina mazzo e carte', valore: 'del', pericolo: true }]).then(async r => {
    if (r === 'carta') editorCarta(m.id);
    if (r === 'sotto') { const n = prompt('Nome del sotto-mazzo'); if (n) { Carte.nuovoMazzo(n, m.id); disegna(); } }
    if (r === 'agg') { if (serveGoogle()) return; avviso('Aggiorno…'); try { const n = await Carte.aggiornaDaDrive(m); avviso(n ? n + ' carte nuove o modificate.' : 'Già aggiornato.'); } catch (e: any) { avviso(String(e.message || e)); } }
    if (r === 'nome') { const n = prompt('Nuovo nome', m.nome); if (n) { m.nome = n; Object.assign(m, Carte.collega(n)); Stato.salva(m); } }
    if (r === 'esp') esportaMazzo(m);
    if (r === 'del') { for (const id of Carte.albero(m.id)) { for (const c of Carte.carte().filter(c => c.mazzo === id)) Stato.elimina(c.id); Stato.elimina(id); } }
  });
}

function vistaCarte(): HTMLElement {
  const aperto = (UI as any).mazzoAperto as string | undefined;
  if (aperto && Stato.prendi<Mazzo>(aperto)) return vistaMazzo(Stato.prendi<Mazzo>(aperto)!);
  const tot = Carte.conta(), radici = Carte.mazzi().filter(m => !m.padre || !Stato.prendi(m.padre));
  const riga = (m: Mazzo, liv: number): HTMLElement[] => {
    const n = Carte.conta([m.id]);
    return [h('div.voce-lista.mazzo-riga', { style: { paddingLeft: (8 + liv * 16) + 'px' } },
      h('button.voce-corpo', { onclick: () => { (UI as any).mazzoAperto = m.id; disegna(); } },
        h('span.voce-titolo', null, (liv ? '└ ' : '') + m.nome, m.sub ? h('span.chip-mini', null, Studio.etichetta(m.sub) + (m.micro ? ' ' + m.micro : '')) : null),
        h('span.voce-sotto', null, h('b.c-nuove', null, n.nuove + ' nuove'), ' · ', h('b.c-rip', null, n.ripasso + ' da ripassare'), ' · ' + n.totale + ' carte', m.fonte ? ' · ☁︎ Drive' : '')),
      h('button.icona-btn', { 'aria-label': 'Opzioni', onclick: () => opzioniMazzo(m) }, '⋯'))].concat(...Carte.figli(m.id).map(f => riga(f, liv + 1)));
  };
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    h('section.card', null,
      h('button.btn.studia-ora', { disabled: !(tot.nuove + tot.ripasso), onclick: () => avviaCarte(undefined, 'Tutti i mazzi') }, tot.nuove + tot.ripasso ? '▶ Ripassa ' + (tot.nuove + tot.ripasso) + ' carte' : '✓ Nessuna carta per oggi'),
      h('div.tenue.piccolo', { style: { marginTop: '6px' } }, tot.ripasso + ' da ripassare + ' + tot.nuove + ' nuove (massimo ' + ((imp() as any).carteNuove || 20) + ' nuove al giorno, come Anki). Si alternano mazzi diversi.'),
      h('div.bottoni', null, h('button.btn.neutro', { onclick: () => { const n = prompt('Nome del mazzo (es. «2.2.4 Calore latente» per collegarlo allo step)'); if (n) { const m = Carte.nuovoMazzo(n); disegna(); editorCarta(m.id); } } }, '＋ Nuovo mazzo'), h('button.btn.neutro', { onclick: () => importaCarte() }, '⤓ Importa'))),
    h('section.card', null, h('h2.card-titolo', null, 'Mazzi'),
      radici.length ? radici.flatMap(m => riga(m, 0)) : h('div.vuoto', null, 'Nessun mazzo. Creane uno o importa da Drive (file o cartelle), da Anki o da Quizlet.')));
}

function vistaMazzo(m: Mazzo): HTMLElement {
  const n = Carte.conta([m.id]), cc = Carte.carteDi(m.id);
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    h('button.btn-testo', { style: { alignSelf: 'flex-start' }, onclick: () => { (UI as any).mazzoAperto = m.padre && Stato.prendi(m.padre) ? m.padre : undefined; disegna(); } }, '‹ Mazzi'),
    h('section.card', null, h('h2.card-titolo', null, m.nome),
      m.sub ? h('div.tenue.piccolo', null, 'Collegato a ' + Studio.etichetta(m.sub) + (m.micro ? ' · microstep ' + m.micro : '') + ': compare nei ripassi e in «Studia ora».') : null,
      h('button.btn.studia-ora', { disabled: !(n.nuove + n.ripasso), onclick: () => avviaCarte([m.id], m.nome) }, n.nuove + n.ripasso ? '▶ Ripassa ' + (n.nuove + n.ripasso) + ' carte' : '✓ Niente per oggi'),
      h('div.bottoni', null, h('button.btn.neutro', { onclick: () => editorCarta(m.id) }, '＋ Carta'), h('button.btn.neutro', { onclick: () => importaCarte(m.id) }, '⤓ Importa qui'), h('button.btn.neutro', { onclick: () => opzioniMazzo(m) }, '⋯ Altro'))),
    h('section.card', null, h('h2.card-titolo', null, cc.length + ' carte'),
      cc.slice(0, 200).map(c => { const me = Carte.mem({ c, rev: false }); return h('button.voce-lista', { onclick: () => editorCarta(c.mazzo, c) },
        h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, testoPiano(c.f.replace(/\{\{([^}]+)\}\}/g, '[$1]')).slice(0, 120)),
          h('span.voce-sotto', null, testoPiano(c.r).slice(0, 90) || (c.tipo === 'cloze' ? 'completamento' : ''), me ? ' · 🧠 ' + Math.round(Ripassi.recuperabilita(Math.max(0, Math.round((inizioGiorno(new Date()).getTime() - inizioGiorno(daDt(me.ultimo!)).getTime()) / 86400000)), me.s) * 100) + '%' : ' · nuova'))); }),
      cc.length > 200 ? h('div.tenue.piccolo', null, '… e altre ' + (cc.length - 200)) : null));
}

/** Nel sotto-step: carte collegate. */
function rigaCarte(k: string): HTMLElement | null {
  const mz = Carte.mazzi().filter(m => m.sub === k); if (!mz.length) return null;
  const n = Carte.conta(mz.map(m => m.id));
  return h('div.bottoni', null, h('button.btn.neutro', { onclick: () => avviaCarte(mz.map(m => m.id), Studio.etichetta(k)) }, '🃏 Flashcard di ' + Studio.etichetta(k) + ' (' + (n.nuove + n.ripasso) + ' oggi / ' + n.totale + ')'));
}

/** Riquadro in Oggi. */
function widgetCarte(): HTMLElement | null {
  if (!Carte.mazzi().length) return null;
  const n = Carte.conta(); if (!(n.nuove + n.ripasso)) return null;
  return scheda('Flashcard di oggi', h('div.tenue.piccolo', null, n.ripasso + ' da ripassare + ' + n.nuove + ' nuove · circa ' + Math.max(2, Math.round((n.ripasso + n.nuove) * 0.2)) + ' min'),
    h('div.bottoni', null, h('button.btn', { onclick: () => avviaCarte(undefined, 'Tutti i mazzi') }, '▶ Ripassa')));
}

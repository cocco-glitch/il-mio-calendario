// ============================================================
// 06-gcal.ts — Specchio su Google Calendar + import/export .ics.
//
// SPECCHIO (Livello 2 delle notifiche): gli eventi (e i promemoria con ora)
// delle categorie scelte vengono copiati in un calendario Google DEDICATO,
// "Il mio calendario – app", creato dall'app. Così le notifiche arrivano
// native dall'app Google Calendar / Calendario di iOS.
// - Scope: calendar.app.created → l'app vede e modifica SOLO i calendari che
//   ha creato lei, non gli altri tuoi calendari.
// - Id evento Google = UUID del record senza trattini (deterministico): niente
//   doppioni anche se lo specchio gira da due dispositivi.
// - Si invia solo ciò che è cambiato (mappa id → updatedAt in localStorage).
// ============================================================

const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const GCAL_NOME = 'Il mio calendario – app';

const GCal = (() => {
  let inCorso = false, timer = 0;
  const LSK = 'imc-gcal-inviati';
  const inviati = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(LSK) || '{}'); } catch (_) { return {}; } };
  const salvaInviati = (m: Record<string, number>) => { try { localStorage.setItem(LSK, JSON.stringify(m)); } catch (_) { /* niente */ } };
  const attivo = () => !!imp().gcal;

  async function chiama(percorso: string, opz: RequestInit = {}): Promise<any> {
    const t = await Drive.tokenValido(false);
    if (!t) throw new Error('NOLOGIN');
    const r = await fetch('https://www.googleapis.com/calendar/v3/' + percorso, { ...opz, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', ...(opz.headers || {}) } });
    if (r.status === 204) return null;
    if (!r.ok) { const e: any = new Error('Calendar ' + r.status + ': ' + (await r.text()).slice(0, 200)); e.status = r.status; throw e; }
    return r.json();
  }

  /** Trova o crea il calendario dedicato; l'id è salvato nelle impostazioni (condiviso tra dispositivi). */
  async function calendario(): Promise<string> {
    const i = imp();
    if (i.gcalId) { try { await chiama('calendars/' + encodeURIComponent(i.gcalId)); return i.gcalId; } catch (e: any) { if (e.status !== 404) throw e; } }
    const c = await chiama('calendars', { method: 'POST', body: JSON.stringify({ summary: GCAL_NOME, timeZone: 'Europe/Rome', description: 'Creato dall\'app "Il mio calendario". Si aggiorna da solo: le modifiche vanno fatte nell\'app.' }) });
    i.gcalId = c.id; Stato.salva(i);
    return c.id;
  }

  /** Id evento valido per Google (esadecimale, 32 caratteri) ricavato da una stringa. */
  function hashHex(s: string): string {
    let out = '';
    for (let k = 0; k < 4; k++) { let h = 0x811c9dc5 ^ k; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } out += h.toString(16).padStart(8, '0'); }
    return out;
  }
  function idGoogle(id: string): string { return id.replace(/[^0-9a-f]/gi, '').toLowerCase().padEnd(5, '0'); }
  const dtG = (s: string) => s.length > 10 ? s + ':00' : s;
  function rruleIcs(rr: Ricorrenza): string {
    let r = 'RRULE:FREQ=' + { D: 'DAILY', W: 'WEEKLY', M: 'MONTHLY', Y: 'YEARLY' }[rr.freq] + ';INTERVAL=' + (rr.interval || 1);
    if (rr.byday && rr.byday.length) r += ';BYDAY=' + rr.byday.map(g => ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][g]).join(',');
    if (rr.until) r += ';UNTIL=' + rr.until.replace(/-/g, '') + 'T225959Z';
    if (rr.count) r += ';COUNT=' + rr.count;
    return r;
  }
  /** Converte un record nella risorsa evento Google (null = non va nello specchio). */
  function risorsa(r: Rec): any | null {
    const cats: string[] = imp().gcalCategorie || [];
    if (r.deleted || (cats.length && !cats.includes(r.categoriaId || ''))) return null;
    if (r.type === 'evento') {
      const e = r as Evento;
      const corpo: any = { id: idGoogle(e.id), summary: e.titolo, location: e.luogo || undefined, description: (e.note || '') + '\n\n(da Il mio calendario)',
        reminders: { useDefault: false, overrides: (e.promemoria || []).slice(0, 5).map(m => ({ method: 'popup', minutes: m })) } };
      if (e.tuttoIlGiorno) { corpo.start = { date: e.inizio.slice(0, 10) }; corpo.end = { date: ymd(piuGiorni(daYmd(e.fine), 1)) }; }
      else { corpo.start = { dateTime: dtG(e.inizio), timeZone: 'Europe/Rome' }; corpo.end = { dateTime: dtG(e.fine), timeZone: 'Europe/Rome' }; }
      const rec: string[] = [];
      if (e.rrule) rec.push(rruleIcs(e.rrule));
      if (e.rrule && e.exdate && e.exdate.length) rec.push(e.tuttoIlGiorno ? 'EXDATE;VALUE=DATE:' + e.exdate.map(d => d.replace(/-/g, '')).join(',') : 'EXDATE;TZID=Europe/Rome:' + e.exdate.map(d => d.replace(/-/g, '') + 'T' + e.inizio.slice(11).replace(':', '') + '00').join(','));
      if (rec.length) corpo.recurrence = rec;
      return corpo;
    }
    if (r.type === 'task') {
      const t = r as Task;
      if (t.fatto || !t.scadenza || t.scadenza.length <= 10) return null;   // solo promemoria con ora
      const fine = dtStr(piuMinuti(daDt(t.scadenza), 15));
      return { id: idGoogle(t.id), summary: '☑ ' + t.titolo, description: (t.note || '') + '\n\n(promemoria da Il mio calendario)',
        start: { dateTime: dtG(t.scadenza), timeZone: 'Europe/Rome' }, end: { dateTime: dtG(fine), timeZone: 'Europe/Rome' },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] }, ...(t.rrule ? { recurrence: [rruleIcs(t.rrule)] } : {}) };
    }
    return null;
  }

  let corrente: Promise<number> | null = null;
  /** Se un allineamento è già in corso, aspetta che finisca e poi ne fa un altro (così nulla va perso). */
  async function allinea(tutto = false): Promise<number> {
    while (corrente) { try { await corrente; } catch (_) { /* niente */ } }
    corrente = allineaOra(tutto);
    try { return await corrente; } finally { corrente = null; }
  }
  async function allineaOra(tutto: boolean): Promise<number> {
    if (!attivo() || !navigator.onLine) return 0;
    inCorso = true;
    try {
      const cal = encodeURIComponent(await calendario()), giaInviati = tutto ? {} : inviati(), nuovi = { ...giaInviati };
      let n = 0;
      for (const r of Stato.esporta()) {
        if (r.type !== 'evento' && r.type !== 'task') continue;
        if (giaInviati[r.id] === r.updatedAt) continue;
        const corpo = risorsa(r), gid = idGoogle(r.id);
        try {
          if (!corpo) { if (giaInviati[r.id] !== undefined || tutto) { try { await chiama('calendars/' + cal + '/events/' + gid, { method: 'DELETE' }); } catch (e: any) { if (e.status !== 404 && e.status !== 410) throw e; } } }
          else {
            try { await chiama('calendars/' + cal + '/events/' + gid, { method: 'PUT', body: JSON.stringify(corpo) }); }
            catch (e: any) { if (e.status === 404) await chiama('calendars/' + cal + '/events', { method: 'POST', body: JSON.stringify(corpo) }); else throw e; }
            n++;
          }
          nuovi[r.id] = r.updatedAt;
        } catch (e: any) { if (e.status === 401 || e.status === 403) throw e; console.warn('specchio', r.id, e); }
      }
      // Blocchi del piano di studio (un evento per voce, id derivato da piano+step: stabile).
      const vivi = new Set<string>();
      if (imp().gcalStudio) for (const p of Studio.pkPiani()) for (const g of p.giorni) for (const v of g.voci) {
        const data = Studio.dataVoce(v, g, p.id), chiave = 'piano:' + p.id + ':' + v.k, gid = hashHex(chiave);
        vivi.add(chiave);
        const ora = imp().gcalStudioOra || '';
        const firma = data + '|' + ora + '|' + v.t;
        if (giaInviati[chiave] !== undefined && (nuovi as any)['f:' + chiave] === firma) continue;
        const titolo = (p.modo === 'raffinamento' && !v.speciale ? 'Raffina ' : '📚 ') + (v.speciale ? v.t : Studio.etichetta(v.k) + ' · ' + v.t);
        const corpo: any = { id: gid, summary: titolo, description: (v.d || g.nota || '') + '\n\n(dal ' + p.titolo + ' — Il mio calendario)' };
        if (ora) { const i = data + 'T' + ora; corpo.start = { dateTime: i + ':00', timeZone: 'Europe/Rome' }; corpo.end = { dateTime: dtStr(piuMinuti(daDt(i), 60)) + ':00', timeZone: 'Europe/Rome' }; corpo.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] }; }
        else { corpo.start = { date: data }; corpo.end = { date: ymd(piuGiorni(daYmd(data), 1)) }; corpo.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] }; }
        try {
          try { await chiama('calendars/' + cal + '/events/' + gid, { method: 'PUT', body: JSON.stringify(corpo) }); }
          catch (e: any) { if (e.status === 404) await chiama('calendars/' + cal + '/events', { method: 'POST', body: JSON.stringify(corpo) }); else throw e; }
          nuovi[chiave] = 1; (nuovi as any)['f:' + chiave] = firma; n++;
        } catch (e: any) { if (e.status === 401 || e.status === 403) throw e; }
      }
      // Studio disattivato (o voce sparita): tolgo i blocchi copiati prima
      for (const chiave of Object.keys(nuovi)) if (chiave.startsWith('piano:') && !vivi.has(chiave)) {
        try { await chiama('calendars/' + cal + '/events/' + hashHex(chiave), { method: 'DELETE' }); } catch (e: any) { if (e.status !== 404 && e.status !== 410) throw e; }
        delete nuovi[chiave]; delete (nuovi as any)['f:' + chiave];
      }
      salvaInviati(nuovi);
      return n;
    } finally { inCorso = false; }
  }
  function programma(): void { if (!attivo()) return; clearTimeout(timer); timer = window.setTimeout(() => allinea().catch(() => { /* riprova al prossimo giro */ }), 5000); }

  return { allinea, programma, attivo, GCAL_NOME };
})();

// ---------- .ics ----------
function icsEsc(s: string): string { return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function icsData(s: string, tutto: boolean): string { return tutto ? ';VALUE=DATE:' + s.slice(0, 10).replace(/-/g, '') : ';TZID=Europe/Rome:' + s.replace(/-/g, '').replace(':', '') + '00'; }
function esportaIcs(): string {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Il mio calendario//IT', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Il mio calendario', 'X-WR-TIMEZONE:Europe/Rome'];
  const ora = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  for (const e of Stato.tutti<Evento>('evento')) {
    const fine = e.tuttoIlGiorno ? ymd(piuGiorni(daYmd(e.fine), 1)) : e.fine;
    L.push('BEGIN:VEVENT', 'UID:' + e.id + '@il-mio-calendario', 'DTSTAMP:' + ora, 'DTSTART' + icsData(e.inizio, e.tuttoIlGiorno), 'DTEND' + icsData(fine, e.tuttoIlGiorno), 'SUMMARY:' + icsEsc(e.titolo));
    if (e.luogo) L.push('LOCATION:' + icsEsc(e.luogo));
    if (e.note) L.push('DESCRIPTION:' + icsEsc(e.note));
    if (e.rrule) { const r = e.rrule; L.push('RRULE:FREQ=' + { D: 'DAILY', W: 'WEEKLY', M: 'MONTHLY', Y: 'YEARLY' }[r.freq] + ';INTERVAL=' + (r.interval || 1) + (r.byday && r.byday.length ? ';BYDAY=' + r.byday.map(g => ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][g]).join(',') : '') + (r.until ? ';UNTIL=' + r.until.replace(/-/g, '') + 'T225959Z' : '') + (r.count ? ';COUNT=' + r.count : '')); }
    for (const x of e.exdate || []) L.push('EXDATE' + icsData(e.tuttoIlGiorno ? x : x + 'T' + e.inizio.slice(11), e.tuttoIlGiorno));
    for (const m of e.promemoria || []) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(e.titolo), 'TRIGGER:-PT' + m + 'M', 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(r => { const out: string[] = []; while (r.length > 74) { out.push(r.slice(0, 74)); r = ' ' + r.slice(74); } out.push(r); return out.join('\r\n'); }).join('\r\n') + '\r\n';
}
/** Importa VEVENT da un file .ics. Gli eventi già importati (stesso UID) vengono aggiornati, non duplicati. */
function importaIcs(testo: string, categoriaId?: string): number {
  const righe = testo.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const de = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
  const leggiData = (chiave: string, val: string): { s: string; tutto: boolean } => {
    if (/VALUE=DATE/.test(chiave) || /^\d{8}$/.test(val)) return { s: val.slice(0, 4) + '-' + val.slice(4, 6) + '-' + val.slice(6, 8), tutto: true };
    const m = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/);
    if (!m) return { s: '', tutto: false };
    if (m[7]) return { s: dtStr(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]))), tutto: false };
    return { s: m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5], tutto: false };
  };
  let n = 0, ev: any = null;
  for (const riga of righe) {
    if (riga === 'BEGIN:VEVENT') { ev = { alarms: [] as number[] }; continue; }
    if (!ev) continue;
    if (riga === 'END:VEVENT') {
      if (ev.inizio) {
        // un .ics esportato da questa app torna sullo stesso evento (niente doppioni)
        const proprio = String(ev.uid || '').match(/^([0-9a-f-]{36}|ics-[A-Za-z0-9-]+)@il-mio-calendario$/);
        const id = proprio ? proprio[1] : 'ics-' + String(ev.uid || uid()).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60);
        let fine = ev.fine || ev.inizio;
        if (ev.tutto) fine = ymd(piuGiorni(daYmd(fine), ev.fine && ev.fine > ev.inizio ? -1 : 0)) + 'T23:59';
        else if (!ev.fine) fine = dtStr(piuMinuti(daDt(ev.inizio), 60));
        const e: Evento = { id, type: 'evento', updatedAt: 0, titolo: ev.titolo || '(senza titolo)', inizio: ev.tutto ? ev.inizio + 'T00:00' : ev.inizio, fine, tuttoIlGiorno: !!ev.tutto,
          luogo: ev.luogo, note: ev.note, categoriaId, rrule: ev.rrule, exdate: ev.exdate, promemoria: ev.alarms, checklist: [] };
        Stato.salva(e, true); n++;
      }
      ev = null; continue;
    }
    if (riga === 'BEGIN:VALARM' || riga === 'END:VALARM') continue;
    const i = riga.indexOf(':'); if (i < 0) continue;
    const chiave = riga.slice(0, i).toUpperCase(), val = riga.slice(i + 1), nome = chiave.split(';')[0];
    if (nome === 'UID') ev.uid = val;
    else if (nome === 'SUMMARY') ev.titolo = de(val);
    else if (nome === 'LOCATION') ev.luogo = de(val) || undefined;
    else if (nome === 'DESCRIPTION') ev.note = de(val);
    else if (nome === 'DTSTART') { const d = leggiData(chiave, val); ev.inizio = d.s; ev.tutto = d.tutto; }
    else if (nome === 'DTEND') ev.fine = leggiData(chiave, val).s;
    else if (nome === 'TRIGGER') { const m = val.match(/-?P(T(\d+)H)?(T?(\d+)M)?(\d+)?D?/); const ore = val.match(/(\d+)H/), min = val.match(/(\d+)M/), gg = val.match(/(\d+)D/); if (m) ev.alarms.push((gg ? +gg[1] * 1440 : 0) + (ore ? +ore[1] * 60 : 0) + (min ? +min[1] : 0)); }
    else if (nome === 'EXDATE') ev.exdate = (ev.exdate || []).concat(val.split(',').map(x => leggiData(chiave, x).s.slice(0, 10)));
    else if (nome === 'RRULE') {
      const p: Record<string, string> = {}; val.split(';').forEach(x => { const [k, v] = x.split('='); p[k] = v; });
      const f = ({ DAILY: 'D', WEEKLY: 'W', MONTHLY: 'M', YEARLY: 'Y' } as any)[p.FREQ];
      if (f) {
        ev.rrule = { freq: f, interval: +(p.INTERVAL || 1) } as Ricorrenza;
        if (p.BYDAY && f === 'W') ev.rrule.byday = p.BYDAY.split(',').map((d: string) => ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].indexOf(d.slice(-2))).filter((x: number) => x >= 0);
        if (p.UNTIL) ev.rrule.until = p.UNTIL.slice(0, 4) + '-' + p.UNTIL.slice(4, 6) + '-' + p.UNTIL.slice(6, 8);
        if (p.COUNT) ev.rrule.count = +p.COUNT;
      }
    }
  }
  if (n) Stato.notifica();
  return n;
}

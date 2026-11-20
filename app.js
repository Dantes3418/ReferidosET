// ===== CONFIGURACIÓN =====
const API = 'https://script.google.com/macros/s/AKfycbwfQzd1WGCSAhJatsvmSHNfpimFSs2hOGpKLvKv_9Pw7x-eMM6KotJuA_Smic9RXnB5Eg/exec';
// Estados (el texto guardado en la hoja) · color · nombre que se ve en pantalla
const ESTADOS = ['CON COBERTURA', 'SIN COBERTURA', 'SIN COB. EN ESPERA...', 'FIN DE MES', 'SIGUIENTE MES', 'CERRADO','NS/NR'];
const COL = { 'CON COBERTURA': '#00b85c', 'SIN COBERTURA': '#e20000fd', 'SIN COB. EN ESPERA...': '#ff02ab', 'FIN DE MES': '#f0aa42', 'SIGUIENTE MES': '#0EA5E9', 'CERRADO': '#111111','NS/NR': '#B8B4C8', 'SIN ESTADO': '#B8B4C8' };
const LBL = { 'CON COBERTURA': 'CON COBERTURA', 'SIN COBERTURA': 'SIN COBERTURA', 'SIN COB. EN ESPERA...': 'SIN COB. EN ESPERA...', 'FIN DE MES': 'FIN DE MES', 'SIGUIENTE MES': 'SIGUIENTE MES', 'CERRADO': 'CERRADO','NS/NR': 'NS/NR', 'SIN ESTADO': 'Sin estado' };

// Mensaje que se escribe solo al abrir WhatsApp (edítalo a tu gusto)
const WA_MSG = ' ¡Hola! 👋😄 ¿Cómo está? Le saluda su asesor de Internet Hogar Entel 📶 Le escribo porque conversamos recientemente acerca de los planes de internet para su hogar 🏠 ';

const $ = id => document.getElementById(id);
// Íconos de línea (reemplazan a los emoticones)
const ic = p => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC = {
  pin: ic('<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  phone: ic('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
  chev: ic('<path d="M6 9l6 6 6-6"/>'),
  wa: ic('<path d="M3 21l1.7-5A9 9 0 1 1 8 19.3L3 21z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a3.5 3.5 0 0 1-1.8-1.8l.8-1-1-2L9 9.5z"/>'),
  edit: ic('<path d="M4 20h4L19 9l-4-4L4 16v4z"/>'),
  trash: ic('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  copy: ic('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>'),
  flag: ic('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>')
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const J = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const W = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// Q = referidos en espera (sin internet) · QW = clics de WhatsApp pendientes de contar
// Q = referidos en espera · QW = clics de WhatsApp pendientes · QE = marcas de OJO pendientes
let S = J('sess', null), D = J('data', []), NAMES = J('names', {}), Q = J('queue', []), QW = J('waq', []), QE = J('eyeq', []);
let edit = null, qedit = null, est = '', cur = 'reg', CH = {}, flushing = false;
const OPEN = new Set(); // tarjetas desplegadas (por celular)

const adm = () => S && S.user === 'A';
const ok = d => ESTADOS.includes(d.estado) ? d.estado : 'SIN ESTADO';
// Compatibilidad: referidos en espera guardados con el formato anterior (plan + obs)
Q = Q.map(q => { const r = q.reg; if (r.estado === undefined) { const o = String(r.obs || ''); r.estado = ESTADOS.includes(o) ? o : ''; r.observacion = ESTADOS.includes(o) ? '' : o.replace(/^OTRO:\s*/, ''); delete r.obs; delete r.plan; } return q; });
const day = d => d.fecha.slice(0, 10);
const ymd = (n = 0) => { const t = new Date(); t.setDate(t.getDate() - n); return t.toLocaleDateString('sv'); };
const who = u => NAMES[u] || (S && u === S.user ? S.name : 'Vendedor ' + u);
const cnt = (a, f) => a.reduce((m, d) => (m[f(d)] = (m[f(d)] || 0) + 1, m), {});
const hm = f => f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)} ${f.slice(11)}` : '';
const wtxt = n => `${n} ${n === 1 ? 'interacción' : 'interacciones'}`;
let tt; const toast = (m, e) => { const t = $('toast'); t.textContent = m; t.className = e ? 'err show' : 'show'; clearTimeout(tt); tt = setTimeout(() => t.className = '', 3500); };

// ===== API (con tiempo límite: si no hay señal, no se queda colgado) =====
async function api(b, ms = 20000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: S && S.token, ...b }), signal: c.signal });
    const j = await r.json();
    if (j.expired) logout();
    return j;
  } finally { clearTimeout(t); }
}

// ===== SESIÓN (se pide la contraseña una sola vez) =====
async function login() {
  const b = $('b-login'); $('l-err').textContent = ''; b.disabled = true;
  try {
    const r = await api({ action: 'login', password: $('pass').value });
    if (!r.ok) { $('l-err').textContent = r.error; return; }
    S = { token: r.token, user: r.user, name: r.name }; W('sess', S); $('pass').value = ''; start();
  } catch (e) { $('l-err').textContent = 'Sin conexión. Intenta de nuevo.'; } finally { b.disabled = false; }
}
function logout() {
  S = null; D = [];
  ['sess', 'data', 'names'].forEach(k => localStorage.removeItem(k));
  document.body.classList.remove('adm'); $('app').hidden = true; $('login').hidden = false;
}
function start() {
  $('login').hidden = true; $('app').hidden = false;
  document.body.classList.toggle('adm', adm());
  $('h-name').textContent = S.name; $('n-list').textContent = adm() ? 'Todos' : 'Mis referidos';
  buildForm(); buildFilters(); resetForm(); nav('reg'); render(); load();
}
async function load() {
  $('h-sync').textContent = 'Actualizando...';
  try {
    const r = await api({ action: 'list' });
    if (!r.ok) throw 0;
    D = r.data; NAMES = r.names || {};
    QE.forEach(e => { const d = D.find(x => x.celular === e.celular); if (d) d.ojo = e.v; });
    W('data', D); W('names', NAMES);
    buildFilters(); render();
    $('h-sync').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    flush();
  } catch (e) { $('h-sync').textContent = 'Sin conexión · datos guardados'; }
}

// ===== REGISTRO =====
function buildForm() {
  $('est').innerHTML = ESTADOS.map(e => `<button type="button" class="st" data-s="${esc(e)}" style="--c:${COL[e]}">${LBL[e]}</button>`).join('');
}
function setEst(e) { est = e; document.querySelectorAll('.st').forEach(c => c.classList.toggle('on', c.dataset.s === e)); }
function resetForm() {
  $('f').reset(); setEst(''); edit = null; qedit = null;
  $('f-title').textContent = 'Nuevo referido'; $('b-save').textContent = 'Guardar referido';
  $('b-cancel').hidden = $('b-del').hidden = true;
}
function fillForm(cel, nom, estado, obs, coo) {
  $('cel').value = cel; $('nom').value = nom; setEst(estado); $('obs').value = obs || ''; $('coo').value = coo;
}
function parseCoo(s) { const m = String(s || '').match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/); return m ? m[1] + ',' + m[2] : String(s || '').trim(); }
function gps() {
  if (!navigator.geolocation) return toast('Tu teléfono no permite GPS', 'err');
  $('b-gps').textContent = '...';
  navigator.geolocation.getCurrentPosition(
    p => { $('coo').value = p.coords.latitude.toFixed(6) + ',' + p.coords.longitude.toFixed(6); $('b-gps').innerHTML = IC.pin + 'GPS'; },
    () => { $('b-gps').innerHTML = IC.pin + 'GPS'; toast('No se pudo obtener el GPS. Activa la ubicación o pega las coordenadas.', 'err'); },
    { enableHighAccuracy: true, timeout: 15000 });
}
const normCel = v => { let c = String(v || '').replace(/\D/g, ''); if (c.length === 11 && c.startsWith('591')) c = c.slice(3); return c; };

// Acepta la respuesta liviana (item/upd) o la antigua (lista completa en data)
function applySaved(r) {
  if (r.data) { D = r.data; return; }
  if (r.item) { D = D.filter(x => x.celular !== r.item.celular); D.push(r.item); }
  else if (r.upd) { const d = D.find(x => x.row === r.upd.row); if (d) { d.celular = r.upd.celular; d.nombre = r.upd.nombre; d.estado = r.upd.estado; d.obs = r.upd.obs; d.coord = r.upd.coord; } }
}

async function submit(ev) {
  ev.preventDefault();
  if (!est) return toast('Elige un estado', 'err');
  const reg = { celular: $('cel').value, nombre: $('nom').value, estado: est, observacion: $('obs').value.trim(), coordenadas: parseCoo($('coo').value) };
  if (edit) {
    const b = $('b-save'); b.disabled = true;
    try {
      const r = await api({ action: 'update', row: edit, reg });
      if (!r.ok) throw r;
      applySaved(r); W('data', D); toast('Cambios guardados'); resetForm(); render();
    } catch (x) { toast(x && x.error ? x.error : 'Sin conexión. Intenta de nuevo', 'err'); }
    finally { b.disabled = false; }
    return;
  }
  // Registro nuevo: se valida aquí y se guarda al instante; el envío sigue en segundo plano
  const fromQ = qedit != null ? Q.find(q => q.ts === qedit) : null, nc = normCel(reg.celular);
  if (!/^\d{8}$/.test(nc)) return toast('Celular inválido: deben ser 8 dígitos', 'err');
  if (D.some(d => d.celular === nc) || Q.some(q => q !== fromQ && normCel(q.reg.celular) === nc)) return toast('Este celular ya está registrado', 'err');
  const ts = fromQ ? fromQ.ts : Date.now();
  if (fromQ) fromQ.reg = reg; else Q.push({ reg, ts });
  W('queue', Q); resetForm(); render(); toast('Referido guardado');
  await flush(true);
  if (Q.some(q => q.ts === ts) && !navigator.onLine) toast('Sin señal: quedó en espera en tu teléfono y se enviará solo');
}

// Envía los pendientes: primero referidos en espera, luego clics de WhatsApp
async function flush(quiet) {
  if (!S || flushing || !(Q.length || QW.length || QE.length)) return;
  flushing = true; let sent = 0;
  try {
      for (let q; (q = Q.find(x => x.ts !== qedit)); ) { // (el que estás editando se salta)
      const r = await api({ action: 'add', reg: q.reg, ts: q.ts });
      if (r.expired) return;
      Q = Q.filter(x => x !== q); W('queue', Q);
      if (r.ok) { applySaved(r); sent++; } else toast(q.reg.celular + ': ' + r.error, 'err');
    }
    while (QW.length) {
      const w = QW[0], r = await api({ action: 'wa', celular: w.celular, ts: w.ts });
      if (r.expired) return;
      QW.shift(); W('waq', QW);
      if (r.ok) setClicks(w.celular, r.clicks, r.last);
    }
    while (QE.length) {
      const e = QE[0], r = await api({ action: 'eye', celular: e.celular, v: e.v });
      if (r.expired) return;
      QE.shift(); W('eyeq', QE);
    }
    if (sent) { W('data', D); if (quiet !== true) toast('Pendientes enviados'); }
  } catch (e) { /* sin señal: reintenta luego */ } finally { flushing = false; render(); }
}

function startEdit(row) {
  const d = D.find(x => x.row === row); if (!d) return;
  resetForm(); edit = row; fillForm(d.celular, d.nombre, d.estado, d.obs, d.coord);
  $('f-title').textContent = 'Editar referido'; $('b-save').textContent = 'Guardar cambios';
  $('b-cancel').hidden = false; $('b-del').hidden = !adm(); nav('reg');
}
function startEditQ(ts) {
  const q = Q.find(x => x.ts === ts); if (!q) return;
  resetForm(); qedit = ts; const r = q.reg;
  fillForm(r.celular, r.nombre, r.estado, r.observacion, r.coordenadas);
  $('f-title').textContent = 'Editar referido en espera'; $('b-save').textContent = 'Guardar';
  $('b-cancel').hidden = false; nav('reg');
}
async function del() {
  const d = D.find(x => x.row === edit);
  if (!d || !confirm(`¿Eliminar a "${d.nombre}"? También se borra de la hoja de Google.`)) return;
  try { const r = await api({ action: 'delete', row: edit }); if (!r.ok) throw r; D = r.data; W('data', D); resetForm(); render(); toast('Eliminado'); }
  catch (x) { toast((x && x.error) || 'Sin conexión', 'err'); }
}

// ===== WHATSAPP (mensaje automático + contador) =====
const waLink = cel => 'https://wa.me/591' + cel + '?text=' + encodeURIComponent(WA_MSG);
function paintClicks(cel, n) {
  document.querySelectorAll('[data-wc]').forEach(el => { if (el.dataset.wc === cel) el.textContent = wtxt(n); });
}
function setClicks(cel, n, last) {
  const d = D.find(x => x.celular === cel);
  if (d) { d.clicks = n; if (last) d.lastwa = last; W('data', D); }
  paintClicks(cel, n);
}
function waClick(cel) {
  // El link se abre solo (es un <a>); aquí solo se cuenta el uso
  const d = D.find(x => x.celular === cel);
  if (d) { d.clicks = (d.clicks || 0) + 1; W('data', D); paintClicks(cel, d.clicks); }
  const ts = Date.now();
  api({ action: 'wa', celular: cel, ts }, 15000)
    .then(r => { if (r.ok) setClicks(cel, r.clicks, r.last); })
    .catch(() => { QW.push({ celular: cel, ts }); W('waq', QW); });
}

// ===== MARCAR CON OJO (borde amarillo para remarcar) =====
function toggleEye(cel) {
  const d = D.find(x => x.celular === cel); if (!d) return;
  d.ojo = !d.ojo; W('data', D); renderList();
  toast(d.ojo ? 'Marcar OJO' : 'Quitar OJO');
  api({ action: 'eye', celular: cel, v: d.ojo }, 15000).then(r => { if (!r.ok) throw r; })
    .catch(x => {
      if (x && x.error) { d.ojo = !d.ojo; W('data', D); renderList(); return toast(x.error, 'err'); }
      QE = QE.filter(e => e.celular !== cel); QE.push({ celular: cel, v: d.ojo }); W('eyeq', QE); // sin señal: se envía luego
    });
}

// ===== LISTA =====
function buildFilters() {
  const o = (id, h, a) => { const s = $(id), v = s.value; s.innerHTML = `<option value="todos">${h}</option>` + a.map(([k, t]) => `<option value="${esc(k)}">${esc(t)}</option>`).join(''); if ([...s.options].some(x => x.value === v)) s.value = v; };
  o('fo', 'Todos los estados', ESTADOS.map(x => [x, LBL[x]])); o('fp', 'Todos', [['si', 'Solo con OJO']]);
  if (adm()) ['fv', 'sv'].forEach(id => o(id, 'Todos los vendedores', Object.keys(NAMES).map(u => [u, who(u)])));
}

const card = (d, i) => {
  const dash = v => { v = String(v ?? '').trim(); return v === '-' ? '' : v; };
  const coord = dash(d.coord), obs = dash(d.obs), n = d.clicks || 0;
  return `<div class="card cd${d.ojo ? ' eye' : ''}${OPEN.has(d.celular) ? ' open' : ''}" data-k="${esc(d.celular)}">
    <div class="sum" data-t>
      <div class="top"><span class="nb">${i}</span>
        <div class="who"><b>${esc(d.nombre)}</b><span class="num">${IC.phone}${esc(d.celular)}${d.ojo ? '<span class="pri">OJO</span>' : ''}</span></div>
        <span class="stp" style="--c:${COL[ok(d)]}"><i class="dot"></i>${esc(LBL[ok(d)])}</span><span class="chev">${IC.chev}</span></div>
      <div class="On"><span class="tg">OBS:</span><span class="ob${obs ? '' : ' nil'}">${obs ? esc(obs) : '-'}</span></div>
      <div class="ln">${IC.pin}<span class="tg">Ubi:</span><span class="co${coord ? '' : ' nil'}">${coord ? esc(coord) : '-'}</span>${coord ? `<button type="button" class="cp" data-copy="${esc(coord)}" aria-label="Copiar coordenadas">${IC.copy}Copiar</button>` : ''}</div>
      <div class="wrow"><a class="wa" data-wa="${esc(d.celular)}" target="_blank" rel="noopener" href="${waLink(esc(d.celular))}"><img src="whatsapp.png" class="wa-logo" alt="">WhatsApp</a><span class="wc" data-wc="${esc(d.celular)}">${wtxt(n)}</span></div>
    </div>
    <div class="more">
      <div class="ft"><div><span class="lab">Fecha de registro</span><span>${hm(d.fecha)}</span></div><div><span class="lab">Registrado por</span><span>${esc(who(d.user))}</span></div></div>
      <div class="acts"><button type="button" class="eyeb${d.ojo ? ' on' : ''}" data-eye="${esc(d.celular)}">${d.ojo ? 'Quitar OJO' : 'Marcar con OJO'}</button><button type="button" class="prim" data-e="${d.row}">Editar registro</button></div>
    </div>
  </div>`;
};

function dateRange() {
  const f = $('fd').value;
  if (f === 'hoy') return [ymd(), ymd()];
  if (f === 'semana') return [ymd((new Date().getDay() + 6) % 7), ymd()]; // desde el lunes
  if (f === 'mes') return [ymd().slice(0, 8) + '01', ymd()];
  if (f === 'rango') { let a = $('d1').value, b = $('d2').value; if (a && b && a > b) [a, b] = [b, a]; return [a, b]; }
  return ['', ''];
}

function renderList() {
  $('rango').hidden = $('fd').value !== 'rango';
  const q = $('q').value.toLowerCase().trim(), fo = $('fo').value, fp = $('fp').value, fv = adm() ? $('fv').value : 'todos', [a, b] = dateRange();
  const R = D.filter(d => (fo === 'todos' || ok(d) === fo) && (fp === 'todos' || d.ojo) && (fv === 'todos' || d.user === fv) &&
    (!a || day(d) >= a) && (!b || day(d) <= b) &&
    (!q || (d.nombre + ' ' + d.celular).toLowerCase().includes(q))).sort((x, y) => y.fecha.localeCompare(x.fecha));
  $('l-count').textContent = R.length + ' referido(s)' + (R.length > 150 ? ' · mostrando los 150 más recientes' : '');
  $('cards').innerHTML = R.slice(0, 150).map((d, i) => card(d, i + 1)).join('') || '<div class="empty">No hay referidos con estos filtros</div>';
}

// ===== EN ESPERA (borradores sin enviar) =====
function renderPend() {
  const bar = $('pend'), box = $('pq');
  bar.hidden = !Q.length;
  bar.textContent = Q.length ? `${Q.length} referido(s) en espera de envío · toca para ver` : '';
  box.innerHTML = Q.length ? `<div class="pqb"><h3>En espera de envío (${Q.length})</h3>
    <p>No se subieron por falta de internet. Se enviarán solos al volver la señal.</p>` +
    Q.map(q => `<div class="pi"><div class="pt"><b>${esc(String(q.reg.nombre).toUpperCase())}</b> · ${esc(q.reg.celular)}<small>${esc(LBL[q.reg.estado] || 'Sin estado')}${q.reg.observacion ? ' · ' + esc(q.reg.observacion) : ''}</small></div>
      <div class="acts"><button data-qs>Enviar ahora</button><button data-qe="${q.ts}" aria-label="Editar">${IC.edit}</button><button data-qd="${q.ts}" aria-label="Descartar">${IC.trash}</button></div></div>`).join('') + '</div>' : '';
}

// ===== ESTADÍSTICAS =====
function mk(id, type, data, leg, o) {
  if (CH[id]) CH[id].destroy();
  CH[id] = new Chart($(id), { type, data, options: { responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: !!leg, position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }, ...o } });
}
const Y = { beginAtZero: true, ticks: { precision: 0 } };
const addDays = (s, n) => { const t = new Date(s + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toLocaleDateString('sv'); };
const daysBetween = (a, b) => { const o = [], t = new Date(a + 'T12:00:00'), e = new Date(b + 'T12:00:00'); for (; t <= e && o.length < 800; t.setDate(t.getDate() + 1)) o.push(t.toLocaleDateString('sv')); return o; };
function statsRange() {
  const p = $('per').value;
  if (p === 'hoy') return [ymd(), ymd()];
  if (p === '7') return [ymd(6), ymd()];
  if (p === 'mes') return [ymd().slice(0, 8) + '01', ymd()];
  if (p === 'rango') { let a = $('s1').value, b = $('s2').value; if (a && b && a > b) [a, b] = [b, a]; return [a, b]; }
  return ['', ''];
}
const KPI_EST = ['CON COBERTURA', 'SIN COBERTURA', 'SIN COB. EN ESPERA...'];
function renderStats() {
  $('srango').hidden = $('per').value !== 'rango';
  const fv = adm() ? $('sv').value : 'todos', [a, b] = statsRange();
  const A = D.filter(d => fv === 'todos' || d.user === fv), R = A.filter(d => (!a || day(d) >= a) && (!b || day(d) <= b));
  const tot = R.length, pc = v => (tot ? Math.round(v / tot * 100) : 0) + '% del total';
  $('kpis').innerHTML = `<div class="kpi tot"><span class="kl">Registros</span><b>${tot}</b><em>en el periodo</em></div>` +
    KPI_EST.map(k => { const v = R.filter(d => d.estado === k).length; return `<div class="kpi" style="--c:${COL[k]}"><span class="kl"><i class="dot"></i>${LBL[k]}</span><b>${v}</b><em>${pc(v)}</em></div>`; }).join('');

  // Gráfica por día: sigue el periodo elegido (mínimo 7 días, máximo 62)
  let cb = b || ymd(), ca = a || (A.map(day).sort()[0] || addDays(cb, -29));
  if (cb < ca) cb = ca;
  if (ca > addDays(cb, -6)) ca = addDays(cb, -6);
  let ds = daysBetween(ca, cb); if (ds.length > 62) ds = ds.slice(-62);
  const P = cnt(A, day);
  mk('c-dia', 'line', { labels: ds.map(x => x.slice(8) + '/' + x.slice(5, 7)), datasets: [{ data: ds.map(x => P[x] || 0), borderColor: '#6D3FD1', backgroundColor: 'rgba(109,63,209,.12)', fill: true, tension: .3, pointRadius: ds.length > 31 ? 0 : 2 }] }, false, { scales: { y: Y } });

  $('w-ven').hidden = !(adm() && fv === 'todos');
  if (adm() && fv === 'todos') {
    const us = Object.keys(NAMES), T = cnt(R, d => d.user);
    const per = k => cnt(R.filter(d => d.estado === k), d => d.user);
    const E = KPI_EST.map(k => [k, per(k)]);
    const otros = u => (T[u] || 0) - E.reduce((m, [, c]) => m + (c[u] || 0), 0);
    mk('c-ven', 'bar', { labels: us.map(who), datasets: [
      ...E.map(([k, c]) => ({ label: LBL[k], data: us.map(u => c[u] || 0), backgroundColor: COL[k], borderRadius: 4 })),
      { label: 'Otros', data: us.map(otros), backgroundColor: COL['SIN ESTADO'], borderRadius: 4 }] },
      true, { scales: { x: { stacked: true }, y: { ...Y, stacked: true } } });
    $('rk').innerHTML = '<span class="h">VENDEDOR</span><i class="h">TOTAL</i><i class="h">CON</i><i class="h">SIN</i><i class="h">ESPERA</i>' +
      [...us].sort((x, y) => (T[y] || 0) - (T[x] || 0)).map(u => `<span>${esc(who(u))}</span><i>${T[u] || 0}</i><i>${E[0][1][u] || 0}</i><i>${E[1][1][u] || 0}</i><i>${E[2][1][u] || 0}</i>`).join('');
  }
}

// ===== NAVEGACIÓN / RENDER =====
function nav(v) {
  cur = v;
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'stats') renderStats();
  window.scrollTo(0, 0);
}
function render() {
  renderPend(); renderList();
  if (cur === 'stats') renderStats();
}

async function copiar(txt) {
  try { await navigator.clipboard.writeText(txt); toast('Coordenadas copiadas'); }
  catch (err) {
    const t = document.createElement('textarea');
    t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
    let c = false; try { c = document.execCommand('copy'); } catch (_) {}
    t.remove(); toast(c ? 'Coordenadas copiadas' : 'No se pudieron copiar; selecciónalas manualmente.', !c);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('b-login').onclick = login;
  $('pass').onkeydown = e => { if (e.key === 'Enter') login(); };
  $('b-sync').onclick = load;
  $('b-out').onclick = () => { if ((Q.length || QW.length || QE.length) && !confirm(`Hay ${Q.length + QE.length} cambio(s) en espera sin enviar que se perderán. ¿Salir?`)) return; Q = []; QW = []; QE = []; W('queue', Q); W('waq', QW); W('eyeq', QE); logout(); };
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => nav(b.dataset.v));
  $('est').onclick = e => { const b = e.target.closest('[data-s]'); if (b) setEst(b.dataset.s); };
  $('b-gps').onclick = gps; $('f').onsubmit = submit; $('b-cancel').onclick = resetForm; $('b-del').onclick = del;
  ['q', 'fo', 'fp', 'fv'].forEach(id => $(id).oninput = renderList);
  ['fd', 'd1', 'd2'].forEach(id => $(id).onchange = renderList);
  ['per', 'sv', 's1', 's2'].forEach(id => $(id).onchange = renderStats);

  $('pend').onclick = () => nav('list');
  $('pq').onclick = async e => {
    if (e.target.closest('[data-qs]')) { await flush(); if (Q.length) toast('Aún sin conexión. Se reintentará solo', 'err'); return; }
    const qe = e.target.closest('[data-qe]'); if (qe) return startEditQ(Number(qe.dataset.qe));
    const qd = e.target.closest('[data-qd]');
    if (qd && confirm('¿Descartar este referido en espera? No se subirá.')) {
      const ts = Number(qd.dataset.qd); Q = Q.filter(q => q.ts !== ts); W('queue', Q);
      if (qedit === ts) resetForm(); render();
    }
  };

  $('cards').onclick = e => {
    const wa = e.target.closest('[data-wa]'); if (wa) return waClick(wa.dataset.wa); // el link abre WhatsApp solo
    const ey = e.target.closest('[data-eye]'); if (ey) return toggleEye(ey.dataset.eye);
    const cp = e.target.closest('[data-copy]'); if (cp) return copiar(cp.dataset.copy);
    const ed = e.target.closest('[data-e]'); if (ed) return startEdit(Number(ed.dataset.e));
    const t = e.target.closest('[data-t]');
    if (t) { const c = t.closest('.cd'), k = c.dataset.k; c.classList.toggle('open'); c.classList.contains('open') ? OPEN.add(k) : OPEN.delete(k); }
  };

  window.addEventListener('online', flush);
  setInterval(flush, 60000);
  if (S) start();
});

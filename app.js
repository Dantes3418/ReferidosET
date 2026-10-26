// ===== CONFIGURACIÓN =====
const API = 'https://script.google.com/macros/s/AKfycbx-vI3Dju2YsnxrVpAPJrgkhyD_ProqMs2Ex3d6Y4LgNj1Ylvb_VnLWahfcIaKi-wnClA/exec';
const PLANES = ['SIMPLE', 'DOBLE', 'TRIPLE'];
const OBS = ['CON COBERTURA', 'SIN COBERTURA', 'FIN DE MES', 'SIGUIENTE MES', 'SIN COB. EN ESPERA...', 'CERRADO'];
const COL = { 'CON COBERTURA': '#10B981', 'SIN COBERTURA': '#EF4444', 'FIN DE MES': '#F59E0B', 'SIGUIENTE MES': '#22B8E8', 'SIN COB. EN ESPERA...': '#7A7394', 'CERRADO': '#6D3FD1', 'OTRO': '#C4B5FD' };

// Mensaje que se escribe solo al abrir WhatsApp (edítalo a tu gusto)
const WA_MSG = '¡Hola! 👋😊 ¿Cómo está? Le saluda su asesor de Internet Hogar Entel 📶 ¡Estoy aquí para ayudarle a tener el internet que su hogar necesita! 🏠✨  ';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const J = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
const W = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// Q = referidos en espera (sin internet) · QW = clics de WhatsApp pendientes de contar
let S = J('sess', null), D = J('data', []), NAMES = J('names', {}), Q = J('queue', []), QW = J('waq', []);
let edit = null, qedit = null, plan = '', cur = 'reg', CH = {}, flushing = false;
const OPEN = new Set(); // tarjetas desplegadas (por celular)

const adm = () => S && S.user === 'A';
const ok = d => OBS.includes(d.obs) ? d.obs : 'OTRO';
const day = d => d.fecha.slice(0, 10);
const ymd = (n = 0) => { const t = new Date(); t.setDate(t.getDate() - n); return t.toLocaleDateString('sv'); };
const who = u => NAMES[u] || (S && u === S.user ? S.name : 'Vendedor ' + u);
const cnt = (a, f) => a.reduce((m, d) => (m[f(d)] = (m[f(d)] || 0) + 1, m), {});
const hm = f => f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)} ${f.slice(11)}` : '';
const wtxt = n => `${n} ${n === 1 ? 'vez' : 'veces'}`;
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
    D = r.data; NAMES = r.names || {}; W('data', D); W('names', NAMES);
    buildFilters(); render();
    $('h-sync').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    flush();
  } catch (e) { $('h-sync').textContent = 'Sin conexión · datos guardados'; }
}

// ===== REGISTRO =====
function buildForm() {
  $('plan').innerHTML = PLANES.map(p => `<button type="button" class="chip" data-p="${p}">${p}</button>`).join('');
  $('obs').innerHTML = OBS.concat('OTRO').map(o => `<option>${o}</option>`).join('');
}
function setPlan(p) { plan = p; document.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.p === p)); }
function toggleOtro() { const o = $('obs').value === 'OTRO'; $('obs2').hidden = !o; $('obs2').required = o; }
function resetForm() {
  $('f').reset(); setPlan(''); toggleOtro(); edit = null; qedit = null;
  $('f-title').textContent = 'Nuevo referido'; $('b-save').textContent = 'Guardar referido';
  $('b-cancel').hidden = $('b-del').hidden = true;
}
function fillForm(cel, nom, pl, coo, obs) {
  $('cel').value = cel; $('nom').value = nom; setPlan(pl); $('coo').value = coo;
  if (OBS.includes(obs)) $('obs').value = obs; else { $('obs').value = 'OTRO'; $('obs2').value = String(obs).replace(/^OTRO:\s*/, ''); }
  toggleOtro();
}
function parseCoo(s) { const m = String(s || '').match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/); return m ? m[1] + ',' + m[2] : String(s || '').trim(); }
function gps() {
  if (!navigator.geolocation) return toast('Tu teléfono no permite GPS', 'err');
  $('b-gps').textContent = '...';
  navigator.geolocation.getCurrentPosition(
    p => { $('coo').value = p.coords.latitude.toFixed(6) + ',' + p.coords.longitude.toFixed(6); $('b-gps').textContent = '📍 GPS'; },
    () => { $('b-gps').textContent = '📍 GPS'; toast('No se pudo obtener el GPS. Activa la ubicación o pega las coordenadas.', 'err'); },
    { enableHighAccuracy: true, timeout: 15000 });
}
async function submit(ev) {
  ev.preventDefault();
  if (!plan) return toast('Elige un plan', 'err');
  const reg = { celular: $('cel').value, nombre: $('nom').value, plan, coordenadas: parseCoo($('coo').value),
    obs: $('obs').value === 'OTRO' ? 'OTRO: ' + $('obs2').value.trim() : $('obs').value };
  const fromQ = qedit != null ? Q.find(q => q.ts === qedit) : null;
  const ts = fromQ ? fromQ.ts : Date.now();
  const b = $('b-save'); b.disabled = true;
  try {
    const r = await api(edit ? { action: 'update', row: edit, reg } : { action: 'add', reg, ts });
    if (!r.ok) throw r;
    D = r.data; W('data', D);
    if (fromQ) { Q = Q.filter(q => q.ts !== fromQ.ts); W('queue', Q); }
    toast(edit ? 'Cambios guardados ✓' : 'Referido guardado ✓'); resetForm(); render();
  } catch (x) {
    if (x && x.error) return toast(x.error, 'err');
    if (edit) return toast('Sin conexión. Intenta de nuevo', 'err');
    // Sin señal: queda como borrador en espera en el teléfono
    if (fromQ) fromQ.reg = reg; else Q.push({ reg, ts });
    W('queue', Q); resetForm(); render();
    toast('Sin señal: quedó EN ESPERA en tu teléfono ⏳ y se envía solo');
  } finally { b.disabled = false; }
}

// Envía los pendientes: primero referidos en espera, luego clics de WhatsApp
async function flush() {
  if (!S || flushing || !(Q.length || QW.length)) return;
  flushing = true; let sent = 0;
  try {
    for (const q of [...Q]) {
      if (q.ts === qedit) continue; // lo estás editando ahora
      const r = await api({ action: 'add', reg: q.reg, ts: q.ts });
      if (r.expired) return;
      Q = Q.filter(x => x !== q); W('queue', Q);
      if (r.ok) { D = r.data; sent++; } else toast(q.reg.celular + ': ' + r.error, 'err');
    }
    while (QW.length) {
      const w = QW[0], r = await api({ action: 'wa', celular: w.celular, ts: w.ts });
      if (r.expired) return;
      QW.shift(); W('waq', QW);
      if (r.ok) setClicks(w.celular, r.clicks, r.last);
    }
    if (sent) { W('data', D); toast('Pendientes enviados ✓'); }
  } catch (e) { /* sin señal: reintenta luego */ } finally { flushing = false; render(); }
}

function startEdit(row) {
  const d = D.find(x => x.row === row); if (!d) return;
  resetForm(); edit = row; fillForm(d.celular, d.nombre, d.plan, d.coord, d.obs);
  $('f-title').textContent = 'Editar referido'; $('b-save').textContent = 'Guardar cambios';
  $('b-cancel').hidden = false; $('b-del').hidden = !adm(); nav('reg');
}
function startEditQ(ts) {
  const q = Q.find(x => x.ts === ts); if (!q) return;
  resetForm(); qedit = ts; const r = q.reg;
  fillForm(r.celular, r.nombre, r.plan, r.coordenadas, r.obs);
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

// ===== LISTA =====
function buildFilters() {
  const o = (id, h, a) => { const s = $(id), v = s.value; s.innerHTML = `<option value="todos">${h}</option>` + a.map(([k, t]) => `<option value="${esc(k)}">${esc(t)}</option>`).join(''); if ([...s.options].some(x => x.value === v)) s.value = v; };
  o('fo', 'Todas las obs.', OBS.concat('OTRO').map(x => [x, x])); o('fp', 'Todos los planes', PLANES.map(x => [x, x]));
  if (adm()) ['fv', 'sv'].forEach(id => o(id, 'Todos los vendedores', Object.keys(NAMES).map(u => [u, who(u)])));
}

const card = d => {
  const coord = String(d.coord ?? '').trim(), n = d.clicks || 0;
  return `<div class="card cd${OPEN.has(d.celular) ? ' open' : ''}" data-k="${esc(d.celular)}">
    <div class="sum" data-t>
      <div class="top"><b>${esc(d.nombre)}</b><span class="plan">${esc(d.plan)}</span><span class="chev">▾</span></div>
      <div class="meta"><span class="num"> <img src="telf.png" class="wa-logo" alt=""> ${esc(d.celular)}</span><span class="bd" style="--c:${COL[ok(d)]}">${esc(d.obs)}</span></div>
      ${coord ? `<div class="coo"><span>📍 ${esc(coord)}</span><button type="button" class="cp" data-copy="${esc(coord)}" aria-label="Copiar coordenadas">Copiar</button></div>` : ''}
      <div class="wrow"><a class="wa" data-wa="${esc(d.celular)}" target="_blank" rel="noopener" href="${waLink(esc(d.celular))}"><img src="whatsapp.png" class="wa-logo" alt="">WhatsApp</a><span class="wc" data-wc="${esc(d.celular)}">${wtxt(n)}</span></div>
    </div>
    <div class="more">
      <small>📅 ${hm(d.fecha)}</small>
      <small>👤 Registrado por ${esc(who(d.user))}</small>
      ${d.lastwa ? `<small>💬 Último WhatsApp: ${hm(d.lastwa)}</small>` : ''}
      <div class="acts"><a href="tel:${esc(d.celular)}">📞 Llamar</a><button data-e="${d.row}">✏️ Editar</button></div>
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
  const R = D.filter(d => (fo === 'todos' || ok(d) === fo) && (fp === 'todos' || d.plan === fp) && (fv === 'todos' || d.user === fv) &&
    (!a || day(d) >= a) && (!b || day(d) <= b) &&
    (!q || (d.nombre + ' ' + d.celular).toLowerCase().includes(q))).sort((x, y) => y.fecha.localeCompare(x.fecha));
  $('l-count').textContent = R.length + ' referido(s)' + (R.length > 150 ? ' · mostrando los 150 más recientes' : '');
  $('cards').innerHTML = R.slice(0, 150).map(card).join('') || '<div class="empty">No hay referidos con estos filtros</div>';
}

// ===== EN ESPERA (borradores sin enviar) =====
function renderPend() {
  const bar = $('pend'), box = $('pq');
  bar.hidden = !Q.length;
  bar.textContent = Q.length ? `⏳ ${Q.length} referido(s) en espera de envío · toca para ver` : '';
  box.innerHTML = Q.length ? `<div class="pqb"><h3>⏳ En espera de envío (${Q.length})</h3>
    <p>No se subieron por falta de internet. Se enviarán solos al volver la señal.</p>` +
    Q.map(q => `<div class="pi"><div class="pt"><b>${esc(String(q.reg.nombre).toUpperCase())}</b> · ${esc(q.reg.celular)}<small>${esc(q.reg.plan)} · ${esc(q.reg.obs)}</small></div>
      <div class="acts"><button data-qs>Enviar ahora</button><button data-qe="${q.ts}">✏️</button><button data-qd="${q.ts}">🗑</button></div></div>`).join('') + '</div>' : '';
}

// ===== ESTADÍSTICAS =====
function mk(id, type, data, leg, o) {
  if (CH[id]) CH[id].destroy();
  CH[id] = new Chart($(id), { type, data, options: { responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: !!leg, position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }, ...o } });
}
const Y = { beginAtZero: true, ticks: { precision: 0 } };
function renderStats() {
  const per = $('per').value, fv = adm() ? $('sv').value : 'todos';
  const lim = { hoy: ymd(), 7: ymd(6), mes: ymd().slice(0, 8) + '01', todo: '' }[per];
  const A = D.filter(d => fv === 'todos' || d.user === fv), R = A.filter(d => !lim || day(d) >= lim);
  const n = f => R.filter(f).length, cer = n(d => d.obs === 'CERRADO');
  const K = [['Registros', R.length], ['Hoy', A.filter(d => day(d) === ymd()).length], ['Cerrados', cer],
    ['Con cobertura', n(d => d.obs === 'CON COBERTURA')], ['Sin cobertura', n(d => /^SIN COB/.test(d.obs))]];
  $('kpis').innerHTML = K.map(([l, v]) => `<div class="kpi"><small>${l}</small><b>${v}</b></div>`).join('');

  const O = cnt(R, ok), ks = Object.keys(COL);
  mk('c-obs', 'doughnut', { labels: ks, datasets: [{ data: ks.map(k => O[k] || 0), backgroundColor: ks.map(k => COL[k]), borderWidth: 0 }] }, true, { cutout: '62%' });
  const ds = [...Array(30)].map((_, i) => ymd(29 - i)), P = cnt(A, day);
  mk('c-dia', 'line', { labels: ds.map(x => x.slice(8) + '/' + x.slice(5, 7)), datasets: [{ data: ds.map(x => P[x] || 0), borderColor: '#6D3FD1', backgroundColor: 'rgba(109,63,209,.12)', fill: true, tension: .3, pointRadius: 2 }] }, false, { scales: { y: Y } });
  const L = cnt(R, d => d.plan);
  mk('c-plan', 'bar', { labels: PLANES, datasets: [{ data: PLANES.map(k => L[k] || 0), backgroundColor: ['#22B8E8', '#6D3FD1', '#4B2799'], borderRadius: 8 }] }, false, { scales: { y: Y } });

  $('w-ven').hidden = !(adm() && fv === 'todos');
  if (adm() && fv === 'todos') {
    const us = Object.keys(NAMES), T = cnt(R, d => d.user), C = cnt(R.filter(d => d.obs === 'CERRADO'), d => d.user);
    mk('c-ven', 'bar', { labels: us.map(who), datasets: [
      { label: 'Cerrados', data: us.map(u => C[u] || 0), backgroundColor: '#6D3FD1', borderRadius: 6 },
      { label: 'Otros', data: us.map(u => (T[u] || 0) - (C[u] || 0)), backgroundColor: '#C4B5FD', borderRadius: 6 }] },
      true, { scales: { x: { stacked: true }, y: { ...Y, stacked: true } } });
    $('rk').innerHTML = '<span class="h">VENDEDOR</span><i class="h">TOTAL</i><i class="h">CERRADOS</i><i class="h">%</i>' +
      us.sort((a, b) => (T[b] || 0) - (T[a] || 0)).map(u => `<span>${esc(who(u))}</span><i>${T[u] || 0}</i><i>${C[u] || 0}</i><i>${T[u] ? Math.round((C[u] || 0) / T[u] * 100) : 0}%</i>`).join('');
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
  try { await navigator.clipboard.writeText(txt); toast('Coordenadas copiadas ✓'); }
  catch (err) {
    const t = document.createElement('textarea');
    t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
    let c = false; try { c = document.execCommand('copy'); } catch (_) {}
    t.remove(); toast(c ? 'Coordenadas copiadas ✓' : 'No se pudieron copiar; selecciónalas manualmente.', !c);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('b-login').onclick = login;
  $('pass').onkeydown = e => { if (e.key === 'Enter') login(); };
  $('b-sync').onclick = load;
  $('b-out').onclick = () => { if ((Q.length || QW.length) && !confirm(`Hay ${Q.length} registro(s) en espera sin enviar que se perderán. ¿Salir?`)) return; Q = []; QW = []; W('queue', Q); W('waq', QW); logout(); };
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => nav(b.dataset.v));
  $('plan').onclick = e => { const b = e.target.closest('[data-p]'); if (b) setPlan(b.dataset.p); };
  $('obs').onchange = toggleOtro; $('b-gps').onclick = gps; $('f').onsubmit = submit; $('b-cancel').onclick = resetForm; $('b-del').onclick = del;
  ['q', 'fo', 'fp', 'fv'].forEach(id => $(id).oninput = renderList);
  ['fd', 'd1', 'd2'].forEach(id => $(id).onchange = renderList);
  ['per', 'sv'].forEach(id => $(id).onchange = renderStats);

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
    const cp = e.target.closest('[data-copy]'); if (cp) return copiar(cp.dataset.copy);
    const ed = e.target.closest('[data-e]'); if (ed) return startEdit(Number(ed.dataset.e));
    if (e.target.closest('a')) return; // Llamar
    const t = e.target.closest('[data-t]');
    if (t) { const c = t.closest('.cd'), k = c.dataset.k; c.classList.toggle('open'); c.classList.contains('open') ? OPEN.add(k) : OPEN.delete(k); }
  };

  window.addEventListener('online', flush);
  setInterval(flush, 60000);
  if (S) start();
});

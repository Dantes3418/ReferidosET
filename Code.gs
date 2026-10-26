// ===== CONFIGURACIÓN =====
// 1) Pega este código en Extensiones > Apps Script de tu Google Sheet y ejecuta UNA vez la función configurar().
// 2) Las contraseñas aparecen en Ver > Registros de ejecución. Cámbialas en Configuración > Propiedades del script (PASS_1 ... PASS_7, PASS_A).
// 3) Implementar > Nueva implementación > Aplicación web > Ejecutar como: Yo > Acceso: Cualquier persona. Copia la URL en app.js.
// 4) Si cambias el código: Implementar > Administrar > Editar > Nueva versión.
const HOJA = 'REFERIDOS', TZ = 'America/La_Paz', DIAS = 180;
const PLANES = ['SIMPLE', 'DOBLE', 'TRIPLE'];
const OBS = ['CON COBERTURA', 'SIN COBERTURA', 'FIN DE MES', 'SIGUIENTE MES', 'SIN COB. EN ESPERA...', 'CERRADO'];

const USERS = {
  '1': 'V 1',
  '2': 'V 2',
  '3': 'V 3',
  '4': 'V 4',
  '5': 'V 5',
  '6': 'V 6',
  '7': 'V 7',
  'A': 'Administrador'
};

// ===== CONTRASEÑAS PERSONALIZADAS =====
const PASSWORDS = {
  '1': '101',
  '2': '202',
  '3': '303',
  '4': '404',
  '5': '505',
  '6': '606',
  '7': '707',
  'A': '3434'
};

const P = PropertiesService.getScriptProperties();


function configurar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(HOJA) || ss.insertSheet(HOJA);
  asegurarColumnas_(sh);
  sh.getRange(1, 1, 1, 9).setValues([['CELULAR', 'NOMBRE', 'PLAN', 'OBS', 'COORDENADAS', 'FECHA REGISTRO', 'USUARIO', 'WHATSAPP (VECES)', 'ULTIMO WHATSAPP']])
    .setFontWeight('bold').setBackground('#6D3FD1').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.getRange('A2:E').setNumberFormat('@');
  sh.getRange('G2:G').setNumberFormat('@');
  sh.getRange('F2:F').setNumberFormat('dd/MM/yyyy HH:mm');
  sh.getRange('H2:H').setNumberFormat('0');
  sh.getRange('I2:I').setNumberFormat('dd/MM/yyyy HH:mm');
  const dv = (l, estricto) => SpreadsheetApp.newDataValidation().requireValueInList(l, true).setAllowInvalid(!estricto).build();
  sh.getRange('C2:C').setDataValidation(dv(PLANES, true));
  sh.getRange('D2:D').setDataValidation(dv(OBS, false)); // permite "OTRO: ..."
  if (!P.getProperty('SECRET')) {
  P.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  }
}

function doGet() { return out_({ ok: true, msg: 'API activa' }); }

function doPost(e) {
  try {
    const r = JSON.parse(e.postData.contents);
    if (r.action === 'login') {
      const pw = String(r.password || '').trim();

      const u = pw
      ? Object.keys(PASSWORDS).find(k => PASSWORDS[k] === pw)
      : null;
      if (!u) { Utilities.sleep(800); return out_({ ok: false, error: 'Contraseña incorrecta' }); }
      return out_({ ok: true, token: token_(u), user: u, name: USERS[u] });
    }
    const u = who_(r.token);
    if (!u) return out_({ ok: false, expired: true, error: 'Sesión expirada' });
    const adm = u === 'A';
    if (r.action === 'list') return out_(res_(u));

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const sh = sheet_();
      if (r.action === 'add') {
        const c = clean_(r.reg);
        dup_(sh, c[0], 0);
        const ts = Number(r.ts), f = ts > Date.now() - 7 * 864e5 && ts <= Date.now() + 6e4 ? new Date(ts) : new Date();
        let n = sh.getLastRow() + 1;
        if (n > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 100);
        sh.getRange(n, 1, 1, 9).setValues([c.concat([f, u, 0, ''])]);
      } else if (r.action === 'update') {
        row_(sh, r.row);
        if (!adm && String(sh.getRange(r.row, 7).getValue()) !== u) throw new Error('Sin permiso');
        const c = clean_(r.reg);
        dup_(sh, c[0], r.row);
        sh.getRange(r.row, 1, 1, 5).setValues([c]);
      } else if (r.action === 'wa') {
        const cel = String(r.celular || '').replace(/\D/g, '');
        const v = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
        let row = 0;
        for (let i = 0; i < v.length; i++) if (String(v[i][0]) === cel) { row = i + 2; break; }
        if (!row) throw new Error('Cliente no encontrado');
        if (!adm && String(sh.getRange(row, 7).getValue()) !== u) throw new Error('Sin permiso');
        const n = (Number(sh.getRange(row, 8).getValue()) || 0) + 1;
        const t = Number(r.ts), cuando = t > Date.now() - 7 * 864e5 && t <= Date.now() + 6e4 ? new Date(t) : new Date();
        const prev = sh.getRange(row, 9).getValue();
        const ultimo = prev && new Date(prev) > cuando ? new Date(prev) : cuando;
        sh.getRange(row, 8, 1, 2).setValues([[n, ultimo]]);
        return out_({ ok: true, clicks: n, last: Utilities.formatDate(ultimo, TZ, 'yyyy-MM-dd HH:mm') });
      } else if (r.action === 'delete') {
        if (!adm) throw new Error('Sin permiso');
        row_(sh, r.row);
        sh.deleteRow(r.row);
      } else throw new Error('Acción desconocida');
    } finally { lock.releaseLock(); }
    return out_(res_(u));
  } catch (err) {
    return out_({ ok: false, error: String(err.message || err) });
  }
}

// ===== SESIÓN (token firmado, dura DIAS días; cambiar SECRET cierra todas las sesiones) =====
function secret_() {
  let secret = P.getProperty('SECRET');

  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    P.setProperty('SECRET', secret);
  }

  return secret;
}

function sign_(s) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(s, secret_())
  );
}
function token_(u) { const b = u + '.' + (Date.now() + DIAS * 864e5); return b + '.' + sign_(b); }
function who_(t) {
  const p = String(t || '').split('.');
  return p.length === 3 && USERS[p[0]] && +p[1] > Date.now() && sign_(p[0] + '.' + p[1]) === p[2] ? p[0] : null;
}

// ===== UTILIDADES =====
function sheet_() { const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA); asegurarColumnas_(sh); return sh; }
function asegurarColumnas_(sh) { if (sh.getMaxColumns() < 9) sh.insertColumnsAfter(sh.getMaxColumns(), 9 - sh.getMaxColumns()); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function row_(sh, n) { if (!(n >= 2 && n <= sh.getLastRow())) throw new Error('Fila inválida'); }
function res_(u) { return { ok: true, data: list_(u), names: u === 'A' ? USERS : {} }; }

function clean_(g) {
  let c = String(g.celular || '').replace(/\D/g, '');
  if (c.length === 11 && c.indexOf('591') === 0) c = c.slice(3);
  if (!/^\d{8}$/.test(c)) throw new Error('Celular inválido: deben ser 8 dígitos');
  const n = String(g.nombre || '').trim().toUpperCase().slice(0, 80);
  if (!n) throw new Error('Falta el nombre');
  if (PLANES.indexOf(g.plan) < 0) throw new Error('Plan inválido');
  const o = String(g.obs || '').trim().slice(0, 120);
  if (OBS.indexOf(o) < 0 && !/^OTRO:\s*\S/.test(o)) throw new Error('Observación inválida');
  const k = String(g.coordenadas || '').trim().slice(0, 100);
  if (!k) throw new Error('Faltan las coordenadas');
  return [c, n, g.plan, o, k];
}

function dup_(sh, cel, skip) {
  const v = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < v.length; i++) if (String(v[i][0]) === cel && i + 2 !== skip) throw new Error('Este celular ya está registrado');
}

function list_(u) {
  const sh = sheet_(), n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, 9).getValues().map((f, i) => ({
    row: i + 2, celular: String(f[0]), nombre: String(f[1]), plan: String(f[2]), obs: String(f[3]), coord: String(f[4]),
    fecha: f[5] ? Utilities.formatDate(new Date(f[5]), TZ, 'yyyy-MM-dd HH:mm') : '', user: String(f[6]),
    clicks: Number(f[7]) || 0, lastwa: f[8] ? Utilities.formatDate(new Date(f[8]), TZ, 'yyyy-MM-dd HH:mm') : ''
  })).filter(d => d.celular && (u === 'A' || d.user === u));
}

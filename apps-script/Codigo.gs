const SPREADSHEET_ID = '1EU9OEP46Rxj7eLckjgHoDjEBtQGMHp2FffiwT0XGkTs';
const FECHAMENTO_SHEET_ID = 1319526104;
const REGISTRO_SHEET_ID = 359470099;
const TZ = 'America/Sao_Paulo';

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'ping';
    if (action === 'ping') {
      return json_({ok:true, app:'Mix da Beleza', time:new Date().toISOString()});
    }
    if (action === 'summary') {
      return json_({ok:true, scope:e.parameter.scope || 'daily', rows:getSummary_(e.parameter.scope || 'daily')});
    }
    return json_({ok:false,error:'Ação GET inválida'});
  } catch (err) {
    return json_({ok:false,error:String(err && err.message || err)});
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (payload.action !== 'saveClosing') return json_({ok:false,error:'Ação POST inválida'});
    const result = saveClosing_(payload);
    return json_({ok:true,...result});
  } catch (err) {
    return json_({ok:false,error:String(err && err.message || err)});
  }
}

function parseDate_(yyyyMmDd) {
  const p = String(yyyyMmDd || '').split('-').map(Number);
  if (p.length !== 3 || !p[0] || !p[1] || !p[2]) throw new Error('Data inválida');
  return new Date(p[0], p[1]-1, p[2], 12, 0, 0);
}

function keyDate_(d) {
  return Utilities.formatDate(new Date(d), TZ, 'yyyy-MM-dd');
}

function getSheetByIdSafe_(ss, sheetId) {
  const found = ss.getSheets().find(s => s.getSheetId() === Number(sheetId));
  return found || null;
}

function saveClosing_(p) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const fechamento = getSheetByIdSafe_(ss, FECHAMENTO_SHEET_ID);
  const registros = getSheetByIdSafe_(ss, REGISTRO_SHEET_ID);
  if (!fechamento || !registros) throw new Error('Abas necessárias não encontradas');

  const dateObj = parseDate_(p.date);
  const closer = String(p.closer || '').trim();
  if (!closer) throw new Error('Informe quem fez o fechamento');

  const entries = Array.isArray(p.totalEntrouEntries) ? p.totalEntrouEntries : [];
  if (!entries.length) throw new Error('Informe ao menos um valor de entrada');

  removePwaEntriesForDate_(registros, p.date);

  const now = new Date();
  const notes = String(p.notes || '');
  const rows = entries.map(item => [
    dateObj,
    now,
    String(item.label || 'Valor'),
    Number(item.value || 0),
    notes,
    closer,
    'PWA'
  ]);
  registros.getRange(registros.getLastRow()+1,1,rows.length,7).setValues(rows);

  const totals = p.totals || {};
  const saidas = Number(totals.saidas || 0);
  const dinheiro = Number(totals.dinheiro || 0);
  const cartao = Number(totals.cartao || 0);
  const pix = Number(totals.pix || 0);

  const row = findClosingRow_(fechamento, p.date);
  fechamento.getRange(row,1).setValue(closer);
  fechamento.getRange(row,2).setValue(dateObj);
  fechamento.getRange(row,4,1,4).setValues([[saidas,dinheiro,cartao,pix]]);
  fechamento.getRange(row,11).setValue(notes);
  SpreadsheetApp.flush();

  const totalEntrou = Number(fechamento.getRange(row,3).getValue() || 0);
  const resultado = Number(fechamento.getRange(row,10).getValue() || 0);
  return {row,totalEntrou,resultado};
}

function removePwaEntriesForDate_(sheet, dateKey) {
  const last = sheet.getLastRow();
  if (last < 5) return;
  const vals = sheet.getRange(5,1,last-4,7).getValues();
  for (let i=vals.length-1;i>=0;i--) {
    const d = vals[i][0];
    const source = String(vals[i][6] || '');
    if (d instanceof Date && keyDate_(d) === dateKey && source === 'PWA') {
      sheet.deleteRow(i+5);
    }
  }
}

function findClosingRow_(sheet, dateKey) {
  const last = Math.max(sheet.getLastRow(),5);
  if (last >= 5) {
    const vals = sheet.getRange(5,2,last-4,1).getValues();
    for (let i=0;i<vals.length;i++) {
      const d = vals[i][0];
      if (d instanceof Date && keyDate_(d) === dateKey) return i+5;
    }
  }
  return Math.max(last+1,5);
}

function getSummary_(scope) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getSheetByIdSafe_(ss, FECHAMENTO_SHEET_ID);
  if (!sheet) {
    const available = ss.getSheets().map(s => s.getName() + ':' + s.getSheetId()).join(', ');
    throw new Error('Aba de fechamento não encontrada. Abas: ' + available);
  }
  const last = sheet.getLastRow();
  if (last < 5) return [];

  const vals = sheet.getRange(5,2,last-4,9).getValues();
  const groups = {};
  vals.forEach(r => {
    const d = r[0];
    if (!(d instanceof Date)) return;
    const total = Number(r[1] || 0);
    const saidas = Number(r[2] || 0);
    const resultado = Number(r[8] || 0);
    const info = periodInfo_(new Date(d), scope);
    if (!groups[info.key]) groups[info.key] = {key:info.key,label:info.label,total:0,saidas:0,resultado:0};
    groups[info.key].total += total;
    groups[info.key].saidas += saidas;
    groups[info.key].resultado += resultado;
  });

  const limit = scope === 'daily' ? 31 : scope === 'weekly' ? 16 : 12;
  return Object.keys(groups).sort().map(k => groups[k]).slice(-limit);
}

function periodInfo_(d, scope) {
  if (scope === 'daily') {
    return {key:Utilities.formatDate(d,TZ,'yyyy-MM-dd'),label:Utilities.formatDate(d,TZ,'dd/MM/yyyy')};
  }
  if (scope === 'weekly') {
    const day = (d.getDay()+6)%7;
    const monday = new Date(d); monday.setDate(d.getDate()-day);
    return {
      key:Utilities.formatDate(monday,TZ,'yyyy-MM-dd'),
      label:'Semana '+Utilities.formatDate(monday,TZ,'dd/MM')
    };
  }
  const names=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  return {key,label:names[d.getMonth()]+'/'+d.getFullYear()};
}

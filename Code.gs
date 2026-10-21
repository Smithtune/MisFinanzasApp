/**
 * Backend de Llego el COBRADIARIO para Google Apps Script.
 *
 * Si el proyecto NO está vinculado a la hoja de cálculo, sustituye el valor
 * de SPREADSHEET_ID por el identificador de la URL de Google Sheets.
 */
const SPREADSHEET_ID = '13dXeueKnwYdp86dflJOCHby65PxNZe_cPOsZ0o_1IRs';
const SHEET_NAME = 'Transacciones';

function doGet() {
  try {
    const movements = readTransactions_();
    const totalIngresos = movements
      .filter(item => String(item.tipo).toLowerCase() === 'ingreso')
      .reduce((sum, item) => sum + Number(item.monto || 0), 0);
    const totalGastos = movements
      .filter(item => String(item.tipo).toLowerCase() === 'gasto')
      .reduce((sum, item) => sum + Number(item.monto || 0), 0);

    return json_({
      status: 'success',
      summary: { totalIngresos, totalGastos, balanceNeto: totalIngresos - totalGastos },
      transacciones: movements
    });
  } catch (error) {
    return json_({ status: 'error', message: error.message });
  }
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || '{}');
    if (payload.action === 'delete') {
      deleteTransaction_(payload.rowIndex);
    } else if (payload.action === 'edit') {
      editTransaction_(payload.rowIndex, payload);
    } else {
      createTransaction_(payload);
    }
    return json_({ status: 'success' });
  } catch (error) {
    return json_({ status: 'error', message: error.message });
  }
}

function sheet_() {
  const spreadsheet = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`No existe la pestaña “${SHEET_NAME}”.`);
  return sheet;
}

function headerMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const normalize = value => String(value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const aliases = {
    fecha: ['fecha', 'date'],
    tipo: ['tipo', 'type'],
    monto: ['monto', 'amount', 'valor'],
    categoria: ['categoria', 'category'],
    descripcion: ['descripcion', 'description', 'detalle'],
    metodo: ['metodo', 'method', 'forma de pago']
  };
  const map = {};
  Object.keys(aliases).forEach(key => {
    const index = headers.findIndex(header => aliases[key].includes(normalize(header)));
    if (index >= 0) map[key] = index + 1;
  });
  ['fecha', 'tipo', 'monto', 'categoria', 'descripcion'].forEach(key => {
    if (!map[key]) throw new Error(`Falta la columna obligatoria “${key}” en la fila 1.`);
  });
  return map;
}

function validRow_(sheet, rowIndex) {
  const row = Number(rowIndex);
  if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) {
    throw new Error('El rowIndex recibido no corresponde a una transacción válida.');
  }
  return row;
}

function createTransaction_(payload) {
  const sheet = sheet_();
  const map = headerMap_(sheet);
  const row = Array(sheet.getLastColumn()).fill('');
  Object.keys(map).forEach(key => { if (payload[key] !== undefined) row[map[key] - 1] = payload[key]; });
  sheet.appendRow(row);
}

function editTransaction_(rowIndex, payload) {
  const sheet = sheet_();
  const row = validRow_(sheet, rowIndex);
  const map = headerMap_(sheet);
  ['fecha', 'tipo', 'categoria', 'monto', 'descripcion'].forEach(key => {
    if (payload[key] !== undefined) sheet.getRange(row, map[key]).setValue(payload[key]);
  });
}

function deleteTransaction_(rowIndex) {
  const sheet = sheet_();
  sheet.deleteRow(validRow_(sheet, rowIndex));
}

function readTransactions_() {
  const sheet = sheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const map = headerMap_(sheet);
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  return values.map((row, index) => ({
    rowIndex: index + 2,
    fecha: formatDate_(row[map.fecha - 1]),
    tipo: row[map.tipo - 1],
    monto: Number(row[map.monto - 1]) || 0,
    categoria: row[map.categoria - 1],
    descripcion: row[map.descripcion - 1],
    metodo: map.metodo ? row[map.metodo - 1] : ''
  }));
}

function formatDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value || '');
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

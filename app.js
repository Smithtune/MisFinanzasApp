/* Llego el COBRADIARIO — dashboard PWA */
const API_URL = 'https://script.google.com/macros/s/AKfycbyfJbzGXmRGxwCk_bT_CFkZJQvMiKb8kfiS4ChgnRYe9DtLaGaOIMPX3wqz-cnDDJe1/exec';
const URL_WEB_APP = API_URL;
const QUEUE_KEY = 'cobradiario.pending.v1';
const LOCAL_KEY = 'cobradiario.movements.v1';
const OVERRIDES_KEY = 'cobradiario.overrides.v1';
const CURRENCY = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const ICONS = { Cobro:'✦', Alimentación:'◒', Transporte:'◈', Vivienda:'⌂', Servicios:'⌁', Negocio:'▣', Otros:'◇' };
let allTransactions = [];
let activePeriod = 'mes';
let selectedMovementId = null;

const $ = (selector) => document.querySelector(selector);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const number = (value) => typeof value === 'number' ? (Number.isFinite(value) ? value : 0) : Number(String(value ?? 0).replace(/[^0-9,-]/g, '').replace(',', '.')) || 0;
const escapeHtml = (value) => { const div = document.createElement('div'); div.textContent = String(value); return div.innerHTML; };
const hash = (value) => [...String(value)].reduce((total, char) => ((total << 5) - total + char.charCodeAt(0)) | 0, 0).toString(36).replace('-', 'x');

function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }
function loadLocal() { return loadJson(LOCAL_KEY, []); }
function saveLocal(items) { localStorage.setItem(LOCAL_KEY, JSON.stringify(items)); }
function loadOverrides() { return loadJson(OVERRIDES_KEY, {}); }
function saveOverrides(items) { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(items)); }
/* Sin cola pendiente, lo local ya está en la hoja: se limpia para evitar duplicados y filas ocultas por ids de fila antiguos. */
function purgeStale() { if (!loadJson(QUEUE_KEY, []).length) { saveLocal([]); localStorage.removeItem(OVERRIDES_KEY); } }
function removeLocal(id) { saveLocal(loadLocal().filter(item => normalize(item, true).id !== id)); }
async function readJson(response) { const text = await response.text(); try { return JSON.parse(text); } catch { throw new Error('El Apps Script no devolvió JSON: reimplementa la web app con acceso "Cualquier usuario"'); } }

/* Google Sheets puede devolver ISO, dd/mm/aaaa o una fecha serializada. Convertimos todo a YYYY-MM-DD local. */
function dateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  const text = String(value || today()).trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (match) { const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]); return new Date(year, Number(match[2]) - 1, Number(match[1]), 12); }
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? new Date(`${today()}T12:00:00`) : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12);
}
function dateIso(value) { const date = dateValue(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function dateOf(transaction) { return dateValue(transaction.fecha || transaction.date); }
function normalize(raw, local = false) {
  const fecha = dateIso(raw.fecha || raw.date);
  const tipo = String(raw.tipo || raw.type || 'Gasto');
  const monto = number(raw.monto ?? raw.amount);
  const categoria = raw.categoria || raw.category || 'Otros';
  const descripcion = raw.descripcion || raw.description || '';
  const fallbackId = `tx-${hash([fecha, tipo, monto, categoria, descripcion, raw.metodo || raw.method || ''].join('|'))}`;
  const rowIndex = raw.rowIndex ?? raw.row_index ?? raw.row ?? null;
  return { id: String(raw.id ?? raw.id_temp ?? raw.rowId ?? rowIndex ?? raw._id ?? fallbackId), rowIndex, fecha, tipo, monto, categoria, descripcion, metodo: raw.metodo || raw.method || 'Efectivo', local: Boolean(local || raw.local) };
}
function typeIsIncome(item) { return String(item.tipo).toLowerCase() === 'ingreso'; }
function periodTransactions() {
  const now = new Date(); now.setHours(23, 59, 59, 999);
  if (activePeriod === 'todo') return allTransactions;
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  if (activePeriod === 'hoy') start.setDate(now.getDate());
  if (activePeriod === 'semana') start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return allTransactions.filter(item => { const date = dateOf(item); return date >= start && date <= now; });
}
function formatDate(value) { return new Intl.DateTimeFormat('es-CO', { day:'numeric', month:'short' }).format(dateValue(value)); }
function toast(message) { 
  const el = $('#toast');
  const textSpan = el.querySelector('#toast-text') || el.querySelector('span:not(img)');
  
  if (textSpan) {
    textSpan.textContent = message;
  } else {
    // Por si acaso, si busca el span y no lo encuentra, actualiza el texto respetando la imagen
    const img = el.querySelector('img');
    el.innerHTML = '';
    if (img) el.appendChild(img);
    const span = document.createElement('span');
    span.id = 'toast-text';
    span.textContent = message;
    el.appendChild(span);
  }

  el.classList.add('show'); 
  window.clearTimeout(toast.timer); 
  toast.timer = setTimeout(() => el.classList.remove('show'), 3200); 
}

function render() {
  const items = periodTransactions();
  const income = items.filter(typeIsIncome).reduce((sum, item) => sum + item.monto, 0);
  const expense = items.filter(item => !typeIsIncome(item)).reduce((sum, item) => sum + item.monto, 0);
  $('#total-balance').textContent = CURRENCY.format(income - expense); $('#total-ingresos').textContent = CURRENCY.format(income); $('#total-gastos').textContent = CURRENCY.format(expense);
  const expenses = items.filter(item => !typeIsIncome(item));
  const byCategory = expenses.reduce((memo, item) => { memo[item.categoria] = (memo[item.categoria] || 0) + item.monto; return memo; }, {});
  const ranked = Object.entries(byCategory).sort((a,b) => b[1] - a[1]);
  $('#top-category').textContent = ranked[0]?.[0] || 'Sin movimientos'; $('#spending-label').textContent = ranked.length ? `${CURRENCY.format(expense)} en gastos` : 'Aún no hay gastos';
  $('#categories').innerHTML = ranked.slice(0, 3).map(([name, amount], index) => `<div class="category-row"><span class="left"><i class="category-dot" style="background:${['#d9b46a','#a98750','#777b8a'][index]}"></i>${escapeHtml(name)}</span><span class="amount">${CURRENCY.format(amount)}</span></div>`).join('') || '<p class="empty">Registra un gasto para ver su distribución.</p>';
  const sorted = [...items].sort((a,b) => dateOf(b) - dateOf(a)).slice(0, 6);
  $('#transactions').innerHTML = sorted.map(transactionTemplate).join('') || '<p class="empty">Aún no hay movimientos en este periodo.</p>';
}
function transactionTemplate(item) {
  const isIncome = typeIsIncome(item); const title = item.descripcion || item.categoria;
  const rowIndex = item.rowIndex ?? '';
  return `<article class="transaction" data-row-index="${escapeHtml(rowIndex)}"><span class="tx-icon">${ICONS[item.categoria] || '◇'}</span><div><p class="tx-name">${escapeHtml(title)}</p><p class="tx-meta">${escapeHtml(item.categoria)} · ${formatDate(item.fecha)}</p></div><strong class="tx-value ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '−'}${CURRENCY.format(item.monto)}</strong><button class="tx-action" data-transaction-id="${escapeHtml(item.id)}" data-row-index="${escapeHtml(rowIndex)}" aria-label="Opciones de ${escapeHtml(title)}">⋯</button></article>`;
}

function setLoading(loading) { $('#sync-button').classList.toggle('loading', loading); }
async function getRemoteTransactions() {
  const response = await fetch(API_URL, { cache:'no-store' });
  if (!response.ok) throw new Error('No fue posible conectar');
  const data = await readJson(response);
  if (data.status && data.status !== 'success') throw new Error(data.message || 'Respuesta no válida');
  return (data.transacciones || data.transactions || []).map(item => normalize(item));
}
function applyOverrides(remote, local) {
  const overrides = loadOverrides();
  return [...remote, ...local.map(item => normalize(item, true))].reduce((items, item) => {
    const override = item.rowIndex !== null && item.rowIndex !== undefined ? null : overrides[item.id];
    if (override?.deleted) return items;
    const finalItem = override?.item ? normalize({ ...override.item, id: item.id }, item.local) : item;
    const existing = items.findIndex(entry => entry.id === finalItem.id);
    if (existing === -1) items.push(finalItem); else items[existing] = finalItem;
    return items;
  }, []);
}
async function refresh({ silent = false } = {}) {
  setLoading(true);
  try { const remote = await getRemoteTransactions(); allTransactions = applyOverrides(remote, loadLocal()); render(); if (!silent) toast('Datos actualizados'); }
  catch (error) {
    console.error('Error al cargar COBRADIARIO:', error);
    allTransactions = applyOverrides([], loadLocal()); render();
    if (!silent) toast(error?.message ? `No se pudo cargar: ${error.message}` : (navigator.onLine ? 'Mostrando datos guardados en este dispositivo' : 'Estás trabajando sin conexión'));
  }
  finally { setLoading(false); }
}
function queue(payload) { const pending = loadJson(QUEUE_KEY, []); pending.push(payload); localStorage.setItem(QUEUE_KEY, JSON.stringify(pending)); }
function apiPayload(payload) {
  if (payload.action === 'delete') return { action:'delete', rowIndex:payload.rowIndex };
  if (payload.action === 'edit') return { action:'edit', rowIndex:payload.rowIndex, fecha:payload.fecha, tipo:payload.tipo, categoria:payload.categoria, monto:payload.monto, descripcion:payload.descripcion };
  return { fecha:payload.fecha, tipo:payload.tipo, monto:payload.monto, categoria:payload.categoria, descripcion:payload.descripcion, metodo:payload.metodo };
}
async function eliminarTransaccion(rowIndex) {
  const response = await fetch(URL_WEB_APP, { 
    method: 'POST', 
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
    body: JSON.stringify({ action: 'delete', rowIndex }) 
  });
  const resultado = await readJson(response);
  if (resultado.status !== 'success') throw new Error(resultado.message || 'No se pudo eliminar el movimiento');
  return resultado;
}

async function editarTransaccion(rowIndex, nuevosDatos) {
  const payload = { action:'edit', rowIndex, fecha:nuevosDatos.fecha, tipo:nuevosDatos.tipo, categoria:nuevosDatos.categoria, monto:nuevosDatos.monto, descripcion:nuevosDatos.descripcion };
  const response = await fetch(URL_WEB_APP, { method:'POST', mode:'cors', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(apiPayload(payload)) });
  const resultado = await readJson(response);
  if (resultado.status !== 'success') throw new Error(resultado.message || 'No se pudo editar el movimiento');
  return resultado;
}
let syncing = false;
async function syncPending() {
  if (!navigator.onLine || syncing) return;
  syncing = true; try { await syncPendingInner(); } finally { syncing = false; }
}
async function syncPendingInner() {
  const pending = loadJson(QUEUE_KEY, []); if (!pending.length) return;
  const rejected = [];
  for (const payload of pending) {
    try { const response = await fetch(API_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(apiPayload(payload)) }); const data = await readJson(response); if (data.status !== 'success') rejected.push(payload); else removeLocal(payload.id); }
    catch (error) { console.error('Error al sincronizar:', error); rejected.push(payload); }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(rejected));
  if (rejected.length < pending.length) { toast(`${pending.length - rejected.length} movimiento(s) sincronizado(s)`); refresh({ silent:true }); }
}

function setTransactionType(type) { $('#tipo').value = type; document.querySelectorAll('.type-toggle button').forEach(button => button.classList.toggle('active', button.dataset.type === type)); }
function resetForm() { const form = $('#transaction-form'); form.reset(); delete form.dataset.editingId; $('#fecha').value = today(); setTransactionType('Ingreso'); $('#form-title').textContent = 'Nuevo movimiento'; $('#submit-btn').textContent = 'Guardar movimiento'; }
function openEditor(item = null) {
  resetForm();
  if (item) { $('#transaction-form').dataset.editingId = item.id; $('#form-title').textContent = 'Editar movimiento'; $('#submit-btn').textContent = 'Guardar cambios'; setTransactionType(item.tipo); $('#monto').value = item.monto; $('#categoria').value = item.categoria; $('#descripcion').value = item.descripcion; $('#fecha').value = item.fecha; $('#metodo').value = item.metodo; }
  $('#transaction-dialog').showModal();
}
function persistEditedItem(id, item) {
  const local = loadLocal(); const localIndex = local.findIndex(entry => normalize(entry, true).id === id);
  if (localIndex >= 0) { local[localIndex] = { ...item, local:true }; saveLocal(local); return; }
  const overrides = loadOverrides(); overrides[id] = { item, updatedAt:Date.now() }; saveOverrides(overrides);
}
function deleteItem(id) {
  const local = loadLocal(); const withoutItem = local.filter(item => normalize(item, true).id !== id);
  if (withoutItem.length !== local.length) saveLocal(withoutItem);
  else { const overrides = loadOverrides(); overrides[id] = { deleted:true, updatedAt:Date.now() }; saveOverrides(overrides); }
  const pending = loadJson(QUEUE_KEY, []).filter(item => normalize(item, true).id !== id); localStorage.setItem(QUEUE_KEY, JSON.stringify(pending));
  allTransactions = allTransactions.filter(item => item.id !== id); render();
}
async function saveMovement(event) {
  event.preventDefault();
  const editingId = $('#transaction-form').dataset.editingId;
  const payload = normalize({ id: editingId, fecha: $('#fecha').value, tipo: $('#tipo').value, monto: $('#monto').value, categoria: $('#categoria').value, descripcion: $('#descripcion').value.trim(), metodo: $('#metodo').value }, !editingId);
  if (!payload.monto || payload.monto < 1) return toast('Escribe un monto válido');
  $('#submit-btn').classList.add('loading');
  if (editingId) {
    const original = allTransactions.find(item => item.id === editingId);
    try {
      if (original?.rowIndex !== null && original?.rowIndex !== undefined && original?.rowIndex !== '') {
        await editarTransaccion(original.rowIndex, payload);
        await refresh({ silent:true });
        toast('Movimiento actualizado');
      } else {
        persistEditedItem(editingId, { ...payload, id:editingId });
        allTransactions = allTransactions.map(item => item.id === editingId ? { ...payload, id:editingId, local:item.local } : item);
        render(); toast('Movimiento actualizado en este dispositivo');
      }
      $('#transaction-dialog').close(); resetForm();
    } catch (error) { toast(error.message || 'No se pudo actualizar el movimiento'); }
    finally { $('#submit-btn').classList.remove('loading'); }
    return;
  }
  try {
    if (!navigator.onLine) throw new Error('offline');
    const response = await fetch(API_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(apiPayload(payload)) }); const data = await readJson(response); if (data.status !== 'success') throw new Error(data.message); toast('Movimiento guardado');
  } catch (error) {
    console.error('Error al guardar en Sheets:', error);
    queue(payload); const local = loadLocal(); local.unshift({ ...payload, local:true }); saveLocal(local); toast(navigator.onLine && error?.message !== 'offline' ? `No llegó a Google Sheets (${error.message}). Quedó pendiente.` : 'Sin conexión: quedó pendiente y se sincronizará después');
  } finally { $('#submit-btn').classList.remove('loading'); $('#transaction-dialog').close(); resetForm(); await refresh({ silent:true }); }
}
function openMovementMenu(id) {
  selectedMovementId = id; const item = allTransactions.find(entry => entry.id === id); if (!item) return;
  $('#movement-preview').innerHTML = `<p>${escapeHtml(item.descripcion || item.categoria)}</p><p>${typeIsIncome(item) ? '+' : '−'}${CURRENCY.format(item.monto)} · ${formatDate(item.fecha)}</p>`;
  $('#movement-dialog').showModal();
}

function init() {
  $('#fecha').value = today(); $('#today-label').textContent = new Intl.DateTimeFormat('es-CO', { weekday:'long', day:'numeric', month:'long' }).format(new Date()).replace(/^./, char => char.toUpperCase());
  $('.periods').addEventListener('click', event => { const button = event.target.closest('[data-period]'); if (!button) return; activePeriod = button.dataset.period; document.querySelectorAll('.period').forEach(item => item.classList.toggle('active', item === button)); render(); });
  $('#open-modal-btn').addEventListener('click', () => openEditor()); $('#close-modal-btn').addEventListener('click', () => { $('#transaction-dialog').close(); resetForm(); }); $('#transaction-dialog').addEventListener('click', event => { if (event.target === $('#transaction-dialog')) { $('#transaction-dialog').close(); resetForm(); } });
  $('#close-movement-btn').addEventListener('click', () => $('#movement-dialog').close()); $('#movement-dialog').addEventListener('click', event => { if (event.target === $('#movement-dialog')) $('#movement-dialog').close(); });
  document.querySelector('.type-toggle').addEventListener('click', event => { const button = event.target.closest('[data-type]'); if (button) setTransactionType(button.dataset.type); });
  $('#transactions').addEventListener('click', event => { const button = event.target.closest('[data-transaction-id]'); if (button) openMovementMenu(button.dataset.transactionId); });
  $('#edit-movement-btn').addEventListener('click', () => { const item = allTransactions.find(entry => entry.id === selectedMovementId); $('#movement-dialog').close(); if (item) openEditor(item); });
  $('#delete-movement-btn').addEventListener('click', async () => {
    const item = allTransactions.find(entry => entry.id === selectedMovementId);
    if (!item || !confirm(`¿Eliminar ${item.descripcion || item.categoria} por ${CURRENCY.format(item.monto)}?`)) return;
    try {
      if (item.rowIndex !== null && item.rowIndex !== undefined && item.rowIndex !== '') {
        await eliminarTransaccion(item.rowIndex);
        await refresh({ silent:true });
        toast('Movimiento eliminado');
      } else { deleteItem(item.id); toast('Movimiento eliminado en este dispositivo'); }
      $('#movement-dialog').close();
    } catch (error) { toast(error.message || 'No se pudo eliminar el movimiento'); }
  });
  $('#transaction-form').addEventListener('submit', saveMovement); $('#sync-button').addEventListener('click', () => refresh()); $('#details-button').addEventListener('click', () => toast('La distribución se actualiza según el periodo seleccionado')); $('#all-button').addEventListener('click', () => { activePeriod = 'todo'; document.querySelectorAll('.period').forEach(item => item.classList.toggle('active', item.dataset.period === 'todo')); render(); });
  window.addEventListener('online', syncPending); window.addEventListener('online', () => refresh({ silent:true })); purgeStale(); allTransactions = applyOverrides([], loadLocal()); render(); refresh(); syncPending();
  // Los service workers requieren http/https (no funcionan cuando la app se abre como file://).
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
}
document.addEventListener('DOMContentLoaded', init);

async function cargarClima() {
  try {
    // Coordenadas de Cartagena, Colombia (Puedes cambiarlas si lo deseas)
    const lat = 10.3997;
    const lon = -75.5144;
    
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`);
    const data = await response.json();
    
    if(data && data.current) {
      const temp = data.current.temperature_2m;
      const codigoClima = data.current.weather_code;
      
      // Traducción básica del código del clima de Open-Meteo
      let descripcionClima = "Despejado ☀️";
      if (codigoClima > 0 && codigoClima < 3) descripcionClima = "Parcialmente nublado ⛅";
      if (codigoClima >= 3 && codigoClima < 50) descripcionClima = "Nublado ☁️";
      if (codigoClima >= 50) descripcionClima = "Lluvia 🌧️";

      const weatherEl = document.getElementById('weather-info');
      if(weatherEl) {
        weatherEl.textContent = `${temp}°C - ${descripcionClima}`;
      }
    }
  } catch (error) {
    console.error("No se pudo cargar el clima", error);
    const weatherEl = document.getElementById('weather-info');
    if(weatherEl) weatherEl.textContent = "Clima no disponible";
  }
}

// Ejecutar al cargar la página
document.addEventListener('DOMContentLoaded', cargarClima);


function iniciarRelojDigital() {
  const relojHora = document.getElementById('reloj-hora');
  const relojFecha = document.getElementById('reloj-fecha');

  if (!relojHora || !relojFecha) return;

  function actualizar() {
    const ahora = new Date();
    
    // Formato de hora en Colombia (HH:MM:SS)
    relojHora.textContent = ahora.toLocaleTimeString('es-CO', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });

    // Formato de fecha legible (ej: Miércoles, 21 de Octubre)
    relojFecha.textContent = ahora.toLocaleDateString('es-CO', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
  }

  actualizar();
  setInterval(actualizar, 1000);
}

// Ejecutar al cargar la página
document.addEventListener('DOMContentLoaded', iniciarRelojDigital);
/* Llego el COBRADIARIO — dashboard PWA */
const API_URL = 'https://script.google.com/macros/s/AKfycbyfJbzGXmRGxwCk_bT_CFkZJQvMiKb8kfiS4ChgnRYe9DtLaGaOIMPX3wqz-cnDDJe1/exec';
const QUEUE_KEY = 'cobradiario.pending.v1';
const LOCAL_KEY = 'cobradiario.movements.v1';
const CURRENCY = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const ICONS = { Cobro:'✦', Alimentación:'◒', Transporte:'◈', Vivienda:'⌂', Servicios:'⌁', Negocio:'▣', Otros:'◇' };
let allTransactions = [];
let activePeriod = 'mes';

const $ = (selector) => document.querySelector(selector);
const today = () => new Date().toISOString().slice(0, 10);
const number = (value) => Number(String(value ?? 0).replace(/[^0-9,-]/g, '').replace(',', '.')) || 0;

function seedTransactions() { return []; }
function loadLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; } }
function saveLocal(items) { localStorage.setItem(LOCAL_KEY, JSON.stringify(items)); }
function dateOf(transaction) { const value = String(transaction.fecha || transaction.date || today()); return new Date(`${value.slice(0, 10)}T12:00:00`); }
function normalize(raw) { return { id: raw.id || raw.id_temp || crypto.randomUUID?.() || String(Date.now()), fecha: String(raw.fecha || raw.date || today()).slice(0, 10), tipo: String(raw.tipo || raw.type || 'Gasto'), monto: number(raw.monto ?? raw.amount), categoria: raw.categoria || raw.category || 'Otros', descripcion: raw.descripcion || raw.description || '', metodo: raw.metodo || raw.method || 'Efectivo' }; }
function typeIsIncome(item) { return String(item.tipo).toLowerCase() === 'ingreso'; }
function periodTransactions() { const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), 1); if (activePeriod === 'hoy') start.setHours(0,0,0,0); if (activePeriod === 'semana') start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); if (activePeriod === 'todo') return allTransactions; return allTransactions.filter(item => dateOf(item) >= start && dateOf(item) <= now); }
function formatDate(value) { return new Intl.DateTimeFormat('es-CO', { day:'numeric', month:'short' }).format(dateOf(value)); }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); window.clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3200); }

function render() {
  const items = periodTransactions(); const income = items.filter(typeIsIncome).reduce((sum, item) => sum + item.monto, 0); const expense = items.filter(item => !typeIsIncome(item)).reduce((sum, item) => sum + item.monto, 0);
  $('#total-balance').textContent = CURRENCY.format(income - expense); $('#total-ingresos').textContent = CURRENCY.format(income); $('#total-gastos').textContent = CURRENCY.format(expense);
  const expenses = items.filter(item => !typeIsIncome(item)); const byCategory = expenses.reduce((memo, item) => { memo[item.categoria] = (memo[item.categoria] || 0) + item.monto; return memo; }, {}); const ranked = Object.entries(byCategory).sort((a,b) => b[1] - a[1]);
  $('#top-category').textContent = ranked[0]?.[0] || 'Sin movimientos'; $('#spending-label').textContent = ranked.length ? `${CURRENCY.format(expense)} en gastos` : 'Aún no hay gastos';
  $('#categories').innerHTML = ranked.slice(0, 3).map(([name, amount], index) => `<div class="category-row"><span class="left"><i class="category-dot" style="background:${['#d9b46a','#a98750','#777b8a'][index]}"></i>${escapeHtml(name)}</span><span class="amount">${CURRENCY.format(amount)}</span></div>`).join('') || '<p class="empty">Registra un gasto para ver su distribución.</p>';
  const sorted = [...items].sort((a,b) => dateOf(b) - dateOf(a)).slice(0, 6); $('#transactions').innerHTML = sorted.map(transactionTemplate).join('') || '<p class="empty">Aún no hay movimientos en este periodo.</p>';
}
function transactionTemplate(item) { const isIncome = typeIsIncome(item); const title = item.descripcion || item.categoria; return `<article class="transaction"><span class="tx-icon">${ICONS[item.categoria] || '◇'}</span><div><p class="tx-name">${escapeHtml(title)}</p><p class="tx-meta">${escapeHtml(item.categoria)} · ${formatDate(item.fecha)}</p></div><strong class="tx-value ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '−'}${CURRENCY.format(item.monto)}</strong></article>`; }
function escapeHtml(value) { const div = document.createElement('div'); div.textContent = String(value); return div.innerHTML; }

function setLoading(loading) { $('#sync-button').classList.toggle('loading', loading); }
async function getRemoteTransactions() { const response = await fetch(API_URL, { cache:'no-store' }); if (!response.ok) throw new Error('No fue posible conectar'); const data = await response.json(); if (data.status && data.status !== 'success') throw new Error(data.message || 'Respuesta no válida'); return (data.transacciones || data.transactions || []).map(normalize); }
async function refresh() { setLoading(true); try { const remote = await getRemoteTransactions(); const local = loadLocal(); allTransactions = merge(remote, local); render(); toast('Datos actualizados'); } catch { allTransactions = loadLocal(); render(); toast(navigator.onLine ? 'Mostrando datos guardados en este dispositivo' : 'Estás trabajando sin conexión'); } finally { setLoading(false); } }
function merge(remote, local) { const seen = new Set(); return [...local, ...remote].filter(item => { const key = `${item.fecha}|${item.tipo}|${item.monto}|${item.categoria}|${item.descripcion}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function queue(payload) { const pending = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); pending.push(payload); localStorage.setItem(QUEUE_KEY, JSON.stringify(pending)); }
async function syncPending() { if (!navigator.onLine) return; const pending = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); if (!pending.length) return; const rejected = []; for (const payload of pending) { try { const response = await fetch(API_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(payload) }); const data = await response.json(); if (data.status !== 'success') rejected.push(payload); } catch { rejected.push(payload); } } localStorage.setItem(QUEUE_KEY, JSON.stringify(rejected)); if (rejected.length < pending.length) { toast(`${pending.length - rejected.length} movimiento(s) sincronizado(s)`); refresh(); } }
async function saveMovement(event) { event.preventDefault(); const payload = normalize({ fecha: $('#fecha').value, tipo: $('#tipo').value, monto: $('#monto').value, categoria: $('#categoria').value, descripcion: $('#descripcion').value.trim(), metodo: $('#metodo').value }); if (!payload.monto || payload.monto < 1) return toast('Escribe un monto válido'); $('#submit-btn').classList.add('loading'); try { if (!navigator.onLine) throw new Error('offline'); const response = await fetch(API_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(payload) }); const data = await response.json(); if (data.status !== 'success') throw new Error(data.message); toast('Movimiento guardado'); } catch { queue(payload); const local = loadLocal(); local.unshift(payload); saveLocal(local); toast('Guardado en este dispositivo; se sincronizará después'); } finally { $('#submit-btn').classList.remove('loading'); $('#transaction-dialog').close(); $('#transaction-form').reset(); $('#fecha').value = today(); await refresh(); } }

function init() {
  $('#fecha').value = today(); $('#today-label').textContent = new Intl.DateTimeFormat('es-CO', { weekday:'long', day:'numeric', month:'long' }).format(new Date()).replace(/^./, char => char.toUpperCase());
  $('.periods').addEventListener('click', (event) => { const button = event.target.closest('[data-period]'); if (!button) return; activePeriod = button.dataset.period; document.querySelectorAll('.period').forEach(item => item.classList.toggle('active', item === button)); render(); });
  $('#open-modal-btn').addEventListener('click', () => $('#transaction-dialog').showModal()); $('#close-modal-btn').addEventListener('click', () => $('#transaction-dialog').close()); $('#transaction-dialog').addEventListener('click', event => { if (event.target === $('#transaction-dialog')) $('#transaction-dialog').close(); });
  document.querySelector('.type-toggle').addEventListener('click', event => { const button = event.target.closest('[data-type]'); if (!button) return; document.querySelectorAll('.type-toggle button').forEach(item => item.classList.toggle('active', item === button)); $('#tipo').value = button.dataset.type; });
  $('#transaction-form').addEventListener('submit', saveMovement); $('#sync-button').addEventListener('click', refresh); $('#details-button').addEventListener('click', () => toast('La distribución se actualiza según el periodo seleccionado')); $('#all-button').addEventListener('click', () => { activePeriod = 'todo'; document.querySelectorAll('.period').forEach(item => item.classList.toggle('active', item.dataset.period === 'todo')); render(); });
  window.addEventListener('online', syncPending); window.addEventListener('online', refresh); allTransactions = loadLocal() || seedTransactions(); render(); refresh(); syncPending(); if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}
document.addEventListener('DOMContentLoaded', init);

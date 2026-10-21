const URL_WEB_APP = 'https://script.google.com/macros/s/AKfycbyfJbzGXmRGxwCk_bT_CFkZJQvMiKb8kfiS4ChgnRYe9DtLaGaOIMPX3wqz-cnDDJe1/exec';

async function cargarDashboard() {
  try {
    const response = await fetch(URL_WEB_APP);
    const data = await response.json();

    if (data.status === 'success') {
      // 1. Actualizar los indicadores de resumen (Cards/Widgets)
      document.getElementById('total-ingresos').innerText = `$${data.summary.totalIngresos.toLocaleString()}`;
      document.getElementById('total-gastos').innerText = `$${data.summary.totalGastos.toLocaleString()}`;
      document.getElementById('balance-neto').innerText = `$${data.summary.balanceNeto.toLocaleString()}`;

      // 2. Renderizar la lista o tabla de transacciones recientes
      console.log('Historial reciente:', data.transacciones);
    } else {
      console.error('Error al obtener datos:', data.message);
    }
  } catch (error) {
    console.error('Error de red:', error);
  }
}

// Llamar al cargar la app
cargarDashboard();
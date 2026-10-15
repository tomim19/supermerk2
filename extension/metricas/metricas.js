// Página de métricas: gasto por pedido y gasto entre pedidos en el tiempo.
// Lee el historial guardado (lo baja el panel); no habla con Carrefour.
import { metricas } from '../lib/metricas.js';
import { leerPedidos } from '../lib/store.js';
import { dia, iso } from '../lib/analisis.js';
import { $, h, poner, boton } from '../panel/dom.js';
import { graficoTiempo, ranking } from './graficos.js';

const PERIODOS = { '6m': 182, '1a': 365, todo: null };
const pesos = n => '$' + Math.round(n || 0).toLocaleString('es-AR');
const compacto = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });
const pesosCorto = n => '$' + compacto.format(n);
const aFecha = d => new Date(iso(d) + 'T12:00:00');
const diaAMs = d => aFecha(d).getTime();
const fecha = d => aFecha(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

let pedidos = [], periodo = null, verTabla = false;
try { periodo = localStorage.getItem('periodo'); } catch {}

function tarjeta(titulo, cuerpo, extra) {
  return h('section', { class: 'tarjeta' }, h('header', {}, h('h2', {}, titulo), extra), cuerpo);
}
const indicador = (valor, etiqueta, nota) => h('div', { class: 'indicador' }, h('strong', {}, valor), h('span', {}, etiqueta), nota ? h('small', {}, nota) : null);

function render() {
  const hoy = dia(Date.now());
  const M = metricas(pedidos, PERIODOS[periodo] == null ? null : hoy - PERIODOS[periodo], hoy);
  document.querySelectorAll('.periodos button').forEach(b => b.classList.toggle('activo', b.dataset.periodo === periodo));

  if (!pedidos.length) {
    $('subtitulo').textContent = '';
    return poner($('contenido'), h('div', { class: 'vacio-grande' },
      h('p', {}, 'Todavía no hay historial guardado.'),
      h('p', { class: 'muted' }, 'Abrí carrefour.com.ar con tu sesión y abrí el panel de la extensión: baja tus pedidos y las métricas aparecen acá.')));
  }
  if (M.vacio) {
    $('subtitulo').textContent = '';
    return poner($('contenido'), h('div', { class: 'vacio-grande' },
      h('p', {}, 'No hay pedidos en este período.'), boton('Ver todo el historial', () => elegir('todo'), 'primario')));
  }

  const P = M.pedidos;
  $('subtitulo').textContent = `${P.length} pedidos, del ${fecha(P[0].dia)} al ${fecha(P.at(-1).dia)}. Montos en pesos de cada momento, sin ajustar por inflación.`;
  const ancho = Math.min(1100, document.body.clientWidth - 64);
  const tramos = P.filter(p => p.gastoPorDia != null);

  poner($('contenido'),
    h('div', { class: 'indicadores' },
      indicador(pesos(M.total), 'Gasto total', `${P.length} pedidos`),
      indicador(pesos(M.promedioPedido), 'Promedio por pedido'),
      indicador(pesos(M.gastoMensual), 'Gasto por mes', 'promedio del período'),
      indicador(M.gastoPorDia ? pesos(M.gastoPorDia) : '—', 'Gasto por día', M.diasEntrePedidos ? `pedís cada ~${Math.round(M.diasEntrePedidos)} días` : null),
      indicador(pesos(M.ahorro), 'Ahorro en promos', 'frente al precio de lista')),

    tarjeta('Gasto por pedido',
      verTabla ? tabla(P) : graficoTiempo(P.map(p => ({
        x: p.dia, y: p.total,
        tip: [fecha(p.dia), pesos(p.total), `${p.productos} productos` + (p.ahorro > 0 ? ` · ahorro ${pesos(p.ahorro)}` : '')],
      })), { forma: 'barras', ancho, fmtY: pesosCorto, aFecha, diaAMs }),
      boton(verTabla ? 'Ver gráficos' : 'Ver como tabla', () => { verTabla = !verTabla; render(); }, 'link')),

    verTabla ? null : tarjeta('Gasto por día entre pedidos',
      tramos.length >= 2 ? [
        h('p', { class: 'muted nota' }, 'Lo que gastaste en cada pedido dividido por los días hasta el siguiente. Sirve para comparar pedidos grandes y espaciados con pedidos chicos y seguidos.'),
        graficoTiempo(tramos.map(p => ({
          x: p.dia, y: p.gastoPorDia,
          tip: [fecha(p.dia), `${pesos(p.gastoPorDia)} por día`, `${pesos(p.total)} en ${p.diasHastaSiguiente} días`],
        })), { forma: 'linea', ancho, fmtY: pesosCorto, aFecha, diaAMs }),
      ] : h('p', { class: 'muted' }, 'Hacen falta al menos 3 pedidos en el período.')),

    tarjeta('Productos con más gasto',
      ranking(M.top.map(t => ({ nombre: t.nombre, valor: t.gasto, detalle: t.veces === 1 ? '1 pedido' : `${t.veces} pedidos` })), pesos)),
  );
}

function tabla(P) {
  return h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla' },
    h('thead', {}, h('tr', {}, ['Fecha', 'Total', 'Productos', 'Ahorro', 'Días hasta el siguiente', 'Gasto por día'].map(t => h('th', {}, t)))),
    h('tbody', {}, [...P].reverse().map(p => h('tr', {},
      h('td', {}, fecha(p.dia)), h('td', {}, pesos(p.total)), h('td', {}, p.productos),
      h('td', {}, p.ahorro > 0 ? pesos(p.ahorro) : '—'),
      h('td', {}, p.diasHastaSiguiente ?? '—'), h('td', {}, p.gastoPorDia ? pesos(p.gastoPorDia) : '—'))))));
}

function elegir(p) {
  periodo = p;
  try { localStorage.setItem('periodo', p); } catch {}
  render();
}
document.querySelectorAll('.periodos button').forEach(b => b.onclick = () => elegir(b.dataset.periodo));

let timer;
addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(render, 150); });

// si el panel actualiza el historial con esta página abierta, se redibuja
chrome.storage.onChanged.addListener(async (cambios, area) => {
  if (area === 'local' && cambios.pedidos) { pedidos = Object.values(await leerPedidos()); render(); }
});

pedidos = Object.values(await leerPedidos());
if (!(periodo in PERIODOS)) {
  // por defecto un año; si en el último año no hay pedidos, todo el historial
  const hace1a = dia(Date.now()) - 365;
  periodo = pedidos.some(o => dia(o.creationDate) >= hace1a) ? '1a' : 'todo';
}
render();

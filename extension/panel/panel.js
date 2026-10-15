// Panel lateral: analiza el historial con la sesión de la pestaña de Carrefour, muestra la decisión
// y las listas, y carga en el carrito lo que la persona aprueba. Nunca va al checkout ni paga.
import { perfil, decidir, oferta, precioItem, dia, UMBRALES, TEXTO_DECISION } from '../lib/analisis.js';
import { BASE, esCarrefour, transporteTab, carrito, pedidos, productos, buscar, cargarCarrito, mostrarCarrito } from '../lib/vtex.js';
import { leerConfig, guardarConfig, leerPedidos, guardarPedidos, borrarPedidos } from '../lib/store.js';
import { $, h, poner, boton } from './dom.js';
import { mostrarIntro } from './intro.js';

// ---------- Estado ----------
let config, tabId = null, P = null, live = {}, R = null;
let sel = {};                    // sku → { item, on, cant, lista }
const resueltas = new Set();     // preguntas respondidas con "Sumar" en esta sesión

const pesos = n => '$' + Math.round(n || 0).toLocaleString('es-AR');
const fecha = s => new Date(s + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const estado = (msg, ...botones) => poner($('estado'), msg ? [h('div', {}, msg), botones.length ? h('div', { class: 'botones' }, botones) : null] : []);

async function tabCarrefour() {
  const [act] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (esCarrefour(act?.url)) return act.id;
  const [otra] = await chrome.tabs.query({ url: BASE + '/*', currentWindow: true });
  return otra?.id ?? null;
}

// ---------- Análisis ----------
async function analizar() {
  $('decision').hidden = true; $('listas').replaceChildren(); $('pie').hidden = true;
  estado('Conectando con Carrefour…');
  tabId = await tabCarrefour();
  if (!tabId) return estado('Abrí carrefour.com.ar para empezar.', boton('Abrir Carrefour', () => chrome.tabs.create({ url: BASE + '/' }), 'primario'), boton('Ya lo abrí', analizar));
  const t = transporteTab(tabId);
  let of;
  try { of = await carrito(t); }
  catch (e) { return estado(`No pude leer la página de Carrefour (${e.message}). Recargala y probá de nuevo.`, boton('Reintentar', analizar)); }
  if (!of.loggedIn) return estado('Iniciá sesión en Carrefour en esa pestaña. Nunca te voy a pedir la contraseña.', boton('Ya inicié sesión', analizar, 'primario'));

  try {
    estado('Leyendo tu historial…');
    const lista = await pedidos(t, await leerPedidos(), estado);
    await guardarPedidos(lista);
    P = perfil(lista, config.umbrales);
    live = {};
    estado('Buscando precios y promos…');
    await completarPrecios();
  } catch (e) { return estado(`Algo falló leyendo Carrefour (${e.message}).`, boton('Reintentar', analizar)); }
  estado(P.sinHistorial ? `Tenés ${P.pedidos} pedidos y necesito al menos ${config.umbrales.minPedidos} para saber cada cuánto comprás. Mientras, podés sumar productos fijos en Configuración o buscarlos acá.` : '');
  calcular();
}

async function completarPrecios() {
  const skus = [...(P.activos || []).flatMap(g => g.skus), ...(P.frecuentes || []).flatMap(g => g.skus), ...config.fijos.map(x => String(x.sku))].filter(s => !(s in live));
  if (skus.length && tabId) Object.assign(live, await productos(transporteTab(tabId), [...new Set(skus)], oferta));
}

function calcular() {
  const base = P.sinHistorial ? { activos: [], hoy: dia(Date.now()), diasDesdeUltimo: 0, cadencia: 0, ultimoPedido: 0, ahorroHist: 0 } : P;
  R = decidir(base, live, config.umbrales, config);
  const previo = sel; sel = {};
  for (const lista of ['necesarios', 'adelantar', 'fijos', 'anteriores'])
    for (const item of R[lista]) sel[item.sku] = { item, lista, on: previo[item.sku]?.on ?? true, cant: (lista !== 'fijos' && previo[item.sku]?.cant) || item.cant };
  for (const [sku, s] of Object.entries(previo)) if (s.lista === 'agregados') sel[sku] = s;
  render();
}

async function recalcular() {
  if (!P) return;
  await completarPrecios().catch(() => {});
  calcular();
}

// ---------- Render del pedido ----------
function render() {
  renderDecision();
  const grupos = lista => Object.values(sel).filter(s => s.lista === lista);
  const preguntas = R.preguntas.filter(i => !resueltas.has(i.sku));
  poner($('listas'),
    seccion('Necesarios', grupos('necesarios').map(filaItem)),
    seccion('Para adelantar por promo', grupos('adelantar').map(filaItem)),
    seccion('Lo que comprabas seguido', grupos('anteriores').map(filaItem)),
    seccion('Fijos', grupos('fijos').map(filaItem)),
    seccion('Agregados por vos', grupos('agregados').map(filaItem)),
    seccion('Preguntas', preguntas.map(filaPregunta)),
    seccion('Sin stock', R.sinStock.map(filaSinStock)),
    h('div', {}, boton('Buscar y agregar otro producto', () => abrirBuscador('Agregar producto', '', o => agregar(o)), 'link')),
  );
  renderPie();
}

function renderDecision() {
  const d = $('decision');
  if (P.sinHistorial) { d.hidden = true; return; }
  const ahorro = `Ahorro estimado esta semana: ${R.ahorroEstaSemana}% (tu promedio: ${R.ahorroHistorico}%).`;
  const frec = `Pedís cada ~${Math.round(P.cadencia)} días; el último pedido fue hace ${P.diasDesdeUltimo}.`;
  const extra = {
    TODAVIA_NO: `Entrás en ventana el ${fecha(R.ventana)}.` + (R.ahorroEstaSemana >= R.ahorroHistorico + 5 ? ' Igual, las promos de esta semana están buenas.' : ''),
    PEDIR_ESTA_SEMANA: 'Pedí antes de que terminen las promos.',
    ESTIRAR_UNA_SEMANA: 'Si algo no puede esperar, pedilo igual.',
    PEDIR_YA: 'Conviene pedir aunque las promos no sean buenas.',
    RETOMAR: 'Tu historial puede no reflejar lo que comprás hoy. Abajo están los productos que comprabas seguido: destildá los que no quieras o buscá otros.',
  }[R.decision];
  d.className = 'decision ' + R.decision;
  poner(d, h('h1', {}, TEXTO_DECISION[R.decision]), h('p', {}, frec), h('p', {}, extra), R.decision === 'RETOMAR' ? null : h('p', {}, ahorro),
    h('div', {}, boton('Actualizar', analizar, 'link')));
  d.hidden = false;
}

const foto = i => i.imagen ? h('img', { class: 'img', src: i.imagen, alt: '', loading: 'lazy' }) : h('span', { class: 'img' });

const seccion = (titulo, filas) => filas.length ? h('section', { class: 'lista' }, h('h2', {}, h('span', {}, titulo), h('span', {}, filas.length)), h('ul', { class: 'items' }, filas)) : null;

function metaItem(i) {
  return [
    i.dto ? h('span', { class: 'chip' }, `-${i.dto}%`) : null,
    i.promo ? h('span', {}, i.promo) : null,
    i.cadaDias ? h('span', {}, `cada ~${Math.round(i.cadaDias)} días`) : null,
    i.veces && !i.cadaDias ? h('span', {}, i.veces === 1 ? 'lo compraste 1 vez' : `lo compraste ${i.veces} veces`) : null,
    i.vence != null ? h('span', {}, i.vence < 0 ? `se terminó hace ${-i.vence} días` : `se termina en ${i.vence} días`) : null,
    i.reemplaza ? h('span', {}, `reemplaza a ${i.reemplaza}`) : null,
  ];
}

function filaItem(s) {
  const i = s.item;
  const cambiar = d => { s.cant = Math.max(1, s.cant + d); render(); };
  return h('li', { class: 'item' + (s.on ? '' : ' off') },
    h('label', { class: 'foto' }, h('input', { type: 'checkbox', checked: s.on, 'aria-label': 'Incluir', onchange: e => { s.on = e.target.checked; render(); } }), foto(i)),
    h('span', { class: 'nombre' }, i.nombre),
    h('span', { class: 'sub' }, i.precio == null ? '—' : pesos(i.unitPag * s.cant)),
    h('div', { class: 'meta' },
      h('span', { class: 'cant' }, boton('−', () => cambiar(-1)), h('span', {}, s.cant), boton('+', () => cambiar(1))),
      metaItem(i)),
  );
}

function filaPregunta(i) {
  const texto = i.motivo === 'atrasado'
    ? `Lo comprabas cada ~${Math.round(i.cadaDias)} días y ya pasó el plazo. ¿Todavía lo necesitás?`
    : 'Parece que estás consumiendo menos. ¿Lo querés en el pedido?';
  return h('li', { class: 'item' },
    foto({ ...live[i.sku], ...i }), h('span', { class: 'nombre' }, i.nombre), h('span', { class: 'sub' }, i.precio ? pesos(i.precio) : ''),
    h('div', { class: 'meta' }, texto),
    h('div', { class: 'botones' },
      boton('Sumar', () => { resueltas.add(i.sku); agregar({ ...i, ...live[i.sku] }, i.cant); }),
      boton('Esta vez no', async () => {
        config = await guardarConfig({ respuestas: { ...config.respuestas, [i.sku]: { hasta: P.hoy + Math.max(7, Math.round(i.cadaDias)) } } });
        calcular();
      }),
      boton('Ya no lo compro', async () => {
        config = await guardarConfig({ excluidos: [...config.excluidos, { skus: i.skus, nombre: i.nombre }] });
        calcular();
      })),
  );
}

function filaSinStock(i) {
  const consulta = i.nombre.split(/\s+/).slice(0, 4).join(' ');
  return h('li', { class: 'item' },
    foto({ ...live[i.sku], ...i }), h('span', { class: 'nombre' }, i.nombre), h('span', { class: 'chip warn' }, 'Sin stock'),
    h('div', { class: 'botones' }, boton('Buscar reemplazo', () => abrirBuscador('Reemplazo para ' + i.nombre, consulta, o => agregar({ ...o, reemplaza: i.nombre }, i.cant)))),
  );
}

function agregar(o, cant = 1) {
  const sku = String(o.sku);
  const item = { sku, nombre: o.nombre, imagen: o.imagen, promo: o.promo || '', dto: Math.round(100 * (o.eff || 0)), reemplaza: o.reemplaza, ...precioItem(o, cant) };
  sel[sku] = { item, lista: 'agregados', on: true, cant: item.cant };
  render();
}

function renderPie() {
  const on = Object.values(sel).filter(s => s.on);
  $('pie').hidden = !Object.keys(sel).length || $('pedido').hidden;
  const pag = on.reduce((a, s) => a + s.item.unitPag * s.cant, 0), reg = on.reduce((a, s) => a + s.item.unitReg * s.cant, 0);
  $('total').textContent = pesos(pag);
  $('ahorro').textContent = `${on.length} productos` + (reg > pag ? ` · ahorrás ${pesos(reg - pag)}` : '');
  $('cargar').disabled = !on.length;
  $('todos').textContent = on.length === Object.keys(sel).length ? 'Deseleccionar todos' : 'Seleccionar todos';
}

$('todos').onclick = () => {
  const marcar = Object.values(sel).some(s => !s.on);
  for (const s of Object.values(sel)) s.on = marcar;
  render();
};

// ---------- Buscador (reemplazos, agregados y fijos) ----------
let alElegir = null;
function abrirBuscador(titulo, texto, fn) {
  alElegir = fn;
  $('buscador-titulo').textContent = titulo;
  $('buscador-texto').value = texto;
  $('buscador-res').replaceChildren();
  $('buscador').hidden = false;
  $('buscador-texto').focus();
  if (texto) $('buscador-form').requestSubmit();
}
$('buscador-cerrar').onclick = () => { $('buscador').hidden = true; };
$('buscador-form').onsubmit = async e => {
  e.preventDefault();
  const res = $('buscador-res');
  tabId = tabId ?? await tabCarrefour();
  if (!tabId) return res.replaceChildren(h('p', { class: 'vacio' }, 'Abrí carrefour.com.ar para buscar.'));
  res.replaceChildren(h('p', { class: 'vacio' }, 'Buscando…'));
  try {
    const r = await buscar(transporteTab(tabId), $('buscador-texto').value.trim(), oferta);
    res.replaceChildren(...(r.length ? r.map(o => h('li', { class: 'item' },
      foto(o), h('span', { class: 'nombre' }, o.nombre), h('span', { class: 'sub' }, pesos(o.precio)),
      h('div', { class: 'meta' }, o.eff ? h('span', { class: 'chip' }, `-${Math.round(o.eff * 100)}%`) : null, o.promo || null),
      h('div', { class: 'botones' }, boton('Elegir', () => { $('buscador').hidden = true; alElegir(o); }, 'primario')),
    )) : [h('p', { class: 'vacio' }, 'No encontré nada con stock.')]));
  } catch (err) { res.replaceChildren(h('p', { class: 'vacio' }, 'No pude buscar: ' + err.message)); }
};

// ---------- Cargar el carrito ----------
$('modo').onchange = () => { delete $('cargar').dataset.confirmar; $('cargar').textContent = 'Cargar'; };
$('cargar').onclick = async () => {
  const btn = $('cargar'), out = $('resultado'), modo = $('modo').value;
  if (modo === 'reemplazar' && !btn.dataset.confirmar) {
    btn.dataset.confirmar = '1'; btn.textContent = 'Confirmar: borra lo que no esté en la lista';
    return;
  }
  delete btn.dataset.confirmar; btn.textContent = 'Cargando…'; btn.disabled = true; out.hidden = true;
  try {
    const items = Object.values(sel).filter(s => s.on && s.cant > 0).map(s => ({ sku: s.item.sku, cant: s.cant }));
    const r = await cargarCarrito(transporteTab(tabId), items, modo);
    // el sitio no se entera de los cambios hechos por API: recargar y abrir el minicarrito
    mostrarCarrito(tabId).catch(e => console.warn('[compras] mostrar carrito', e));
    out.className = 'resultado';
    poner(out,
      h('div', { class: 'resultado-ok' }, h('strong', {}, '✓ Carrito cargado')),
      h('dl', { class: 'resumen' },
        h('dt', {}, 'Productos'), h('dd', {}, r.productos),
        h('dt', {}, 'Total'), h('dd', {}, h('strong', {}, pesos(r.total))),
        r.descuentos ? [h('dt', {}, 'Descuentos'), h('dd', { class: 'ahorro' }, '−' + pesos(r.descuentos))] : null),
      r.noDisponibles.length ? h('div', { class: 'aviso' },
        h('strong', {}, r.noDisponibles.length === 1 ? '1 producto no disponible' : `${r.noDisponibles.length} productos no disponibles`),
        h('ul', {}, r.noDisponibles.map(i => h('li', {}, i.nombre, h('small', {}, i.motivo))))) : null,
      r.avisos.length ? h('div', { class: 'aviso' }, h('strong', {}, 'Avisos de Carrefour'), h('ul', {}, r.avisos.map(a => h('li', {}, a)))) : null,
      h('p', { class: 'muted' }, 'Revisalo y pagalo vos en Carrefour.' + (r.noDisponibles.length ? ' Al pagar, el sitio te va a ofrecer seguir sin los no disponibles.' : '')),
    );
  } catch (e) {
    out.className = 'resultado error';
    out.textContent = e.message === 'NO_LOGUEADO' ? 'Se cerró la sesión de Carrefour. Iniciala de nuevo y volvé a cargar.' : 'No pude cargar el carrito: ' + e.message;
  }
  out.hidden = false; btn.textContent = 'Cargar'; btn.disabled = false;
};

// ---------- Configuración ----------
// [clave, título, ayuda, invertir]: invertir muestra en positivo un umbral que se guarda en negativo
const CAMPOS = [
  ['diasNecesario', 'Necesario si se termina en (días)', 'Con 10: la yerba que se termina en 4 días va sí o sí; el detergente que se termina en 25, no.'],
  ['promoMin', 'Descuento mínimo para adelantar (%)', 'Con 25: un aceite con 30% off se sugiere aunque no se te termine todavía. "2do al 70%" cuenta como 35%.'],
  ['adelantarNoPerec', 'Adelantar no perecederos hasta (días)', 'Con 60: el aceite en promo se adelanta si se te termina dentro de 60 días, no si te dura 6 meses.'],
  ['adelantarPerec', 'Adelantar perecederos hasta (días)', 'Con 18: un queso en promo se adelanta solo si se te termina en 18 días o menos, para que no se venza.'],
  ['diasAtrasado', 'Preguntar si se terminó hace más de (días)', 'Con 20: la mayonesa que se te terminó hace 30 días y no volviste a comprar, te la pregunta en vez de sugerirla.', true],
  ['minCompras', 'Compras mínimas por producto', 'Con 4: un producto comprado 3 veces todavía no se analiza.'],
  ['minPedidos', 'Pedidos mínimos', 'Con 4: con 3 pedidos todavía no calcula cada cuánto hacés el súper.'],
];

async function cambiarConfig(cambios) {
  config = await guardarConfig(cambios);
  renderConfig();
  await recalcular();
}

function renderConfig() {
  const U = config.umbrales;
  const hoy = dia(Date.now());
  const respuestas = Object.values(config.respuestas).filter(r => r.hasta >= hoy).length;
  $('config').replaceChildren(
    h('div', {}, boton('Ver la guía de nuevo', abrirIntro, 'link')),

    h('section', { class: 'lista' }, h('h2', {}, 'Avisos'),
      h('label', { class: 'campo check' },
        h('span', {}, 'Avisarme cuando me toque pedir', h('small', {}, 'Revisa una vez por día, a las 10, con tu historial guardado y las promos públicas.')),
        h('input', { type: 'checkbox', checked: config.avisos, onchange: e => cambiarConfig({ avisos: e.target.checked }) }))),

    h('section', { class: 'lista' }, h('h2', {}, h('span', {}, 'Umbrales'), boton('Restaurar', () => cambiarConfig({ umbrales: UMBRALES }), 'link')),
      CAMPOS.map(([k, label, ayuda, inv]) => h('label', { class: 'campo' },
        h('span', {}, label, h('small', {}, ayuda)),
        h('input', { type: 'number', value: inv ? -U[k] : U[k], onchange: e => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) cambiarConfig({ umbrales: { ...U, [k]: inv ? -v : v } }); } })))),

    h('section', { class: 'lista' }, h('h2', {}, h('span', {}, 'Productos fijos'), boton('Agregar', () =>
      abrirBuscador('Agregar producto fijo', '', o => cambiarConfig({ fijos: [...config.fijos.filter(x => x.sku !== o.sku), { sku: o.sku, cant: 1, nombre: o.nombre }] })), 'link')),
      config.fijos.length ? h('ul', { class: 'items' }, config.fijos.map((x, k) => h('li', { class: 'item' },
        h('span'), h('span', { class: 'nombre' }, x.nombre),
        boton('Quitar', () => cambiarConfig({ fijos: config.fijos.filter((_, j) => j !== k) }), 'link'),
        h('div', { class: 'meta' }, h('span', { class: 'cant' },
          boton('−', () => cambiarConfig({ fijos: config.fijos.map((y, j) => j === k ? { ...y, cant: Math.max(1, y.cant - 1) } : y) })),
          h('span', {}, x.cant),
          boton('+', () => cambiarConfig({ fijos: config.fijos.map((y, j) => j === k ? { ...y, cant: y.cant + 1 } : y) }))), 'en cada pedido'),
      ))) : h('p', { class: 'vacio' }, 'Productos que querés en todos los pedidos, aunque el historial no los sugiera.')),

    h('section', { class: 'lista' }, h('h2', {}, 'Ya no los compro'),
      config.excluidos.length ? h('ul', { class: 'items' }, config.excluidos.map((x, k) => h('li', { class: 'item' },
        h('span'), h('span', { class: 'nombre' }, x.nombre),
        boton('Volver a incluir', () => cambiarConfig({ excluidos: config.excluidos.filter((_, j) => j !== k) }), 'link'),
      ))) : h('p', { class: 'vacio' }, 'Cuando respondas "Ya no lo compro" a una pregunta, aparece acá.')),

    h('section', { class: 'lista' }, h('h2', {}, 'Tus datos'),
      h('p', { class: 'vacio' }, 'Todo queda solo en este navegador: tu historial guardado, la configuración y tus respuestas. Nunca se guarda tu contraseña.'),
      h('div', { class: 'campo check' }, h('span', {}, `Respuestas "Esta vez no" vigentes: ${respuestas}`),
        boton('Olvidar', () => cambiarConfig({ respuestas: {} }), 'link')),
      h('div', { class: 'campo check' }, h('span', {}, 'Historial guardado', h('small', {}, 'Se vuelve a bajar la próxima vez que abras el panel.')),
        boton('Borrar', async () => { await borrarPedidos(); renderConfig(); }, 'link peligro'))),
  );
}

// ---------- Inicio ----------
$('abrir-metricas').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('metricas/metricas.html') });

document.querySelectorAll('.tabs button[data-vista]').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button[data-vista]').forEach(x => x.classList.toggle('activa', x === b));
  for (const v of ['pedido', 'config']) $(v).hidden = v !== b.dataset.vista;
  $('pie').hidden = b.dataset.vista !== 'pedido' || !Object.keys(sel).length;
});

function abrirIntro() {
  mostrarIntro(config, async c => { config = await guardarConfig(c); }, () => { renderConfig(); recalcular(); });
}

config = await leerConfig();
renderConfig();
analizar();
if (!config.introVista) abrirIntro();

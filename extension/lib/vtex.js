// Llamadas a la API VTEX de Carrefour. Ver docs/api-carrefour.md.
// Un "transporte" recibe [{ url, method, body }] y devuelve [{ data } | { error }].

export const BASE = 'https://www.carrefour.com.ar';
export const esCarrefour = url => !!url && url.startsWith(BASE);

// Se serializa y corre dentro de la página: no puede usar nada de afuera.
function pedir(reqs, base, credentials) {
  return Promise.all(reqs.map(async r => {
    try {
      const res = await fetch(base + r.url, {
        method: r.method || 'GET', credentials,
        headers: { Accept: 'application/json', ...(r.body ? { 'Content-Type': 'application/json' } : {}) },
        body: r.body ? JSON.stringify(r.body) : undefined,
      });
      return res.ok ? { data: await res.json() } : { error: 'HTTP ' + res.status };
    } catch (e) { return { error: String(e) }; }
  }));
}

// Con la sesión del usuario: corre en la pestaña de Carrefour (mismo origen, sus cookies).
export const transporteTab = tabId => async reqs => {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: pedir, args: [reqs, '', 'include'] });
  return r.result;
};

// Sin sesión: solo para el catálogo público (precio y stock de otra región; las promos coinciden).
export const transportePublico = () => reqs => pedir(reqs, BASE, 'omit');

const uno = async (t, req) => { const [r] = await t([req]); if (r.error) throw new Error(r.error); return r.data; };

export const carrito = t => uno(t, { url: '/api/checkout/pub/orderForm' });

// Historial con caché: el detalle de un pedido se baja una sola vez (se refresca si tiene menos de 7 días).
export async function pedidos(t, cache = {}, progreso = () => {}) {
  const pag = n => ({ url: `/api/oms/user/orders?page=${n}&per_page=15` });
  const primera = await uno(t, pag(1));
  const resto = Array.from({ length: Math.max(0, (primera.paging?.pages || 1) - 1) }, (_, i) => pag(i + 2));
  const lista = [primera, ...(await t(resto)).map(r => r.data || {})].flatMap(j => j.list || []);

  const reciente = Date.now() - 7 * 864e5;
  const bajar = lista.filter(o => !cache[o.orderId] || new Date(o.creationDate).getTime() > reciente);
  const nuevo = {};
  for (let i = 0; i < bajar.length; i += 8) {
    progreso(`Leyendo pedidos ${i + 1}–${Math.min(i + 8, bajar.length)} de ${bajar.length}…`);
    const lote = bajar.slice(i, i + 8);
    (await t(lote.map(o => ({ url: '/api/oms/user/orders/' + o.orderId })))).forEach((r, k) => {
      if (r.data?.items) nuevo[lote[k].orderId] = r.data;
    });
  }
  return lista.map(o => {
    const d = nuevo[o.orderId] || cache[o.orderId];
    if (!d) return null;
    return {
      orderId: o.orderId, creationDate: d.creationDate || o.creationDate, status: o.status || d.status, total: o.totalValue ?? d.value,
      items: d.items.map(i => ({ id: String(i.id), name: i.name, quantity: i.quantity, listPrice: i.listPrice, price: i.price, sellingPrice: i.sellingPrice })),
    };
  }).filter(Boolean);
}

// Precios y promos en vivo de una lista de SKUs, de a 25 por llamada.
export async function productos(t, skus, aOferta) {
  const lotes = [];
  for (let i = 0; i < skus.length; i += 25) lotes.push(skus.slice(i, i + 25));
  const res = await t(lotes.map(c => ({ url: '/api/catalog_system/pub/products/search?' + c.map(s => 'fq=skuId:' + s).join('&') + '&_from=0&_to=49' })));
  const live = {};
  res.forEach((r, k) => {
    for (const p of (Array.isArray(r.data) ? r.data : [])) for (const it of (p.items || []))
      if (lotes[k].includes(String(it.itemId))) live[it.itemId] = aOferta(it);
  });
  return live;
}

export async function buscar(t, texto, aOferta) {
  const j = await uno(t, { url: '/api/catalog_system/pub/products/search?ft=' + encodeURIComponent(texto) + '&_from=0&_to=29' });
  return (Array.isArray(j) ? j : []).flatMap(p => (p.items || []).map(aOferta)).filter(x => x.stock).slice(0, 12);
}

// Carga la lista aprobada en el carrito. Nunca va al checkout, nunca paga, nunca confirma nada.
//   'agregar'    -> agrega/actualiza estos SKUs y deja el resto del carrito como está
//   'reemplazar' -> el carrito queda exactamente con items
// Motivo corto de un ítem no disponible. Carrefour marca "cannotBeDelivered" (con el mensaje
// "no pudo ser enviado para las coordenadas seleccionadas") cuando no hay stock en la sucursal,
// y el sitio lo muestra como SIN STOCK: se usa el mismo criterio.
const SIN_STOCK = ['cannotBeDelivered', 'withoutStock', 'unavailable'];
const motivo = (item, texto) => SIN_STOCK.includes(item.availability) ? 'Sin stock en tu sucursal' : (texto || 'No disponible');

export async function cargarCarrito(t, items, modo = 'agregar') {
  let of = await carrito(t);
  if (!of.loggedIn) throw new Error('NO_LOGUEADO');
  const id = of.orderFormId, want = Object.fromEntries(items.map(i => [String(i.sku), i.cant]));

  const upd = of.items.map((it, index) => ({ index, quantity: it.id in want ? want[it.id] : (modo === 'reemplazar' ? 0 : it.quantity) }));
  if (upd.length) of = await uno(t, { url: `/api/checkout/pub/orderForm/${id}/items/update`, method: 'POST', body: { orderItems: upd } });

  const have = new Set(of.items.map(i => i.id));
  const add = Object.entries(want).filter(([s]) => !have.has(s)).map(([id, quantity]) => ({ id, quantity, seller: '1' }));
  if (add.length) of = await uno(t, { url: `/api/checkout/pub/orderForm/${id}/items?sc=1`, method: 'POST', body: { orderItems: add } });

  const tot = Object.fromEntries((of.totalizers || []).map(x => [x.id, x.value / 100]));
  const textos = (of.messages || []).map(m => m.text);
  const noDisp = of.items.filter(i => i.availability !== 'available');
  return {
    productos: of.items.length,
    total: of.value / 100,
    descuentos: -(tot.Discounts || 0),
    noDisponibles: noDisp.map(i => ({ nombre: i.name, motivo: motivo(i, textos.find(x => x.includes(i.name))) })),
    // el resto de los avisos de productos que siguen en el carrito (guarda mensajes viejos de otros)
    avisos: textos.filter(x => of.items.some(i => x.includes(i.name)) && !noDisp.some(i => x.includes(i.name))),
  };
}

// Abre el minicarrito del sitio si está cerrado. Corre en la página: no puede usar nada de afuera.
// El sitio es VTEX IO; las clases llevan un prefijo con versión (carrefourar-minicart-split-0-x-…),
// por eso se buscan por sufijo. Espera hasta que el header termine de cargar.
function abrirMinicarritoEnPagina() {
  return new Promise(resolve => {
    const fin = Date.now() + 15000;
    let clicks = 0;
    const intentar = () => {
      const cajon = [...document.querySelectorAll('[class*="minicart"]')].find(e => [...e.classList].some(c => c.endsWith('-x-drawer')));
      const boton = document.querySelector('[class*="minicart"][class*="-x-openIconContainer"] button');
      if (cajon && [...cajon.classList].some(c => c.endsWith('-x-opened'))) return resolve(clicks ? 'abierto' : 'ya-abierto');
      if (Date.now() > fin) return resolve('no-encontrado');
      // el botón puede existir antes de que la página termine de cargar y no responder: reintentar
      if (boton) { boton.click(); clicks++; return setTimeout(intentar, 1000); }
      setTimeout(intentar, 300);
    };
    intentar();
  });
}

// Recarga la pestaña para que el sitio muestre el carrito actualizado y abre el minicarrito.
export async function mostrarCarrito(tabId) {
  const cargada = new Promise(resolve => {
    const t = setTimeout(listo, 20000);
    function listo() { clearTimeout(t); chrome.tabs.onUpdated.removeListener(oir); resolve(); }
    function oir(id, info) { if (id === tabId && info.status === 'complete') listo(); }
    chrome.tabs.onUpdated.addListener(oir);
  });
  await chrome.tabs.reload(tabId);
  await cargada;
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: abrirMinicarritoEnPagina });
  return r.result;
}

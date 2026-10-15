// Análisis del historial: funciones puras, sin red ni chrome.*.
// Lo usan el panel y el chequeo en background.

// ---------- Umbrales por defecto (la persona los puede cambiar en Configuración) ----------
export const UMBRALES = {
  minCompras: 4,          // un producto necesita al menos N compras para analizarse
  minPedidos: 4,          // con menos pedidos no hay cadencia confiable
  diasNecesario: 10,      // vence en ≤ N días → necesario en este pedido
  diasAtrasado: -20,      // vencido hace más de N días → preguntar antes de sugerir
  promoMin: 25,           // % de descuento mínimo para adelantar una compra
  adelantarNoPerec: 60,   // no perecedero: adelantar si vence en ≤ N días
  adelantarPerec: 18,     // perecedero: adelantar si vence en ≤ N días
};

// ---------- Heurísticas genéricas (tipos de producto, nunca marcas ni datos de alguien) ----------
const CATEGORIAS = {
  'atún': /at[uú]n/i, 'arvejas': /arveja/i, 'choclo': /choclo/i, 'jamón': /jam[oó]n/i,
  'mayonesa': /mayonesa/i, 'lavandina': /lavandina/i,
  'detergente': /detergente/i, 'suavizante': /suavizante/i, 'yerba': /yerba/i,
  'aceite': /aceite/i, 'galletitas': /galletita/i, 'gaseosa': /gaseosa/i, 'cerveza': /cerveza/i,
};
const PERECEDERO = /yogur|queso|crema de leche|jam[oó]n|fiambre|salame|\bpan\b|manteca(?! ghee)|ricota|\bleche\b|fresco/i;
const NO_PERECEDERO = /congelad|rebozad|milanesa|uat|larga vida|papas? (noisette|bast|cong)/i;
const GRANEL = / x kg| x uni|x 1 atado|x kg\.|seleccion x/i; // a granel: el precio siempre figura rebajado; se excluye

// ---------- Utilidades ----------
const DAY = 864e5, TZ = 3 * 3600e3; // Argentina, UTC−3
export const dia = d => Math.floor((new Date(d).getTime() - TZ) / DAY);
export const iso = n => new Date(n * DAY).toISOString().slice(0, 10);
const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/(\d+)[.,](\d+)/g, '$1$2').replace(/\b(grs|gr|gramos)\b/g, 'g').replace(/\b(lts|lt|litros?)\b/g, 'l')
  .replace(/\b(unidades|uni|un)\b/g, 'u').replace(/\bcc\b/g, 'ml').replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\b(x|de|con|en|y|el|la|sabor|tipo)\b/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
const catOf = n => Object.keys(CATEGORIAS).find(c => CATEGORIAS[c].test(n)) || null;

// ---------- Perfil: cadencia, ahorro histórico y productos activos ----------
// pedidos: [{ orderId, creationDate, status, items: [{ id, name, quantity, listPrice, price, sellingPrice }] }] (precios en centavos)
export function perfil(pedidos, U, hoy = dia(Date.now())) {
  const orders = pedidos.filter(o => o && o.items && !/cancel/i.test(o.status || ''))
    .sort((a, b) => a.creationDate < b.creationDate ? -1 : 1);
  if (orders.length < U.minPedidos) return { sinHistorial: true, pedidos: orders.length };

  const od = orders.map(o => dia(o.creationDate));
  const cadencia = med(od.slice(1).map((d, k) => d - od[k]));
  const ahorroPedido = o => { let L = 0, P = 0; o.items.forEach(i => { if (GRANEL.test(i.name)) return; const b = Math.max(i.listPrice, i.price); L += b * i.quantity; P += Math.min(i.sellingPrice, b) * i.quantity; }); return L ? 1 - P / L : 0; };
  const ultimoAnio = orders.filter(o => dia(o.creationDate) >= hoy - 365);
  const ahorroHist = avg((ultimoAnio.length ? ultimoAnio : orders).map(ahorroPedido));

  // agrupar: mismo SKU, mismo nombre normalizado o misma categoría
  const par = {}, f = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const u = (a, b) => { par[a] ??= a; par[b] ??= b; par[f(a)] = f(b); };
  orders.forEach(o => o.items.forEach(i => { u('s' + i.id, 'n' + norm(i.name)); const c = catOf(i.name); if (c) u('s' + i.id, 'c' + c); }));
  const G = {};
  orders.forEach(o => {
    const d = dia(o.creationDate), seen = {};
    o.items.forEach(i => {
      if (GRANEL.test(i.name)) return;
      const k = f('s' + i.id), g = G[k] || (G[k] = { days: [], q: [], skus: new Set() });
      g.name = i.name; g.sku = String(i.id); g.skus.add(String(i.id)); g.cat = catOf(i.name) || g.cat;
      if (!seen[k]) { seen[k] = 1; g.days.push(d); g.q.push(i.quantity); }
      else g.q[g.q.length - 1] += i.quantity;
    });
  });

  const resumir = g => {
    const iv = g.days.slice(1).map((d, k) => d - g.days[k]);
    const m = med(iv);
    const qTip = Math.max(1, Math.round(med(g.q)));
    const vence = Math.round(g.days.at(-1) + m * Math.max(1, g.q.at(-1) / qTip) - hoy);
    // consumo en baja: últimos intervalos mucho más largos, o cantidades bajando
    const qRecientes = avg(g.q.slice(-3)), qAntes = avg(g.q.slice(0, -3));
    const bajando = (iv.length >= 5 && med(iv.slice(-3)) > 1.5 * m) || (g.q.length >= 6 && qRecientes < 0.6 * qAntes);
    return {
      sku: g.sku, skus: [...g.skus], nombre: g.name, categoria: g.cat || null, cadaDias: m, cant: qTip, vence, bajando,
      desde: hoy - g.days.at(-1), perecedero: PERECEDERO.test(g.name) && !NO_PERECEDERO.test(g.name), veces: g.days.length,
    };
  };
  const activos = Object.values(G).filter(g => g.days.length >= U.minCompras).map(resumir)
    .filter(g => g.desde <= Math.max(2 * g.cadaDias, 45));
  // para cuando la persona retoma después de mucho tiempo: los que más veces compró (sin mínimo), y entre iguales los más recientes
  const frecuentes = Object.values(G).sort((a, b) => b.days.length - a.days.length || b.days.at(-1) - a.days.at(-1))
    .slice(0, 30).map(resumir);

  return { hoy, ultimoPedido: od.at(-1), diasDesdeUltimo: hoy - od.at(-1), cadencia, ahorroHist, pedidos: orders.length, activos, frecuentes };
}

// ---------- Precio y promo de un SKU (catálogo, precios en pesos) ----------
export function oferta(item) {
  const o = item.sellers?.[0]?.commertialOffer || {};
  const names = [...(o.Teasers || []), ...(o.DiscountHighLight || [])].map(t => t['<Name>k__BackingField'] || t.Name || '').filter(n => n.includes('PROMO'));
  // las promos no se suman: nos quedamos con la mejor
  let eff = o.ListPrice > o.Price ? 1 - o.Price / o.ListPrice : 0, multi = false; const lab = [];
  for (const n of names) {
    lab.push(((n.match(/PROMO-(.*?)(?:\s+Max|\s*-Reg)/) || [])[1] || n).trim());
    let m, e = 0;
    if ((m = n.match(/2do al (\d+)%/))) e = m[1] / 200;
    else if (/2x1/i.test(n)) e = .5;
    else if (/3x2/i.test(n)) e = 1 / 3;
    else if ((m = n.match(/(\d+)% Off/i)) && !(o.ListPrice > o.Price)) e = m[1] / 100;
    if (e > eff) { eff = e; multi = /2do|2x1|3x2/i.test(n); }
  }
  // imagen chica: VTEX acepta el tamaño en la URL (/ids/123-120-120/)
  const imagen = item.images?.[0]?.imageUrl?.replace(/\/ids\/(\d+)(-\d+-\d+)?\//, '/ids/$1-120-120/');
  return { sku: String(item.itemId), nombre: item.name, imagen, precio: o.Price, lista: o.ListPrice, stock: o.AvailableQuantity > 0, eff, multi, promo: [...new Set(lab)].join('; ') };
}

// precio unitario regular y pagado, según la promo
export function precioItem(L, cant) {
  if (!L || L.precio == null) return { cant, unitReg: 0, unitPag: 0 };
  if (L.multi && cant % 2) cant++;
  return { cant, unitReg: L.multi ? L.precio : Math.max(L.lista || 0, L.precio), unitPag: L.multi ? L.precio * (1 - L.eff) : L.precio };
}

// ---------- Decisión y listas ----------
// live: { sku: oferta }; usuario: { excluidos: [{ skus, nombre }], fijos: [{ sku, cant, nombre }], respuestas: { sku: { hasta } } }
export function decidir(P, live, U, usuario) {
  const { excluidos = [], fijos = [], respuestas = {} } = usuario;
  const excl = new Set(excluidos.flatMap(x => x.skus)), fijoSkus = new Set(fijos.map(x => String(x.sku)));
  const respondida = g => g.skus.some(s => respuestas[s] && respuestas[s].hasta >= P.hoy);
  const out = { necesarios: [], adelantar: [], fijos: [], anteriores: [], sinStock: [], preguntas: [] };
  // hace mucho que no pide: el historial no sirve para predecir, se ofrecen los frecuentes sin marcar
  const retomar = P.diasDesdeUltimo > Math.max(3 * P.cadencia, 90);
  let reg = 0, pag = 0;
  const sumar = it => { reg += it.unitReg * it.cant; pag += it.unitPag * it.cant; };

  for (const g of (retomar ? [] : P.activos)) {
    if (g.skus.some(s => excl.has(s) || fijoSkus.has(s))) continue;
    // si el último SKU ya no está en el catálogo, otro del mismo grupo
    const L = live[g.sku] || live[g.skus.findLast(s => live[s])] || {};
    const item = { sku: L.sku || g.sku, skus: g.skus, nombre: g.nombre, imagen: L.imagen, categoria: g.categoria, vence: g.vence, cadaDias: g.cadaDias, cant: g.cant, precio: L.precio, promo: L.promo || '', dto: Math.round(100 * (L.eff || 0)) };
    if (g.bajando || g.vence < U.diasAtrasado) {
      if (!respondida(g)) out.preguntas.push({ ...item, motivo: g.bajando ? 'bajando' : 'atrasado' });
      continue;
    }
    let dest = null;
    if (g.vence <= U.diasNecesario) dest = 'necesarios';
    else if ((L.eff || 0) * 100 >= U.promoMin && g.vence <= (g.perecedero ? U.adelantarPerec : U.adelantarNoPerec)) dest = 'adelantar';
    if (!dest) continue;
    if (L.stock === false) { out.sinStock.push(item); continue; }
    Object.assign(item, precioItem(L, item.cant));
    sumar(item); out[dest].push(item);
  }
  for (const g of (retomar ? P.frecuentes : [])) {
    if (g.skus.some(s => excl.has(s) || fijoSkus.has(s))) continue;
    const L = live[g.sku] || live[g.skus.findLast(s => live[s])] || {};
    if (L.stock === false || L.precio == null) continue;
    out.anteriores.push({ sku: L.sku || g.sku, skus: g.skus, nombre: g.nombre, veces: g.veces, imagen: L.imagen, precio: L.precio, promo: L.promo || '', dto: Math.round(100 * (L.eff || 0)), ...precioItem(L, g.cant) });
  }
  for (const x of fijos) {
    const L = live[x.sku] || {};
    const item = { sku: String(x.sku), skus: [String(x.sku)], nombre: x.nombre, imagen: L.imagen, cant: x.cant, precio: L.precio, promo: L.promo || '', dto: Math.round(100 * (L.eff || 0)), fijo: true };
    if (L.stock === false) { out.sinStock.push(item); continue; }
    Object.assign(item, precioItem(L, item.cant));
    sumar(item); out.fijos.push(item);
  }

  // respeta la cadencia; lo que se mueve es estirar una semana
  const ahorroSemana = reg ? 1 - pag / reg : 0;
  let decision;
  if (retomar) decision = 'RETOMAR';
  else if (P.diasDesdeUltimo < P.cadencia - 3) decision = 'TODAVIA_NO';
  else if (P.diasDesdeUltimo >= P.cadencia + 10) decision = 'PEDIR_YA';
  else if (ahorroSemana >= P.ahorroHist) decision = 'PEDIR_ESTA_SEMANA';
  else decision = 'ESTIRAR_UNA_SEMANA';

  return {
    decision, ventana: iso(P.ultimoPedido + P.cadencia - 3),
    ahorroHistorico: +(100 * P.ahorroHist).toFixed(1), ahorroEstaSemana: +(100 * ahorroSemana).toFixed(1),
    totalEstimado: Math.round(pag), ahorroEstimado: Math.round(reg - pag), ...out,
  };
}

export const TEXTO_DECISION = {
  TODAVIA_NO: 'Todavía no te toca pedir',
  PEDIR_ESTA_SEMANA: 'Te toca pedir y la semana viene buena',
  ESTIRAR_UNA_SEMANA: 'Te toca, pero conviene estirar una semana',
  PEDIR_YA: 'Ya te pasaste de tu frecuencia: conviene pedir',
  RETOMAR: 'Hace mucho que no pedís',
};

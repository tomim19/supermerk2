// Métricas de gasto a partir del historial: funciones puras, sin red ni chrome.*.
// Montos en pesos (el historial viene en centavos). Son nominales: no ajustan por inflación.
import { dia } from './analisis.js';

const sumar = (a, f) => a.reduce((s, x) => s + f(x), 0);

// pedidos: los del historial guardado; desde: día (número) a partir del cual se cuenta, o null para todo.
export function metricas(pedidos, desde = null, hoy = dia(Date.now())) {
  const todos = pedidos.filter(o => o && o.items && !/cancel/i.test(o.status || ''))
    .map(o => {
      const items = o.items;
      const pagado = sumar(items, i => i.sellingPrice * i.quantity);
      const regular = sumar(items, i => Math.max(i.listPrice, i.price, i.sellingPrice) * i.quantity);
      return {
        orderId: o.orderId, dia: dia(o.creationDate),
        // total del pedido (incluye envío) si está; si no, la suma de los productos
        total: (o.total ?? pagado) / 100, ahorro: (regular - pagado) / 100, productos: items.length, items,
      };
    })
    .sort((a, b) => a.dia - b.dia);

  // días hasta el pedido siguiente y gasto por día en ese tramo (el último no tiene siguiente)
  todos.forEach((p, k) => {
    const sig = todos[k + 1];
    p.diasHastaSiguiente = sig ? sig.dia - p.dia : null;
    p.gastoPorDia = sig && sig.dia > p.dia ? p.total / (sig.dia - p.dia) : null;
  });

  const lista = desde == null ? todos : todos.filter(p => p.dia >= desde);
  if (!lista.length) return { pedidos: [], vacio: true };

  const total = sumar(lista, p => p.total);
  const inicio = desde ?? lista[0].dia;
  const meses = Math.max(1, (hoy - inicio) / 30.44);
  const tramos = lista.filter(p => p.gastoPorDia != null);
  const diasTramos = sumar(tramos, p => p.diasHastaSiguiente);

  // productos con más gasto, agrupados por SKU (el nombre es el último que se vio)
  const prod = {};
  for (const p of lista) for (const i of p.items) {
    const g = prod[i.id] || (prod[i.id] = { sku: i.id, nombre: i.name, gasto: 0, veces: 0 });
    g.nombre = i.name; g.gasto += i.sellingPrice * i.quantity / 100; g.veces++;
  }

  return {
    pedidos: lista.map(({ items, ...p }) => p),
    total,
    promedioPedido: total / lista.length,
    gastoMensual: total / meses,
    // gasto por día ponderado por la duración de cada tramo
    gastoPorDia: diasTramos ? sumar(tramos, p => p.total) / diasTramos : null,
    diasEntrePedidos: tramos.length ? diasTramos / tramos.length : null,
    ahorro: sumar(lista, p => p.ahorro),
    top: Object.values(prod).sort((a, b) => b.gasto - a.gasto).slice(0, 10),
  };
}

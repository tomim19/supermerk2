// Gráficos SVG de una sola serie, sin dependencias. Hover: el punto más cercano en x muestra el tooltip.
// Colores por clase (metricas.css), así toman el modo claro u oscuro.
import { h } from '../panel/dom.js';

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...hijos) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...hijos.filter(Boolean));
  return el;
}

// escala "linda" para el eje y: 0 .. máximo redondeado, con 3–5 marcas
function marcasY(max) {
  if (!(max > 0)) return [0, 1];
  const paso0 = max / 4, mag = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map(m => m * mag).find(p => p >= paso0);
  return Array.from({ length: Math.ceil(max / paso) + 1 }, (_, k) => k * paso);
}

// marcas de x por mes, como mucho ~6
function marcasX(d0, d1, aFecha) {
  const ini = aFecha(d0), fin = aFecha(d1), meses = [];
  for (let d = new Date(ini.getFullYear(), ini.getMonth() + 1, 1); d <= fin; d.setMonth(d.getMonth() + 1)) meses.push(new Date(d));
  const cada = Math.max(1, Math.ceil(meses.length / 6));
  return meses.filter((_, k) => k % cada === 0);
}

// Barras (forma 'barras') o línea con puntos (forma 'linea') sobre un eje de tiempo real.
// puntos: [{ x: día, y, tip: [líneas] }]. Devuelve un contenedor con el SVG y el tooltip.
export function graficoTiempo(puntos, { forma, ancho, alto = 220, fmtY, aFecha, diaAMs }) {
  const M = { t: 12, r: 12, b: 26, l: 56 };
  const W = ancho - M.l - M.r, H = alto - M.t - M.b;
  const xs = puntos.map(p => p.x), d0 = Math.min(...xs), d1 = Math.max(...xs);
  const rango = Math.max(1, d1 - d0);
  // margen en x para que la primera y la última barra no queden cortadas
  const pad = forma === 'barras' ? Math.min(16, W / (puntos.length * 2)) : 6;
  const X = d => M.l + pad + (d - d0) / rango * (W - 2 * pad);
  const ticks = marcasY(Math.max(...puntos.map(p => p.y)));
  const yMax = ticks.at(-1);
  const Y = v => M.t + H - v / yMax * H;

  const svg = s('svg', { width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, role: 'img' });
  // grilla y eje y (recesivos)
  for (const t of ticks) svg.append(
    s('line', { x1: M.l, x2: M.l + W, y1: Y(t), y2: Y(t), class: t ? 'grilla' : 'base' }),
    s('text', { x: M.l - 8, y: Y(t), class: 'eje', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, fmtY(t)));
  // eje x por mes
  for (const f of marcasX(d0, d1, aFecha)) {
    const d = d0 + (f.getTime() - diaAMs(d0)) / 864e5;
    svg.append(s('text', { x: X(d), y: alto - 6, class: 'eje', 'text-anchor': 'middle' },
      f.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })));
  }

  const marcas = [];
  if (forma === 'barras') {
    // barras finas, extremo superior redondeado (4px) y apoyadas en la base; 2px de separación como mínimo
    const minDist = puntos.slice(1).reduce((m, p, k) => Math.min(m, X(p.x) - X(puntos[k].x)), Infinity);
    const bw = Math.max(3, Math.min(18, (isFinite(minDist) ? minDist : 18) - 2));
    for (const p of puntos) {
      const x = X(p.x) - bw / 2, y = Y(p.y), base = Y(0), r = Math.min(4, bw / 2, base - y);
      const d = `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z`;
      const el = s('path', { d, class: 'serie' }); svg.append(el); marcas.push(el);
    }
  } else {
    svg.append(s('path', { d: puntos.map((p, k) => `${k ? 'L' : 'M'}${X(p.x)},${Y(p.y)}`).join(' '), class: 'linea' }));
    for (const p of puntos) { const el = s('circle', { cx: X(p.x), cy: Y(p.y), r: 4, class: 'punto' }); svg.append(el); marcas.push(el); }
  }

  // hover: el punto más cercano en x; la zona sensible es todo el gráfico
  const guia = s('line', { y1: M.t, y2: M.t + H, class: 'guia', visibility: 'hidden' });
  svg.append(guia);
  const tip = h('div', { class: 'tip', hidden: true });
  const caja = h('div', { class: 'grafico' }, svg, tip);
  svg.addEventListener('pointermove', e => {
    const bx = svg.getBoundingClientRect(), mx = e.clientX - bx.left;
    let k = 0; puntos.forEach((p, i) => { if (Math.abs(X(p.x) - mx) < Math.abs(X(puntos[k].x) - mx)) k = i; });
    marcas.forEach((m, i) => m.classList.toggle('activa', i === k));
    const x = X(puntos[k].x);
    guia.setAttribute('x1', x); guia.setAttribute('x2', x); guia.setAttribute('visibility', 'visible');
    tip.replaceChildren(...puntos[k].tip.map((l, i) => h(i ? 'div' : 'strong', {}, l)));
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(0, x - tw / 2), ancho - tw) + 'px';
    tip.style.top = Math.max(0, Y(puntos[k].y) - tip.offsetHeight - 10) + 'px';
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; guia.setAttribute('visibility', 'hidden'); marcas.forEach(m => m.classList.remove('activa')); });
  return caja;
}

// Ranking horizontal: una barra por fila con el valor al final (texto en tinta, no en el color de la serie).
export function ranking(filas, fmt) {
  const max = Math.max(...filas.map(f => f.valor));
  return h('ol', { class: 'ranking' }, filas.map(f => h('li', {},
    h('div', { class: 'ranking-nombre', title: f.nombre }, f.nombre, f.detalle ? h('small', {}, f.detalle) : null),
    h('div', { class: 'ranking-barra' }, h('span', { style: `width:${Math.max(1, f.valor / max * 100)}%` })),
    h('div', { class: 'ranking-valor' }, fmt(f.valor)))));
}

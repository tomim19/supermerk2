// Utilidades de DOM compartidas por el panel y la guía.
export const $ = id => document.getElementById(id);

// replaceChildren escribe null como texto: filtrar siempre
export const poner = (el, ...hijos) => el.replaceChildren(...hijos.flat().filter(x => x != null && x !== false));

export function h(tag, attrs = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  el.append(...hijos.flat().filter(x => x != null && x !== false));
  return el;
}

export const boton = (texto, fn, clase) => h('button', { class: clase, onclick: fn }, texto);

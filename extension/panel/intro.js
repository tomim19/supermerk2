// Guía de bienvenida: explica cada punto de la configuración con ejemplos que se recalculan
// mientras la persona cambia los valores. Se muestra la primera vez y desde Configuración.
import { $, h, poner, boton } from './dom.js';

// Un campo numérico de la guía. "invertir" muestra en positivo un umbral que se guarda en negativo.
function numero(U, k, sufijo, alCambiar, invertir = false) {
  return h('label', { class: 'intro-num' },
    h('input', {
      type: 'number', min: 0, value: invertir ? -U[k] : U[k],
      oninput: e => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) { U[k] = invertir ? -v : v; alCambiar(); } },
    }), sufijo);
}

// Párrafo de ejemplo que se vuelve a escribir con cada cambio.
function ejemplo(escribir) {
  const el = h('div', { class: 'intro-ejemplo' });
  const actualizar = () => poner(el, escribir());
  actualizar();
  return { el, actualizar };
}

const si = (cond, a, b) => cond ? h('strong', { class: 'ok' }, a) : h('strong', { class: 'no' }, b);

const PASOS = [
  {
    titulo: 'Te ayudo a hacer el súper',
    cuerpo: () => [
      h('p', {}, 'Esta extensión mira tus pedidos anteriores en Carrefour y te ayuda a decidir ', h('strong', {}, 'cuándo'), ' pedir y ', h('strong', {}, 'qué'), ' llevar.'),
      h('ul', {},
        h('li', {}, 'Te dice si te toca pedir esta semana o si conviene estirar una más.'),
        h('li', {}, 'Arma la lista con lo que se te está por terminar y lo que conviene adelantar por promo.'),
        h('li', {}, 'Carga el carrito cuando vos se lo pedís.')),
      h('div', { class: 'intro-ejemplo' },
        h('strong', {}, 'Lo que nunca hace: '), 'pagar, ir al checkout ni ver tu contraseña. El pago lo hacés vos en el sitio. Tus datos quedan solo en este navegador.'),
      h('p', { class: 'muted' }, 'En los próximos pasos te explico cada ajuste con ejemplos. Podés dejar todo como está: los valores de entrada funcionan bien para la mayoría.'),
    ],
  },
  {
    titulo: 'Cómo calcula',
    cuerpo: () => [
      h('p', {}, 'Para cada producto que compraste varias veces, mira ', h('strong', {}, 'cada cuántos días'), ' lo comprás y calcula cuándo se te termina.'),
      h('div', { class: 'intro-ejemplo' },
        h('div', {}, 'Yerba: la comprás cada ', h('strong', {}, '14 días'), ' y la última fue hace ', h('strong', {}, '10'), '.'),
        h('div', {}, '→ Se te termina en ', h('strong', {}, '4 días'), '.')),
      h('p', {}, 'Si la última vez llevaste el doble de lo habitual, estima que te dura el doble.'),
      h('p', {}, 'Con tus pedidos calcula también cada cuánto hacés el súper. Cuando te toca, compara las promos de la semana con lo que ahorrás en promedio:'),
      h('ul', {},
        h('li', {}, 'Si la semana es buena, te sugiere pedir.'),
        h('li', {}, 'Si es floja, te sugiere estirar una semana.'),
        h('li', {}, 'Nunca te apura a pedir antes de tiempo solo porque hay promos.')),
    ],
  },
  {
    titulo: 'Lo necesario',
    cuerpo: (U, guardar) => {
      const ej = ejemplo(() => [
        h('div', {}, 'Yerba, se termina en 4 días → ', si(4 <= U.diasNecesario, 'va como necesaria', 'no entra')),
        h('div', {}, 'Arroz, se termina en 9 días → ', si(9 <= U.diasNecesario, 'va como necesario', 'no entra')),
        h('div', {}, 'Detergente, se termina en 25 días → ', si(25 <= U.diasNecesario, 'va como necesario', 'no entra, queda para otro pedido')),
      ]);
      return [
        h('p', {}, 'Lo que se te termina pronto va a la lista ', h('strong', {}, 'Necesarios'), ', haya promo o no.'),
        h('div', { class: 'intro-campo' }, h('span', {}, 'Es necesario si se termina en los próximos'), numero(U, 'diasNecesario', 'días', () => { ej.actualizar(); guardar(); })),
        ej.el,
        h('p', { class: 'muted' }, 'Consejo: si pedís cada dos semanas, 10 días suele andar bien. Si pedís cada mes, probá con 20.'),
      ];
    },
  },
  {
    titulo: 'Aprovechar promos',
    cuerpo: (U, guardar) => {
      const ej = ejemplo(() => [
        h('div', {}, 'Aceite con 30% off, se termina en 40 días → ',
          si(30 >= U.promoMin && 40 <= U.adelantarNoPerec, 'te lo sugiere ahora', 'no lo adelanta')),
        h('div', {}, 'Queso con 30% off, se termina en 25 días → ',
          si(30 >= U.promoMin && 25 <= U.adelantarPerec, 'te lo sugiere ahora', 'no lo adelanta (se te vencería)')),
        h('div', {}, 'Galletitas con 15% off, se terminan en 20 días → ',
          si(15 >= U.promoMin && 20 <= U.adelantarNoPerec, 'te las sugiere ahora', 'no las adelanta (la promo es chica)')),
      ]);
      const cambio = () => { ej.actualizar(); guardar(); };
      return [
        h('p', {}, 'Si algo todavía no se te termina pero tiene un buen descuento, te sugiere comprarlo ahora. Va a la lista ', h('strong', {}, 'Para adelantar por promo'), '.'),
        h('div', { class: 'intro-campo' }, h('span', {}, 'Descuento mínimo'), numero(U, 'promoMin', '%', cambio)),
        h('p', { class: 'muted' }, 'Las promos tipo "2do al 70%" se cuentan como descuento promedio por unidad: 35%. Un 2x1 es 50%.'),
        h('p', {}, 'Para no llenarte la alacena, hay un límite de cuánto tiempo antes lo adelanta:'),
        h('div', { class: 'intro-campo' }, h('span', {}, 'No perecederos (atún, aceite, detergente)'), numero(U, 'adelantarNoPerec', 'días', cambio)),
        h('div', { class: 'intro-campo' }, h('span', {}, 'Perecederos (yogur, queso, fiambre, leche)'), numero(U, 'adelantarPerec', 'días', cambio)),
        ej.el,
      ];
    },
  },
  {
    titulo: 'Cuando algo deja de comprarse',
    cuerpo: (U, guardar) => {
      const ej = ejemplo(() => [
        h('div', {}, 'Mayonesa: la comprabas cada 30 días y la última fue hace 60, así que se terminó hace 30 días.'),
        h('div', {}, '→ ', si(30 > -U.diasAtrasado, 'te pregunta si todavía la necesitás', 'te la sugiere directamente')),
      ]);
      return [
        h('p', {}, 'Si algo se te terminó hace bastante y no lo volviste a comprar, quizás lo compraste en otro lado, cambiaste de marca o dejaste de usarlo. En vez de sugerirlo, ', h('strong', {}, 'te pregunta'), '.'),
        h('div', { class: 'intro-campo' }, h('span', {}, 'Preguntar si se terminó hace más de'), numero(U, 'diasAtrasado', 'días', () => { ej.actualizar(); guardar(); }, true)),
        ej.el,
        h('p', {}, 'También pregunta cuando nota que estás comprando menos de algo. Podés responder:'),
        h('ul', {},
          h('li', {}, h('strong', {}, 'Sumar:'), ' lo agrega a este pedido.'),
          h('li', {}, h('strong', {}, 'Esta vez no:'), ' no lo vuelve a preguntar hasta el próximo ciclo.'),
          h('li', {}, h('strong', {}, 'Ya no lo compro:'), ' no lo sugiere más. Lo podés recuperar desde Configuración.')),
      ];
    },
  },
  {
    titulo: 'Cuánta historia necesita',
    cuerpo: (U, guardar) => {
      const ej = ejemplo(() => [
        h('div', {}, 'Un producto que compraste 3 veces → ', si(3 >= U.minCompras, 'se analiza', 'todavía no se analiza')),
        h('div', {}, 'Una cuenta con 3 pedidos → ', si(3 >= U.minPedidos, 'ya tiene frecuencia', 'todavía no calcula cada cuánto pedís')),
      ]);
      const cambio = () => { ej.actualizar(); guardar(); };
      return [
        h('p', {}, 'Con pocas compras el promedio engaña: dos compras seguidas no dicen mucho. Por eso pide un mínimo.'),
        h('div', { class: 'intro-campo' }, h('span', {}, 'Compras mínimas de un producto'), numero(U, 'minCompras', 'veces', cambio)),
        h('div', { class: 'intro-campo' }, h('span', {}, 'Pedidos mínimos para calcular tu frecuencia'), numero(U, 'minPedidos', 'pedidos', cambio)),
        ej.el,
        h('p', { class: 'muted' }, 'Si bajás estos números vas a ver más productos, pero con estimaciones menos precisas.'),
      ];
    },
  },
  {
    titulo: 'Tu lista, a tu manera',
    cuerpo: () => [
      h('p', {}, 'Además de lo que calcula, tenés dos listas propias en Configuración:'),
      h('div', { class: 'intro-ejemplo' },
        h('div', {}, h('strong', {}, 'Productos fijos: '), 'van en todos los pedidos aunque el historial no los sugiera. Por ejemplo, la leche que hasta ahora comprabas en el almacén.')),
      h('div', { class: 'intro-ejemplo' },
        h('div', {}, h('strong', {}, 'Ya no los compro: '), 'lo que marcaste para que no se sugiera más.')),
      h('p', {}, 'Y en cada pedido podés destildar productos, cambiar cantidades y buscar reemplazos para lo que no tiene stock.'),
    ],
  },
  {
    titulo: 'Avisos',
    cuerpo: (U, guardar, cfg) => [
      h('p', {}, 'Todos los días a las 10 revisa si te toca pedir. Si te toca, te manda una notificación con cuántos productos sugiere y cuánto ahorrarías.'),
      h('label', { class: 'intro-campo' }, h('span', {}, 'Avisarme cuando me toque pedir'),
        h('input', { type: 'checkbox', checked: cfg.avisos, onchange: e => { cfg.avisos = e.target.checked; guardar(); } })),
      h('p', { class: 'muted' }, 'Para el aviso usa tu historial guardado y las promos públicas del sitio. Las promos coinciden con las de tu sucursal, pero los precios pueden variar un poco. El total exacto lo ves al abrir el panel.'),
    ],
  },
  {
    titulo: 'Listo',
    cuerpo: () => [
      h('p', {}, 'Ya podés empezar. Abrí carrefour.com.ar, iniciá sesión y el panel arma tu pedido.'),
      h('p', {}, 'Todo lo que configuraste lo podés cambiar en ', h('strong', {}, 'Configuración'), ', y desde ahí podés volver a ver esta guía.'),
    ],
  },
];

// config: copia editable; guardar(config) persiste; alTerminar() se llama al cerrar.
export function mostrarIntro(config, guardar, alTerminar) {
  const cfg = { ...config, umbrales: { ...config.umbrales } };
  let paso = 0, timer = null;
  const persistir = () => { clearTimeout(timer); timer = setTimeout(() => guardar(cfg), 300); };
  const cerrar = async () => { clearTimeout(timer); await guardar({ ...cfg, introVista: true }); $('intro').hidden = true; alTerminar(); };

  const dibujar = () => {
    const P = PASOS[paso], ultimo = paso === PASOS.length - 1;
    poner($('intro'),
      h('div', { class: 'intro-cabecera' },
        h('span', { class: 'muted' }, `Paso ${paso + 1} de ${PASOS.length}`),
        ultimo ? null : boton('Saltar guía', cerrar, 'link')),
      h('div', { class: 'intro-puntos' }, PASOS.map((_, k) => h('span', { class: k === paso ? 'activo' : k < paso ? 'hecho' : '' }))),
      h('article', { class: 'intro-cuerpo' }, h('h1', {}, P.titulo), P.cuerpo(cfg.umbrales, persistir, cfg)),
      h('div', { class: 'intro-acciones' },
        paso ? boton('Atrás', () => { paso--; dibujar(); }) : h('span'),
        boton(ultimo ? 'Empezar' : 'Siguiente', ultimo ? cerrar : () => { paso++; dibujar(); }, 'primario')),
    );
    $('intro').scrollTop = 0;
  };
  $('intro').hidden = false;
  dibujar();
}

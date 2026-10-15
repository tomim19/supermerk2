# Compras Carrefour

Extensión de Chrome que planifica las compras en **Carrefour Argentina** (carrefour.com.ar) a partir del historial de pedidos de quien la usa:

- calcula cada cuánto compra cada producto (mediana entre pedidos)
- detecta lo que le toca reponer y lo que conviene adelantar por promo
- recomienda si pedir esta semana o estirar una más, y avisa con una notificación
- arma el carrito, sin pasar por el checkout ni pagar

No contiene datos de ningún usuario: todo se infiere del historial de la persona que la use y queda solo en su navegador.

## Requisitos
- Chrome 116 o más nuevo.
- Una cuenta de Carrefour Argentina con pedidos previos (mínimo 4 para calcular la frecuencia).

## Instalación (modo desarrollador)
1. Abrí `chrome://extensions` y activá **Modo de desarrollador**.
2. **Cargar extensión sin empaquetar** → elegí esta carpeta (`extension/`).
3. Abrí carrefour.com.ar, iniciá sesión y tocá el ícono de la extensión: se abre el panel lateral.

## Uso
- **Pedido**: la decisión de la semana, las listas (necesarios, para adelantar, fijos), las preguntas y lo que no tiene stock, con buscador de reemplazos. Elegí qué llevar y tocá **Cargar**. Después revisá el carrito y pagalo vos en el sitio.
- **Configuración**: umbrales, productos fijos, productos que ya no comprás, avisos y borrado de datos.
- **Avisos**: una vez por día revisa tu historial guardado y las promos públicas, y te avisa cuando te toca pedir.

## Estructura
- `manifest.json`: manifiesto MV3.
- `background.js`: abre el panel y hace el chequeo diario.
- `panel/`: interfaz del panel lateral y guía de bienvenida.
- `metricas/`: página de métricas de gasto.
- `lib/analisis.js`: cálculo de frecuencia, promos y decisión (funciones puras).
- `lib/metricas.js`: cálculo de las métricas de gasto (funciones puras).
- `lib/vtex.js`: llamadas a la API de Carrefour.
- `lib/store.js`: configuración e historial guardados en `chrome.storage.local`.
- [`../docs/api-carrefour.md`](../docs/api-carrefour.md): endpoints y formato de precios.

La skill original de Claude sigue en la raíz del repo (`SKILL.md`, `analizar.js`, `cargar_carrito.js`); esta extensión es independiente.

## Limitaciones
- Los endpoints de Carrefour (VTEX) no son públicos ni documentados: pueden cambiar sin aviso.
- Revisá los términos de uso de Carrefour antes de automatizar compras.
- El aviso diario usa precios públicos: las promos coinciden con las de tu sucursal, pero precio y stock pueden no coincidir.
- Las categorías de sustitución y los perecederos son heurísticas: la persona las corrige respondiendo las preguntas y desde Configuración.

## Licencia
MIT

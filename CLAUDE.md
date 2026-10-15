# CLAUDE.md

Este repo planifica las compras de supermercado en Carrefour Argentina a partir del historial de pedidos del usuario y arma el carrito, sin pagar. Conviven dos versiones independientes:

- **Skill de Claude (original)**, en la raíz: `SKILL.md`, `analizar.js`, `cargar_carrito.js`, `api-carrefour.md` y `README.md`. **No tocar ni borrar estos archivos**: otra persona usa la skill desde `main`. Los cambios nuevos van en la extensión.
- **Extensión de Chrome (Manifest V3)**, en `extension/`. No hay build, bundler ni dependencias: se carga la carpeta tal cual. Su README es `extension/README.md`.

La lógica de análisis de la extensión (`extension/lib/analisis.js`) salió de `analizar.js`, pero ya divergió: no se sincronizan.

## Estructura de la extensión
- `extension/manifest.json`: permisos `sidePanel`, `storage`, `alarms`, `notifications`, `scripting`; host `https://www.carrefour.com.ar/*`.
- `extension/background.js`: service worker (módulo). Abre el panel desde el ícono y una vez por día (`chrome.alarms`) revisa si toca pedir y manda una notificación.
- `extension/panel/`: panel lateral (`panel.html`, `panel.css`, `panel.js`), con las vistas Pedido y Configuración. `intro.js` es la guía de bienvenida (se muestra si `config.introVista` es falso y desde Configuración). `dom.js` tiene los helpers `h()`, `poner()` y `boton()`.
- `extension/metricas/`: página de métricas que se abre en una pestaña nueva desde el panel ("Métricas ↗"). Lee solo el historial guardado; no habla con Carrefour. `graficos.js` dibuja SVG sin dependencias.
- `extension/lib/metricas.js`: cálculo de las métricas de gasto (funciones puras).
- `extension/lib/analisis.js`: **funciones puras** (`perfil`, `oferta`, `precioItem`, `decidir`). Sin red ni `chrome.*`, para poder probarlas en Node.
- `extension/lib/vtex.js`: llamadas a la API VTEX a través de un *transporte*.
- `extension/lib/store.js`: `chrome.storage.local` (config, caché del historial y último aviso).
- `docs/api-carrefour.md`: endpoints, formato de precios y cómo leer las promos, actualizado para la extensión (la copia de la raíz es la de la skill). Actualizalo si cambia la API.

## Cómo se habla con Carrefour
- **Con sesión** (`transporteTab`): las llamadas corren dentro de la pestaña de carrefour.com.ar con `chrome.scripting.executeScript`. Son del mismo origen y usan las cookies del usuario. La función que se inyecta (`pedir`) se serializa, así que no puede usar nada de fuera de su cuerpo.
- **Sin sesión** (`transportePublico`): solo el catálogo público, desde el service worker. Precio y stock son de otra región; las promos coinciden. Lo usa el chequeo diario.
- El historial se cachea en `chrome.storage.local`. El detalle de cada pedido se baja una vez y se refresca si tiene menos de 7 días.

## Reglas que no se negocian
- **Nunca** ir al checkout, elegir carrito, tocar "Continuar con disponibles" ni ingresar datos de pago. El único endpoint de escritura permitido es el de agregar o actualizar ítems del `orderForm`, y solo cuando la persona toca **Cargar**.
- **Nunca** pedir, guardar ni leer contraseñas, tokens o cookies. El login lo hace el usuario en el sitio.
- El modo por defecto es **agregar**. **Reemplazar** borra lo que no está en la lista y pide una segunda confirmación.
- No sumar permisos ni hosts al manifiesto sin una razón concreta.

## Sin datos de usuarios
- El repo no contiene datos de nadie. Los datos de la persona (historial, configuración, respuestas) viven solo en `chrome.storage.local` de su navegador y se pueden borrar desde Configuración.
- Las regex de `analisis.js` (`CATEGORIAS`, `PERECEDERO`, `NO_PERECEDERO`, `GRANEL`) son **solo heurísticas genéricas** del súper argentino: tipos de producto, nunca marcas ni productos puntuales sacados de un historial real.
- No commitear SKUs, pedidos, nombres, direcciones, respuestas de la API ni capturas de una cuenta real. Para fixtures o docs, usá datos inventados.

## Idioma y estilo
- Todo en **español rioplatense**: identificadores, comentarios, textos de la interfaz y docs. En la interfaz se usa voseo ("pedí", "revisalo").
- Para referirte al usuario, usá "la persona" o "el usuario", sin asumir género.
- JS moderno sin dependencias ni frameworks, con módulos ES y el estilo compacto que ya tiene el código. En el panel, el DOM se arma con `h()` y se reemplaza con `poner()`, nunca con `replaceChildren` directo (escribe `null` como texto).
- Los umbrales viven en `UMBRALES` con un comentario cada uno. Si agregás o cambiás uno, actualizá también `CAMPOS` en `panel.js` y el paso que corresponda en `intro.js`, con su ejemplo.
- `diasAtrasado` se guarda en negativo pero en la interfaz se muestra en positivo (`invertir`).
- Precios: el historial (`/api/oms`) y el carrito vienen **en centavos**; el catálogo viene **en pesos**. Al usuario se le muestran pesos sin centavos.
- Colores: tokens en `:root` con su versión oscura (`prefers-color-scheme`). El color de los gráficos (`--serie` en `metricas.css`) está validado para contraste y luminosidad en los dos modos: si lo cambiás, volvé a validarlo.
- Los montos de las métricas son nominales (sin ajustar por inflación) y la página lo aclara.

## Probar cambios
No hay tests automáticos en el repo. Para probar:
1. Sintaxis: `for f in extension/lib/*.js extension/background.js extension/panel/panel.js; do node --check --input-type=module < $f; done`
2. Lógica: `analisis.js` se puede importar desde Node con un historial inventado. Hay que copiarlo como `.mjs` o correrlo con `--input-type=module`. No commitees esos scripts ni sus datos.
3. Extensión: en `chrome://extensions`, recargá la extensión. Abrí carrefour.com.ar con sesión, abrí el panel y revisá la consola del panel y del service worker. Probá **Cargar** con pocos ítems y en modo agregar, y no avances al checkout.
4. Aviso diario: desde la consola del service worker, `chrome.alarms.create('chequeo-diario', { when: Date.now() + 1000 })`.

## Git
- No commitear salvo que el usuario lo pida, y nunca en `main`. Usar la branch que indique el usuario (hoy, `extension-version`). No hacer push sin pedido.

## Pendiente
- Definir la distribución: Chrome Web Store, `.zip` o solo modo desarrollador.

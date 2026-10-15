# API de Carrefour Argentina (VTEX)

carrefour.com.ar corre sobre VTEX. Con la sesión iniciada en el navegador, estas APIs responden con las cookies del sitio; no hace falta token. Hay que llamarlas desde una página de carrefour.com.ar (mismo origen).

## Autenticación
- El login se hace en el navegador, a cargo de la persona. La extensión no maneja contraseñas ni tokens.
- La sesión queda en las cookies del sitio. La extensión ejecuta las llamadas con sesión dentro de la pestaña de Carrefour (`chrome.scripting.executeScript`), con `credentials: 'include'`. El catálogo público también se puede leer sin sesión (lo usa el chequeo diario).
- Estos endpoints no son públicos ni documentados: pueden cambiar sin aviso.

## Historial
- `GET /api/oms/user/orders?page=N&per_page=15` → `{ list, paging: { total, pages } }`. Cada pedido: `orderId`, `creationDate` (UTC), `totalValue`, `status`.
- `GET /api/oms/user/orders/{orderId}` → `items[]` con `id` (SKU), `productId`, `ean`, `name`, `quantity`, `listPrice`, `price`, `sellingPrice`.
- **Precios en centavos** (dividir por 100). `listPrice` a veces viene en 0: usar el mayor entre `listPrice` y `price` como precio regular.
- Frutas y verduras por kg/unidad siempre parecen "con descuento" por cómo cargan el precio: se excluyen del análisis.

## Precios y promos en vivo
- `GET /api/catalog_system/pub/products/search?fq=skuId:A&fq=skuId:B…&_from=0&_to=49` (hasta ~25 SKUs por llamada). Precios en pesos (sin centavos).
- `items[].sellers[0].commertialOffer`: `Price`, `ListPrice`, `AvailableQuantity`, `Teasers[]`, `DiscountHighLight[]`.
- Los nombres de promo están en `Name` o `<Name>k__BackingField`. Ej.: `PROMO-2do al 70% Max 48 unidades Combinable 7 UP-Reg-2-70-Aniv2 9 al 15.10`. La vigencia está al final.
- Descuento efectivo: rebaja directa = 1 − Price/ListPrice; "2do al X%" = X/2 por unidad llevando par; 2x1 = 50%; 3x2 = 33%.
- **Las promos no se suman**: si hay rebaja y "2do al X%", Carrefour aplica una sola. Usar la mejor.
- "Tarjeta Carrefour 15%" depende del medio de pago: se ignora.
- Con la sesión, precio y stock son los de la sucursal del usuario. Sin sesión (desde la nube) se ve otra región: las promos coinciden, pero precio y stock pueden no coincidir.
- Búsqueda por texto: `?ft=<texto>`.

## Carrito
- `GET /api/checkout/pub/orderForm` → carrito actual: `orderFormId`, `loggedIn`, `items`, `totalizers` (Items, Discounts, Shipping), `value`, `messages`.
- Agregar: `POST /api/checkout/pub/orderForm/{id}/items?sc=1` con `{"orderItems":[{"id":"<SKU>","quantity":N,"seller":"1"}]}`.
- Cambiar cantidades / sacar: `POST /api/checkout/pub/orderForm/{id}/items/update` con `{"orderItems":[{"index":i,"quantity":N}]}` (0 = sacar).
- Cada ítem trae `availability` (`available` / `cannotBeDelivered` / …). `cannotBeDelivered` viene con un mensaje "no pudo ser enviado para las coordenadas seleccionadas", pero en la práctica es **sin stock en la sucursal**: el sitio lo muestra como SIN STOCK. El catálogo (`AvailableQuantity`) puede decir que hay stock igual.
- Carrefour separa el carrito por tipo (ej. "Supermercado"). En el checkout pide elegir carrito y ofrece "Continuar con disponibles", que borra los sin stock. Eso lo hace el usuario.
- Hay un mínimo de compra para el carrito Supermercado.


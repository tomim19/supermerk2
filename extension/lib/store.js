// Lo que se guarda en chrome.storage.local, solo en el navegador de la persona.
//   config:   { introVista: bool, umbrales, excluidos: [{ skus, nombre }], fijos: [{ sku, cant, nombre }], respuestas: { sku: { hasta } }, avisos: bool }
//   pedidos:  { orderId: pedido }  (caché del historial; se puede borrar desde Configuración)
//   aviso:    { fecha, decision }  (última notificación enviada)
import { UMBRALES } from './analisis.js';

const CONFIG = { introVista: false, umbrales: UMBRALES, excluidos: [], fijos: [], respuestas: {}, avisos: true };

export async function leerConfig() {
  const { config = {} } = await chrome.storage.local.get('config');
  return { ...CONFIG, ...config, umbrales: { ...UMBRALES, ...config.umbrales } };
}

export async function guardarConfig(cambios) {
  const config = { ...(await leerConfig()), ...cambios };
  await chrome.storage.local.set({ config });
  return config;
}

export async function leerPedidos() {
  const { pedidos = {} } = await chrome.storage.local.get('pedidos');
  return pedidos;
}

export const guardarPedidos = lista =>
  chrome.storage.local.set({ pedidos: Object.fromEntries(lista.map(o => [o.orderId, o])) });

export const borrarPedidos = () => chrome.storage.local.remove(['pedidos', 'aviso']);

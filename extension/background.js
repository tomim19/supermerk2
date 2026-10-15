// Service worker: abre el panel desde el ícono y revisa una vez por día si toca pedir.
// El chequeo usa el historial guardado (se actualiza al abrir el panel) y el catálogo público:
// no necesita la sesión ni toca el carrito.
import { perfil, decidir, oferta, TEXTO_DECISION } from './lib/analisis.js';
import { BASE, productos, transportePublico } from './lib/vtex.js';
import { leerConfig, leerPedidos } from './lib/store.js';

const ALARMA = 'chequeo-diario';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  const prox = new Date(); prox.setHours(10, 0, 0, 0);
  if (prox < new Date()) prox.setDate(prox.getDate() + 1);
  chrome.alarms.create(ALARMA, { when: prox.getTime(), periodInMinutes: 24 * 60 });
});

chrome.alarms.onAlarm.addListener(a => { if (a.name === ALARMA) chequear().catch(e => console.warn('[compras] chequeo', e)); });

async function chequear() {
  const config = await leerConfig();
  if (!config.avisos) return;
  const P = perfil(Object.values(await leerPedidos()), config.umbrales);
  if (P.sinHistorial) return;
  const skus = [...new Set([...P.activos.flatMap(g => g.skus), ...config.fijos.map(x => String(x.sku))])];
  const R = decidir(P, await productos(transportePublico(), skus, oferta), config.umbrales, config);

  // avisar al entrar en ventana o si cambia la decisión; si no, como mucho una vez por semana
  const { aviso = {} } = await chrome.storage.local.get('aviso');
  const hoy = Date.now();
  if (R.decision === 'TODAVIA_NO' || R.decision === 'RETOMAR') { await chrome.storage.local.set({ aviso: { decision: R.decision, fecha: hoy } }); return; }
  if (aviso.decision === R.decision && hoy - aviso.fecha < 7 * 864e5) return;

  const n = R.necesarios.length + R.adelantar.length;
  chrome.notifications.create(ALARMA, {
    type: 'basic', iconUrl: 'icons/128.png', title: TEXTO_DECISION[R.decision],
    message: `${n} productos sugeridos · ahorro estimado ${R.ahorroEstaSemana}% (tu promedio: ${R.ahorroHistorico}%). Abrí el panel para ver la lista.`,
  });
  await chrome.storage.local.set({ aviso: { decision: R.decision, fecha: hoy } });
}

chrome.notifications.onClicked.addListener(async () => {
  const [tab] = await chrome.tabs.query({ url: BASE + '/*' });
  const t = tab ? await chrome.tabs.update(tab.id, { active: true }) : await chrome.tabs.create({ url: BASE + '/' });
  await chrome.windows.update(t.windowId, { focused: true });
  chrome.sidePanel.open({ windowId: t.windowId }).catch(() => {}); // si Chrome no lo permite, queda el ícono
});

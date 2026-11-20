/** Integração nativa opcional: nada é carregado na versão web/PWA. */

export function isAndroidPlatform(capacitor = globalThis.Capacitor) {
  return Boolean(
    capacitor?.isNativePlatform?.() && capacitor?.getPlatform?.() === 'android',
  );
}

/**
 * Voltar: cancela o modal de reset, volta para a aba inicial ou encerra o app.
 * A lógica é pura para permitir teste sem dispositivo.
 */
export function createBackHandler({ ui, app, doc = globalThis.document }) {
  return function handleBack() {
    const modal = doc?.querySelector?.('#modal-reset');
    if (modal && !modal.hidden) {
      doc.querySelector('#modal-reset-cancelar')?.click();
      return 'modal';
    }
    const active = doc?.querySelector?.('.aba.ativa')?.dataset?.area;
    if (active && active !== 'sorteio') {
      ui.showTab('sorteio');
      return 'aba';
    }
    // Nunca deixe música/efeitos tocando quando o APK for encerrado.
    ui.audio?.stopAll?.();
    const exiting = app?.exitApp?.();
    exiting?.catch?.(() => {});
    return 'saida';
  };
}

/** Suspende apresentação e áudio; não altera regras nem física. */
export function createAppStateHandler(ui) {
  let pausedByBridge = false;
  return function handleAppState({ isActive }) {
    if (!isActive) {
      ui.audio?.pause?.('android');
      pausedByBridge = Boolean(ui.show.pause());
      return;
    }
    ui.audio?.resume?.('android');
    if (pausedByBridge) {
      ui.show.resume();
      pausedByBridge = false;
    }
  };
}

export async function installAndroidBridge(ui) {
  if (!isAndroidPlatform()) return false;

  const [{ App }, core] = await Promise.all([import('@capacitor/app'), import('@capacitor/core')]);
  const { SystemBars, SystemBarsStyle } = core;

  const backHandle = await App.addListener('backButton', createBackHandler({ ui, app: App }));
  const stateHandle = await App.addListener('appStateChange', createAppStateHandler(ui));

  try {
    await SystemBars.setStyle({ style: SystemBarsStyle.Dark });
  } catch (error) {
    console.warn('Estilo das barras Android indisponível:', error);
  }

  globalThis.__lotofacilAndroidBridge = {
    dispose() {
      backHandle.remove?.();
      stateHandle.remove?.();
      delete globalThis.__lotofacilAndroidBridge;
    },
  };
  return true;
}

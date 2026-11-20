import { SETTINGS_KEYS } from '../persistence/schema.js';
import { readPreferences } from '../settings/preferences.js';

/**
 * Controles de áudio e modo de teste. Todas as alterações passam pelo serviço
 * de histórico, que grava somente na store `settings` — preservada no reset.
 */
export function createPreferencesPanel({ root = document, history, audio = null, onPreferences = () => {} } = {}) {
  const find = (selector) => root.querySelector(selector);
  if (!history || typeof history.setPreference !== 'function') {
    return { refresh() {}, dispose() {}, get values() { return readPreferences(); } };
  }

  const controls = {
    music: find('#config-musica'),
    effects: find('#config-efeitos'),
    musicVolume: find('#config-volume-musica'),
    musicVolumeValue: find('#config-volume-musica-valor'),
    effectsVolume: find('#config-volume-efeitos'),
    effectsVolumeValue: find('#config-volume-efeitos-valor'),
    testMode: find('#config-modo-teste'),
    testProbability: find('#config-probabilidade-teste'),
    testProbabilityValue: find('#config-probabilidade-teste-valor'),
    badge: find('#selo-modo-teste'),
  };

  let preferences = readPreferences();
  let disposed = false;
  const listeners = [];

  function listen(element, event, handler) {
    if (!element) return;
    element.addEventListener(event, handler);
    listeners.push([element, event, handler]);
  }

  function refresh(settings = null) {
    if (settings) preferences = readPreferences(settings);
    if (controls.music) controls.music.checked = preferences[SETTINGS_KEYS.MUSIC_ENABLED];
    if (controls.effects) controls.effects.checked = preferences[SETTINGS_KEYS.SFX_ENABLED];
    if (controls.musicVolume) {
      controls.musicVolume.value = String(preferences[SETTINGS_KEYS.MUSIC_VOLUME]);
    }
    if (controls.musicVolumeValue) {
      controls.musicVolumeValue.textContent = `${preferences[SETTINGS_KEYS.MUSIC_VOLUME]}%`;
    }
    if (controls.effectsVolume) {
      controls.effectsVolume.value = String(preferences[SETTINGS_KEYS.SFX_VOLUME]);
    }
    if (controls.effectsVolumeValue) {
      controls.effectsVolumeValue.textContent = `${preferences[SETTINGS_KEYS.SFX_VOLUME]}%`;
    }
    if (controls.testMode) controls.testMode.checked = preferences[SETTINGS_KEYS.TEST_MODE_ENABLED];
    if (controls.testProbability) {
      controls.testProbability.value = String(preferences[SETTINGS_KEYS.TEST_PROBABILITY]);
    }
    if (controls.testProbabilityValue) {
      controls.testProbabilityValue.textContent = `${preferences[SETTINGS_KEYS.TEST_PROBABILITY]}%`;
    }
    if (controls.badge) controls.badge.hidden = !preferences[SETTINGS_KEYS.TEST_MODE_ENABLED];
    audio?.configure?.(preferences);
    return { ...preferences };
  }

  async function save(key, value) {
    if (disposed) return;
    audio?.unlock?.();
    try {
      const summary = await history.setPreference(key, value);
      preferences = readPreferences(summary.settings);
      refresh();
      onPreferences(preferences);
    } catch (error) {
      onPreferences(preferences, error);
    }
  }

  listen(controls.music, 'change', (event) => {
    save(SETTINGS_KEYS.MUSIC_ENABLED, event.target.checked);
  });
  listen(controls.effects, 'change', (event) => {
    save(SETTINGS_KEYS.SFX_ENABLED, event.target.checked);
  });
  listen(controls.musicVolume, 'input', (event) => {
    if (controls.musicVolumeValue) controls.musicVolumeValue.textContent = `${event.target.value}%`;
  });
  listen(controls.musicVolume, 'change', (event) => {
    save(SETTINGS_KEYS.MUSIC_VOLUME, Number(event.target.value));
  });
  listen(controls.effectsVolume, 'input', (event) => {
    if (controls.effectsVolumeValue) controls.effectsVolumeValue.textContent = `${event.target.value}%`;
  });
  listen(controls.effectsVolume, 'change', (event) => {
    save(SETTINGS_KEYS.SFX_VOLUME, Number(event.target.value));
  });
  listen(controls.testMode, 'change', (event) => {
    save(SETTINGS_KEYS.TEST_MODE_ENABLED, event.target.checked);
  });
  listen(controls.testProbability, 'input', (event) => {
    if (controls.testProbabilityValue) controls.testProbabilityValue.textContent = `${event.target.value}%`;
  });
  listen(controls.testProbability, 'change', (event) => {
    save(SETTINGS_KEYS.TEST_PROBABILITY, Number(event.target.value));
  });

  return {
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [element, event, handler] of listeners) element.removeEventListener(event, handler);
      listeners.length = 0;
    },
    get values() {
      return { ...preferences };
    },
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';


test('браузерная история отдаётся для миграции и больше не сохраняется как источник истины', async () => {
  const dom = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'), {url: 'http://localhost/prism/'});
  for (const key of ['window', 'document', 'Event', 'CustomEvent', 'Option', 'localStorage']) {
    globalThis[key] = key === 'window' ? dom.window : dom.window[key];
  }
  try {
    const legacyHistory = [{promptId: 'legacy', url: '/view?filename=legacy.png', settings: {positive: 'portrait'}}];
    localStorage.setItem('matrix_dashboard_v3', JSON.stringify({positive: 'draft', negative: '', history: legacyHistory}));
    const gallery = await import('../gallery.js');
    const {loadSavedSettings, saveSettings} = await import('../storage.js');
    gallery.updateHistory([]);

    const migration = loadSavedSettings();

    assert.deepEqual(migration, legacyHistory);
    assert.equal(gallery.history.length, 0, 'localStorage не восстанавливает параллельную историю');
    saveSettings();
    const saved = JSON.parse(localStorage.getItem('matrix_dashboard_v3'));
    assert.equal(saved.version, 4);
    assert.equal(Object.hasOwn(saved, 'history'), false);
  } finally {
    dom.window.close();
  }
});

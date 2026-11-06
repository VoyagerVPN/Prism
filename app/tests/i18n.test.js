import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalization, createServerLanguageStore} from '../i18n.js';

test('язык установки применяется при первом запуске и выбор сохраняется', async () => {
  const data = new Map();
  const storage = {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value)};
  const first = await createLocalization({storage, installationLanguage: 'ru', systemLanguage: 'en-US'});
  assert.equal(first.language, 'ru');
  assert.equal(first.t('common.cancel'), 'Отмена');
  await first.changeLanguage('en');
  const reopened = await createLocalization({storage, installationLanguage: 'ru', systemLanguage: 'ru-RU'});
  assert.equal(reopened.language, 'en');
  assert.equal(reopened.t('common.cancel'), 'Cancel');
});

test('системный язык выбирается для новой установки, остальные языки получают английский', async () => {
  const storage = {getItem: () => null, setItem: () => {}};
  assert.equal((await createLocalization({storage, systemLanguage: 'ru-RU'})).language, 'ru');
  assert.equal((await createLocalization({storage, systemLanguage: 'en-GB'})).language, 'en');
  assert.equal((await createLocalization({storage, systemLanguage: 'de-DE'})).language, 'en');
});

test('количество отображается по правилам выбранного языка', async () => {
  const storage = {getItem: () => null, setItem: () => {}};
  const l10n = await createLocalization({storage, systemLanguage: 'ru'});
  assert.equal(l10n.t('gallery.imageCount', {count: 1}), '1 изображение');
  assert.equal(l10n.t('gallery.imageCount', {count: 2}), '2 изображения');
  assert.equal(l10n.t('gallery.imageCount', {count: 5}), '5 изображений');
  await l10n.changeLanguage('en');
  assert.equal(l10n.t('gallery.imageCount', {count: 1}), '1 image');
  assert.equal(l10n.t('gallery.imageCount', {count: 2}), '2 images');
});

test('ошибка сохранения языка не меняет язык текущего интерфейса', async () => {
  const storage = {getItem: () => null, setItem: () => {throw new Error('storage unavailable');}};
  const l10n = await createLocalization({storage, systemLanguage: 'ru'});
  await assert.rejects(l10n.changeLanguage('en'), /storage unavailable/);
  assert.equal(l10n.language, 'ru');
});

test('выбор языка в интерфейсе сохраняется в общей настройке установки', async () => {
  let installedLanguage = 'ru';
  const fetchImpl = async (_url, options = {}) => {
    if (options.method === 'POST') installedLanguage = JSON.parse(options.body).language;
    return {ok: true, json: async () => ({language: installedLanguage})};
  };
  const storage = createServerLanguageStore(fetchImpl);
  const first = await createLocalization({storage, systemLanguage: 'en'});
  assert.equal(first.language, 'ru');
  await first.changeLanguage('en');
  assert.equal(installedLanguage, 'en');
  const reopened = await createLocalization({storage, systemLanguage: 'ru'});
  assert.equal(reopened.language, 'en');
});

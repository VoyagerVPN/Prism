// Запустить в консоли панели с выбранным изображением из истории.
(async () => {
  const box = document.querySelector('#lightbox');
  const img = document.querySelector('#lightbox-img');
  document.querySelector('#fullscreen-btn').click();
  await img.decode();
  await Promise.all(img.getAnimations().map(animation => animation.finished));
  const click = (x, y) => document.elementFromPoint(x, y).dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
  click(innerWidth / 2, innerHeight / 2);
  if (box.style.display === 'none') throw new Error('Клик по картинке закрыл lightbox');
  document.querySelector('#lightbox-caption').click();
  if (box.style.display === 'none') throw new Error('Клик по подписи закрыл lightbox');
  const portrait = img.naturalWidth / img.naturalHeight < innerWidth / innerHeight;
  click(portrait ? 1 : innerWidth / 2, portrait ? innerHeight / 3 : 1);
  if (box.style.display !== 'none') throw new Error('Клик по полю не закрыл lightbox');
  return 'Картинка и подпись сохраняют lightbox; пустое поле закрывает';
})();

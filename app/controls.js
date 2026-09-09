const controls = new Map();
let observer;

function positionMenu(control) {
  const viewport = window.visualViewport;
  const width = viewport?.width ?? innerWidth;
  const height = viewport?.height ?? innerHeight;
  const top = viewport?.offsetTop ?? 0;
  const left = viewport?.offsetLeft ?? 0;
  const rect = control.control.getBoundingClientRect();
  const below = top + height - rect.bottom - 12;
  const above = rect.top - top - 12;
  const upwards = below < 220 && above > below;
  const menuWidth = Math.min(width - 24, rect.width);
  const menuHeight = Math.max(80, Math.min(320, (upwards ? above : below) - 58));
  control.dropdown_content.style.maxHeight = `${menuHeight}px`;
  Object.assign(control.dropdown.style, {
    position: 'fixed', width: `${menuWidth}px`,
    left: `${Math.max(left + 12, Math.min(rect.left, left + width - menuWidth - 12))}px`,
    top: upwards ? 'auto' : `${rect.bottom + 2}px`,
    bottom: upwards ? `${innerHeight - rect.top + 2}px` : 'auto',
  });
}

export function syncSelectControls() {
  if (!observer) return;
  observer.disconnect();
  try {
    for (const [select, entry] of controls) {
      if (!select.isConnected) { entry.control.destroy(); controls.delete(select); }
    }
    for (const select of document.querySelectorAll('select')) {
      let entry = controls.get(select);
      if (!entry) {
        const label = select.labels?.[0]?.textContent.trim() || select.getAttribute('aria-label') || select.title || 'Выбор значения';
        const control = new TomSelect(select, {
          plugins: ['dropdown_input'], create: false, allowEmptyOption: false, placeholder:'Выбрать…',
          maxOptions: null, searchField: ['text', 'value'], refreshThrottle: 0,
          dropdownParent: select.closest('dialog') || document.body,
          onDelete: () => false,
          render: {
            option: (data, escape) => `<div><span>${escape(data.text)}</span>${data.value.includes('/') || data.value.includes('\\') ? `<small>${escape(data.value)}</small>` : ''}</div>`,
            no_results: () => '<div class="no-results">Ничего не найдено</div>',
          },
        });
        control.focus_node.setAttribute('aria-label', label);
        control.control_input.setAttribute('aria-label', `Поиск: ${label}`);
        control.control_input.placeholder = 'Найти…';
        control.positionDropdown = () => positionMenu(control);
        entry = {control, signature:''};
        controls.set(select, entry);
      }
      const {control} = entry;
      const signature = JSON.stringify([...select.options].map(option => [option.value, option.text, option.disabled]));
      if (entry.signature !== signature) {
        control.clearOptions(() => false);
        control.sync();
        entry.signature = signature;
      } else if (String(control.getValue()) !== select.value) {
        control.setValue(select.value, true);
      }
      const disabled = select.matches(':disabled');
      const ownDisabled = select.disabled;
      if (disabled !== control.isDisabled) {
        if (disabled) control.disable(); else control.enable();
        // Блокировка fieldset не должна навсегда менять disabled самого select.
        select.disabled = ownDisabled;
      }
    }
  } finally {
    observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['disabled']});
  }
}

export function setupSelectControls() {
  observer = new MutationObserver(records => {
    if (records.some(record => record.target instanceof Element && (
      record.target.matches('select,option,optgroup,fieldset') ||
      [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches('select') || node.querySelector('select')))
    ))) syncSelectControls();
  });
  syncSelectControls();
  document.addEventListener('change', event => { if (event.target instanceof HTMLSelectElement) syncSelectControls(); });
  const reposition = () => { for (const {control} of controls.values()) if (control.isOpen) positionMenu(control); };
  window.addEventListener('resize', reposition);
  document.addEventListener('scroll', reposition, true);
  window.visualViewport?.addEventListener('resize', reposition);
}

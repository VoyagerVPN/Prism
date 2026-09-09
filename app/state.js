import {
  seedRandomBtn, seedLockBtn, seedInput,
  hiresToggle, faceToggle, upscaleToggle, advancedToggle,
  reactorToggle, reactorPreview, reactorClearBtn, reactorFileInput
} from './elements.js';

export let activeWidth = 1024;
export let activeHeight = 1024;
export let reactorFile = null;
export let reactorImageName = null;
export let seedMode = "random";
let lastGeneratedSeed = null;

export function setLastGeneratedSeed(seed) {
  lastGeneratedSeed = Number.isSafeInteger(seed) && seed >= 0 ? seed : null;
}

export function setActiveWidth(w) { activeWidth = w; }
export function setActiveHeight(h) { activeHeight = h; }
export function setSeedModeState(m) { seedMode = m; }

export function setSeedMode(mode) {
  seedMode = mode;
  if (mode === "random") {
    seedRandomBtn.classList.add("active");
    seedLockBtn.classList.remove("active");
    seedInput.value = "random";
  } else {
    seedRandomBtn.classList.remove("active");
    seedLockBtn.classList.add("active");
    if (seedInput.value === "random") {
      seedInput.value = lastGeneratedSeed ?? Math.floor(Math.random() * 9000000000) + 1000000000;
    }
  }
  window.dispatchEvent(new CustomEvent("save-settings"));
}

export function offsetSeed(offset) {
  let val = parseInt(seedInput.value.trim());
  if (isNaN(val)) {
    val = Math.floor(Math.random() * 9000000000) + 1000000000;
  }
  seedInput.value = val + offset;
  setSeedMode("lock");
  window.dispatchEvent(new CustomEvent("save-settings"));
}

export function updateAllExpansions() {
  const sync = (toggle, elementSelector) => {
    const el = document.querySelector(elementSelector);
    if (!el) return;
    if (toggle.checked) {
      el.classList.add("expanded");
    } else {
      el.classList.remove("expanded");
    }
  };
  sync(hiresToggle, "#hires-card");
  sync(faceToggle, "#face-card");
  sync(upscaleToggle, "#upscale-card");
  sync(advancedToggle, "#advanced-card");
  sync(reactorToggle, "#reactor-card");
}

export function handleReactorFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  reactorFile = file;
  reactorImageName = null;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    reactorPreview.src = e.target.result;
    reactorPreview.style.display = "block";
    reactorClearBtn.style.display = "block";
  };
  reader.readAsDataURL(file);
}

export function clearReactorFile() {
  reactorFile = null;
  reactorImageName = null;
  reactorFileInput.value = "";
  reactorPreview.src = "";
  reactorPreview.style.display = "none";
  reactorClearBtn.style.display = "none";
  window.dispatchEvent(new CustomEvent("save-settings"));
}

export function setReactorImageName(name) {
  reactorImageName = name;
}

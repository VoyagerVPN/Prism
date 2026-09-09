import { 
  tabT2I, tabI2I, t2iElements, i2iElements,
  i2iPreview, i2iClearBtn, i2iFileInput,
  seedRandomBtn, seedLockBtn, seedInput,
  hiresToggle, faceToggle, upscaleToggle, advancedToggle,
  reactorToggle, reactorPreview, reactorClearBtn, reactorFileInput
} from './elements.js';

export let currentMode = "t2i";
export let activeWidth = 1024;
export let activeHeight = 1024;
export let i2iFile = null;
export let i2iImageName = null;
export let i2iWidth = null;
export let i2iHeight = null;
export let reactorFile = null;
export let reactorImageName = null;
export let seedMode = "random";
let lastGeneratedSeed = null;

export function setLastGeneratedSeed(seed) {
  lastGeneratedSeed = Number.isSafeInteger(seed) && seed >= 0 ? seed : null;
}

export function setCurrentMode(mode) { currentMode = mode; }
export function setActiveWidth(w) { activeWidth = w; }
export function setActiveHeight(h) { activeHeight = h; }
export function setI2IFile(f) { i2iFile = f; }
export function setSeedModeState(m) { seedMode = m; }

export function switchMode(mode) {
  currentMode = mode;
  if (mode === "t2i") {
    tabT2I.classList.add("active");
    tabI2I.classList.remove("active");
    t2iElements.forEach(el => el.style.display = "flex");
    i2iElements.forEach(el => el.style.display = "none");
  } else {
    tabT2I.classList.remove("active");
    tabI2I.classList.add("active");
    t2iElements.forEach(el => el.style.display = "none");
    i2iElements.forEach(el => el.style.display = "flex");
  }
  
  window.dispatchEvent(new CustomEvent("save-settings"));
}

export function handleI2IFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  i2iFile = file;
  i2iImageName = null;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    i2iPreview.src = e.target.result;
    i2iPreview.style.display = "block";
    i2iClearBtn.style.display = "block";
  };
  reader.readAsDataURL(file);
}

export function clearI2IFile() {
  i2iFile = null;
  i2iImageName = null;
  i2iWidth = null;
  i2iHeight = null;
  i2iFileInput.value = "";
  i2iPreview.src = "";
  i2iPreview.style.display = "none";
  i2iClearBtn.style.display = "none";
  window.dispatchEvent(new CustomEvent('save-settings'));
}

export function setI2IImage(name, width, height) {
  i2iImageName = name;
  i2iWidth = width;
  i2iHeight = height;
}

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

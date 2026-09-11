import { 
  statusDot, statusText, progressContainer,
  progressLabel, progressSub, progressBarFill 
} from './elements.js';

export function updateStatus(state, text) {
  statusDot.className = "status-dot " + state;
  statusText.textContent = text;
  
  if (state === "connected" || state === "idle") {
    progressContainer.style.display = "none";
    progressLabel.textContent = "Готов к генерации";
    progressSub.textContent = "Настройте параметры и нажмите Запуск";
  }
}

export function showProgress(label, sub, percent = 0) {
  progressContainer.style.display = "block";
  progressLabel.textContent = label;
  progressSub.textContent = sub;
  const pct = Number(percent);
  progressBarFill.style.width = `${Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0}%`;
}

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

export function showProgress(label, sub) {
  progressContainer.style.display = "block";
  progressLabel.textContent = label;
  progressSub.textContent = sub;
  progressBarFill.style.width = "0%";
}

export function updateProgressBar(pct, subText) {
  progressContainer.style.display = "block";
  progressBarFill.style.width = `${pct}%`;
  progressSub.textContent = `${pct}% (${subText})`;
}

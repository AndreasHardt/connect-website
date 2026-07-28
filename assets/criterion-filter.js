const state = { measurementOnly: false };

function classifyCards() {
  document.querySelectorAll('[data-criterion]').forEach(card => {
    const hasNumericInput = Boolean(card.querySelector('[data-input-id][type="number"]'));
    const calculatedFromGeometry = Boolean(card.querySelector('.calculated-note'));
    const measurementRelevant = hasNumericInput || calculatedFromGeometry;
    card.dataset.measurementRelevant = measurementRelevant ? 'true' : 'false';
  });
}

function applyFilter() {
  classifyCards();
  document.querySelectorAll('[data-criterion]').forEach(card => {
    card.classList.toggle('hidden', state.measurementOnly && card.dataset.measurementRelevant !== 'true');
  });
  document.querySelectorAll('.criterion-group').forEach(group => {
    const visibleCards = [...group.querySelectorAll('[data-criterion]')].some(card => !card.classList.contains('hidden'));
    group.classList.toggle('hidden', !visibleCards);
  });
  const button = document.querySelector('#toggle-measurement-only');
  if (button) {
    button.setAttribute('aria-pressed', String(state.measurementOnly));
    button.textContent = state.measurementOnly ? 'Alle Kriterien anzeigen' : 'Nur messwertabhängige Kriterien anzeigen';
  }
}

function ensureButton() {
  const actions = document.querySelector('.criteria-toolbar .toolbar-actions');
  if (!actions || document.querySelector('#toggle-measurement-only')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.id = 'toggle-measurement-only';
  button.setAttribute('aria-pressed', 'false');
  button.textContent = 'Nur messwertabhängige Kriterien anzeigen';
  button.addEventListener('click', () => {
    state.measurementOnly = !state.measurementOnly;
    applyFilter();
  });
  actions.prepend(button);
}

function refresh() {
  ensureButton();
  applyFilter();
}

const criteriaList = document.querySelector('#criteria-list');
if (criteriaList) new MutationObserver(refresh).observe(criteriaList, { childList: true, subtree: true });
document.addEventListener('DOMContentLoaded', refresh);
refresh();

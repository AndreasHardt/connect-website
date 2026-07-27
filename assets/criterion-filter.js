const state = { hideBooleanOnly: false };

function classifyCards() {
  document.querySelectorAll('[data-criterion]').forEach(card => {
    const inputs = [...card.querySelectorAll('[data-input-id]')];
    const booleanOnly = inputs.length > 0 && inputs.every(input => input.type === 'checkbox');
    card.dataset.booleanOnly = booleanOnly ? 'true' : 'false';
  });
}

function applyFilter() {
  classifyCards();
  document.querySelectorAll('[data-criterion]').forEach(card => {
    card.classList.toggle('hidden', state.hideBooleanOnly && card.dataset.booleanOnly === 'true');
  });
  document.querySelectorAll('.criterion-group').forEach(group => {
    const visibleCards = [...group.querySelectorAll('[data-criterion]')].some(card => !card.classList.contains('hidden'));
    group.classList.toggle('hidden', !visibleCards);
  });
  const button = document.querySelector('#toggle-boolean-only');
  if (button) {
    button.setAttribute('aria-pressed', String(state.hideBooleanOnly));
    button.textContent = state.hideBooleanOnly ? 'Ja/Nein-Kriterien einblenden' : 'Ja/Nein-Kriterien ausblenden';
  }
}

function ensureButton() {
  const actions = document.querySelector('.criteria-toolbar .toolbar-actions');
  if (!actions || document.querySelector('#toggle-boolean-only')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.id = 'toggle-boolean-only';
  button.setAttribute('aria-pressed', 'false');
  button.textContent = 'Ja/Nein-Kriterien ausblenden';
  button.addEventListener('click', () => {
    state.hideBooleanOnly = !state.hideBooleanOnly;
    applyFilter();
  });
  actions.prepend(button);
}

function refresh() {
  ensureButton();
  applyFilter();
}

const criteriaList = document.querySelector('#criteria-list');
if (criteriaList) {
  new MutationObserver(refresh).observe(criteriaList, { childList: true, subtree: true });
}
document.addEventListener('DOMContentLoaded', refresh);
refresh();

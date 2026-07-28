const state = { measurementOnly: false };

function requiredQuality() {
  return document.querySelector('input[name="required_quality"]:checked')?.value || 'B';
}

function effectiveQuality(card) {
  return card.querySelector('[data-quality-override]')?.value || requiredQuality();
}

function classifyCards() {
  document.querySelectorAll('[data-criterion]').forEach(card => {
    const hasNumericInput = Boolean(card.querySelector('[data-input-id][type="number"]'));
    const calculatedFromGeometry = Boolean(card.querySelector('.calculated-note'));
    const measurementRelevant = hasNumericInput || calculatedFromGeometry;
    card.dataset.measurementRelevant = measurementRelevant ? 'true' : 'false';
  });
}

function patchOverlapCriterion() {
  const card = document.querySelector('[data-criterion="IMP-000013"]');
  if (!card) return;
  const quality = effectiveQuality(card);
  const presenceOnly = quality !== 'D';
  const info = card.querySelector('.criterion-header p');
  const role = card.querySelector('.role-tag');
  if (info) {
    info.textContent = presenceOnly
      ? `Schweißgutüberlauf ist bei Bewertungsgruppe ${quality} nicht zulässig; das Vorhandensein allein entscheidet.`
      : 'Bei D sind Höhe und Breite zu messen; bei C und B ist Überlauf unzulässig.';
  }
  if (role) role.textContent = presenceOnly ? 'Verbotsregel' : 'Vorhandensein und Maße';

  ['overlap_height_h', 'overlap_width_b'].forEach(fieldId => {
    const input = card.querySelector(`[data-input-id="${fieldId}"]`);
    const wrapper = input?.closest('[data-field-wrapper]');
    if (!wrapper) return;
    wrapper.style.display = presenceOnly ? 'none' : '';
    input.disabled = presenceOnly;
  });
}

function patchSollIstLabels() {
  const legend = [...document.querySelectorAll('legend')].find(node => node.textContent.trim() === 'Geforderte Bewertungsgruppe');
  if (legend) legend.textContent = 'SOLL-Bewertungsgruppe';
  document.querySelectorAll('.field-help').forEach(node => {
    if (node.textContent.includes('Die erreichte Gruppe wird')) {
      node.textContent = node.textContent.replace('Die erreichte Gruppe wird', 'Die IST-Gruppe wird');
    }
  });
  document.querySelectorAll('.quality-override').forEach(label => {
    label.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('Sollgruppe dieses Kriteriums')) {
        node.textContent = node.textContent.replace('Sollgruppe dieses Kriteriums', 'SOLL-Gruppe dieses Kriteriums');
      }
    });
  });

  const summary = document.querySelector('#result-summary p');
  if (summary) {
    summary.innerHTML = summary.innerHTML
      .replace(' · gefordert <strong>', ' · SOLL: <strong>')
      .replace(' · erreicht <strong>', ' · IST: <strong>');
  }

  document.querySelectorAll('.result-card').forEach(card => {
    const badges = [...card.querySelectorAll('.result-meta .badge')];
    if (badges.some(badge => badge.textContent.trim().startsWith('SOLL:'))) return;
    const statusBadge = badges[0];
    const sollBadge = badges.find(badge => /^Soll\s+[BCD]$/.test(badge.textContent.trim()));
    const oldIstBadge = badges.find(badge => badge.textContent.trim().startsWith('Erreicht '));
    if (!statusBadge || !sollBadge || !oldIstBadge) return;
    const quality = sollBadge.textContent.trim().replace(/^Soll\s+/, '');
    const status = statusBadge.textContent.trim();
    const ist = oldIstBadge.textContent.trim().replace(/^Erreicht\s+/, '');
    statusBadge.textContent = `SOLL: ${quality} ${status}`;
    sollBadge.textContent = `IST: ${ist === '-' ? '—' : ist}`;
    sollBadge.className = oldIstBadge.className;
    oldIstBadge.remove();
  });

  document.querySelectorAll('.comparison-row').forEach(row => {
    row.innerHTML = row.innerHTML.replace(', erreicht ', ', IST: ');
  });
}

function oneDecimal(value) {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed)
    ? parsed.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : value;
}

function roundTextNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    node.textContent = node.textContent.replace(/(-?\d+[,.]\d{2,})(?=\s*(?:mm|°))/g, match => oneDecimal(match));
    return;
  }
  node.childNodes.forEach(roundTextNode);
}

function patchDecimalDisplay() {
  ['#geo-b', '#geo-aA'].forEach(selector => {
    const input = document.querySelector(selector);
    if (!input || input.value === '') return;
    const value = Number(input.value);
    if (Number.isFinite(value)) input.value = value.toFixed(1);
  });
  ['#geometry-formula', '#results-list'].forEach(selector => {
    const root = document.querySelector(selector);
    if (root) roundTextNode(root);
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

let refreshPending = false;
function refresh() {
  if (refreshPending) return;
  refreshPending = true;
  requestAnimationFrame(() => {
    refreshPending = false;
    ensureButton();
    patchOverlapCriterion();
    patchSollIstLabels();
    patchDecimalDisplay();
    applyFilter();
  });
}

const criteriaList = document.querySelector('#criteria-list');
if (criteriaList) new MutationObserver(refresh).observe(criteriaList, { childList: true, subtree: true });
const resultsList = document.querySelector('#results-list');
if (resultsList) new MutationObserver(refresh).observe(resultsList, { childList: true, subtree: true });
const geometryFormula = document.querySelector('#geometry-formula');
if (geometryFormula) new MutationObserver(refresh).observe(geometryFormula, { childList: true, subtree: true, characterData: true });
document.addEventListener('change', event => {
  if (event.target.matches('input[name="required_quality"], [data-quality-override], [data-input-id]')) refresh();
});
document.addEventListener('input', event => {
  if (event.target.matches('#geometry-fields input')) refresh();
});
document.addEventListener('DOMContentLoaded', refresh);
refresh();

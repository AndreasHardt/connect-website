import { createEvaluationService } from './evaluation.js';
import { openReport } from './report.js';

const state = {
  config: null,
  currentStep: 1,
  lastPayload: null,
  lastResult: null,
  service: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const statusLabels = {
  pass: 'erfüllt', fail: 'nicht erfüllt', incomplete: 'unvollständig',
  manual_review: 'Fachentscheidung', not_applicable: 'nicht anwendbar',
  not_assessable: 'nicht bewertbar'
};
const inspectionLabels = {
  complete: 'vollständig', one_sided: 'einseitig', not_assessable: 'nicht bewertbar'
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function jointType() { return $('input[name="joint_type"]:checked').value; }
function requiredQuality() { return $('input[name="required_quality"]:checked').value; }

function jointSvg(type, compact = false) {
  if (type === 'butt') {
    return `<svg viewBox="0 0 300 180" role="img" aria-label="Schematische Stumpfnaht">
      <rect x="15" y="112" width="115" height="28" rx="3" fill="#173d5f"/>
      <rect x="170" y="112" width="115" height="28" rx="3" fill="#173d5f"/>
      <path d="M125 112 L145 70 L155 70 L175 112" fill="#66a4c7" stroke="#246b99" stroke-width="3"/>
      <path d="M145 70 Q150 56 155 70" fill="none" stroke="#246b99" stroke-width="4"/>
      <line x1="150" y1="54" x2="150" y2="16" stroke="#b33a3a" stroke-width="2"/>
      <path d="M144 22l6-8 6 8" fill="none" stroke="#b33a3a" stroke-width="2"/>
      <text x="160" y="28" fill="#b33a3a" font-size="14" font-weight="700">h</text>
      <line x1="128" y1="50" x2="172" y2="50" stroke="#173d5f" stroke-width="2"/>
      <path d="M134 45l-7 5 7 5M166 45l7 5-7 5" fill="none" stroke="#173d5f" stroke-width="2"/>
      <text x="145" y="45" fill="#173d5f" font-size="14" font-weight="700">b</text>
      <text x="42" y="130" fill="#fff" font-size="14" font-weight="700">t</text>
      <text x="220" y="130" fill="#fff" font-size="14" font-weight="700">t</text>
    </svg>`;
  }
  return `<svg viewBox="0 0 300 180" role="img" aria-label="Schematische Kehlnaht">
    <rect x="40" y="126" width="220" height="25" rx="3" fill="#173d5f"/>
    <rect x="40" y="28" width="25" height="123" rx="3" fill="#173d5f"/>
    <path d="M65 126 L65 70 Q72 82 128 126 Z" fill="#66a4c7" stroke="#246b99" stroke-width="3"/>
    <line x1="74" y1="117" x2="115" y2="117" stroke="#b33a3a" stroke-width="2"/>
    <path d="M80 112l-7 5 7 5M109 112l7 5-7 5" fill="none" stroke="#b33a3a" stroke-width="2"/>
    <text x="91" y="110" fill="#b33a3a" font-size="14" font-weight="700">z1</text>
    <line x1="74" y1="117" x2="74" y2="80" stroke="#a86b00" stroke-width="2"/>
    <path d="M69 86l5-7 5 7M69 111l5 7 5-7" fill="none" stroke="#a86b00" stroke-width="2"/>
    <text x="80" y="96" fill="#a86b00" font-size="14" font-weight="700">z2</text>
    <line x1="67" y1="122" x2="97" y2="92" stroke="#1f7a4d" stroke-width="2" stroke-dasharray="5 4"/>
    <text x="98" y="88" fill="#1f7a4d" font-size="14" font-weight="700">aA</text>
  </svg>`;
}

function geometrySvg(type) {
  return jointSvg(type);
}

function showAlert(messages) {
  const alert = $('#alert');
  if (!messages || !messages.length) {
    alert.classList.add('hidden'); alert.innerHTML = ''; return;
  }
  alert.innerHTML = `<strong>Bitte prüfen:</strong><ul>${messages.map(message => `<li>${escapeHtml(message)}</li>`).join('')}</ul>`;
  alert.classList.remove('hidden');
  alert.scrollIntoView({behavior:'smooth', block:'center'});
}

function updateJointVisuals() {
  const type = jointType();
  $('#joint-illustration').innerHTML = jointSvg(type);
  $('#geometry-schematic').innerHTML = geometrySvg(type);
  renderGeometryFields();
  renderCriteria();
}

function geometryValue(id) {
  const element = $(`#geo-${id}`);
  return element ? element.value : '';
}

function updateThroat() {
  if (jointType() !== 'fillet') return;
  const auto = $('#auto_throat')?.checked;
  const aA = $('#geo-aA');
  if (!auto || !aA) return;
  const z1 = parseFloat(geometryValue('z1'));
  const z2 = parseFloat(geometryValue('z2'));
  const angle = parseFloat(geometryValue('angle')) || 90;
  if (Number.isFinite(z1) && Number.isFinite(z2)) {
    const calculated = Math.min(z1, z2) * Math.sin((angle / 2) * Math.PI / 180);
    aA.value = calculated.toFixed(1);
    aA.readOnly = true;
    $('#geometry-formula').innerHTML = `<strong>Automatische Geometrie:</strong><br>aA = min(z1, z2) × sin(α/2) = <strong>${calculated.toFixed(2)} mm</strong><br>h<sub>Ungleichschenkligkeit</sub> = |z1 - z2| = <strong>${Math.abs(z1-z2).toFixed(2)} mm</strong>`;
  } else {
    aA.value = '';
    $('#geometry-formula').innerHTML = 'Schenkellängen z1 und z2 eingeben, um aA und die Ungleichschenkligkeit automatisch zu berechnen.';
  }
  updateConditionalFields();
}

function renderGeometryFields() {
  const type = jointType();
  const container = $('#geometry-fields');
  const existing = {};
  $$('[id^="geo-"]').forEach(input => existing[input.id.replace('geo-','')] = input.value);
  const common = [{id:'t', label:'Bauteildicke t', unit:'mm', value:existing.t || '8.0', min:.5, step:.1}];
  const fields = type === 'butt' ? [
    ...common,
    {id:'s', label:'Nahtdicke s', unit:'mm', value:existing.s || '8.0', min:.1, step:.1},
  ] : [
    ...common,
    {id:'a', label:'Nenn-Kehlnahtdicke a', unit:'mm', value:existing.a || '5.0', min:.1, step:.1},
    {id:'z1', label:'Schenkellänge z1', unit:'mm', value:existing.z1 || '7.0', min:.1, step:.1},
    {id:'z2', label:'Schenkellänge z2', unit:'mm', value:existing.z2 || '7.5', min:.1, step:.1},
    {id:'angle', label:'Öffnungswinkel α', unit:'°', value:existing.angle || '90', min:45, max:135, step:1},
    {id:'aA', label:'Tatsächliche Kehlnahtdicke aA', unit:'mm', value:existing.aA || '', min:.1, step:.1},
  ];
  container.innerHTML = fields.map(field => `<label>${escapeHtml(field.label)}
    <div class="input-unit"><input id="geo-${field.id}" type="number" min="${field.min}" ${field.max ? `max="${field.max}"` : ''} step="${field.step}" value="${field.value}"><span>${field.unit}</span></div>
  </label>`).join('');
  $('#auto-throat-row').classList.toggle('hidden', type !== 'fillet');
  $$('[id^="geo-"]').forEach(input => input.addEventListener('input', () => { updateThroat(); updateConditionalFields(); }));
  if (type === 'fillet') {
    $('#auto_throat').addEventListener('change', () => {
      $('#geo-aA').readOnly = $('#auto_throat').checked;
      if ($('#auto_throat').checked) updateThroat();
    }, {once:true});
    updateThroat();
  } else {
    $('#geometry-formula').innerHTML = '<strong>Stumpfnaht:</strong><br>t beschreibt die Bauteildicke; s ist die für die Regel verwendete Nahtdicke. Deck- und Wurzelseite werden getrennt über die Zugänglichkeit geführt.';
  }
}

function fieldHtml(ruleId, field) {
  if (field.joint_types && !field.joint_types.includes(jointType())) return '';
  const id = `${ruleId}-${field.id}`;
  const condition = field.show_if ? `data-show-field="${field.show_if.field}" data-show-equals="${field.show_if.equals}"` : '';
  const geometryCondition = field.show_if_geometry ? `data-show-geometry="${field.show_if_geometry.field}" data-show-lte="${field.show_if_geometry.lte}"` : '';
  const positiveCondition = field.show_if_positive ? `data-show-positive="${field.show_if_positive}"` : '';
  const anyPositiveCondition = field.show_if_any_positive ? `data-show-any-positive="${field.show_if_any_positive.join(',')}"` : '';
  const geometryDifference = field.show_if_geometry_difference ? `data-difference-left="${field.show_if_geometry_difference.left}" data-difference-right="${field.show_if_geometry_difference.right}" data-difference-operator="${field.show_if_geometry_difference.operator}"` : '';
  const wrapper = `data-field-wrapper data-rule-id="${ruleId}" ${condition} ${geometryCondition} ${positiveCondition} ${anyPositiveCondition} ${geometryDifference}`;
  if (field.type === 'boolean') {
    const checked = field.default ? 'checked' : '';
    return `<label class="switch-row" ${wrapper}><input id="${id}" data-input-id="${field.id}" type="checkbox" ${checked}><span>${escapeHtml(field.label)}</span>${field.help ? `<small>${escapeHtml(field.help)}</small>` : ''}</label>`;
  }
  if (field.type === 'select') {
    return `<label ${wrapper}>${escapeHtml(field.label)}<select id="${id}" data-input-id="${field.id}">${field.options.map(option => `<option value="${option.value}" ${option.value === field.default ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>${field.help ? `<small class="field-help">${escapeHtml(field.help)}</small>` : ''}</label>`;
  }
  return `<label ${wrapper}>${escapeHtml(field.label)}<div class="input-unit"><input id="${id}" data-input-id="${field.id}" type="number" min="${field.min ?? ''}" ${field.max !== undefined ? `max="${field.max}"` : ''} step="${field.step ?? .1}" value="${field.default ?? ''}"><span>${escapeHtml(field.unit || '')}</span></div>${field.help ? `<small class="field-help">${escapeHtml(field.help)}</small>` : ''}</label>`;
}

function criterionAvailable(item) {
  if (item.side === 'face') return $('#access_face').checked;
  if (item.side === 'root') return $('#access_root').checked;
  return $('#access_face').checked || $('#access_root').checked;
}

function snapshotCriteria() {
  const snapshot = {};
  $$('[data-criterion]').forEach(card => {
    const ruleId = card.dataset.criterion;
    const values = {};
    $$('[data-input-id]', card).forEach(input => {
      values[input.dataset.inputId] = input.type === 'checkbox' ? input.checked : input.value;
    });
    snapshot[ruleId] = {
      values,
      quality: $('[data-quality-override]', card)?.value || '',
      open: card.open || false
    };
  });
  return snapshot;
}

function renderCriteria() {
  if (!state.config) return;
  const snapshot = snapshotCriteria();
  const type = jointType();
  const overallQuality = requiredQuality();
  const criteria = state.config.criteria.filter(item => item.joint_types.includes(type));
  const groups = new Map();
  criteria.forEach(item => {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group).push(item);
  });
  $('#criteria-list').innerHTML = [...groups.entries()].map(([group, items]) => `
    <section class="criterion-group">
      <div class="criterion-group-heading"><div><span class="eyebrow">Prüfbereich</span><h3>${escapeHtml(group)}</h3></div><span>${items.length} ${items.length === 1 ? 'Kriterium' : 'Kriterien'}</span></div>
      <div class="criterion-group-list">${items.map(item => {
        const available = criterionAvailable(item);
        const sideLabel = item.side === 'root' ? 'Wurzelseite' : item.side === 'face' ? 'Deckseite' : 'zugänglicher Prüfbereich';
        return `<details class="criterion-card panel ${available ? '' : 'criterion-unavailable'}" data-criterion="${item.rule_id}" data-side="${item.side}">
          <summary class="criterion-header">
            <div class="rule-number">${item.table_no}</div>
            <div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.ui.short_info)}</p></div>
            <div class="summary-tags"><span class="role-tag">${escapeHtml(item.prototype_role)}</span><span class="side-tag">${sideLabel}</span>${available ? '' : '<span class="badge not_assessable">nicht zugänglich</span>'}</div>
          </summary>
          <div class="criterion-body">
            <div class="criterion-tools">
              <div class="criterion-fields">${item.fields.length ? item.fields.map(field => fieldHtml(item.rule_id, field)).join('') : '<div class="calculated-note">Die Bewertung wird vollständig aus der Grundgeometrie berechnet.</div>'}</div>
              <label class="quality-override">Sollgruppe dieses Kriteriums<select data-quality-override>
                <option value="">wie Gesamt (${overallQuality})</option><option>B</option><option>C</option><option>D</option>
              </select></label>
            </div>
            <p class="field-help"><strong>Messmittel:</strong> ${escapeHtml(item.ui.measuring_tool)} · <strong>Hinweis:</strong> ${escapeHtml(item.ui.warning)}</p>
          </div>
        </details>`;
      }).join('')}</div>
    </section>`).join('');
  $$('[data-criterion]').forEach(card => {
    const saved = snapshot[card.dataset.criterion];
    if (saved) {
      $$('[data-input-id]', card).forEach(input => {
        if (!(input.dataset.inputId in saved.values)) return;
        if (input.type === 'checkbox') input.checked = Boolean(saved.values[input.dataset.inputId]);
        else input.value = saved.values[input.dataset.inputId];
      });
      const override = $('[data-quality-override]', card);
      if (override) override.value = saved.quality;
      card.open = saved.open;
    }
    if (card.classList.contains('criterion-unavailable')) {
      $$('input,select', card).forEach(input => input.disabled = true);
    }
  });
  $$('[data-input-id]').forEach(input => input.addEventListener('input', updateConditionalFields));
  $$('[data-input-id]').forEach(input => input.addEventListener('change', updateConditionalFields));
  updateConditionalFields();
}

function updateConditionalFields() {
  $$('[data-field-wrapper]').forEach(wrapper => {
    let visible = true;
    if (wrapper.dataset.showField) {
      const source = $(`#${wrapper.dataset.ruleId}-${wrapper.dataset.showField}`);
      visible = source ? String(source.checked) === wrapper.dataset.showEquals : false;
    }
    if (wrapper.dataset.showGeometry) {
      const value = parseFloat(geometryValue(wrapper.dataset.showGeometry));
      visible = visible && Number.isFinite(value) && value <= parseFloat(wrapper.dataset.showLte);
    }
    if (wrapper.dataset.showPositive) {
      const source = $(`#${wrapper.dataset.ruleId}-${wrapper.dataset.showPositive}`);
      visible = visible && source && Number(source.value) > 0;
    }
    if (wrapper.dataset.showAnyPositive) {
      const fields = wrapper.dataset.showAnyPositive.split(',');
      visible = visible && fields.some(field => {
        const source = $(`#${wrapper.dataset.ruleId}-${field}`);
        return source && Number(source.value) > 0;
      });
    }
    if (wrapper.dataset.differenceLeft) {
      const left = Number(geometryValue(wrapper.dataset.differenceLeft));
      const right = Number(geometryValue(wrapper.dataset.differenceRight));
      if (wrapper.dataset.differenceOperator === 'gt') visible = visible && left > right;
      if (wrapper.dataset.differenceOperator === 'lt') visible = visible && left < right;
    }
    wrapper.classList.toggle('hidden', !visible);
  });
}

function collectPayload() {
  const criteria = {};
  $$('[data-criterion]').forEach(card => {
    const ruleId = card.dataset.criterion;
    const values = {};
    $$('[data-input-id]', card).forEach(input => {
      if (input.closest('[data-field-wrapper]')?.classList.contains('hidden')) return;
      if (input.type === 'checkbox') values[input.dataset.inputId] = input.checked;
      else if (input.type === 'number') values[input.dataset.inputId] = input.value === '' ? null : Number(input.value);
      else values[input.dataset.inputId] = input.value;
    });
    const override = $('[data-quality-override]', card).value;
    criteria[ruleId] = {values, required_quality: override || null};
  });
  return {
    report: {
      report_id: $('#report_id').value.trim(), inspection_date: $('#inspection_date').value,
      component: $('#component').value.trim(), weld_id: $('#weld_id').value.trim(),
      inspector: $('#inspector').value.trim(), location: $('#location').value.trim(), notes: $('#notes').value.trim()
    },
    joint_type: jointType(), required_quality: requiredQuality(),
    accessibility: {face: $('#access_face').checked, root: $('#access_root').checked},
    geometry: {
      t: numberOrNull(geometryValue('t')), s: numberOrNull(geometryValue('s')),
      a: numberOrNull(geometryValue('a')), aA: numberOrNull(geometryValue('aA')),
      z1: numberOrNull(geometryValue('z1')), z2: numberOrNull(geometryValue('z2')),
      angle: numberOrNull(geometryValue('angle'))
    },
    criteria, compare_2014: $('#compare_2014').checked
  };
}

function numberOrNull(value) { const parsed = Number(value); return value !== '' && Number.isFinite(parsed) ? parsed : null; }

function frontendValidation(step) {
  const errors = [];
  if (step >= 1 && !$('#access_face').checked && !$('#access_root').checked) errors.push('Mindestens eine Prüfseite muss zugänglich sein.');
  if (step >= 2) {
    const t = numberOrNull(geometryValue('t'));
    if (t === null || t < .5) errors.push('Bauteildicke t muss mindestens 0,5 mm betragen.');
    if (jointType() === 'butt') {
      const s = numberOrNull(geometryValue('s')); if (s === null || s <= 0) errors.push('Nahtdicke s ist erforderlich.');
    } else {
      ['a','aA','z1','z2'].forEach(key => { const value = numberOrNull(geometryValue(key)); if (value === null || value <= 0) errors.push(`${key} muss größer als 0 sein.`); });
    }
  }
  return errors;
}

async function evaluate() {
  const errors = frontendValidation(3);
  if (errors.length) { showAlert(errors); return false; }
  showAlert([]);
  const payload = collectPayload();
  $('#next-button').disabled = true; $('#next-button').textContent = 'Bewertung läuft...';
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    const data = state.service.evaluatePayload(payload);
    state.lastPayload = payload; state.lastResult = data;
    renderResults(data); $('#download-pdf').disabled = false; return true;
  } catch (error) {
    showAlert(String(error.message || error).split('\n')); return false;
  } finally {
    $('#next-button').disabled = false; updateNavigation();
  }
}

function valueText(item) {
  const measured = item.measured_value;
  const limit = item.governing_limit;
  if (measured === null && limit === null) return 'keine Maßgrenze';
  if (typeof measured === 'boolean') return measured ? 'vorhanden / ja' : 'nicht vorhanden / nein';
  const left = measured !== null ? `${Number(measured).toLocaleString('de-DE',{maximumFractionDigits:2})} mm` : '-';
  const right = limit !== null ? `Grenze ${Number(limit).toLocaleString('de-DE',{maximumFractionDigits:2})} mm` : '';
  return [left,right].filter(Boolean).join(' · ');
}

function renderResults(data) {
  const primary = data.primary;
  const summary = $('#result-summary');
  summary.querySelector('h2').textContent = primary.status === 'pass' ? 'Anforderung erfüllt' : primary.status === 'fail' ? 'Anforderung nicht erfüllt' : 'Bewertung noch nicht abschließend';
  summary.querySelector('p').innerHTML = `Prüfstatus: <strong>${inspectionLabels[primary.inspection_status] || primary.inspection_status}</strong> · gefordert <strong>${primary.required_quality}</strong> · erreicht <strong>${primary.achieved_quality || '-'}</strong>`;
  const comparisonById = Object.fromEntries((data.comparison?.results || []).map(item => [item.rule_id,item]));
  $('#results-list').innerHTML = primary.results.map(item => {
    const comp = comparisonById[item.rule_id];
    const messages = item.messages.map(message => `<span>${escapeHtml(message)}</span>`).join(' ');
    return `<article class="result-card panel">
      <div class="rule-number">${item.table_no}</div>
      <div><h3>${escapeHtml(item.name)}</h3><div class="result-meta">
        <span class="badge ${item.status}">${statusLabels[item.status] || item.status}</span>
        <span class="badge not_applicable">Soll ${item.required_quality}</span>
        <span class="badge ${item.achieved_quality ? 'pass' : 'not_applicable'}">Erreicht ${item.achieved_quality || '-'}</span>
      </div><p class="field-help">${messages}</p>${item.formula ? `<p class="field-help"><strong>Formel:</strong> ${escapeHtml(item.formula)}</p>` : ''}
      ${comp ? `<div class="comparison-row"><strong>2014:</strong> ${statusLabels[comp.status] || comp.status}, erreicht ${comp.achieved_quality || '-'}, Grenze ${comp.governing_limit ?? '-'}</div>` : ''}</div>
      <div class="metric"><small>Messwert / maßgebende Grenze</small><strong>${valueText(item)}</strong></div>
    </article>`;
  }).join('');
}

async function downloadPdf() {
  if (!state.lastResult) return;
  const button = $('#download-pdf'); button.disabled = true; button.textContent = 'Bericht wird geöffnet...';
  try {
    openReport(state.lastResult, state.config);
  } catch (error) {
    showAlert(String(error.message || error).split('\n'));
  } finally {
    button.disabled = false; button.textContent = 'Bericht / PDF';
  }
}

function updateNavigation() {
  const next = $('#next-button'); const back = $('#back-button');
  back.disabled = state.currentStep === 1;
  next.textContent = state.currentStep === 3 ? 'Jetzt bewerten' : state.currentStep === 4 ? 'Zur Prüfstelle' : 'Weiter';
  $('#progress-note').textContent = `Schritt ${state.currentStep} von 4`;
  $$('.step').forEach(step => {
    const number = Number(step.dataset.step);
    step.classList.toggle('active', number === state.currentStep);
    step.classList.toggle('completed', number < state.currentStep);
  });
}

function goToStep(step) {
  state.currentStep = Math.max(1,Math.min(4,step));
  $$('.step-panel').forEach(panel => panel.classList.toggle('hidden', Number(panel.dataset.panel) !== state.currentStep));
  updateNavigation(); window.scrollTo({top:140,behavior:'smooth'});
}

async function nextStep() {
  if (state.currentStep < 3) {
    const errors = frontendValidation(state.currentStep);
    if (errors.length) { showAlert(errors); return; }
    showAlert([]); goToStep(state.currentStep + 1); return;
  }
  if (state.currentStep === 3) {
    if (await evaluate()) goToStep(4);
  } else goToStep(1);
}

async function init() {
  $('#inspection_date').value = new Date().toISOString().slice(0,10);
  try {
    const [configResponse, libraryResponse] = await Promise.all([
      fetch('./data/ui-config.json', {cache: 'no-store'}),
      fetch('./data/rules.v1.json', {cache: 'no-store'})
    ]);
    if (!configResponse.ok || !libraryResponse.ok) throw new Error('Regel- oder UI-Konfiguration konnte nicht geladen werden.');
    const [config, library] = await Promise.all([configResponse.json(), libraryResponse.json()]);
    state.service = createEvaluationService(library, config);
    state.config = state.service.config;
  } catch (error) {
    showAlert([String(error.message || error)]);
    $('#next-button').disabled = true;
    return;
  }
  $('#version-pill').textContent = `Assistent ${state.config.prototype_version}`;
  $('#footer-library').textContent = `Regelbibliothek ${state.config.library.version} · ${state.config.criteria.length} aktive V1-Kriterien · Berechnung lokal im Browser`;
  if ((state.config.app_mode || 'test') !== 'production') document.body.classList.add('test-mode');
  else document.body.classList.add('production-mode');
  updateJointVisuals(); updateNavigation();
  $$('input[name="joint_type"]').forEach(input => input.addEventListener('change', updateJointVisuals));
  $$('input[name="required_quality"]').forEach(input => input.addEventListener('change', renderCriteria));
  $('#next-button').addEventListener('click', nextStep);
  $('#back-button').addEventListener('click', () => goToStep(state.currentStep - 1));
  $('#evaluate-again').addEventListener('click', () => goToStep(3));
  $('#download-pdf').addEventListener('click', downloadPdf);
  $('#access_face').addEventListener('change', renderCriteria);
  $('#access_root').addEventListener('change', renderCriteria);
  $('#expand-all').addEventListener('click', () => $$('[data-criterion]:not(.criterion-unavailable)').forEach(card => card.open = true));
  $('#collapse-all').addEventListener('click', () => $$('[data-criterion]').forEach(card => card.open = false));
  $$('.step').forEach(step => step.addEventListener('click', () => {
    const target = Number(step.dataset.step); if (target < state.currentStep || (target === 4 && state.lastResult)) goToStep(target);
  }));
}

document.addEventListener('DOMContentLoaded', init);

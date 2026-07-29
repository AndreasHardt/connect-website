import { createEvaluationService } from './evaluation.js?v=fea4ea872f1a';
import { openReport } from './report.js?v=7e2eaafd8c9f';
import { computeFilletGeometry, computeFilletNominalMeasurements, GEOMETRY_TOLERANCE_MM } from './geometry.js?v=bda6fb5469b7';
import { filletGeometrySvg } from './fillet-geometry-svg.js?v=ab8ab806d448';

const state = {
  config: null,
  lastPayload: null,
  lastResult: null,
  service: null,
  geometry: null,
  geometryStatus: 'incomplete',
  liveTimer: null,
  liveBusy: false,
  initialized: false,
  filletMeasurements: {
    values: {z1:'', z2:'', m:''},
    automatic: {z1:true, z2:true, m:true},
  },
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
const aASourceLabels = {
  legs: 'aus dem kleineren Schenkel', middle: 'aus dem mittleren Messwert', direct: 'direkt gemessen'
};
const profileLabels = {
  straight: 'gerades Profil', convex: 'Überhöhung', concave: 'Unterwölbung'
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function jointType() { return $('input[name="joint_type"]:checked').value; }
function requiredQuality() { return $('input[name="required_quality"]:checked').value; }
function numberOrNull(value) {
  const parsed = Number(value);
  return value !== '' && Number.isFinite(parsed) ? parsed : null;
}
function formatNumber(value) {
  return Number.isFinite(Number(value))
    ? Number(value).toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1})
    : '—';
}
function formatMm(value) {
  return Number.isFinite(Number(value)) ? `${formatNumber(value)} mm` : '—';
}

function jointSvg(type) {
  if (type === 'butt') {
    return `<svg viewBox="0 0 300 180" role="img" aria-label="Schematische Stumpfnaht">
      <rect x="15" y="112" width="115" height="28" rx="3" fill="#173d5f"/>
      <rect x="170" y="112" width="115" height="28" rx="3" fill="#173d5f"/>
      <path d="M125 112 L145 70 L155 70 L175 112" fill="#66a4c7" stroke="#246b99" stroke-width="3"/>
      <path d="M145 70 Q150 56 155 70" fill="none" stroke="#246b99" stroke-width="4"/>
      <line x1="150" y1="54" x2="150" y2="16" stroke="#b33a3a" stroke-width="2"/>
      <text x="160" y="28" fill="#b33a3a" font-size="14" font-weight="700">h</text>
      <line x1="128" y1="50" x2="172" y2="50" stroke="#173d5f" stroke-width="2"/>
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
    <text x="91" y="110" fill="#b33a3a" font-size="14" font-weight="700">z1</text>
    <line x1="74" y1="117" x2="74" y2="80" stroke="#a86b00" stroke-width="2"/>
    <text x="80" y="96" fill="#a86b00" font-size="14" font-weight="700">z2</text>
    <line x1="67" y1="122" x2="97" y2="92" stroke="#1f7a4d" stroke-width="2" stroke-dasharray="5 4"/>
    <text x="98" y="88" fill="#1f7a4d" font-size="14" font-weight="700">m</text>
  </svg>`;
}

function showAlert(messages) {
  const alert = $('#alert');
  if (!messages || !messages.length) {
    alert.classList.add('hidden');
    alert.innerHTML = '';
    return;
  }
  alert.innerHTML = `<strong>Bitte prüfen:</strong><ul>${messages.map(message => `<li>${escapeHtml(message)}</li>`).join('')}</ul>`;
  alert.classList.remove('hidden');
}

function geometryValue(id) {
  const element = $(`#geo-${id}`);
  return element ? element.value : '';
}

function filletGeometryInput() {
  return {
    z1: numberOrNull(geometryValue('z1')),
    z2: numberOrNull(geometryValue('z2')),
    m: numberOrNull(geometryValue('m')),
    gamma: numberOrNull(geometryValue('angle')),
    directAA: numberOrNull(geometryValue('direct-aA')),
    directH: numberOrNull(geometryValue('direct-h')),
    tolerance: GEOMETRY_TOLERANCE_MM,
  };
}

function renderGeometrySummary(result) {
  const summary = $('#geometry-formula');
  if (!summary) return;
  if (!result?.b) {
    summary.innerHTML = 'Schenkellängen z1 und z2, den Bauteilwinkel γ und den Höhenmesswert m eingeben.';
    return;
  }
  const sign = result.profileH >= 0 ? '+' : '−';
  const profileText = `${profileLabels[result.profileClass]} (${sign}${formatMm(Math.abs(result.profileH))})`;
  const requirements = [];
  if (result.needsDirectH) requirements.push('Maximale Nahtüberhöhung h direkt messen.');
  if (result.needsDirectAA) requirements.push('Kleinste tatsächliche Kehlnahtdicke aA direkt messen.');
  const warnings = [...(result.errors || []), ...requirements];
  const combined = result.combinedFeatures
    ? '<br><strong>Hinweis:</strong> Ungleichschenkligkeit und Profilabweichung treten gemeinsam auf und werden getrennt bewertet.'
    : '';
  summary.innerHTML = `<strong>Automatisch berechnete Geometrie:</strong><br>
    Nahtbreite b = <strong>${formatMm(result.b)}</strong><br>
    Schenkelbezogene Kehlnahtdicke az = <strong>${formatMm(result.az)}</strong><br>
    Vergleichshöhe m0 = <strong>${formatMm(result.m0)}</strong><br>
    Ungleichschenkligkeit hz = <strong>${formatMm(result.asymmetryH)}</strong><br>
    Profilabweichung senkrecht zu b = <strong>${profileText}</strong><br>
    tatsächliche Kehlnahtdicke aA = <strong>${formatMm(result.aA)}</strong>${result.aASource ? ` (${escapeHtml(aASourceLabels[result.aASource])})` : ''}
    ${warnings.length ? `<div class="alert geometry-alert">${warnings.map(item => escapeHtml(item)).join('<br>')}</div>` : ''}${combined}<br>
    Geometriestatus (Nr. 1.10, 1.16, 1.20 und 1.21): <span id="fillet-geometry-status" class="badge incomplete">noch unvollständig</span><br>
    <small>Symmetrie- und Profiltoleranz: ${formatMm(result.tolerance)}; messtechnische, nicht normative Toleranz. Die farbige Linie vom Wurzelpunkt bis m zeigt ausschließlich diesen Geometriestatus; Einbrandkerben und andere separate Kriterien ändern ihre Farbe nicht.</small>`;
}

function updateFilletGeometryStatus(status) {
  const normalized = ['pass', 'fail'].includes(status) ? status : 'incomplete';
  const labels = {pass:'erfüllt', fail:'nicht erfüllt', incomplete:'noch unvollständig'};
  state.geometryStatus = normalized;
  if (jointType() === 'fillet' && state.geometry?.valid) {
    $('#geometry-schematic').innerHTML = filletGeometrySvg(
      state.geometry,
      numberOrNull(geometryValue('a')),
      normalized,
    );
  }
  const label = $('#fillet-geometry-status');
  if (label) {
    label.className = `badge ${normalized}`;
    label.textContent = labels[normalized];
  }
}

function refreshGeometry({schedule = true} = {}) {
  if (jointType() !== 'fillet') {
    state.geometry = null;
    $('#geometry-schematic').innerHTML = jointSvg('butt');
    const summary = $('#geometry-formula');
    if (summary) summary.innerHTML = '<strong>Stumpfnaht:</strong><br>Nahtdicke s und Breite b werden am Nahtabschnitt gemessen. Die Breite b wird für die Bewertung der Decklagenüberhöhung verwendet.';
    updateConditionalFields();
    if (schedule) scheduleLiveEvaluation();
    return;
  }
  state.geometryStatus = 'incomplete';
  const result = computeFilletGeometry(filletGeometryInput());
  state.geometry = result;
  $('#geometry-schematic').innerHTML = filletGeometrySvg(result, numberOrNull(geometryValue('a')), state.geometryStatus);
  const bField = $('#geo-b');
  const aAField = $('#geo-aA');
  if (bField) bField.value = Number.isFinite(result.b) ? result.b.toFixed(1) : '';
  if (aAField) aAField.value = Number.isFinite(result.aA) ? result.aA.toFixed(1) : '';
  $('#direct-h-field')?.classList.toggle('hidden', !result.needsDirectH);
  $('#direct-aA-field')?.classList.toggle('hidden', !result.needsDirectAA);
  renderGeometrySummary(result);
  updateConditionalFields();
  if (schedule) scheduleLiveEvaluation();
}

const FILLET_MEASUREMENT_IDS = ['z1', 'z2', 'm'];

function nominalFilletMeasurementValues() {
  const target = computeFilletNominalMeasurements(
    numberOrNull(geometryValue('a')),
    numberOrNull(geometryValue('angle')),
  );
  if (!target.valid) return null;
  return {
    z1: target.z1.toFixed(1),
    z2: target.z2.toFixed(1),
    m: target.m.toFixed(1),
  };
}

function captureFilletMeasurementValues(container = $('#geometry-fields')) {
  FILLET_MEASUREMENT_IDS.forEach(id => {
    const input = `#geo-${id}`;
    const field = $(input, container);
    if (field) state.filletMeasurements.values[id] = field.value;
  });
}

function syncAutomaticFilletMeasurements({refresh = true} = {}) {
  const target = nominalFilletMeasurementValues();
  if (target) {
    FILLET_MEASUREMENT_IDS.forEach(id => {
      if (!state.filletMeasurements.automatic[id]) return;
      state.filletMeasurements.values[id] = target[id];
      const field = `#geo-${id}`;
      const input = $(field);
      if (input) {
        input.value = target[id];
        input.dataset.valueMode = 'automatic';
      }
    });
  }
  if (refresh) refreshGeometry();
}

function renderGeometryFields() {
  const type = jointType();
  const container = $('#geometry-fields');
  const existing = {};
  $$('[id^="geo-"]', container).forEach(input => { existing[input.id.replace('geo-', '')] = input.value; });
  captureFilletMeasurementValues(container);
  syncAutomaticFilletMeasurements({refresh:false});
  const fields = type === 'butt' ? [
    {id:'s', label:'Gemessene Nahtdicke s', unit:'mm', value:existing.s || '8.0', min:.1, step:.1},
    {id:'b', label:'Gemessene Nahtbreite b', unit:'mm', value:existing.b || '', min:.1, step:.1},
  ] : [
    {id:'z1', label:'Schenkellänge z1', unit:'mm', value:state.filletMeasurements.values.z1, min:.1, step:.1, valueMode:state.filletMeasurements.automatic.z1 ? 'automatic' : 'manual'},
    {id:'z2', label:'Schenkellänge z2', unit:'mm', value:state.filletMeasurements.values.z2, min:.1, step:.1, valueMode:state.filletMeasurements.automatic.z2 ? 'automatic' : 'manual'},
    {id:'m', label:'Höhenmesswert m bei γ/2', unit:'mm', value:state.filletMeasurements.values.m, min:0, step:.1, valueMode:state.filletMeasurements.automatic.m ? 'automatic' : 'manual'},
  ];
  container.innerHTML = fields.map(field => `<label ${field.wrapperId ? `id="${field.wrapperId}"` : ''} class="${field.hidden ? 'hidden' : ''}">${escapeHtml(field.label)}
    <div class="input-unit"><input id="geo-${field.id}" type="number" min="${field.min}" step="${field.step}" value="${escapeHtml(field.value)}" ${field.valueMode ? `data-value-mode="${field.valueMode}"` : ''} ${field.readonly ? 'readonly' : ''}><span>${escapeHtml(field.unit)}</span></div>
  </label>`).join('');
  $$('[id^="geo-"]', container).forEach(input => {
    if (input.readOnly) return;
    input.addEventListener('input', () => {
      const id = input.id.replace('geo-', '');
      if (type === 'fillet' && FILLET_MEASUREMENT_IDS.includes(id)) {
        state.filletMeasurements.automatic[id] = false;
        state.filletMeasurements.values[id] = input.value;
        input.dataset.valueMode = 'manual';
      }
      refreshGeometry();
    });
  });
  refreshGeometry({schedule:false});
}

function updateJointVisuals() {
  const type = jointType();
  $('#geometry-schematic').innerHTML = type === 'butt' ? jointSvg(type) : '';
  $('#general-a-field')?.classList.toggle('hidden', type !== 'fillet');
  $('#general-angle-field')?.classList.toggle('hidden', type !== 'fillet');
  renderGeometryFields();
  renderCriteria();
  scheduleLiveEvaluation();
}

function hiddenSystemField(ruleId, fieldId) {
  return (ruleId === 'IMP-000010' && ['fillet_reinforcement_h','fillet_reinforcement_width_b'].includes(fieldId))
    || (ruleId === 'IMP-000009' && fieldId === 'butt_reinforcement_width_b');
}

function criterionSystemNote(ruleId) {
  if (ruleId === 'IMP-000010') return 'Überhöhung h und Breite b werden aus der Kehlnahtgeometrie übernommen.';
  if (ruleId === 'IMP-000009') return 'Die Nahtbreite b wird aus der Messdatenerfassung übernommen.';
  return '';
}

function criterionFieldLabel(ruleId, field) {
  if (ruleId !== 'IMP-000007' || jointType() !== 'fillet') return field.label;
  const labels = {
    undercut_left_h: 'Einbrandkerbe 1 an Bauteil 1 (horizontal, z1)',
    undercut_right_h: 'Einbrandkerbe 2 an Bauteil 2 (senkrecht/abgewinkelt, z2)',
  };
  return labels[field.id] || field.label;
}

function fieldHtml(ruleId, field, quality = requiredQuality()) {
  if (field.joint_types && !field.joint_types.includes(jointType())) return '';
  if (ruleId === 'IMP-000013' && quality !== 'D' && ['overlap_height_h','overlap_width_b'].includes(field.id)) return '';
  if (hiddenSystemField(ruleId, field.id)) return '';
  const label = criterionFieldLabel(ruleId, field);
  const id = `${ruleId}-${field.id}`;
  const condition = field.show_if ? `data-show-field="${field.show_if.field}" data-show-equals="${field.show_if.equals}"` : '';
  const geometryCondition = field.show_if_geometry ? `data-show-geometry="${field.show_if_geometry.field}" data-show-lte="${field.show_if_geometry.lte}"` : '';
  const positiveCondition = field.show_if_positive ? `data-show-positive="${field.show_if_positive}"` : '';
  const anyPositiveCondition = field.show_if_any_positive ? `data-show-any-positive="${field.show_if_any_positive.join(',')}"` : '';
  const geometryDifference = field.show_if_geometry_difference ? `data-difference-left="${field.show_if_geometry_difference.left}" data-difference-right="${field.show_if_geometry_difference.right}" data-difference-operator="${field.show_if_geometry_difference.operator}"` : '';
  const wrapper = `data-field-wrapper data-rule-id="${ruleId}" ${condition} ${geometryCondition} ${positiveCondition} ${anyPositiveCondition} ${geometryDifference}`;
  if (field.type === 'boolean') {
    return `<label class="switch-row" ${wrapper}><input id="${id}" data-input-id="${field.id}" type="checkbox" ${field.default ? 'checked' : ''}><span>${escapeHtml(label)}</span>${field.help ? `<small>${escapeHtml(field.help)}</small>` : ''}</label>`;
  }
  if (field.type === 'select') {
    return `<label ${wrapper}>${escapeHtml(label)}<select id="${id}" data-input-id="${field.id}">${field.options.map(option => `<option value="${escapeHtml(option.value)}" ${option.value === field.default ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>${field.help ? `<small class="field-help">${escapeHtml(field.help)}</small>` : ''}</label>`;
  }
  return `<label ${wrapper}>${escapeHtml(label)}<div class="input-unit"><input id="${id}" data-input-id="${field.id}" type="number" min="${field.min ?? ''}" ${field.max !== undefined ? `max="${field.max}"` : ''} step="${field.step ?? .1}" value="${field.default ?? ''}"><span>${escapeHtml(field.unit || '')}</span></div>${field.help ? `<small class="field-help">${escapeHtml(field.help)}</small>` : ''}</label>`;
}

function criterionAvailable(item) {
  if (item.side === 'face') return $('#access_face').checked;
  if (item.side === 'root') return $('#access_root').checked;
  return $('#access_face').checked || $('#access_root').checked;
}

function snapshotCriteria() {
  const snapshot = {};
  $$('[data-criterion]').forEach(card => {
    const values = {};
    $$('[data-input-id]', card).forEach(input => {
      values[input.dataset.inputId] = input.type === 'checkbox' ? input.checked : input.value;
    });
    snapshot[card.dataset.criterion] = {
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
        const effectiveQuality = snapshot[item.rule_id]?.quality || overallQuality;
        const overlapPresenceOnly = item.rule_id === 'IMP-000013' && effectiveQuality !== 'D';
        const roleText = overlapPresenceOnly ? 'Verbotsregel' : item.prototype_role;
        const shortInfo = overlapPresenceOnly
          ? `Schweißgutüberlauf ist bei Bewertungsgruppe ${effectiveQuality} nicht zulässig; das Vorhandensein allein entscheidet.`
          : item.ui.short_info;
        const fields = item.fields.map(field => fieldHtml(item.rule_id, field, effectiveQuality)).filter(Boolean).join('');
        const systemNote = criterionSystemNote(item.rule_id);
        return `<details class="criterion-card panel ${available ? '' : 'criterion-unavailable'}" data-criterion="${item.rule_id}" data-side="${item.side}">
          <summary class="criterion-header">
            <div class="rule-number">${item.table_no}</div>
            <div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(shortInfo)}</p></div>
            <div class="summary-tags"><span class="role-tag">${escapeHtml(roleText)}</span><span class="side-tag">${sideLabel}</span>${available ? '' : '<span class="badge not_assessable">nicht zugänglich</span>'}</div>
          </summary>
          <div class="criterion-body">
            <div class="criterion-tools">
              <div class="criterion-fields">${systemNote ? `<div class="calculated-note">${escapeHtml(systemNote)}</div>` : ''}${fields || (!systemNote ? '<div class="calculated-note">Die Bewertung wird vollständig aus den allgemeinen Vorgaben und den erfassten Messwerten berechnet.</div>' : '')}</div>
              <label class="quality-override">SOLL-Gruppe dieses Kriteriums<select data-quality-override>
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
    if (card.classList.contains('criterion-unavailable')) $$('input,select', card).forEach(input => { input.disabled = true; });
  });
  $$('[data-input-id]').forEach(input => {
    input.addEventListener('input', () => { updateConditionalFields(); scheduleLiveEvaluation(); });
    input.addEventListener('change', () => { updateConditionalFields(); scheduleLiveEvaluation(); });
  });
  $$('[data-quality-override]').forEach(select => select.addEventListener('change', () => {
    renderCriteria();
    scheduleLiveEvaluation();
  }));
  updateConditionalFields();
}

function systemCriterionValue(ruleId, fieldId) {
  if (ruleId === 'IMP-000010' && fieldId === 'fillet_reinforcement_h') return state.geometry?.reinforcementH;
  if (ruleId === 'IMP-000010' && fieldId === 'fillet_reinforcement_width_b') return state.geometry?.b;
  if (ruleId === 'IMP-000009' && fieldId === 'butt_reinforcement_width_b') return numberOrNull(geometryValue('b'));
  return null;
}

function criterionInputValue(ruleId, fieldId) {
  const source = $(`#${ruleId}-${fieldId}`);
  if (source) return source.type === 'checkbox' ? source.checked : source.value;
  return systemCriterionValue(ruleId, fieldId);
}

function updateConditionalFields() {
  $$('[data-field-wrapper]').forEach(wrapper => {
    let visible = true;
    const ruleId = wrapper.dataset.ruleId;
    if (wrapper.dataset.showField) {
      visible = String(Boolean(criterionInputValue(ruleId, wrapper.dataset.showField))) === wrapper.dataset.showEquals;
    }
    if (wrapper.dataset.showGeometry) {
      const value = parseFloat(geometryValue(wrapper.dataset.showGeometry));
      visible = visible && Number.isFinite(value) && value <= parseFloat(wrapper.dataset.showLte);
    }
    if (wrapper.dataset.showPositive) visible = visible && Number(criterionInputValue(ruleId, wrapper.dataset.showPositive)) > 0;
    if (wrapper.dataset.showAnyPositive) {
      visible = visible && wrapper.dataset.showAnyPositive.split(',').some(field => Number(criterionInputValue(ruleId, field)) > 0);
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

function systemValuesForCriterion(ruleId) {
  if (ruleId === 'IMP-000010') {
    return {
      fillet_reinforcement_h: state.geometry?.reinforcementH,
      fillet_reinforcement_width_b: state.geometry?.b,
    };
  }
  if (ruleId === 'IMP-000009') return {butt_reinforcement_width_b: numberOrNull(geometryValue('b'))};
  return {};
}

function collectPayload() {
  refreshGeometry({schedule:false});
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
    Object.assign(values, systemValuesForCriterion(ruleId));
    const override = $('[data-quality-override]', card)?.value || '';
    criteria[ruleId] = {values, required_quality: override || null};
  });
  const g = state.geometry;
  const undercutValues = criteria['IMP-000007']?.values ?? {};
  return {
    report: {
      report_id: $('#report_id').value.trim(), inspection_date: $('#inspection_date').value,
      wps: $('#wps').value.trim(), component: $('#component').value.trim(), weld_id: $('#weld_id').value.trim(),
      inspector: $('#inspector').value.trim(), location: $('#location').value.trim(), notes: $('#notes').value.trim()
    },
    joint_type: jointType(), required_quality: requiredQuality(),
    accessibility: {face: $('#access_face').checked, root: $('#access_root').checked},
    geometry: {
      t: numberOrNull(geometryValue('t')),
      s: numberOrNull(geometryValue('s')),
      a: numberOrNull(geometryValue('a')),
      aA: jointType() === 'fillet' ? g?.aA ?? null : null,
      z1: numberOrNull(geometryValue('z1')),
      z2: numberOrNull(geometryValue('z2')),
      gamma: numberOrNull(geometryValue('angle')),
      m: numberOrNull(geometryValue('m')),
      b: jointType() === 'fillet' ? g?.b ?? null : numberOrNull(geometryValue('b')),
      az: g?.az ?? null,
      m0: g?.m0 ?? null,
      delta_m: g?.deltaM ?? null,
      profile_h: g?.profileH ?? null,
      reinforcement_h: g?.reinforcementH ?? null,
      asymmetry_h: g?.asymmetryH ?? null,
      profile_class: g?.profileClass ?? null,
      aA_source: g?.aASource ?? null,
      direct_aA: numberOrNull(geometryValue('direct-aA')),
      direct_h: numberOrNull(geometryValue('direct-h')),
      notch1: numberOrNull(undercutValues.undercut_left_h) ?? 0,
      notch2: numberOrNull(undercutValues.undercut_right_h) ?? 0,
      combined_features: Boolean(g?.combinedFeatures),
      tolerance_mm: GEOMETRY_TOLERANCE_MM,
    },
    criteria,
    compare_2014: $('#compare_2014').checked
  };
}

function frontendValidation() {
  refreshGeometry({schedule:false});
  const errors = [];
  if (!$('#access_face').checked && !$('#access_root').checked) errors.push('Mindestens eine Prüfseite muss zugänglich sein.');
  const t = numberOrNull(geometryValue('t'));
  if (t === null || t < .5) errors.push('Bauteildicke t muss mindestens 0,5 mm betragen.');
  if (jointType() === 'butt') {
    const s = numberOrNull(geometryValue('s'));
    const b = numberOrNull(geometryValue('b'));
    if (s === null || s <= 0) errors.push('Gemessene Nahtdicke s ist erforderlich.');
    if (b === null || b <= 0) errors.push('Gemessene Nahtbreite b ist erforderlich.');
  } else {
    const a = numberOrNull(geometryValue('a'));
    if (a === null || a <= 0) errors.push('Nenn-Kehlnahtdicke a muss größer als 0 mm sein.');
    errors.push(...(state.geometry?.errors || []));
    if (state.geometry?.needsDirectH && !Number.isFinite(state.geometry.reinforcementH)) {
      errors.push('Bei ungleichschenkliger und überwölbter Naht ist die maximale Nahtüberhöhung h direkt zu messen.');
    }
    if (state.geometry?.needsDirectAA && !Number.isFinite(state.geometry.aA)) {
      errors.push('Bei ungleichschenkliger und unterwölbter Naht ist die kleinste tatsächliche Kehlnahtdicke aA direkt zu messen.');
    }
    if (!Number.isFinite(state.geometry?.aA) || state.geometry.aA <= 0) errors.push('Die tatsächliche Kehlnahtdicke aA konnte nicht bestimmt werden.');
  }
  return [...new Set(errors)];
}

function valueText(item) {
  const measured = item.measured_value;
  const limit = item.governing_limit;
  if (measured === null && limit === null) return 'keine Maßgrenze';
  if (typeof measured === 'boolean') return measured ? 'vorhanden / ja' : 'nicht vorhanden / nein';
  const left = measured !== null ? `${formatNumber(measured)} mm` : '—';
  const right = limit !== null ? `Grenze ${formatNumber(limit)} mm` : '';
  return [left, right].filter(Boolean).join(' · ');
}

function statusText(item, edition) {
  const soll = `SOLL: ${item.required_quality}`;
  const status = statusLabels[item.status] || item.status;
  const ist = `IST: ${item.achieved_quality || '—'}`;
  return `${edition} · ${soll} ${status} · ${ist}`;
}

function resultSectionState(status) {
  if (status === 'pass') return 'evaluation-pass';
  if (status === 'fail') return 'evaluation-fail';
  if (status === 'manual_review' || status === 'incomplete') return 'evaluation-warning';
  return 'evaluation-neutral';
}

function setEvaluationState(status) {
  const section = $('#evaluation-result');
  section.classList.remove('evaluation-pass','evaluation-fail','evaluation-warning','evaluation-neutral');
  section.classList.add(resultSectionState(status));
}

function renderIncompleteState(errors = []) {
  updateFilletGeometryStatus('incomplete');
  state.lastPayload = null;
  state.lastResult = null;
  setEvaluationState('incomplete');
  const summary = $('#result-summary');
  summary.querySelector('h2').textContent = 'Bewertung noch nicht vollständig';
  summary.querySelector('p').textContent = 'Erforderliche Eingaben fehlen. Die Bewertung aktualisiert sich automatisch, sobald alle notwendigen Angaben vorliegen.';
  $('#results-list').innerHTML = errors.length
    ? `<div class="live-incomplete-note"><strong>Noch erforderlich:</strong><ul>${errors.map(error => `<li>${escapeHtml(error)}</li>`).join('')}</ul></div>`
    : '';
  $('#download-pdf').disabled = true;
}

function renderResults(data) {
  const primary = data.primary;
  updateFilletGeometryStatus(data.geometry?.geometry_status?.status);
  setEvaluationState(primary.status);
  const summary = $('#result-summary');
  summary.querySelector('h2').textContent = primary.status === 'pass'
    ? 'Anforderung erfüllt'
    : primary.status === 'fail'
      ? 'Anforderung nicht erfüllt'
      : 'Bewertung noch nicht abschließend';
  const combined = data.geometry?.combined_features ? ' · mehrere geometrische Merkmale getrennt bewertet' : '';
  summary.querySelector('p').innerHTML = `Prüfstatus: <strong>${inspectionLabels[primary.inspection_status] || primary.inspection_status}</strong> · 2023 SOLL: <strong>${primary.required_quality}</strong> · IST: <strong>${primary.achieved_quality || '—'}</strong>${combined}`;
  const comparisonById = Object.fromEntries((data.comparison?.results || []).map(item => [item.rule_id,item]));
  $('#results-list').innerHTML = primary.results.map(item => {
    const comp = comparisonById[item.rule_id];
    const messages = item.messages.map(message => `<span>${escapeHtml(message)}</span>`).join(' ');
    return `<article class="result-card panel result-status-${item.status}">
      <div class="rule-number">${item.table_no}</div>
      <div><h3>${escapeHtml(item.name)}</h3>
        <div class="result-editions">
          <div class="result-edition-row edition-2023"><span class="edition-label">2023</span><span class="badge ${item.status}">${escapeHtml(statusText(item, '2023'))}</span></div>
          ${comp ? `<div class="result-edition-row edition-2014"><span class="edition-label">2014</span><span class="badge ${comp.status}">${escapeHtml(statusText(comp, '2014'))}</span></div>` : ''}
        </div>
        <p class="field-help">${messages}</p>${item.formula ? `<p class="field-help"><strong>Formel 2023:</strong> ${escapeHtml(item.formula)}</p>` : ''}
        ${comp?.formula ? `<p class="field-help comparison-formula"><strong>Formel 2014:</strong> ${escapeHtml(comp.formula)}</p>` : ''}
      </div>
      <div class="metric"><small>Messwert / maßgebende Grenze 2023</small><strong>${valueText(item)}</strong>${comp ? `<small class="comparison-metric">2014: ${valueText(comp)}</small>` : ''}</div>
    </article>`;
  }).join('');
  $('#download-pdf').disabled = false;
}

async function evaluateLive() {
  if (!state.initialized || !state.service || state.liveBusy) return;
  const errors = frontendValidation();
  if (errors.length) {
    showAlert([]);
    renderIncompleteState(errors);
    return;
  }
  state.liveBusy = true;
  try {
    const payload = collectPayload();
    const data = state.service.evaluatePayload(payload);
    state.lastPayload = payload;
    state.lastResult = data;
    renderResults(data);
    showAlert([]);
  } catch (error) {
    state.lastPayload = null;
    state.lastResult = null;
    renderIncompleteState([]);
    showAlert(String(error.message || error).split('\n'));
  } finally {
    state.liveBusy = false;
  }
}

function scheduleLiveEvaluation(delay = 300) {
  if (!state.initialized) return;
  window.clearTimeout(state.liveTimer);
  state.liveTimer = window.setTimeout(evaluateLive, delay);
}

function downloadPdf() {
  if (!state.lastResult) return;
  const button = $('#download-pdf');
  button.disabled = true;
  button.textContent = 'Bericht wird geöffnet …';
  try {
    openReport(state.lastResult, state.config);
  } catch (error) {
    showAlert(String(error.message || error).split('\n'));
  } finally {
    button.disabled = false;
    button.textContent = 'pdf-Bericht';
  }
}

function bindStaticInputs() {
  $$('input[name="joint_type"]').forEach(input => input.addEventListener('change', updateJointVisuals));
  $$('input[name="required_quality"]').forEach(input => input.addEventListener('change', () => {
    renderCriteria();
    scheduleLiveEvaluation();
  }));
  $('#geo-angle').addEventListener('input', () => syncAutomaticFilletMeasurements());
  $('#geo-a').addEventListener('input', () => syncAutomaticFilletMeasurements());
  $('#geo-t').addEventListener('input', () => { updateConditionalFields(); scheduleLiveEvaluation(); });
  $('#compare_2014').addEventListener('change', () => scheduleLiveEvaluation());
  $('#access_face').addEventListener('change', () => { renderCriteria(); scheduleLiveEvaluation(); });
  $('#access_root').addEventListener('change', () => { renderCriteria(); scheduleLiveEvaluation(); });
  $('#download-pdf').addEventListener('click', downloadPdf);
  $$('.step[data-target]').forEach(step => step.addEventListener('click', () => document.getElementById(step.dataset.target)?.scrollIntoView({behavior:'smooth', block:'start'})));
  ['#report_id','#inspection_date','#wps','#component','#weld_id','#inspector','#location','#notes'].forEach(selector => {
    $(selector)?.addEventListener('input', () => {
      if (state.lastResult) scheduleLiveEvaluation(450);
    });
  });
}

async function init() {
  $('#inspection_date').value = new Date().toISOString().slice(0,10);
  $('#compare_2014').checked = true;
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
    $('#download-pdf').disabled = true;
    return;
  }
  $('#footer-library').textContent = `Regelbibliothek ${state.config.library.version} · ${state.config.criteria.length} aktive V1-Kriterien · Berechnung lokal im Browser`;
  document.body.classList.add((state.config.app_mode || 'test') !== 'production' ? 'test-mode' : 'production-mode');
  updateJointVisuals();
  bindStaticInputs();
  state.initialized = true;
  renderIncompleteState(frontendValidation());
  scheduleLiveEvaluation(0);
}

document.addEventListener('DOMContentLoaded', init);


import {
  requirementText as formatRequirement,
  actualText as formatActual,
  assessmentText as formatAssessment,
  detailsText as formatDetails,
} from './result-format.js?v=044d1e9cde1f';

function renderEditionResultRow(item, edition) {
  if (!item) return '';
  return `<div class="result-edition-row edition-${edition}">
    <div class="edition-label">${edition}</div>
    <div class="result-value"><small>SOLL</small><strong>${escapeHtml(formatRequirement(item))}</strong></div>
    <div class="result-value"><small>IST</small><strong>${escapeHtml(formatActual(item))}</strong></div>
    <div class="result-value result-assessment ${escapeHtml(item.status)}"><small>Bewertung</small><strong>${escapeHtml(formatAssessment(item))}</strong></div>
  </div>`;
}

function renderResultDetails(item, comparison) {
  const primaryDetails = formatDetails(item);
  const comparisonDetails = formatDetails(comparison);
  if (!primaryDetails.length && !comparisonDetails.length) return '';
  const list = (edition, values) => values.length
    ? `<div><strong>${edition}</strong><ul>${values.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul></div>`
    : '';
  return `<details class="result-details"><summary>Details und Berechnungsgrundlage anzeigen</summary>${list('2023', primaryDetails)}${list('2014', comparisonDetails)}</details>`;
}

renderResults = function renderResultsSemantic(data) {
  const primary = data.primary;
  updateFilletGeometryStatus(data.geometry?.geometry_status?.status);
  setEvaluationState(primary.status);
  const summary = $('#result-summary');
  summary.querySelector('h2').textContent = primary.status === 'pass'
    ? 'Anforderung erfüllt'
    : primary.status === 'fail'
      ? 'Anforderung nicht erfüllt'
      : 'Bewertung noch nicht abschließend';
  const combined = data.geometry?.combined_features ? ' | mehrere geometrische Merkmale getrennt bewertet' : '';
  summary.querySelector('p').innerHTML = `Prüfstatus: <strong>${inspectionLabels[primary.inspection_status] || primary.inspection_status}</strong> | 2023 SOLL: <strong>${primary.required_quality}</strong> | Bewertung: <strong>${primary.achieved_quality ? `${primary.achieved_quality} erreicht` : statusLabels[primary.status] || primary.status}</strong>${combined}`;
  const comparisonById = Object.fromEntries((data.comparison?.results || []).map(item => [item.rule_id, item]));
  $('#results-list').innerHTML = primary.results.map(item => {
    const comparison = comparisonById[item.rule_id];
    return `<article class="result-card panel result-status-${escapeHtml(item.status)}">
      <div class="rule-number">${escapeHtml(item.table_no)}</div>
      <div class="result-card-content">
        <h3>${escapeHtml(item.name)}</h3>
        <div class="result-editions">
          ${renderEditionResultRow(item, '2023')}
          ${renderEditionResultRow(comparison, '2014')}
        </div>
        ${renderResultDetails(item, comparison)}
      </div>
    </article>`;
  }).join('');
  $('#download-pdf').disabled = false;
};

function normalizeVisibleSeparators(root = document) {
  const footer = root.querySelector?.('#footer-library');
  if (footer?.textContent?.includes(' · ')) footer.textContent = footer.textContent.replaceAll(' · ', ' | ');
}

const footerLibrary = document.querySelector('#footer-library');
if (footerLibrary) {
  new MutationObserver(() => normalizeVisibleSeparators()).observe(footerLibrary, { childList: true, characterData: true, subtree: true });
  normalizeVisibleSeparators();
}

// Ergänzung des vollständigen UI-Codes um Modellbeschriftungen und die Headergrafik.
aASourceLabels.model = 'aus der interpolierten Modellkontur';

function applyModelFieldLabels() {
  const labels = {
    'geo-z1': 'Messwert z1 am Übergang Bauteil 1',
    'geo-z2': 'Messwert z2 am Übergang Bauteil 2',
    'geo-notch1': 'Einbrandkerbe 1 an Bauteil 1',
    'geo-notch2': 'Einbrandkerbe 2 an Bauteil 2',
    'geo-aA': 'Modellierte tatsächliche Kehlnahtdicke aA',
  };
  Object.entries(labels).forEach(([id, text]) => {
    const input = document.getElementById(id);
    const label = input?.closest('label');
    if (!label) return;
    const firstTextNode = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (firstTextNode) firstTextNode.textContent = `${text}\n    `;
  });
  document.getElementById('direct-h-field')?.classList.add('hidden');
  document.getElementById('direct-aA-field')?.classList.add('hidden');
}

function ensureHeaderGraphic() {
  const target = document.getElementById('joint-illustration');
  if (!target) return;
  target.style.display = 'grid';
  target.style.minHeight = '120px';
  target.style.backgroundImage = `url("${new URL('./graphics/header.svg', import.meta.url)}")`;
  target.style.backgroundPosition = 'center';
  target.style.backgroundRepeat = 'no-repeat';
  target.style.backgroundSize = 'contain';
}

queueMicrotask(() => {
  ensureHeaderGraphic();
  applyModelFieldLabels();
  refreshGeometry({schedule:false});
});

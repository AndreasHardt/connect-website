import {
  formatNumber,
  requirementText,
  actualText,
  assessmentText,
  statusLabel,
} from './result-format.js?v=044d1e9cde1f';
import { filletGeometrySvg } from './fillet-geometry-svg.js?v=ab8ab806d448';

const inspectionLabels = {
  complete: 'vollständig',
  one_sided: 'einseitig',
  not_assessable: 'nicht bewertbar',
};
const aASourceLabels = {
  legs: 'aus dem kleineren Schenkel',
  middle: 'aus dem mittleren Messwert',
  direct: 'direkt gemessen',
  model: 'aus der interpolierten Modellkontur',
};
const profileLabels = {
  straight: 'gerades Profil',
  convex: 'Überhöhung',
  concave: 'Unterwölbung',
};
const geometryStatusLabels = {
  pass: 'erfüllt',
  fail: 'nicht erfüllt',
  incomplete: 'noch unvollständig',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));
}

function mm(value) {
  return Number.isFinite(Number(value)) ? `${formatNumber(value)} mm` : '—';
}

function degree(value) {
  return Number.isFinite(Number(value)) ? `${formatNumber(value)}°` : '—';
}

function geometryRows(geometry, jointType) {
  if (jointType === 'Stumpfnaht') {
    return `<tr><td>Bauteildicke t</td><td>${mm(geometry.t)}</td><td>Gemessene Nahtdicke s</td><td>${mm(geometry.s)}</td></tr>
      <tr><td>Gemessene Nahtbreite b</td><td>${mm(geometry.b)}</td><td></td><td></td></tr>`;
  }
  const profile = profileLabels[geometry.profile_class] || '—';
  const source = aASourceLabels[geometry.aA_source] || '—';
  const geometryStatus = geometryStatusLabels[geometry.geometry_status?.status] || geometryStatusLabels.incomplete;
  return `<tr><td>Bauteildicke t</td><td>${mm(geometry.t)}</td><td>Nenn-Kehlnahtdicke a</td><td>${mm(geometry.a)}</td></tr>
    <tr><td>Bauteilwinkel γ</td><td>${degree(geometry.gamma)}</td><td>Messtechnische Toleranz</td><td>${mm(geometry.tolerance_mm)}</td></tr>
    <tr><td>Schenkellänge z1</td><td>${mm(geometry.z1)}</td><td>Schenkellänge z2</td><td>${mm(geometry.z2)}</td></tr>
    <tr><td>Höhenmesswert m</td><td>${mm(geometry.m)}</td><td>Vergleichshöhe m0</td><td>${mm(geometry.m0)}</td></tr>
    <tr><td>Nahtbreite b</td><td>${mm(geometry.b)}</td><td>Schenkelbezogene Kehlnahtdicke az</td><td>${mm(geometry.az)}</td></tr>
    <tr><td>Profilabweichung</td><td>${escapeHtml(profile)} | ${mm(geometry.profile_h)}</td><td>Ungleichschenkligkeit hz</td><td>${mm(geometry.asymmetry_h)}</td></tr>
    <tr><td>Tatsächliche Kehlnahtdicke aA</td><td>${mm(geometry.aA)}</td><td>Ermittlungsart</td><td>${escapeHtml(source)}</td></tr>
    <tr><td>Direkt gemessenes aA</td><td>${mm(geometry.direct_aA)}</td><td>Direkt gemessene Überhöhung h</td><td>${mm(geometry.direct_h)}</td></tr>
    <tr><td>Geometriestatus aus Nr. 1.10, 1.16, 1.20 und 1.21</td><td>${escapeHtml(geometryStatus)}</td><td>Messlinie</td><td>Wurzelpunkt bis m auf der Winkelhalbierenden</td></tr>
    <tr><td>Einbrandkerbe 1 an Bauteil 1 (horizontal, z1)</td><td>${mm(geometry.notch1)}</td><td>Einbrandkerbe 2 an Bauteil 2 (senkrecht/abgewinkelt, z2)</td><td>${mm(geometry.notch2)}</td></tr>`;
}


function geometryFigure(geometry, jointType) {
  if (jointType !== 'Kehlnaht') return '';
  const svg = filletGeometrySvg(
    geometry,
    geometry.a,
    geometry.geometry_status?.status,
  );
  if (!svg) return '';
  return `<figure class="report-geometry-figure">
    ${svg}
    <figcaption class="report-geometry-caption">Grau: Sollkontur | Schwarz: modellierte Istkontur | Grün/Rot/Grau: maßlicher Geometriestatus nach RGL-01</figcaption>
  </figure>`;
}
function messagesText(item) {
  return (item?.messages || []).map(message => `<div>${escapeHtml(message)}</div>`).join('') || '—';
}

function statusText(item) {
  if (!item) return '—';
  return `<span class="status-text ${escapeHtml(item.status)}">${escapeHtml(assessmentText(item))}</span>`;
}

function resultRows(result, otherResult) {
  const otherById = Object.fromEntries((otherResult?.results || []).map(item => [item.rule_id, item]));
  return (result?.results || []).map(item => {
    const other = otherById[item.rule_id];
    return `<tr>
      <td>${escapeHtml(item.table_no)}</td>
      <td><strong>${escapeHtml(item.name)}</strong><div class="small">${escapeHtml(item.ui?.section || '')}</div></td>
      <td>${item.formula ? escapeHtml(item.formula) : '—'}</td>
      <td>${escapeHtml(requirementText(item))}</td>
      <td>${escapeHtml(actualText(item))}</td>
      <td>${messagesText(item)}</td>
      <td>${statusText(item)}</td>
      <td class="secondary-status">${statusText(other)}</td>
    </tr>`;
  }).join('');
}

function reportHeader(report, access, result, edition, config, today) {
  return `<header><div class="brand">${escapeHtml(config.title)}</div><div class="subtitle">${escapeHtml(config.subtitle)}</div><div class="meta">${escapeHtml(config.platform || 'Hardt-Wiehl Connect')} | ${escapeHtml(config.domain)}</div></header>
    <h1>${edition === 2023 ? 'Bericht nach DIN EN ISO 5817:2023' : 'Vergleichsbericht nach DIN EN ISO 5817:2014'}</h1>
    ${edition === 2014 ? '<div class="legacy-notice"><strong>Vergleich nach älterer Normausgabe.</strong> Maßgebend bleibt die Ausgabe 2023.</div>' : ''}
    <table class="info">
      <tr><td>Berichtsnummer</td><td>${escapeHtml(report.report_id || '—')}</td><td>Prüfdatum</td><td>${escapeHtml(report.inspection_date || today)}</td></tr>
      <tr><td>WPS</td><td>${escapeHtml(report.wps || '—')}</td><td>Bauteil</td><td>${escapeHtml(report.component || '—')}</td></tr>
      <tr><td>Nahtbezeichnung</td><td>${escapeHtml(report.weld_id || '—')}</td><td>Prüfer</td><td>${escapeHtml(report.inspector || '—')}</td></tr>
      <tr><td>Prüfort</td><td>${escapeHtml(report.location || '—')}</td><td>Nahtart</td><td>${escapeHtml(result.joint_type)}</td></tr>
      <tr><td>Normausgabe</td><td>DIN EN ISO 5817:${edition}</td><td>SOLL</td><td>${escapeHtml(result.required_quality)}</td></tr>
      <tr><td>Zugänglichkeit</td><td colspan="3">Deckseite: ${access.face ? 'ja' : 'nein'}; Wurzelseite: ${access.root ? 'ja' : 'nein'}</td></tr>
    </table>
    <div class="summary"><div><strong>Prüfstatus</strong><span>${escapeHtml(inspectionLabels[result.inspection_status] || result.inspection_status)}</span></div><div><strong>Gesamtergebnis</strong><span>${escapeHtml(statusLabel(result.status))}</span></div><div><strong>Bewertung</strong><span>${escapeHtml(result.achieved_quality ? `${result.achieved_quality} erreicht` : statusLabel(result.status))}</span></div></div>`;
}

function reportSection({ edition, result, otherResult, report, geometry, access, config, today, isTest }) {
  const isLegacy = edition === 2014;
  const testNotice = isTest ? '<div class="test-notice"><strong>TESTSYSTEM:</strong> Dieser Bericht ist noch nicht zur produktiven Verwendung freigegeben.</div>' : '';
  const combinedNotice = geometry.combined_features
    ? '<div class="note"><strong>Kombinierte Geometriemerkmale:</strong> Ungleichschenkligkeit und Profilabweichung treten im selben Querschnitt auf. Die Merkmale wurden nach den jeweiligen Einzelkriterien bewertet und nicht automatisch summiert.</div>'
    : '';
  return `<section class="report-section ${isLegacy ? 'comparison-report' : 'current-report'}" data-edition="${edition}">
    ${isTest ? '<div class="watermark">TESTBERICHT</div>' : ''}<div class="report-content">
    ${testNotice}${reportHeader(report, access, result, edition, config, today)}
    <div class="traceability">Regelbibliothek ${escapeHtml(result.library_version)} | Inhaltshash ${escapeHtml(result.library_content_sha256.slice(0, 16))}… | Assistentversion ${escapeHtml(config.prototype_version)}. Die Bewertung gilt nur für den dokumentierten, zugänglichen Prüfbereich.</div>
    <h2>Vorgaben, Messung und Berechnung</h2><table class="info">${geometryRows(geometry, result.joint_type)}</table>
    ${geometryFigure(geometry, result.joint_type)}
    ${combinedNotice}
    <h2>Einzelergebnisse – Ausgabe ${edition}</h2>
    <div class="table-context">SOLL bezeichnet die Anforderung, IST den festgestellten Befund oder Messwert. Die letzte Spalte zeigt den direkten Vergleich zur Ausgabe ${edition === 2023 ? 2014 : 2023}.</div>
    <table class="result-table"><thead><tr><th>Nr.</th><th>Kriterium</th><th>Berechnungsgrundlage</th><th>SOLL</th><th>IST</th><th>Bemerkung</th><th>Status ${edition}</th><th class="secondary-status">Status ${edition === 2023 ? 2014 : 2023}</th></tr></thead><tbody>${resultRows(result, otherResult)}</tbody></table>
    ${report.notes ? `<h2>Bemerkungen zum Nahtabschnitt</h2><div class="note">${escapeHtml(report.notes)}</div>` : ''}
    <div class="signature"><div>Prüfer / Datum</div><div>Freigabe / Datum</div></div>
    <div class="report-actions"><button class="print" type="button" data-print-edition="${edition}">Bericht ${edition} drucken</button></div>
    </div></section>`;
}

function loadStoredReport() {
  const key = decodeURIComponent(location.hash.slice(1));
  if (!key) throw new Error('Die Berichtsdaten konnten nicht zugeordnet werden. Bitte den Bericht erneut aus der Prüfung öffnen.');
  const raw = localStorage.getItem(key);
  if (!raw) throw new Error('Die Berichtsdaten sind nicht mehr verfügbar. Bitte den Bericht erneut aus der Prüfung öffnen.');
  localStorage.removeItem(key);
  return JSON.parse(raw);
}

function renderReport(payload) {
  const { data, config } = payload;
  const primary = data.primary;
  const comparison = data.comparison;
  const report = data.report || {};
  const geometry = data.geometry || {};
  const access = data.accessibility || {};
  const isTest = (data.app_mode || config.app_mode) !== 'production';
  const today = new Date().toISOString().slice(0, 10);
  document.title = report.report_id || 'ISO5817-Prüfbericht';
  document.querySelector('#reports').innerHTML =
    reportSection({ edition: 2023, result: primary, otherResult: comparison, report, geometry, access, config, today, isTest })
    + (comparison ? reportSection({ edition: 2014, result: comparison, otherResult: primary, report, geometry, access, config, today, isTest }) : '');
}

function printEdition(edition) {
  document.body.dataset.printEdition = String(edition);
  const cleanup = () => { delete document.body.dataset.printEdition; };
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 1000);
}

function returnToInspection() {
  if (window.opener && !window.opener.closed) {
    window.opener.focus();
    window.close();
    window.setTimeout(() => location.assign('./'), 250);
    return;
  }
  location.assign('./');
}

function showError(error) {
  const element = document.querySelector('#report-error');
  element.hidden = false;
  element.textContent = String(error?.message || error);
}

try {
  renderReport(loadStoredReport());
} catch (error) {
  showError(error);
}

document.querySelector('#back-to-inspection').addEventListener('click', returnToInspection);
document.querySelector('#reports').addEventListener('click', event => {
  const button = event.target.closest('[data-print-edition]');
  if (button) printEdition(button.dataset.printEdition);
});

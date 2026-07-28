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

function number(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? '—'
    : Number(value).toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1});
}

function mm(value) {
  const formatted = number(value);
  return formatted === '—' ? formatted : `${formatted} mm`;
}

function degree(value) {
  const formatted = number(value);
  return formatted === '—' ? formatted : `${formatted}°`;
}

function measureCell(item) {
  const measured = item?.measured_value;
  const limit = item?.governing_limit;
  let measuredText = '—';
  if (measured === true) measuredText = 'ja';
  else if (measured === false) measuredText = 'nein';
  else if (measured !== null && measured !== undefined) measuredText = number(measured);
  const limitText = limit === null || limit === undefined ? '' : `Grenze ${number(limit)}`;
  return [measuredText, limitText].filter(Boolean).join(' / ');
}

function statusBadge(item) {
  if (!item) return '<span class="badge not_applicable">—</span>';
  const label = statusLabels[item.status] || item.status;
  return `<span class="badge ${escapeHtml(item.status)}">${escapeHtml(label)}</span>`;
}

function remarkCell(item) {
  if (!item) return '—';
  const messages = (item.messages || []).map(message => `<div>${escapeHtml(message)}</div>`).join('');
  const formula = item.formula ? `<div class="small"><strong>Formel:</strong> ${escapeHtml(item.formula)}</div>` : '';
  return `${messages}${formula}` || '—';
}

function geometryRows(geometry, jointType) {
  if (jointType === 'Stumpfnaht') {
    return `<tr><td>Bauteildicke t</td><td>${mm(geometry.t)}</td><td>Gemessene Nahtdicke s</td><td>${mm(geometry.s)}</td></tr>
      <tr><td>Gemessene Nahtbreite b</td><td>${mm(geometry.b)}</td><td></td><td></td></tr>`;
  }
  const profile = profileLabels[geometry.profile_class] || '—';
  const source = aASourceLabels[geometry.aA_source] || '—';
  return `<tr><td>Bauteildicke t</td><td>${mm(geometry.t)}</td><td>Nenn-Kehlnahtdicke a</td><td>${mm(geometry.a)}</td></tr>
    <tr><td>Bauteilwinkel γ</td><td>${degree(geometry.gamma)}</td><td>Messtechnische Toleranz</td><td>${mm(geometry.tolerance_mm)}</td></tr>
    <tr><td>Schenkellänge z1</td><td>${mm(geometry.z1)}</td><td>Schenkellänge z2</td><td>${mm(geometry.z2)}</td></tr>
    <tr><td>Höhenmesswert m</td><td>${mm(geometry.m)}</td><td>Vergleichshöhe m0</td><td>${mm(geometry.m0)}</td></tr>
    <tr><td>Nahtbreite b</td><td>${mm(geometry.b)}</td><td>Schenkelbezogene Kehlnahtdicke az</td><td>${mm(geometry.az)}</td></tr>
    <tr><td>Profilabweichung</td><td>${escapeHtml(profile)} · ${mm(geometry.profile_h)}</td><td>Ungleichschenkligkeit hz</td><td>${mm(geometry.asymmetry_h)}</td></tr>
    <tr><td>Tatsächliche Kehlnahtdicke aA</td><td>${mm(geometry.aA)}</td><td>Ermittlungsart</td><td>${escapeHtml(source)}</td></tr>
    <tr><td>Direkt gemessenes aA</td><td>${mm(geometry.direct_aA)}</td><td>Direkt gemessene Überhöhung h</td><td>${mm(geometry.direct_h)}</td></tr>
    <tr><td>Kerbentiefe Übergang 1</td><td>${mm(geometry.notch1)}</td><td>Kerbentiefe Übergang 2</td><td>${mm(geometry.notch2)}</td></tr>`;
}

function resultRows(primaryResults, comparisonResults, edition) {
  const primaryById = Object.fromEntries((primaryResults || []).map(item => [item.rule_id, item]));
  const comparisonById = Object.fromEntries((comparisonResults || []).map(item => [item.rule_id, item]));
  const base = edition === 2023 ? primaryResults : comparisonResults;
  return (base || []).map(item => {
    const item2023 = edition === 2023 ? item : primaryById[item.rule_id];
    const item2014 = edition === 2014 ? item : comparisonById[item.rule_id];
    const current = edition === 2023 ? item2023 : item2014;
    const statusPrimary = edition === 2023 ? item2023 : item2014;
    const statusSecondary = edition === 2023 ? item2014 : item2023;
    return `<tr>
      <td>${escapeHtml(current?.table_no || item.table_no)}</td>
      <td><strong>${escapeHtml(current?.name || item.name)}</strong><div class="small">${escapeHtml(current?.ui?.section || '')}</div></td>
      <td>${escapeHtml(measureCell(current))}</td>
      <td>${escapeHtml(current?.required_quality || '—')}</td>
      <td>${escapeHtml(current?.achieved_quality || '—')}</td>
      <td>${remarkCell(current)}</td>
      <td>${statusBadge(statusPrimary)}</td>
      <td class="secondary-status">${statusBadge(statusSecondary)}</td>
    </tr>`;
  }).join('');
}

function reportHeader(report, access, result, edition, config, today) {
  return `<header><div class="brand">${escapeHtml(config.title)}</div><div class="subtitle">${escapeHtml(config.subtitle)}</div><div class="meta">${escapeHtml(config.platform || 'Hardt-Wiehl Connect')} · ${escapeHtml(config.domain)}</div></header>
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
    <div class="summary"><div><strong>Prüfstatus</strong><span>${escapeHtml(inspectionLabels[result.inspection_status] || result.inspection_status)}</span></div><div><strong>Gesamtergebnis</strong><span>${escapeHtml(statusLabels[result.status] || result.status)}</span></div><div><strong>IST</strong><span>${escapeHtml(result.achieved_quality || '—')}</span></div></div>`;
}

function reportSection({edition, result, otherResult, report, geometry, access, config, today, testNotice, combinedNotice}) {
  const isLegacy = edition === 2014;
  return `<section class="report-section ${isLegacy ? 'comparison-report' : 'current-report'}" data-edition="${edition}">
    ${testNotice}
    ${reportHeader(report, access, result, edition, config, today)}
    <div class="traceability">Regelbibliothek ${escapeHtml(result.library_version)} · Inhaltshash ${escapeHtml(result.library_content_sha256.slice(0,16))}… · Assistentversion ${escapeHtml(config.prototype_version)}. Die Bewertung gilt nur für den dokumentierten, zugänglichen Prüfbereich.</div>
    <h2>Vorgaben, Messung und Berechnung</h2><table class="info">${geometryRows(geometry, result.joint_type)}</table>
    ${combinedNotice}
    <h2>Einzelergebnisse – Ausgabe ${edition}</h2>
    <div class="table-context">Alle Spalten außer der letzten Statusspalte beziehen sich auf die Ausgabe ${edition}. Die letzte Spalte zeigt den direkten Vergleich zur Ausgabe ${edition === 2023 ? 2014 : 2023}.</div>
    <table class="result-table"><thead><tr><th>Nr.</th><th>Kriterium</th><th>Messwert / Grenze</th><th>SOLL</th><th>IST</th><th>Bemerkung</th><th>Status ${edition}</th><th class="secondary-status">Status ${edition === 2023 ? 2014 : 2023}</th></tr></thead><tbody>${resultRows(edition === 2023 ? result.results : otherResult.results, edition === 2014 ? result.results : otherResult?.results, edition)}</tbody></table>
    ${report.notes ? `<h2>Bemerkungen zum Nahtabschnitt</h2><div class="note">${escapeHtml(report.notes)}</div>` : ''}
    <div class="signature"><div>Prüfer / Datum</div><div>Freigabe / Datum</div></div>
    <div class="report-actions"><button class="print" type="button" onclick="printReport('${edition}')">Bericht ${edition} drucken</button></div>
  </section>`;
}

export function reportHtml(data, config) {
  const isTest = (data.app_mode || config.app_mode) !== 'production';
  const report = data.report || {};
  const geometry = data.geometry || {};
  const access = data.accessibility || {};
  const primary = data.primary;
  const comparison = data.comparison;
  const today = new Date().toISOString().slice(0, 10);
  const watermark = isTest ? '<div class="watermark">TESTBERICHT</div>' : '';
  const testNotice = isTest ? '<div class="test-notice"><strong>TESTSYSTEM:</strong> Dieser Bericht ist noch nicht zur produktiven Verwendung freigegeben.</div>' : '';
  const combinedNotice = geometry.combined_features
    ? '<div class="note"><strong>Kombinierte Geometriemerkmale:</strong> Ungleichschenkligkeit und Profilabweichung treten im selben Querschnitt auf. Die Merkmale wurden nach den jeweiligen Einzelkriterien bewertet und nicht automatisch summiert.</div>'
    : '';
  const primarySection = reportSection({edition:2023, result:primary, otherResult:comparison || {results:[]}, report, geometry, access, config, today, testNotice, combinedNotice});
  const comparisonSection = comparison
    ? reportSection({edition:2014, result:comparison, otherResult:primary, report, geometry, access, config, today, testNotice, combinedNotice})
    : '';

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.report_id || 'ISO5817-Prüfbericht')}</title>
  <style>
    @page { size:A4 landscape; margin:10mm; }
    :root{--navy:#173d5f;--blue:#246b99;--pale:#eaf3f8;--green:#1f7a4d;--red:#b33a3a;--amber:#a86b00;--ink:#15212b;--muted:#52606d;--line:#ccd8e0;--grey:#667784}
    *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:var(--ink);font-size:8.3pt;line-height:1.3;margin:0;background:#eef3f6}
    .watermark{position:fixed;inset:34% 0 auto;transform:rotate(-28deg);text-align:center;font-size:58pt;font-weight:900;color:rgba(179,58,58,.08);z-index:-1;letter-spacing:.08em}
    .screen-actions{position:sticky;top:0;z-index:5;display:flex;justify-content:flex-end;gap:8px;padding:9px 14px;background:#eef5f9;border-bottom:1px solid var(--line)}
    button{border:0;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer}.print{background:var(--blue);color:#fff}.close{background:#fff;color:var(--navy);border:1px solid var(--line)}
    .close-fallback{display:none;margin-right:auto;color:var(--red);font-weight:700}
    .reports{max-width:297mm;margin:0 auto;padding:12px}.report-section{background:#fff;padding:10mm;margin:0 auto 14px;border:1px solid var(--line);box-shadow:0 8px 28px rgba(23,61,95,.10)}
    .comparison-report{background:#eceff1;border-color:#b6c0c7}.comparison-report table,.comparison-report th,.comparison-report td{border-color:#b7c0c6}.comparison-report th{background:#d9dee2}.comparison-report .info td:nth-child(odd){background:#e1e5e8}
    header{border-bottom:3px solid var(--navy);padding-bottom:7px;margin-bottom:9px}.brand{font-size:18pt;font-weight:700;color:var(--navy)}.subtitle{color:var(--blue);font-size:9pt;font-weight:700}.meta{margin-top:5px;color:var(--muted);font-size:7.5pt}
    h1{font-size:13pt;color:var(--navy);margin:10px 0 6px}h2{font-size:10pt;color:var(--navy);margin:10px 0 5px}
    table{width:100%;border-collapse:collapse}thead{display:table-header-group}tr{break-inside:avoid}th{text-align:left;color:var(--navy);background:var(--pale);font-weight:700}th,td{border:1px solid var(--line);padding:4px 5px;vertical-align:top}.info td:nth-child(odd){width:17%;font-weight:700;background:#f7fafc}
    .summary{display:table;width:100%;margin:8px 0}.summary>div{display:table-cell;width:33.333%;border:1px solid var(--line);padding:7px}.summary strong{display:block;color:var(--muted);font-size:7.2pt;text-transform:uppercase}.summary span{display:block;font-size:11pt;font-weight:700;margin-top:2px}
    .result-table{font-size:7.1pt;table-layout:fixed}.result-table th:nth-child(1){width:5%}.result-table th:nth-child(2){width:17%}.result-table th:nth-child(3){width:12%}.result-table th:nth-child(4){width:6%}.result-table th:nth-child(5){width:6%}.result-table th:nth-child(6){width:28%}.result-table th:nth-child(7){width:13%}.result-table th:nth-child(8){width:13%}
    .secondary-status{background:#e3e7ea!important}.current-report .secondary-status{background:#edf0f2!important}.comparison-report .secondary-status{background:#dce8ef!important}
    .badge{display:inline-block;padding:2px 5px;border-radius:8px;font-size:6.8pt;font-weight:700;white-space:nowrap}.pass{color:#fff;background:var(--green)}.fail{color:#fff;background:var(--red)}.manual_review,.incomplete{color:#fff;background:var(--amber)}.not_applicable,.not_assessable{color:#fff;background:var(--grey)}
    .small{font-size:6.5pt;color:var(--muted);margin-top:2px}.note,.test-notice,.legacy-notice,.table-context{border-left:4px solid var(--blue);background:var(--pale);padding:6px 8px;margin:7px 0}.test-notice{border-color:var(--red);background:#fae8e8;color:#7d2929}.legacy-notice{border-color:var(--grey);background:#dde2e5}.table-context{font-size:7pt;color:var(--muted)}
    .traceability{margin:5px 0 7px;color:var(--muted);font-size:6.2pt}.signature{margin-top:15px;display:table;width:100%}.signature div{display:table-cell;width:48%;border-top:1px solid #5d6b75;padding-top:4px}.report-actions{display:flex;justify-content:flex-end;margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}
    @media print{
      body{background:#fff}.screen-actions,.report-actions,.close-fallback{display:none!important}.reports{max-width:none;padding:0}.report-section{box-shadow:none;border:0;margin:0;padding:0}
      body[data-print-edition="2023"] .report-section[data-edition="2014"],body[data-print-edition="2014"] .report-section[data-edition="2023"]{display:none!important}
      .comparison-report{background:#eceff1!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.secondary-status,.badge,.test-notice,.legacy-notice{ -webkit-print-color-adjust:exact;print-color-adjust:exact }
    }
  </style></head><body>${watermark}
  <div class="screen-actions"><span class="close-fallback" id="close-fallback">Dieser Tab kann vom Browser nicht automatisch geschlossen werden. Bitte schließen Sie ihn manuell.</span><button class="close" type="button" onclick="closeReport()">Schließen</button></div>
  <main class="reports">${primarySection}${comparisonSection}</main>
  <script>
    function printReport(edition){document.body.dataset.printEdition=String(edition);requestAnimationFrame(function(){window.print();});}
    window.addEventListener('afterprint',function(){delete document.body.dataset.printEdition;});
    function closeReport(){window.close();setTimeout(function(){if(window.closed)return;if(history.length>1){history.back();return;}document.getElementById('close-fallback').style.display='inline';},180);}
  </script></body></html>`;
}

export function openReport(data, config) {
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) throw new Error('Das Berichtfenster wurde vom Browser blockiert. Pop-ups für diese Seite zulassen.');
  reportWindow.document.open();
  reportWindow.document.write(reportHtml(data, config));
  reportWindow.document.close();
  reportWindow.focus();
}

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

function mm(value) {
  return value === null || value === undefined ? '-' : `${Number(value).toLocaleString('de-DE', {maximumFractionDigits: 2})} mm`;
}

function measure(value) {
  if (value === true) return 'ja';
  if (value === false) return 'nein';
  if (value === null || value === undefined) return '-';
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('de-DE', {maximumFractionDigits: 3}) : escapeHtml(value);
}

function resultRows(results) {
  return results.map(item => `<tr>
    <td>${escapeHtml(item.table_no)}</td>
    <td><strong>${escapeHtml(item.name)}</strong><div class="small">${escapeHtml(item.ui?.section || '')}</div></td>
    <td>${escapeHtml(item.required_quality)}</td>
    <td>${escapeHtml(item.achieved_quality || '-')}</td>
    <td><span class="badge ${item.status}">${escapeHtml(statusLabels[item.status] || item.status)}</span></td>
    <td>${measure(item.measured_value)}${item.governing_limit !== null ? ` / ${measure(item.governing_limit)}` : ''}${item.formula ? `<div class="small">${escapeHtml(item.formula)}</div>` : ''}</td>
    <td>${(item.messages || []).map(message => `<div class="rule-message">${escapeHtml(message)}</div>`).join('')}</td>
  </tr>`).join('');
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

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(report.report_id || 'ISO5817-Prüfbericht')}</title>
  <style>
    @page { size:A4; margin:14mm; @bottom-right { content:"Seite " counter(page) " / " counter(pages); font-size:8pt; color:#52606d; } }
    :root{--navy:#173d5f;--blue:#246b99;--pale:#eaf3f8;--green:#1f7a4d;--red:#b33a3a;--amber:#a86b00;--ink:#15212b;--muted:#52606d;--line:#ccd8e0}
    *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:var(--ink);font-size:9pt;line-height:1.35;margin:0;background:white}
    .watermark{position:fixed;inset:35% 0 auto;transform:rotate(-28deg);text-align:center;font-size:58pt;font-weight:900;color:rgba(179,58,58,.10);z-index:-1;letter-spacing:.08em}
    header{border-bottom:3px solid var(--navy);padding-bottom:8px;margin-bottom:10px}.brand{font-size:20pt;font-weight:700;color:var(--navy)}.subtitle{color:var(--blue);font-size:10pt;font-weight:700;letter-spacing:.03em}.meta{margin-top:6px;color:var(--muted);font-size:8pt}
    h1{font-size:14pt;color:var(--navy);margin:12px 0 7px}h2{font-size:11pt;color:var(--navy);margin:11px 0 5px}table{width:100%;border-collapse:collapse}th{text-align:left;color:var(--navy);background:var(--pale);font-weight:700}th,td{border:1px solid var(--line);padding:5px 6px;vertical-align:top}.info td:nth-child(odd){width:18%;font-weight:700;background:#f7fafc}
    .summary{display:table;width:100%;margin:9px 0}.summary>div{display:table-cell;width:33.333%;border:1px solid var(--line);padding:8px}.summary strong{display:block;color:var(--muted);font-size:8pt;text-transform:uppercase}.summary span{display:block;font-size:13pt;font-weight:700;margin-top:3px}
    .badge{display:inline-block;padding:2px 6px;border-radius:9px;font-size:7.5pt;font-weight:700;white-space:nowrap}.pass{color:#fff;background:var(--green)}.fail{color:#fff;background:var(--red)}.manual_review,.incomplete{color:#fff;background:var(--amber)}.not_applicable,.not_assessable{color:#fff;background:#667784}
    .result-table{font-size:8.1pt}.result-table th:nth-child(1){width:7%}.result-table th:nth-child(2){width:18%}.result-table th:nth-child(3){width:8%}.result-table th:nth-child(4){width:8%}.result-table th:nth-child(5){width:10%}.result-table th:nth-child(6){width:12%}.result-table th:nth-child(7){width:37%}.rule-message{color:var(--muted);margin-top:2px}.small{font-size:7.6pt;color:var(--muted)}
    .note,.test-notice{border-left:4px solid var(--blue);background:var(--pale);padding:7px 9px;margin:8px 0}.test-notice{border-color:var(--red);background:#fae8e8;color:#7d2929}.traceability{margin:5px 0 8px;color:var(--muted);font-size:6.5pt;line-height:1.2}.signature{margin-top:17px;display:table;width:100%}.signature div{display:table-cell;width:48%;border-top:1px solid #5d6b75;padding-top:4px}
    .screen-actions{position:sticky;top:0;display:flex;justify-content:flex-end;gap:8px;padding:9px;background:#eef5f9;border-bottom:1px solid var(--line)}.screen-actions button{border:0;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer}.print{background:var(--blue);color:#fff}.close{background:#fff;color:var(--navy);border:1px solid var(--line)!important}.page{padding:14mm;max-width:210mm;margin:0 auto}
    @media print {.screen-actions{display:none}.page{padding:0;max-width:none}}
  </style></head><body>${watermark}
  <div class="screen-actions"><button class="close" onclick="window.close()">Schließen</button><button class="print" onclick="window.print()">Drucken / als PDF speichern</button></div>
  <main class="page"><header><div class="brand">${escapeHtml(config.title)}</div><div class="subtitle">${escapeHtml(config.subtitle)}</div><div class="meta">${escapeHtml(config.platform || 'Hardt-Wiehl Connect')} · ${escapeHtml(config.domain)}</div></header>
  ${testNotice}
  <h1>Prüfbericht – Sichtprüfung und geometrische Bewertung</h1>
  <table class="info">
    <tr><td>Berichtsnummer</td><td>${escapeHtml(report.report_id || '-')}</td><td>Prüfdatum</td><td>${escapeHtml(report.inspection_date || today)}</td></tr>
    <tr><td>Bauteil</td><td>${escapeHtml(report.component || '-')}</td><td>Nahtbezeichnung</td><td>${escapeHtml(report.weld_id || '-')}</td></tr>
    <tr><td>Prüfer</td><td>${escapeHtml(report.inspector || '-')}</td><td>Prüfort</td><td>${escapeHtml(report.location || '-')}</td></tr>
    <tr><td>Nahtart</td><td>${escapeHtml(primary.joint_type)}</td><td>Normausgabe</td><td>DIN EN ISO 5817:2023</td></tr>
    <tr><td>Geforderte Gruppe</td><td>${escapeHtml(primary.required_quality)}</td><td>Zugänglichkeit</td><td>Deckseite: ${access.face ? 'ja' : 'nein'}; Wurzelseite: ${access.root ? 'ja' : 'nein'}</td></tr>
  </table>
  <div class="summary"><div><strong>Prüfstatus</strong><span>${escapeHtml(inspectionLabels[primary.inspection_status] || primary.inspection_status)}</span></div><div><strong>Gesamtergebnis</strong><span>${escapeHtml(statusLabels[primary.status] || primary.status)}</span></div><div><strong>Erreichte Gruppe</strong><span>${escapeHtml(primary.achieved_quality || '-')}</span></div></div>
  <div class="traceability">Regelbibliothek ${escapeHtml(primary.library_version)} · Inhaltshash ${escapeHtml(primary.library_content_sha256.slice(0,16))}… · Assistentversion ${escapeHtml(data.assistant_version)}. Die Bewertung gilt nur für den dokumentierten, zugänglichen Prüfbereich.</div>
  <h2>Grundgeometrie</h2><table class="info"><tr><td>Bauteildicke t</td><td>${mm(geometry.t)}</td><td>Nahtdicke s</td><td>${mm(geometry.s)}</td></tr><tr><td>Nenn-Kehlnahtdicke a</td><td>${mm(geometry.a)}</td><td>Tatsächliche Kehlnahtdicke aA</td><td>${mm(geometry.aA)}</td></tr><tr><td>Schenkellänge z1</td><td>${mm(geometry.z1)}</td><td>Schenkellänge z2</td><td>${mm(geometry.z2)}</td></tr></table>
  <h2>Einzelergebnisse – Ausgabe 2023</h2><table class="result-table"><thead><tr><th>Nr.</th><th>Kriterium</th><th>Soll</th><th>Erreicht</th><th>Status</th><th>Messwert / Grenze</th><th>Bewertung</th></tr></thead><tbody>${resultRows(primary.results)}</tbody></table>
  ${comparison ? `<h2>Optionaler Vergleich – Ausgabe 2014</h2><div class="note">Die Ausgabe 2014 wird nur vergleichend dargestellt. Maßgebend ist die Ausgabe 2023.</div><table class="result-table"><thead><tr><th>Nr.</th><th>Kriterium</th><th>Soll</th><th>Erreicht</th><th>Status</th><th>Messwert / Grenze</th><th>Bewertung</th></tr></thead><tbody>${resultRows(comparison.results)}</tbody></table>` : ''}
  ${report.notes ? `<h2>Bemerkungen</h2><div class="note">${escapeHtml(report.notes)}</div>` : ''}
  <div class="signature"><div>Prüfer / Datum</div><div>Freigabe / Datum</div></div></main></body></html>`;
}

export function openReport(data, config) {
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) throw new Error('Das Berichtfenster wurde vom Browser blockiert. Pop-ups für diese Seite zulassen.');
  reportWindow.opener = null;
  reportWindow.document.open();
  reportWindow.document.write(reportHtml(data, config));
  reportWindow.document.close();
  reportWindow.focus();
}

const STORAGE_PREFIX = 'iso5817-report-';

function reportKey() {
  if (globalThis.crypto?.randomUUID) return `${STORAGE_PREFIX}${globalThis.crypto.randomUUID()}`;
  return `${STORAGE_PREFIX}${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function openReport(data, config) {
  const key = reportKey();
  const payload = { data, config, stored_at: new Date().toISOString() };
  localStorage.setItem(key, JSON.stringify(payload));

  const reportUrl = new URL('./report.html', window.location.href);
  reportUrl.hash = encodeURIComponent(key);
  const reportWindow = window.open(reportUrl.href, '_blank');
  if (!reportWindow) {
    localStorage.removeItem(key);
    throw new Error('Das Berichtfenster wurde vom Browser blockiert. Pop-ups für diese Seite zulassen.');
  }
  reportWindow.focus();
}

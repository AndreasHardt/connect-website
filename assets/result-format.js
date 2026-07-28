const STATUS_LABELS = {
  pass: 'erfüllt',
  fail: 'nicht erfüllt',
  incomplete: 'Bewertung unvollständig',
  manual_review: 'Fachentscheidung erforderlich',
  not_applicable: 'nicht anwendbar',
  not_assessable: 'nicht bewertbar',
};

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

export function formatNumber(value) {
  return hasNumericValue(value)
    ? Number(value).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : '—';
}

function formulaText(item) {
  return String(item?.formula || '').trim();
}

function measurementSymbol(item) {
  const formula = formulaText(item);
  const match = formula.match(/^\s*([A-Za-zαβγΣ][A-Za-z0-9_αβγΣ]*)\s*(?:≤|≥|<|>|=)/u);
  return match?.[1] || 'Messwert';
}

function comparisonOperator(item) {
  const formula = formulaText(item);
  const match = formula.match(/(≤|≥|<|>)/u);
  return match?.[1] || '≤';
}

function valueUnit(item) {
  const formula = formulaText(item);
  const symbol = measurementSymbol(item);
  if (formula.includes('°') || ['α', 'β', 'γ'].includes(symbol)) return '°';
  if (formula.includes('%')) return '%';
  return 'mm';
}

function formatValue(value, unit) {
  const formatted = formatNumber(value);
  if (formatted === '—') return formatted;
  if (unit === '°') return `${formatted}°`;
  if (unit === '%') return `${formatted} %`;
  return `${formatted} mm`;
}

function lowerFirst(value) {
  return value ? `${value.charAt(0).toLocaleLowerCase('de-DE')}${value.slice(1)}` : value;
}

export function requirementText(item) {
  if (!item) return '—';
  const quality = item.required_quality || '—';
  const formula = formulaText(item);
  if (hasNumericValue(item.governing_limit)) {
    const symbol = measurementSymbol(item);
    return `${quality} | ${symbol} ${comparisonOperator(item)} ${formatValue(item.governing_limit, valueUnit(item))}`;
  }
  if (formula) return `${quality} | ${lowerFirst(formula)}`;
  return quality;
}

export function actualText(item) {
  if (!item) return '—';
  const measured = item.measured_value;
  if (typeof measured === 'boolean') {
    return `${item.name || 'Unregelmäßigkeit'} ${measured ? 'vorhanden' : 'nicht vorhanden'}`;
  }
  if (hasNumericValue(measured)) {
    return `${measurementSymbol(item)} = ${formatValue(measured, valueUnit(item))}`;
  }
  if (measured !== null && measured !== undefined && measured !== '') return String(measured);
  return '—';
}

export function assessmentText(item) {
  if (!item) return '—';
  const required = item.required_quality || '—';
  const achieved = item.achieved_quality || null;
  if (item.status === 'pass') return achieved ? `${required} erfüllt` : 'erfüllt';
  if (item.status === 'fail') {
    if (achieved) return `${required} nicht erfüllt | ${achieved} erfüllt`;
    return 'nicht zulässig | D nicht erfüllt';
  }
  return STATUS_LABELS[item.status] || String(item.status || '—');
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || String(status || '—');
}

export function detailsText(item) {
  if (!item) return [];
  const details = [...(item.messages || [])];
  if (item.formula) details.push(`Formel: ${item.formula}`);
  return details;
}

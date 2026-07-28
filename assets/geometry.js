export const GEOMETRY_TOLERANCE_MM = 0.1;

function finitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

export function computeFilletGeometry(input = {}) {
  const tolerance = Number.isFinite(input.tolerance) && input.tolerance >= 0
    ? input.tolerance
    : GEOMETRY_TOLERANCE_MM;
  const z1 = Number(input.z1);
  const z2 = Number(input.z2);
  const m = Number(input.m);
  const gamma = Number(input.gamma);
  const directAA = input.directAA === null || input.directAA === undefined || input.directAA === ''
    ? null
    : Number(input.directAA);
  const directH = input.directH === null || input.directH === undefined || input.directH === ''
    ? null
    : Number(input.directH);
  const errors = [];

  if (!finitePositive(z1)) errors.push('Schenkellänge z1 muss größer als 0 mm sein.');
  if (!finitePositive(z2)) errors.push('Schenkellänge z2 muss größer als 0 mm sein.');
  if (!finiteNonNegative(m)) errors.push('Der Höhenmesswert m auf der Winkelhalbierenden ist erforderlich.');
  if (!Number.isFinite(gamma) || gamma <= 0 || gamma >= 180) {
    errors.push('Der eingeschlossene Bauteilwinkel γ muss zwischen 0° und 180° liegen.');
  }

  if (errors.length) {
    return {
      valid: false,
      errors,
      tolerance,
      b: null,
      az: null,
      m0: null,
      profileH: null,
      asymmetryH: null,
      aA: null,
      reinforcementH: null,
      needsDirectAA: false,
      needsDirectH: false,
    };
  }

  const gammaRad = gamma * Math.PI / 180;
  const halfGamma = gammaRad / 2;
  const bSquared = z1 ** 2 + z2 ** 2 - 2 * z1 * z2 * Math.cos(gammaRad);
  const b = Math.sqrt(Math.max(0, bSquared));
  if (!finitePositive(b)) {
    return {
      valid: false,
      errors: ['Aus z1, z2 und γ konnte keine gültige Nahtbreite b berechnet werden.'],
      tolerance,
      b: null,
      az: null,
      m0: null,
      profileH: null,
      asymmetryH: null,
      aA: null,
      reinforcementH: null,
      needsDirectAA: false,
      needsDirectH: false,
    };
  }

  const az = Math.min(z1, z2) * Math.cos(halfGamma);
  const m0 = (2 * z1 * z2 * Math.cos(halfGamma)) / (z1 + z2);
  const profileFactor = ((z1 + z2) * Math.sin(halfGamma)) / b;
  const deltaM = m - m0;
  const profileH = deltaM * profileFactor;
  const asymmetryH = Math.abs(z1 - z2);
  const symmetric = asymmetryH <= tolerance;
  const profileClass = Math.abs(profileH) <= tolerance
    ? 'straight'
    : profileH > 0
      ? 'convex'
      : 'concave';
  const needsDirectAA = !symmetric && profileClass === 'concave';
  const needsDirectH = !symmetric && profileClass === 'convex';
  const validationErrors = [];

  if (directAA !== null) {
    if (!finitePositive(directAA)) validationErrors.push('Die direkt gemessene Kehlnahtdicke aA muss größer als 0 mm sein.');
    if (finitePositive(directAA) && directAA > az + tolerance) {
      validationErrors.push('Die direkt gemessene Kehlnahtdicke aA darf den durch den kleineren Schenkel begrenzten Wert az nicht überschreiten.');
    }
  }
  if (directH !== null) {
    if (!finiteNonNegative(directH)) validationErrors.push('Die direkt gemessene maximale Nahtüberhöhung h darf nicht negativ sein.');
    if (finiteNonNegative(directH) && directH + tolerance < Math.max(profileH, 0)) {
      validationErrors.push('Die direkt gemessene maximale Nahtüberhöhung h darf nicht kleiner als die am mittleren Messpunkt ermittelte lokale Überhöhung sein.');
    }
  }

  let aA = null;
  let aASource = null;
  if (needsDirectAA) {
    if (finitePositive(directAA) && directAA <= az + tolerance) {
      aA = directAA;
      aASource = 'direct';
    }
  } else if (symmetric && profileClass === 'concave') {
    aA = Math.min(az, m);
    aASource = 'middle';
  } else {
    aA = az;
    aASource = 'legs';
  }

  let reinforcementH = 0;
  let reinforcementSource = 'none';
  if (profileClass === 'convex') {
    if (needsDirectH) {
      reinforcementH = finiteNonNegative(directH) ? directH : null;
      reinforcementSource = reinforcementH === null ? null : 'direct';
    } else {
      reinforcementH = Math.max(profileH, 0);
      reinforcementSource = 'middle';
    }
  }

  return {
    valid: validationErrors.length === 0,
    errors: validationErrors,
    tolerance,
    z1,
    z2,
    m,
    gamma,
    b,
    az,
    m0,
    deltaM,
    profileFactor,
    profileH,
    asymmetryH,
    symmetric,
    profileClass,
    needsDirectAA,
    needsDirectH,
    directAA,
    directH,
    aA,
    aASource,
    reinforcementH,
    reinforcementSource,
    combinedFeatures: !symmetric && profileClass !== 'straight',
  };
}

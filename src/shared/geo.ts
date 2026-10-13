/** Haversine distance in kilometers between two lat/lng points. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Rough ETA minutes from distance + vendor base deliveryTime. */
export function estimateEtaMinutes(distanceKm: number, baseMinutes?: number | null): number {
  const travel = (distanceKm / 30) * 60; // 30 km/h avg
  const base = baseMinutes ?? 15;
  return Math.max(5, Math.round(travel + base));
}

export function formatDistanceEta(distanceKm: number, etaMin: number): string {
  const dist =
    distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`;
  const lo = Math.max(5, Math.floor(etaMin / 5) * 5);
  return `${dist} away • ${lo}–${lo + 5} min`;
}

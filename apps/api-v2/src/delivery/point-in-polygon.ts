export type NormalizedGeoJsonPolygon = {
  type: 'Polygon';
  coordinates: number[][][];
};

export function normalizeGeoJsonPolygon(input: unknown): NormalizedGeoJsonPolygon {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid GeoJSON polygon: payload must be an object.');
  }

  const raw = input as { type?: unknown; coordinates?: unknown };
  if (raw.type !== 'Polygon' || !Array.isArray(raw.coordinates)) {
    throw new Error('Invalid GeoJSON polygon: expected type Polygon.');
  }

  if (raw.coordinates.length === 0) {
    throw new Error('Invalid GeoJSON polygon: missing rings.');
  }

  const normalizedRings: number[][][] = raw.coordinates.map((ring, ringIndex) => {
    if (!Array.isArray(ring) || ring.length < 4) {
      throw new Error(`Invalid GeoJSON polygon: ring ${ringIndex} must have at least 4 points.`);
    }

    return ring.map((point, pointIndex) => {
      if (!Array.isArray(point) || point.length < 2) {
        throw new Error(`Invalid GeoJSON polygon: point ${pointIndex} in ring ${ringIndex} is invalid.`);
      }

      const lng = Number(point[0]);
      const lat = Number(point[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        throw new Error(`Invalid GeoJSON polygon: coordinates at ring ${ringIndex}, point ${pointIndex} are invalid.`);
      }

      return [lng, lat];
    });
  });

  return {
    type: 'Polygon',
    coordinates: normalizedRings,
  };
}

export function isPointInsidePolygon(lat: number, lng: number, polygon: NormalizedGeoJsonPolygon): boolean {
  const [outerRing, ...holes] = polygon.coordinates;
  if (!isPointInRing(lng, lat, outerRing)) {
    return false;
  }

  for (const hole of holes) {
    if (isPointInRing(lng, lat, hole)) {
      return false;
    }
  }

  return true;
}

function isPointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

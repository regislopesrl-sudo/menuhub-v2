import { Injectable } from '@nestjs/common';

export type RouteDistanceResult = {
  distanceMeters: number;
  durationSeconds: number;
};

export interface RouteDistanceProvider {
  getDistance(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<RouteDistanceResult>;
}

@Injectable()
class InMemoryRouteDistanceProvider implements RouteDistanceProvider {
  async getDistance(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<RouteDistanceResult> {
    const distanceMeters = haversineDistanceMeters(originLat, originLng, destLat, destLng);
    const durationSeconds = Math.round((distanceMeters / 1000 / 25) * 3600);

    return {
      distanceMeters: Math.round(distanceMeters),
      durationSeconds: Math.max(0, durationSeconds),
    };
  }
}

@Injectable()
export class RouteDistanceService {
  // Future provider adapters: OSRM, Google, Mapbox.
  constructor(private readonly provider: RouteDistanceProvider = new InMemoryRouteDistanceProvider()) {}

  getDistance(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<RouteDistanceResult> {
    return this.provider.getDistance(originLat, originLng, destLat, destLng);
  }
}

function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

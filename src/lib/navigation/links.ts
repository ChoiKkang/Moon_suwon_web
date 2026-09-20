export type NavigationTarget = {
  displayName: string;
  addressFull?: string | null;
  lat: number | null | undefined;
  lng: number | null | undefined;
};

export type PlaceNavigationLinks = {
  kakao: string;
  google: string;
  naver: string;
  hasExactCoordinates: boolean;
};

function normalizedCoordinate(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value;
}

function hasValidCoordinates(target: NavigationTarget): target is NavigationTarget & { lat: number; lng: number } {
  const lat = normalizedCoordinate(target.lat);
  const lng = normalizedCoordinate(target.lng);
  return lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function searchText(target: NavigationTarget): string {
  return target.addressFull?.trim() || target.displayName.trim();
}

function coordinateText(target: NavigationTarget & { lat: number; lng: number }): string {
  return `${target.lat},${target.lng}`;
}

export function buildPlaceNavigationLinks(target: NavigationTarget): PlaceNavigationLinks {
  if (hasValidCoordinates(target)) {
    const coordinate = coordinateText(target);
    const google = new URL('https://www.google.com/maps/dir/');
    google.searchParams.set('api', '1');
    google.searchParams.set('destination', coordinate);
    google.searchParams.set('travelmode', 'walking');

    return {
      kakao: `https://map.kakao.com/link/to/${encodeURIComponent(target.displayName)},${coordinate}`,
      google: google.toString(),
      // Naver's public web URL is stable for place search; users can start
      // walking directions from the resolved place without a browser-only SDK.
      naver: `https://map.naver.com/p/search/${encodeURIComponent(searchText(target))}`,
      hasExactCoordinates: true,
    };
  }

  const query = encodeURIComponent(searchText(target));
  const google = new URL('https://www.google.com/maps/search/');
  google.searchParams.set('api', '1');
  google.searchParams.set('query', searchText(target));

  return {
    kakao: `https://map.kakao.com/link/search/${query}`,
    google: google.toString(),
    naver: `https://map.naver.com/p/search/${query}`,
    hasExactCoordinates: false,
  };
}

export function buildCourseDirectionsUrl(stops: readonly NavigationTarget[]): string | null {
  if (stops.length < 2 || stops.some((stop) => !hasValidCoordinates(stop))) return null;

  const coordinateStops = stops as Array<NavigationTarget & { lat: number; lng: number }>;
  const origin = coordinateText(coordinateStops[0]);
  const destination = coordinateText(coordinateStops[coordinateStops.length - 1]);
  const waypoints = coordinateStops.slice(1, -1).map(coordinateText).join('|');
  const google = new URL('https://www.google.com/maps/dir/');
  google.searchParams.set('api', '1');
  google.searchParams.set('origin', origin);
  google.searchParams.set('destination', destination);
  if (waypoints) google.searchParams.set('waypoints', waypoints);
  google.searchParams.set('travelmode', 'walking');
  return google.toString();
}

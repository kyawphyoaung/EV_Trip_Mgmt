/** Single-shot geolocation — never uses watchPosition. */
export function getCurrentPositionOnce(
  options: PositionOptions = { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
): Promise<{ latitude: number; longitude: number } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      () => resolve(null),
      options,
    );
  });
}

export function formatLatLng(lat: number | null | undefined, lng: number | null | undefined): string {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return 'Location unavailable';
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

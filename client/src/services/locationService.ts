/**
 * Location Service: High-accuracy Reverse Geocoding and Live Location Tracking.
 * Uses OpenStreetMap Nominatim with BigDataCloud fallback for $0 cost, zero API key requirement.
 */

export interface GeocodedLocation {
  name: string;
  address: string;
  city?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

/**
 * Reverse geocodes latitude and longitude into human-readable place names and addresses.
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<GeocodedLocation> {
  // 1. Try OpenStreetMap Nominatim first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
    const res = await fetch(nominatimUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WibbyChat/1.0'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.address) {
        const addr = data.address;
        
        // Determine the most specific place / venue / landmark name
        const placeTitle =
          data.name ||
          addr.amenity ||
          addr.shop ||
          addr.tourism ||
          addr.leisure ||
          addr.building ||
          addr.historic ||
          addr.office ||
          addr.road ||
          addr.neighbourhood ||
          addr.suburb ||
          addr.village ||
          addr.town ||
          addr.city ||
          'Current Location';

        // Build a clean, structured address subtitle
        const addressParts: string[] = [];
        if (addr.road && addr.road !== placeTitle) addressParts.push(addr.road);
        if (addr.neighbourhood && addr.neighbourhood !== placeTitle && !addressParts.includes(addr.neighbourhood)) addressParts.push(addr.neighbourhood);
        if (addr.suburb && addr.suburb !== placeTitle && !addressParts.includes(addr.suburb)) addressParts.push(addr.suburb);
        if (addr.city || addr.town || addr.village) {
          const c = addr.city || addr.town || addr.village;
          if (c !== placeTitle && !addressParts.includes(c)) addressParts.push(c);
        }
        if (addr.state && !addressParts.includes(addr.state)) addressParts.push(addr.state);

        const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : (data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        const city = addr.city || addr.town || addr.village || addr.county || '';
        const country = addr.country || '';

        return {
          name: placeTitle,
          address: fullAddress,
          city,
          country,
          latitude,
          longitude
        };
      }
    }
  } catch (err) {
    console.warn('[WIBBY LOCATION] Nominatim reverse geocode note:', err);
  }

  // 2. High-speed Fallback: BigDataCloud Reverse Geocode Client API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
    const res = await fetch(bdcUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data) {
        const placeTitle = data.locality || data.principalSubdivision || data.city || 'Shared Location';
        const addressParts: string[] = [];
        if (data.locality && data.locality !== placeTitle) addressParts.push(data.locality);
        if (data.principalSubdivision) addressParts.push(data.principalSubdivision);
        if (data.countryName) addressParts.push(data.countryName);

        const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

        return {
          name: placeTitle,
          address: fullAddress,
          city: data.city || data.locality || '',
          country: data.countryName || '',
          latitude,
          longitude
        };
      }
    }
  } catch (err) {
    console.warn('[WIBBY LOCATION] Fallback reverse geocode note:', err);
  }

  // 3. Coordinate fallback if network/offline
  return {
    name: 'Shared Location',
    address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    latitude,
    longitude
  };
}

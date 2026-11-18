import 'server-only';
import { placeLocation } from './google';
import type { Office } from './data';

/** Resolve an office address chosen from autocomplete into what we store on the event. */
export async function officeFromPlace(placeId: string, sessionToken?: string): Promise<Office> {
  const place = await placeLocation(placeId.slice(0, 300), sessionToken?.slice(0, 100));
  return { address: place.address, lat: place.location.lat, lng: place.location.lng };
}

// Shapes shared by the server API and the browser.
// Nothing here ever carries another person's address or coordinates,
// except MyTrip.pickups, which is only sent to the assigned driver.

export type EventKind = 'food' | 'activity';
export type MidpointMode = 'fair' | 'total';
export type Role = 'driver' | 'rider' | 'transit' | 'bike' | 'walk';
export type TravelMode = 'drive' | 'transit' | 'bike' | 'walk';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PublicEvent {
  slug: string;
  title: string;
  startsAt: string; // ISO, the time everyone should arrive
  kind: EventKind;
  midpointMode: MidpointMode;
  chosenPlaceId: string | null;
}

export interface PublicPerson {
  id: string;
  name: string;
  role: Role;
  seats: number;
  likes: string[];
  color: string;
  hasLocation: boolean;
}

export interface Venue {
  placeId: string;
  name: string;
  address: string;
  location: LatLng;
  category: string;
  rating?: number;
  ratingCount?: number;
  priceLevel?: string;
  mapsUri?: string;
}

export interface RankedVenue extends Venue {
  fanIds: string[];
  avgMin: number;
  maxMin: number;
  worstId: string | null;
  score: number;
  kmFromMidpoint: number;
}

export interface Carpool {
  driverId: string;
  riderIds: string[];
  openSeats: number;
}

export interface PersonEstimate {
  minutes: number;
  mode: TravelMode;
  driverId?: string;
  unmatched?: boolean;
}

export interface Plan {
  midpoint: LatLng | null;
  midpointMaxMin: number | null;
  venues: RankedVenue[];
  selectedPlaceId: string | null;
  carpools: Carpool[];
  unmatchedRiderIds: string[];
  estimates: Record<string, PersonEstimate>;
  error?: string;
}

export interface Me {
  id: string;
  name: string;
  role: Role;
  seats: number;
  likes: string[];
  address: string;
  location: LatLng;
}

export interface EventBundle {
  event: PublicEvent;
  people: PublicPerson[];
  plan: Plan;
  me: Me | null;
  isOrganizer: boolean;
}

export interface TripStep {
  icon: string;
  text: string;
  detail?: string;
  highlight?: boolean;
}

export interface Pickup {
  name: string;
  address: string;
  at: string;
  location: LatLng;
}

export interface MyTrip {
  mode: TravelMode;
  minutes: number;
  km: number | null;
  leaveAt: string;
  arriveAt: string;
  polyline: string | null;
  steps: TripStep[];
  pickups?: Pickup[];
  driverName?: string;
  pickupAt?: string;
  unmatched?: boolean;
  estimated?: boolean;
  mapsUrl: string;
  home: LatLng;
  venue: { name: string; address: string; location: LatLng };
}

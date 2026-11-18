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

export type DateStatus = 'set' | 'voting'; // 'voting' = everyone marks the days they're free
export type StartFrom = 'home' | 'office' | 'other'; // 'other' = a private custom starting address
export type Rsvp = 'going' | 'maybe' | 'no';
export type Need = 'vegetarian' | 'vegan' | 'halal' | 'gluten_free' | 'nut_allergy' | 'step_free';
export type PriceCap = 'PRICE_LEVEL_INEXPENSIVE' | 'PRICE_LEVEL_MODERATE' | 'PRICE_LEVEL_EXPENSIVE';

export interface PublicEvent {
  slug: string;
  title: string;
  startsAt: string; // ISO, the time everyone should arrive (while voting: the date times are planned around)
  kind: EventKind;
  midpointMode: MidpointMode;
  chosenPlaceId: string | null;
  dateStatus: DateStatus;
  arriveTime: string; // 'HH:MM' in the outing's time zone
  timezone: string; // IANA, e.g. America/Toronto
  /** Shared starting point people can choose instead of home (set by the host). */
  office: { address: string; location: LatLng } | null;
  /** Host has locked in the day and the place: this is the final plan. */
  finalized: boolean;
  replyBy: string | null; // 'YYYY-MM-DD'
  maxPrice: PriceCap | null;
  addressesPurged: boolean;
}

/** Who is free on which day ('YYYY-MM-DD' -> participant ids). */
export interface Availability {
  byDay: Record<string, string[]>;
  bestDay: string | null;
  today: string;
}

export interface PublicPerson {
  id: string;
  name: string;
  role: Role;
  seats: number;
  likes: string[];
  color: string;
  hasLocation: boolean;
  startFrom: StartFrom;
  rsvp: Rsvp;
  /** Only present when this person switched on "Show my address to the group". */
  address?: string;
  home?: LatLng;
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
  veg?: boolean; // serves vegetarian food (only checked when someone needs it)
  stepFree?: boolean; // wheelchair-accessible entrance (only checked when someone needs it)
}

export interface RankedVenue extends Venue {
  fanIds: string[];
  voterIds: string[]; // people who voted for this place (only counted while it's in a tie)
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
  /** When several top places are equally liked, everyone votes among them. */
  vote: { open: boolean; placeIds: string[]; fans: number };
  error?: string;
}

/** Group-level counts only (never who), for booking and for filtering places. */
export type NeedsSummary = Partial<Record<Need, number>>;

/** Who still has something to do. Names only, nothing private. */
export interface Progress {
  noDays: string[]; // ids of people (going/maybe) who haven't marked any days
  noVote: string[]; // ids of people who haven't voted while a vote is open
  going: number;
  maybe: number;
  no: number;
}

export interface PlaceInfo {
  phone?: string;
  website?: string;
  reservable?: boolean;
  hours?: string[];
}

export interface Me {
  id: string;
  name: string;
  role: Role;
  seats: number;
  likes: string[];
  showAddress: boolean;
  startFrom: StartFrom;
  placeVote: string | null;
  rsvp: Rsvp;
  phone: string | null;
  needs: Need[];
  altStartAddress: string | null;
  address: string | null;
  location: LatLng | null;
}

export interface EventBundle {
  event: PublicEvent;
  people: PublicPerson[];
  plan: Plan;
  me: Me | null;
  isOrganizer: boolean;
  availability: Availability;
  needs: NeedsSummary;
  progress: Progress;
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
  phone?: string; // only if that rider added one
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
  driverPhone?: string; // only if the driver added one
  pickupAt?: string;
  unmatched?: boolean;
  estimated?: boolean;
  fromOffice?: boolean;
  mapsUrl: string;
  home: LatLng;
  venue: { name: string; address: string; location: LatLng };
}

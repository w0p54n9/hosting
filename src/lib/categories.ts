import type { EventKind, Need, PriceCap, Role, Rsvp, TravelMode } from './types';

export interface Category {
  key: string;   // what people pick and what is stored in `likes`
  icon: string;
  query: string; // what we send to Google Places Text Search
}

export const FOOD: Category[] = [
  { key: 'Italian', icon: '🍝', query: 'italian restaurant' },
  { key: 'Japanese', icon: '🍣', query: 'japanese restaurant' },
  { key: 'Korean BBQ', icon: '🥩', query: 'korean bbq' },
  { key: 'Mexican', icon: '🌮', query: 'mexican restaurant' },
  { key: 'Indian', icon: '🍛', query: 'indian restaurant' },
  { key: 'Thai', icon: '🍜', query: 'thai restaurant' },
  { key: 'Pizza', icon: '🍕', query: 'pizza restaurant' },
  { key: 'Vegetarian', icon: '🥗', query: 'vegetarian restaurant' },
  { key: 'Pub', icon: '🍺', query: 'pub' },
  { key: 'Dim sum', icon: '🥟', query: 'dim sum' },
  { key: 'Middle Eastern', icon: '🧆', query: 'middle eastern restaurant' },
  { key: 'Burgers', icon: '🍔', query: 'burger restaurant' },
];

export const ACTIVITIES: Category[] = [
  { key: 'Bowling', icon: '🎳', query: 'bowling alley' },
  { key: 'Karaoke', icon: '🎤', query: 'karaoke' },
  { key: 'Escape room', icon: '🗝️', query: 'escape room' },
  { key: 'Mini golf', icon: '⛳', query: 'mini golf' },
  { key: 'Board games', icon: '🎲', query: 'board game cafe' },
  { key: 'Arcade', icon: '🕹️', query: 'arcade bar' },
  { key: 'Climbing', icon: '🧗', query: 'climbing gym' },
  { key: 'Trivia', icon: '❓', query: 'trivia night bar' },
  { key: 'Pottery', icon: '🏺', query: 'pottery class' },
  { key: 'Axe throwing', icon: '🪓', query: 'axe throwing' },
];

export const ALL_CATEGORIES = [...FOOD, ...ACTIVITIES];
export const ALL_KEYS = new Set(ALL_CATEGORIES.map((c) => c.key));

export const categoriesFor = (kind: EventKind) => (kind === 'food' ? FOOD : ACTIVITIES);
export const iconFor = (key: string) => ALL_CATEGORIES.find((c) => c.key === key)?.icon ?? '📍';

export const ROLES: Record<Role, { label: string; icon: string }> = {
  driver: { label: 'Driving', icon: '🚗' },
  rider: { label: 'Needs a ride', icon: '🙋' },
  transit: { label: 'Transit', icon: '🚇' },
  bike: { label: 'Biking', icon: '🚲' },
  walk: { label: 'Walking', icon: '🚶' },
};

export const MODE_LABEL: Record<TravelMode, { label: string; icon: string }> = {
  drive: { label: 'driving', icon: '🚗' },
  transit: { label: 'transit', icon: '🚇' },
  bike: { label: 'biking', icon: '🚲' },
  walk: { label: 'walking', icon: '🚶' },
};

export const travelModeOf = (role: Role): TravelMode =>
  role === 'driver' || role === 'rider' ? 'drive' : role;

// Bright enough to read black initials on, and to stand out on the dark map.
export const PERSON_COLORS = [
  '#ff6b4a', '#4da3ff', '#c08bff', '#36e3b4', '#ffc23d', '#ff5fae',
  '#a6e85a', '#8fb2ff', '#ff9a5c', '#4fdcf0', '#e0a3ff', '#ffe36b',
];


export const NEEDS: { key: Need; label: string; icon: string; filters: boolean }[] = [
  { key: 'vegetarian', label: 'Vegetarian', icon: '🥕', filters: true },
  { key: 'vegan', label: 'Vegan', icon: '🌱', filters: true },
  { key: 'halal', label: 'Halal', icon: '🍖', filters: false },
  { key: 'gluten_free', label: 'Gluten-free', icon: '🌾', filters: false },
  { key: 'nut_allergy', label: 'Nut allergy', icon: '🥜', filters: false },
  { key: 'step_free', label: 'Step-free entrance', icon: '♿', filters: true },
];
export const NEED_KEYS = new Set<Need>(NEEDS.map((n) => n.key));

export const PRICE_CAPS: { key: PriceCap; label: string; levels: string[] }[] = [
  { key: 'PRICE_LEVEL_INEXPENSIVE', label: '$ only', levels: ['PRICE_LEVEL_INEXPENSIVE'] },
  { key: 'PRICE_LEVEL_MODERATE', label: 'Up to $$', levels: ['PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE'] },
  { key: 'PRICE_LEVEL_EXPENSIVE', label: 'Up to $$$', levels: ['PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE', 'PRICE_LEVEL_EXPENSIVE'] },
];

export const RSVPS: { key: Rsvp; label: string; short: string }[] = [
  { key: 'going', label: "I'm going", short: 'Going' },
  { key: 'maybe', label: 'Maybe', short: 'Maybe' },
  { key: 'no', label: "Can't make it", short: "Can't make it" },
];

import type { EventKind, Role, TravelMode } from './types';

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

export const PERSON_COLORS = [
  '#e2583e', '#2f7dd1', '#8a5cd1', '#1f9e89', '#d9921a', '#c2417f',
  '#55702e', '#5a6b85', '#b5552d', '#2b8a9e', '#7a4fb0', '#c97a00',
];

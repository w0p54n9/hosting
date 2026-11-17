import EventApp from '@/components/EventApp';

// Read keys per request, not at build time, so the same build runs on any server.
export const dynamic = 'force-dynamic';

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const mapsKey = process.env.GOOGLE_MAPS_BROWSER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || '';
  const mapId = process.env.GOOGLE_MAP_ID || process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || 'DEMO_MAP_ID';
  return <EventApp slug={slug} mapsKey={mapsKey} mapId={mapId} />;
}

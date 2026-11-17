import EventApp from '@/components/EventApp';

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EventApp slug={slug} />;
}

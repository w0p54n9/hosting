import { autocomplete } from '@/lib/server/google';
import { handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Address suggestions, proxied through the server so the browser never needs a Places key. */
export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
    const session = url.searchParams.get('session')?.slice(0, 100) || undefined;
    if (q.length < 3) return json({ suggestions: [] });
    return json({ suggestions: await autocomplete(q, session) });
  });
}

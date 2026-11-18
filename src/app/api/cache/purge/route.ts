export const dynamic = 'force-dynamic';

/**
 * Clears the LiteSpeed web server's page cache for this site (cPanel/WHC hosting).
 * Visit /api/cache/purge once after a deploy if an old page keeps showing.
 */
export async function GET() {
  return new Response(JSON.stringify({ ok: true, purged: true }), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'X-LiteSpeed-Purge': '*',
    },
  });
}

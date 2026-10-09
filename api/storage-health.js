import { put, list, del } from '@vercel/blob';

export async function GET() {
  const pathname = `fidbachr-beta/health/storage-check-${Date.now()}.txt`;
  try {
    const blob = await put(pathname, 'fidbachr-storage-ok', {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'text/plain; charset=utf-8',
      cacheControlMaxAge: 60,
    });
    const found = await list({ prefix: pathname, limit: 1 });
    const listed = (found.blobs || []).some(item => item.pathname === pathname || item.url === blob.url);
    await del(blob.url);
    return Response.json({ ok: true, write: true, list: listed, delete: true, region: 'connected-store' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('storage health error', error);
    return Response.json({ ok: false, error: String(error?.message || error).slice(0, 300) }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

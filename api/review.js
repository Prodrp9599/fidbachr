import crypto from 'node:crypto';
import { list, put } from '@vercel/blob';

const ACCESS = 'public';
const PREFIX = 'fidbachr-beta/reviews/';

function hash(value='') {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function token(bytes=24) {
  return crypto.randomBytes(bytes).toString('base64url');
}
function safeReview(record) {
  const { ownerHash, reviewerHash, reviewerKey, ...review } = record;
  return review;
}
async function latest(id) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id || '')) return null;
  const result = await list({ prefix: `${PREFIX}${id}/`, limit: 100 });
  const blobs = [...(result.blobs || [])].sort((a,b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  if (!blobs.length) return null;
  const response = await fetch(`${blobs[0].url}?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) return null;
  return await response.json();
}
async function write(record) {
  const rev = String(record.revision || 1).padStart(8, '0');
  const path = `${PREFIX}${record.id}/${rev}-${crypto.randomBytes(5).toString('hex')}.json`;
  await put(path, JSON.stringify(record), {
    access: ACCESS,
    addRandomSuffix: false,
    contentType: 'application/json; charset=utf-8',
    cacheControlMaxAge: 60,
  });
}
function capability(record, key='') {
  const h = hash(key);
  if (record.ownerHash && h === record.ownerHash) return 'creator';
  if (record.reviewerHash && h === record.reviewerHash) return 'reviewer';
  return null;
}
function cleanFeedback(items=[]) {
  return items.slice(0, 500).map(item => ({
    id: String(item.id || token(8)).slice(0,80),
    text: String(item.text || '').slice(0,3000),
    severity: ['blocker','major','suggestion'].includes(item.severity) ? item.severity : 'major',
    category: ['Editing','Content','Design','Audio','Branding','Technical'].includes(item.category) ? item.category : 'Editing',
    start: Math.max(0, Number(item.start)||0),
    end: Math.max(0, Number(item.end)||0),
    mark: item.mark?.type === 'area'
      ? { type:'area', x:+item.mark.x||0, y:+item.mark.y||0, w:+item.mark.w||0, h:+item.mark.h||0 }
      : { type:'point', x:+item.mark?.x||0, y:+item.mark?.y||0 },
    status: ['open','working','ready','resolved'].includes(item.status) ? item.status : 'open',
    replies: (item.replies || []).slice(0,100).map(r => ({
      id: String(r.id || token(6)).slice(0,60),
      author: String(r.author || 'Guest').slice(0,80),
      role: r.role === 'creator' ? 'creator' : 'reviewer',
      text: String(r.text || '').slice(0,2000),
      at: Number(r.at) || Date.now(),
    })),
  }));
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const key = url.searchParams.get('key') || '';
    const record = await latest(id);
    if (!record) return Response.json({ error:'Review not found' }, { status:404 });
    const cap = capability(record, key);
    if (!cap) return Response.json({ error:'This review link is invalid or expired.' }, { status:403 });
    return Response.json({
      review: safeReview(record),
      capability: cap,
      reviewerKey: cap === 'creator' ? record.reviewerKey : undefined,
    }, { headers:{'Cache-Control':'no-store'} });
  } catch (error) {
    console.error('review get error', error);
    return Response.json({ error:'Could not load review' }, { status:500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.action === 'create') {
      if (!body.videoUrl || !/^https:\/\//.test(body.videoUrl)) return Response.json({ error:'Video upload is required.' }, { status:400 });
      const id = token(9);
      const ownerKey = token();
      const reviewerKey = token();
      const now = Date.now();
      const record = {
        id,
        title: String(body.title || 'Untitled review').slice(0,160),
        fileName: String(body.fileName || 'video.mp4').slice(0,260),
        videoUrl: body.videoUrl,
        videoSize: Math.max(0, Number(body.videoSize)||0),
        version: 1,
        feedback: [],
        revision: 1,
        createdAt: now,
        updatedAt: now,
        ownerHash: hash(ownerKey),
        reviewerHash: hash(reviewerKey),
        reviewerKey,
      };
      await write(record);
      return Response.json({ id, ownerKey, reviewerKey, review:safeReview(record), capability:'creator' });
    }

    if (body.action === 'save') {
      const record = await latest(body.id);
      if (!record) return Response.json({ error:'Review not found' }, { status:404 });
      const cap = capability(record, body.key || '');
      if (!cap) return Response.json({ error:'Invalid review key' }, { status:403 });
      if (Number(body.revision) !== Number(record.revision)) {
        return Response.json({ error:'This review changed in another browser. Reloading the latest version is safest.', review:safeReview(record), capability:cap }, { status:409 });
      }
      const next = {
        ...record,
        feedback: cleanFeedback(body.feedback),
        revision: record.revision + 1,
        updatedAt: Date.now(),
      };
      await write(next);
      return Response.json({ review:safeReview(next), capability:cap, reviewerKey:cap==='creator'?record.reviewerKey:undefined });
    }

    return Response.json({ error:'Unsupported action' }, { status:400 });
  } catch (error) {
    console.error('review post error', error);
    const missing = String(error?.message || '').includes('BLOB') || String(error?.message || '').includes('token');
    return Response.json({ error: missing ? 'Cloud storage is not connected to this Fidbachr project yet.' : 'Could not save review' }, { status:500 });
  }
}

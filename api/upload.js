import { handleUpload } from '@vercel/blob/client';

export async function POST(request) {
  try {
    const body = await request.json();
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
        maximumSizeInBytes: 250 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ pathname, issuedAt: Date.now() }),
      }),
      onUploadCompleted: async () => {},
    });
    return Response.json(response);
  } catch (error) {
    console.error('blob upload error', error);
    const message = String(error?.message || '');
    const missing = /BLOB|token|store/i.test(message);
    return Response.json({ error: missing ? 'Cloud storage is not connected to this Fidbachr project yet.' : 'Upload could not be authorized' }, { status: 400 });
  }
}

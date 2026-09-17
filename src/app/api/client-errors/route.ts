import { NextResponse } from 'next/server';

const MAX_BODY_LENGTH = 8_192;
const MAX_FIELD_LENGTH = 500;

function safeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const text = value.trim();
  return text ? text.slice(0, MAX_FIELD_LENGTH) : null;
}

export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (!rawBody || rawBody.length > MAX_BODY_LENGTH) {
    return new NextResponse(null, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const message = safeText(payload.message);
  if (!message) {
    return new NextResponse(null, { status: 400 });
  }

  const digest = safeText(payload.digest);
  const pathname = safeText(payload.pathname);
  console.error('[client-error]', JSON.stringify({ message, digest, pathname, receivedAt: new Date().toISOString() }));

  return new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });
}

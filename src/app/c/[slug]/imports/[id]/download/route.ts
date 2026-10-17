import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { getClient } from '@/server/clients';
import { AccessError } from '@/server/permissions';
import { ImportError, ImportService } from '@/server/imports/service';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const actor = await requireUser();
  const { slug, id } = await params;
  if (!z.uuid().safeParse(id).success)
    return new NextResponse('Not found', { status: 404 });
  const client = await getClient(slug);
  try {
    const { item, data } = await new ImportService().download(
      actor,
      client.id,
      id,
    );
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="export"; filename*=UTF-8''${encodeURIComponent(item.fileName).replaceAll("'", '%27')}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return new NextResponse(
      error instanceof AccessError
        ? 'Administrator access required.'
        : 'Original file is unavailable.',
      {
        status:
          error instanceof AccessError
            ? 403
            : error instanceof ImportError
              ? 404
              : 503,
      },
    );
  }
}

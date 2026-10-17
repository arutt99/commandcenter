import { NextResponse, type NextRequest } from 'next/server';
import { localRequestAllowed } from './server/local/request';
export function proxy(request: NextRequest) {
  const port = Number(process.env.WAYFIND_PORT ?? 4310);
  if (!localRequestAllowed(request.headers, port))
    return new NextResponse('This app is available only on this computer.', {
      status: 403,
    });
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set(
    'Content-Security-Policy',
    "frame-ancestors 'none'; form-action 'self'; base-uri 'self'",
  );
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
export const config = { matcher: '/:path*' };

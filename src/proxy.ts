import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
// Refresh auth cookies before Server Components render. Authorization remains
// in requireUser/requireAdmin and is repeated by every action and route.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;
  const auth = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items)
          response.cookies.set(name, value, options);
      },
    },
  });
  await auth.auth.getUser();
  return response;
}
export const config = { matcher: ['/', '/c/:path*', '/admin/:path*'] };

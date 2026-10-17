import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/server/supabase';
export async function GET(request: NextRequest) {
  const auth = await supabase();
  const code = request.nextUrl.searchParams.get('code');
  const token = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  const result = code
    ? await auth.auth.exchangeCodeForSession(code)
    : token && (type === 'invite' || type === 'email' || type === 'magiclink')
      ? await auth.auth.verifyOtp({ token_hash: token, type })
      : { error: true };
  return NextResponse.redirect(
    new URL(
      result.error
        ? '/sign-in?error=Invalid%20or%20expired%20sign-in%20link.'
        : '/',
      process.env.APP_URL ?? request.url,
    ),
  );
}

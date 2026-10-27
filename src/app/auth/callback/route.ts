import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/domain';
import { authLoginPath, authResponseOrigin } from '@/features/auth/navigation';
export async function GET(request: NextRequest) {
  const origin = authResponseOrigin(
    process.env.NEXT_PUBLIC_APP_URL,
    request,
    process.env.NODE_ENV === 'development',
  );
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(safeNext(request.nextUrl.searchParams.get('next')), origin),
      );
  }
  return NextResponse.redirect(
    new URL(authLoginPath(request.nextUrl.searchParams.get('next'), 'callback'), origin),
  );
}

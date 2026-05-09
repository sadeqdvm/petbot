import { NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(request) {
  const response = NextResponse.next();
  const supabase = createMiddlewareClient({ req: request, res: response });
  const { data: { session } } = await supabase.auth.getSession();
  if (request.nextUrl.pathname.startsWith('/dashboard') && !session) return NextResponse.redirect(new URL('/login', request.url));
  return response;
}

export const config = { matcher: ['/dashboard/:path*'] };

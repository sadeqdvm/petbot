import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const protectedPaths = ["/dashboard"];

export async function middleware(request) {
  const isProtected = protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path));
  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get("petbot_session")?.value;
  if (!token || !process.env.SESSION_SECRET) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET));
    return NextResponse.next();
  } catch (error) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/dashboard/:path*"]
};

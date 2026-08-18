import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const cookieName = process.env.SESSION_COOKIE_NAME || "khicn_session";
  const isAuthPage = request.nextUrl.pathname.startsWith("/login");
  const isPublicApi =
    request.nextUrl.pathname.startsWith("/api/auth/login") ||
    request.nextUrl.pathname.startsWith("/api/health") ||
    request.nextUrl.pathname.startsWith("/api/notifications/flush");
  const hasSession = Boolean(request.cookies.get(cookieName)?.value);

  if (!hasSession && !isAuthPage && !isPublicApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

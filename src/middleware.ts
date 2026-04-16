import { type NextRequest, NextResponse } from "next/server";
import { createMiddlewareSupabase } from "@/lib/supabase/middleware";
import { isLocalMode } from "@/lib/env";

const isPublicPath = (pathname: string) =>
  pathname === "/login" ||
  pathname.startsWith("/auth/") ||
  pathname.startsWith("/api/webhooks") ||
  pathname.startsWith("/approve");

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isLocalMode()) {
    return NextResponse.next();
  }
  const { supabase, getResponse } = createMiddlewareSupabase(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(pathname) && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return getResponse();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

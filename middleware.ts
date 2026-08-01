import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/nouveau-site/explorer.html" ||
    request.nextUrl.pathname === "/nouveau-site/site-map.json"
  ) {
    return NextResponse.redirect(new URL("/nouveau-site/index.html", request.url), 307);
  }

  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|bmp)$).*)"]
};

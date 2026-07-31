import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "./config";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        }
      }
    }
  );

  const { data } = await supabase.auth.getClaims();
  const isProtected = request.nextUrl.pathname.startsWith("/espace");
  if (isProtected && !data?.claims) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.searchParams.set("retour", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (isProtected && data?.claims?.sub) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role,status")
      .eq("id", data.claims.sub)
      .single();

    if (!profile) {
      const url = request.nextUrl.clone();
      url.pathname = "/connexion";
      return NextResponse.redirect(url);
    }

    if (profile.status === "pending") {
      const url = request.nextUrl.clone();
      url.pathname = "/compte-en-attente";
      return NextResponse.redirect(url);
    }

    if (profile.status === "suspended") {
      const url = request.nextUrl.clone();
      url.pathname = "/compte-suspendu";
      return NextResponse.redirect(url);
    }

    const sensitiveRole = ["admin", "super_admin"].includes(profile.role);
    if (sensitiveRole && data.claims.aal !== "aal2") {
      const url = request.nextUrl.clone();
      url.pathname = "/mfa";
      return NextResponse.redirect(url);
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

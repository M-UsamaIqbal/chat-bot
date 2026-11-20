import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { PUBLIC_CONFIG } from "@/lib/config";

/**
 * Server Supabase client bound to the request cookies (anon key + user session).
 * Use inside Server Components, Route Handlers, and Server Actions to read data
 * as the authenticated admin, respecting RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    PUBLIC_CONFIG.supabaseUrl,
    PUBLIC_CONFIG.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component where cookies are read-only —
            // safe to ignore; the middleware refreshes the session.
          }
        },
      },
    }
  );
}

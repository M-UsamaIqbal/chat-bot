"use client";

import { createBrowserClient } from "@supabase/ssr";
import { PUBLIC_CONFIG } from "@/lib/config";

/**
 * Browser Supabase client (anon key). Safe for the client — Row Level Security
 * governs what this key can read/write. Used by the admin dashboard for auth.
 */
export function createClient() {
  return createBrowserClient(
    PUBLIC_CONFIG.supabaseUrl,
    PUBLIC_CONFIG.supabaseAnonKey
  );
}

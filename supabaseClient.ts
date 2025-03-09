// supabaseContext.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Database } from "./supabase-types.ts";
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";

const env = await load();
const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_KEY;

const defaultSupabase = createClient<Database>(supabaseUrl, supabaseKey);

// Runtime context for the current request's Supabase client
let currentSupabase: ReturnType<typeof createClient<Database>> =
  defaultSupabase;

export function getSupabase(): ReturnType<typeof createClient<Database>> {
  return currentSupabase;
}

export function setSupabase(token?: string) {
  if (token) {
    currentSupabase = createClient<Database>(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
  } else {
    currentSupabase = defaultSupabase; // Reset to global client
  }
}

import "https://deno.land/x/dotenv/load.ts";

// Initialize environment variables
export const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
export const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY")!;
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is not set!");
}

import OpenAI from "https://esm.sh/openai@latest";
import { OPENAI_API_KEY } from "./env.ts";

export const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

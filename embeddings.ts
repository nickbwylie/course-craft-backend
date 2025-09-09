// transcript_embeddings.ts - Core functionality for processing transcripts with embeddings
import { load } from "https://deno.land/std/dotenv/mod.ts";
import { OPENAI_API_KEY } from "./env.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import pLimit from "https://esm.sh/p-limit@4.0.0";

const env = await load();

export function chunkTranscript(text: string, maxWords = 400): string[] {
  const words = text.split(" ");
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }
  return chunks;
}

// Function to calculate number of chunks to retrieve based on transcript length
export function getNumChunksToRetrieve(
  transcript: string,
  chunkSize = 400,
  maxChunks = 30
) {
  const estimatedChunks = Math.ceil(transcript.split(" ").length / chunkSize);
  const targetChunks = Math.ceil(estimatedChunks * 0.3); // Get ~30% of transcript
  return Math.min(targetChunks, maxChunks);
}

// Function to get embedding from OpenAI
export async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model: "text-embedding-3-small",
    }),
  });

  const data = await res.json();

  return data.data[0].embedding;
}

// Optimized chunk storage with higher concurrency and logging
export async function storeChunksInSupabase(
  videoId: string,
  transcript: string
) {
  const chunks = chunkTranscript(transcript, 800); // Fewer, larger chunks
  const concurrencyLimit = 8;
  const limit = pLimit(concurrencyLimit);

  const results = await Promise.all(
    chunks.map((content, i) =>
      limit(async () => {
        try {
          const embedding = await getEmbedding(content);
          return {
            video_id: videoId,
            chunk_index: i,
            content,
            embedding: `[${embedding.join(",")}]`,
          };
        } catch (err) {
          console.error(`❌ Error embedding chunk ${i}:`, err);
          return null;
        }
      })
    )
  );

  const validChunks = results.filter(Boolean) as {
    video_id: string;
    chunk_index: number;
    content: string;
    embedding: string;
  }[];

  if (validChunks.length > 0) {
    const supabaseAdmin = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await supabaseAdmin
      .from("transcript_chunks")
      .insert(validChunks);

    if (error) {
      console.error("❌ Supabase insert error:", error.message);
    } else {
      console.log("✅ Chunks successfully inserted.");
    }
  }
}

// Function to query Supabase RPC for relevant transcript chunks
export async function getRelevantChunks(
  queries: string[],
  videoId: string,
  transcript: string
) {
  const numChunks = getNumChunksToRetrieve(transcript);
  const allChunks: { [key: string]: any }[] = [];

  const queryEmbeddings = await Promise.all(
    queries.map((query) => getEmbedding(query))
  );

  const supabaseAdmin = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  for (const [i, queryEmbedding] of queryEmbeddings.entries()) {
    const { data, error } = await supabaseAdmin.rpc("match_transcript_chunks", {
      query_embedding: `[${queryEmbedding.join(",")}]`,
      match_count: numChunks,
      video_id: videoId,
    });

    if (error) {
      console.error(
        `Error retrieving chunks for query '${queries[i]}':`,
        error.message
      );
      continue;
    }

    if (data) allChunks.push(...data);
  }

  // Deduplicate by ID
  const uniqueChunks = Array.from(
    new Map(allChunks.map((c) => [c.id, c])).values()
  );

  return uniqueChunks;
}

// Example usage:
// const chunks = await getRelevantChunks(supabase, "summarize this video", "yt1234", OPENAI_KEY, fullTranscript);
// Feed `chunks.map(c => c.content).join("\n\n")` into your GPT prompt

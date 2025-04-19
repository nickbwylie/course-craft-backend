// transcript_embeddings.ts - Core functionality for processing transcripts with embeddings
import { OPENAI_API_KEY } from "./env.ts";
import { getSupabase } from "./supabaseClient.ts";

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

  if (data?.usage) {
    console.log("Embedding usage:", data.usage);
  }

  return data.data[0].embedding;
}

export async function storeChunksInSupabase(
  videoId: string,
  transcript: string
) {
  const chunks = chunkTranscript(transcript);

  // Limit concurrency if needed (e.g., 5 at a time)
  const promises = chunks.map(async (content, i) => {
    try {
      const embedding = await getEmbedding(content);

      const { error } = await getSupabase()
        .from("transcript_chunks")
        .insert({
          video_id: videoId,
          chunk_index: i,
          content,
          embedding: `[${embedding.join(",")}]`,
        });

      if (error) {
        console.error(`Insert error at chunk ${i}:`, error.message);
      }
    } catch (err) {
      console.error(`Failed processing chunk ${i}:`, err);
    }
  });

  await Promise.all(promises);
}

// Function to query Supabase RPC for relevant transcript chunks
export async function getRelevantChunks(
  queries: string[],
  videoId: string,
  transcript: string
) {
  const numChunks = getNumChunksToRetrieve(transcript);
  const allChunks: { [key: string]: any }[] = [];

  for (const query of queries) {
    const queryEmbedding = await getEmbedding(query);

    const { data, error } = await getSupabase().rpc("match_transcript_chunks", {
      query_embedding: `[${queryEmbedding.join(",")}]`,
      match_count: numChunks,
      video_id: videoId,
    });

    if (error) {
      console.error(
        `Error retrieving chunks for query '${query}':`,
        error.message
      );
      continue;
    }

    if (data) allChunks.push(...data);
  }

  // Deduplicate chunks by ID
  const uniqueChunks = Array.from(
    new Map(allChunks.map((c) => [c.id, c])).values()
  );

  return uniqueChunks;
}

// Example usage:
// const chunks = await getRelevantChunks(supabase, "summarize this video", "yt1234", OPENAI_KEY, fullTranscript);
// Feed `chunks.map(c => c.content).join("\n\n")` into your GPT prompt

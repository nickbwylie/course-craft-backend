import { getSupabase } from "./supabaseClient.ts";
import { generateSmartSummary, generateQuiz } from "./gptHandlers.ts";
import { storeChunksInSupabase } from "./embeddings.ts";
import { getRelevantChunks } from "./embeddings.ts";
import { addSummary, addQuiz } from "./database.ts";
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import {
  createClient,
  SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";

const env = await load();
// export async function processPendingJobs() {
//   const supabase = getSupabase();

//   const { data: jobs } = await supabase
//     .from("course_jobs")
//     .select("*")
//     .eq("status", "pending")
//     .limit(5);

//   if (!jobs || jobs.length === 0) {
//     console.log("No pending jobs.");
//     return;
//   }

//   for (const job of jobs) {
//     try {
//       console.log(`Processing job ${job.id}`);

//       // Update status to 'processing'
//       await supabase
//         .from("course_jobs")
//         .update({ status: "processing", updated_at: new Date().toISOString() })
//         .eq("id", job.id);

//       // Fetch video data and transcript
//       const { data: video } = await supabase
//         .from("videos")
//         .select("*")
//         .eq("id", job.video_id)
//         .single();

//       if (!video) throw new Error("Video not found");

//       // Assume you have transcript inside video table or fetch externally
//       const transcript = video.transcript || "";

//       await storeChunksInSupabase(job.video_id, transcript);

//       const chunks = await getRelevantChunks(
//         ["What is this video about? Key ideas and important moments?"],
//         job.video_id,
//         transcript
//       );

//       const chunkedTranscript = chunks
//         .map((c) => `- ${c.content.trim()}`)
//         .join("\n\n");

//       const [summary, quiz] = await Promise.all([
//         generateSmartSummary(chunkedTranscript, 3),
//         generateQuiz(chunkedTranscript, 3, 5),
//       ]);

//       if (!summary || !quiz)
//         throw new Error("Failed to generate summary or quiz");

//       // Insert into your summaries and quizzes table
//       await addSummary(job.video_id, summary);

//       await addQuiz(job.video_id, quiz);

//       // Update status to 'completed'
//       await supabase
//         .from("course_jobs")
//         .update({ status: "completed", updated_at: new Date().toISOString() })
//         .eq("id", job.id);

//       console.log(`✅ Job ${job.id} completed`);
//     } catch (err) {
//       console.error(`❌ Error processing job ${job.id}:`, err);

//       await getSupabase()
//         .from("course_jobs")
//         .update({ status: "failed", updated_at: new Date().toISOString() })
//         .eq("id", job.id);
//     }
//   }
// }

export async function adminSummary(
  supabaseClient: SupabaseClient,
  videoId: string,
  summaryText: string
): Promise<string> {
  const summaryId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    const { error } = await supabaseClient.from("summaries").insert([
      {
        id: summaryId,
        video_id: videoId,
        summary_text: summaryText,
        created_at: createdAt,
      },
    ]);

    if (error) {
      console.error("Error adding summary:", error.message);
      return "failed";
    }

    console.log(`Summary added for video '${videoId}'`);
    return "success";
  } catch (e) {
    console.error("Unexpected error adding summary:", e);
    return "failed";
  }
}

export async function adminQuiz(
  supabaseClient: SupabaseClient,
  videoId: string,
  quiz: any[]
): Promise<string> {
  const quizId = crypto.randomUUID(); // Supabase accepts string UUIDs
  const createdAt = new Date().toISOString();

  try {
    const { error } = await supabaseClient.from("quizzes").insert([
      {
        id: quizId,
        video_id: videoId,
        quiz: quiz,
        created_at: createdAt,
      },
    ]);

    if (error) {
      console.error("Error adding quiz:", error.message);
      return "failed";
    }

    console.log(`Quiz added for video '${videoId}'`);
    return "success";
  } catch (e) {
    console.error("Unexpected error adding quiz:", e);
    return "failed";
  }
}

export async function processSingleJob(
  jobId: string,
  summary_detail: number,
  questionCount: number,
  difficulty: number
) {
  const supabaseAdmin = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data: job, error: jobError } = await supabaseAdmin
    .from("course_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    console.error("❌ No such job:", jobId);
    return;
  }

  try {
    console.log(`🔨 Processing job ${jobId}...`);

    // Update job status to 'processing'
    await supabaseAdmin
      .from("course_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    // Fetch associated video
    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .select("*")
      .eq("video_id", job.video_id)
      .single();

    if (videoError || !video) throw new Error("Video not found");

    const transcript = video.transcript || "";
    if (!transcript) throw new Error("No transcript available");

    // Store transcript chunks
    await storeChunksInSupabase(job.video_id, transcript);

    // Pull relevant chunks
    const chunks = await getRelevantChunks(
      [
        "What is this video about? What are the key ideas and important moments?",
      ],
      job.video_id,
      transcript
    );

    const chunkedTranscript = chunks
      .map((c) => `- ${c.content.trim()}`)
      .join("\n\n");

    const [summary, quiz] = await Promise.all([
      generateSmartSummary(chunkedTranscript, summary_detail),
      generateQuiz(chunkedTranscript, difficulty, questionCount),
    ]);

    if (!summary || !quiz)
      throw new Error("Failed to generate summary or quiz");

    // Insert into your summaries and quizzes table
    await adminSummary(supabaseAdmin, job.video_id, summary);

    await adminQuiz(supabaseAdmin, job.video_id, quiz);

    // Update status to 'completed'
    await supabaseAdmin
      .from("course_jobs")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", job.id);

    console.log(`✅ Job ${job.id} completed`);
  } catch (err) {
    console.error(`❌ Error processing job ${job.id}:`, err);
    await supabaseAdmin
      .from("course_jobs")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", job.id);
  }
}

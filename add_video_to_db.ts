import {
  fetchChannelThumbnail,
  fetchYouTubeVideo,
  getCaptions,
} from "./youtubeApi.ts";
import { addVideo, addSummary, addQuiz } from "./database.ts";
import {
  generateQuiz,
  generateFinalSummary,
  generateSmartSummary,
} from "./gptHandlers.ts";
import { getSupabase } from "./supabaseClient.ts";
import { processSingleJob } from "./process_jobs.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";

const env = await load();

export async function addVideoToDb(
  youtube_id: string,
  courseId: string,
  order: number,
  difficulty: number,
  questionCount: number,
  summary_detail: number
) {
  // Fetch video details
  const videoData = await fetchYouTubeVideo(youtube_id);
  const channelThumbnail = await fetchChannelThumbnail(
    videoData.items[0]?.snippet?.channelId
  );

  const transcript = await getCaptions(youtube_id);

  // Process video data
  const thumbnailUrl =
    videoData.items[0]?.snippet?.thumbnails?.maxres?.url ??
    videoData.items[0]?.snippet?.thumbnails?.standard?.url ??
    videoData.items[0]?.snippet?.thumbnails?.default?.url;

  // Add video to the database
  const video_id = await addVideo({
    title: videoData.items[0]?.snippet?.title,
    youtube_id,
    channelTitle: videoData.items[0]?.snippet?.channelTitle,
    description: videoData.items[0]?.snippet?.description,
    duration: videoData.items[0]?.contentDetails?.duration,
    publishedAt: videoData.items[0]?.snippet?.publishedAt,
    thumbnailUrl,
    tags: videoData.items[0]?.snippet?.tags || [],
    channelThumbnail,
    viewCount: videoData.items[0]?.statistics?.viewCount || "0",
  });

  if (!video_id) {
    throw new Error("Failed to add video to the database.");
  }

  const [summary, quiz] = await Promise.all([
    generateFinalSummary(transcript, summary_detail),
    generateQuiz(transcript, difficulty, questionCount),
  ]);

  if (!summary) {
    throw new Error("Failed to generate summary.");
  }

  if (!quiz) {
    throw new Error("Failed to generate quiz.");
  }

  await addSummary(video_id, summary);

  await addQuiz(video_id, quiz);

  const uniqueId = crypto.randomUUID();
  const created_at = new Date().toISOString();

  console.log("adding to course videos");

  const res = await getSupabase().from("course_videos").insert({
    id: uniqueId,
    course_id: courseId,
    video_id: video_id,
    order: order,
    created_at: created_at,
  });

  console.log(res);

  if (!res) throw new Error("failed to add to course videos");

  return { status: "success", video_id };
}

export async function getVideoDataTranscriptThumbnail(
  youtube_id: string
): Promise<{ videoData: any; transcript: string; channelThumbnail: string }> {
  const videoData = await fetchYouTubeVideo(youtube_id);
  const channelId = videoData.items[0]?.snippet?.channelId;

  const [channelThumbnail, transcript] = await Promise.all([
    fetchChannelThumbnail(channelId),
    getCaptions(youtube_id),
  ]);

  return { videoData, transcript, channelThumbnail };
}

export async function addVideoToDbUsingEmbedding(
  youtube_id: string,
  courseId: string,
  order: number,
  difficulty: number,
  questionCount: number,
  summary_detail: number,
  videoData: any,
  channelThumbnail: string,
  transcript: string
) {
  // Process video data
  const thumbnailUrl =
    videoData.items[0]?.snippet?.thumbnails?.maxres?.url ??
    videoData.items[0]?.snippet?.thumbnails?.standard?.url ??
    videoData.items[0]?.snippet?.thumbnails?.default?.url;

  // Add video to the database
  const video_id = await addVideo({
    title: videoData.items[0]?.snippet?.title,
    youtube_id,
    channelTitle: videoData.items[0]?.snippet?.channelTitle,
    description: videoData.items[0]?.snippet?.description,
    duration: videoData.items[0]?.contentDetails?.duration,
    publishedAt: videoData.items[0]?.snippet?.publishedAt,
    thumbnailUrl,
    tags: videoData.items[0]?.snippet?.tags || [],
    channelThumbnail,
    viewCount: videoData.items[0]?.statistics?.viewCount || "0",
    transcript: transcript,
  });

  if (!video_id) {
    throw new Error("Failed to add video to the database.");
  }

  const uniqueId = crypto.randomUUID();
  const created_at = new Date().toISOString();

  const supabaseAdmin = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const res = await supabaseAdmin.from("course_videos").insert({
    id: uniqueId,
    course_id: courseId,
    video_id: video_id,
    order: order,
    created_at: created_at,
  });

  if (!res) throw new Error("failed to add to course videos");

  const { data: jobInsertData, error } = await supabaseAdmin
    .from("course_jobs")
    .insert({
      course_id: courseId,
      video_id: video_id,
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  try {
    if (!jobInsertData || !jobInsertData.id)
      throw new Error("failed to add to course videos");
    console.log("🔄 Immediately processing new job...");

    processSingleJob(
      jobInsertData.id,
      summary_detail,
      questionCount,
      difficulty
    );
  } catch (err) {
    console.error("❌ Error immediately processing new job:", err);
    // Don't fail user-facing request even if background fails
  }

  return { status: "success", video_id };
}

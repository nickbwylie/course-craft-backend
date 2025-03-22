import {
  fetchChannelThumbnail,
  fetchYouTubeVideo,
  getCaptions,
} from "./youtubeApi.ts";
import { addVideo, addSummary, addQuiz } from "./database.ts";
import { generateQuiz, generateFinalSummary } from "./gptHandlers.ts";
import { getSupabase } from "./supabaseClient.ts";

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

import { uuid } from "https://esm.sh/v135/@supabase/auth-js@2.66.1/dist/module/lib/helpers.js";
import { getSupabase } from "./supabaseClient.ts";

// this returns an auto generated video id
// that is used else where
export async function addVideo({
  title,
  youtube_id,
  channelTitle,
  description,
  duration,
  publishedAt,
  thumbnailUrl,
  tags,
  channelThumbnail,
  viewCount,
  transcript,
}: {
  title: string;
  youtube_id: string;
  channelTitle: string;
  description: string;
  duration: string;
  publishedAt: string;
  thumbnailUrl: string;
  tags: string[];
  channelThumbnail?: string;
  viewCount?: string;
  transcript: string;
}): Promise<string | null> {
  const createdAt = new Date().toISOString();
  const video_id = uuid();

  try {
    const { error } = await getSupabase()
      .from("videos")
      .insert([
        {
          video_id: video_id,
          youtube_id: youtube_id,
          title,
          created_at: createdAt,
          channel_title: channelTitle || "",
          description,
          duration,
          published_at: publishedAt,
          thumbnail_url: thumbnailUrl,
          tags,
          channel_thumbnail: channelThumbnail,
          view_count: viewCount || "0",
          transcript: transcript,
        },
      ]);

    if (error) {
      console.error("Error adding video:", error.message);
      return null;
    }

    console.log(`Video '${title}' added successfully!`);
    return video_id;
  } catch (e) {
    console.error("Unexpected error adding video:", e);
    return null;
  }
}

export async function addSummary(
  videoId: string,
  summaryText: string
): Promise<string> {
  const summaryId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    const { error } = await getSupabase()
      .from("summaries")
      .insert([
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

export async function addQuiz(videoId: string, quiz: any[]): Promise<string> {
  const quizId = crypto.randomUUID(); // Supabase accepts string UUIDs
  const createdAt = new Date().toISOString();

  try {
    const { error } = await getSupabase()
      .from("quizzes")
      .insert([
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

interface CourseRequest {
  title: string;
  description: string;
  user_id: string;
  courseDifficulty: number;
  detailLevel: "Simple" | "Normal" | "Advanced";
  is_public: boolean;
}

export async function addCourse(
  request: CourseRequest
): Promise<{ status: "success" | "error"; course_id: string | null }> {
  const course_id = crypto.randomUUID();
  const created_at = new Date().toISOString();

  try {
    const res = await getSupabase().from("courses").insert({
      id: course_id,
      title: request.title,
      description: request.description,
      author_id: request.user_id,
      created_at: created_at,
      course_difficulty: request.courseDifficulty,
      detailLevel: request.detailLevel,
      public: request.is_public,
    });
    console.log("res from adding course", res);

    if (!res || res.error) throw new Error("failed to add course");
    return { status: "success", course_id: course_id };
  } catch (e) {
    return { status: "error", course_id: null };
  }
}

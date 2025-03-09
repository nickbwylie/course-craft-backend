import { getSupabase } from "./supabaseClient.ts";

export async function getCourseVideos(courseId: string) {
  const { data, error } = await getSupabase()
    .from("course_videos")
    .select("video_id, videos(*)")
    .eq("course_id", courseId);

  if (!data || error) return [];

  const videos_ids = data.map((video) => {
    return video.video_id;
  });

  const { data: videosData, error: videosError } = await getSupabase()
    .from("videos")
    .select("*")
    .in("video_id", videos_ids);

  // with video ids

  if (videosError) {
    console.error("Error fetching course videos:", videosError);
    return [];
  }

  return videosData;
}

export async function getCourseData(courseId: string) {
  const { data, error } = await getSupabase()
    .from("courses")
    .select("*")
    .eq("id", courseId);

  if (error) {
    console.error("Error fetching course videos:", error);
    return [];
  }

  return data;
}

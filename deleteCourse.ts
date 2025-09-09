import { getSupabase } from "./supabaseClient.ts";

export async function deleteCourseById(course_id: string) {
  try {
    const supabase = getSupabase();

    // Get all video ids from course_videos
    const { data: courseVideos, error: courseVideosError } = await supabase
      .from("course_videos")
      .select("video_id")
      .eq("course_id", course_id);

    if (courseVideosError) {
      throw new Error(
        `Error fetching course videos: ${courseVideosError.message}`
      );
    }

    const video_ids = courseVideos.map((video) => video.video_id);

    // Delete quizzes
    const { error: quizError } = await supabase
      .from("quizzes")
      .delete()
      .in("video_id", video_ids);
    if (quizError) {
      throw new Error(`Error deleting quizzes: ${quizError.message}`);
    }

    // Delete summaries
    const { error: summaryError } = await supabase
      .from("summaries")
      .delete()
      .in("video_id", video_ids);
    if (summaryError) {
      throw new Error(`Error deleting summaries: ${summaryError.message}`);
    }

    // Delete videos
    const { error: videoError } = await supabase
      .from("videos")
      .delete()
      .in("video_id", video_ids);
    if (videoError) {
      throw new Error(`Error deleting videos: ${videoError.message}`);
    }

    // Delete course videos
    const { error: courseVideosDeleteError } = await supabase
      .from("course_videos")
      .delete()
      .eq("course_id", course_id);
    if (courseVideosDeleteError) {
      throw new Error(
        `Error deleting course videos: ${courseVideosDeleteError.message}`
      );
    }

    // Finally delete the course
    const { error: courseDeleteError } = await supabase
      .from("courses")
      .delete()
      .eq("id", course_id);
    if (courseDeleteError) {
      throw new Error(`Error deleting course: ${courseDeleteError.message}`);
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting course:", error);
    throw error;
  }
}

import { Context } from "https://deno.land/x/oak@v17.1.3/context.ts";
import { getSupabase } from "./supabaseClient.ts";

export async function courseStatusHandler(ctx: Context) {
  const url = new URL(ctx.request.url);
  const courseId = url.searchParams.get("courseId");

  if (!courseId) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Missing courseId parameter" };
    return;
  }

  const supabase = getSupabase();

  const { data: job, error: jobError } = await supabase
    .from("course_jobs")
    .select("status")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (jobError) {
    console.error("Error fetching job:", jobError);
  }

  if (job) {
    if (job.status !== "completed") {
      ctx.response.status = 200;
      ctx.response.body = { status: job.status };
      return;
    }
    // If job is "completed", still do extra verification below
  }

  // (No job found OR job completed, so fallback to summaries check)

  // --- fallback check if all videos have summaries ---

  const { data: courseVideos, error: videosError } = await supabase
    .from("course_videos")
    .select("video_id")
    .eq("course_id", courseId);

  if (videosError) {
    console.error("Error fetching course_videos:", videosError);
  }

  if (!courseVideos || courseVideos.length === 0) {
    ctx.response.status = 200;
    ctx.response.body = { status: "failed" };
    return;
  }

  const videoIds = courseVideos
    .map((v: { video_id: string | null }) => v.video_id)
    .filter((id): id is string => id !== null);

  const { data: summaries, error: summariesError } = await supabase
    .from("summaries")
    .select("video_id")
    .in("video_id", videoIds);

  if (summariesError) {
    console.error("Error fetching summaries:", summariesError);
  }

  if (summaries && summaries.length === videoIds.length) {
    ctx.response.status = 200;
    ctx.response.body = { status: "completed" };
    return;
  }

  // Default fallback → still processing
  ctx.response.status = 200;
  ctx.response.body = { status: "processing" };
  return;
}

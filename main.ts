import { Application, Router, Context } from "https://deno.land/x/oak/mod.ts";
import { load } from "https://deno.land/std/dotenv/mod.ts";
import { oakCors } from "https://deno.land/x/cors/mod.ts";
import { fetchYouTubeVideo } from "./youtubeApi.ts";
import { addCourse } from "./database.ts";
import { addVideoToDb } from "./add_video_to_db.ts";
import { OPENAI_API_KEY } from "./env.ts";
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { getSupabase, setSupabase } from "./supabaseClient.ts";

const env = await load();
const SUPABASE_JWT_SECRET = env.SUPABASE_JWT_SECRET;

async function authenticateToken(ctx: Context, next: () => Promise<unknown>) {
  const authHeader = ctx.request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  if (!token) {
    ctx.response.status = 401;
    ctx.response.body = { message: "Token required" };
    ctx.response.headers.set("Content-Type", "application/json");
    return;
  }

  try {
    const keyData = new TextEncoder().encode(SUPABASE_JWT_SECRET);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const payload = await verify(token, cryptoKey);
    (ctx.request as any).user = payload; // Attach user to request (TypeScript workaround)
    (ctx.request as any).token = token;
    setSupabase(token);

    await next(); // Proceed to the next middleware or route

    setSupabase();
  } catch (_err) {
    ctx.response.status = 403;
    ctx.response.body = { message: "Invalid or expired token" };
    ctx.response.headers.set("Content-Type", "application/json");
  }
}

export async function generateQuiz(transcript: string) {
  if (!transcript) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "o3-mini",
      messages: [
        {
          role: "system",
          content: `
            You are an expert quiz creator. Based on a YouTube transcript, create a quiz in this format:
            1. One multiple-choice question with four options (a, b, c, d) and indicate the correct answer.
            2. One true/false question.
            3. One short-answer question.

            Answers: [answer1, answer2, answer3]
          `,
        },
        { role: "user", content: transcript },
      ],
      max_tokens: 500,
      temperature: 0.5,
    }),
  });

  const result = await response.json();
  return result.choices[0].message.content;
}

// Routes
const router = new Router();

router.get("/", (context) => {
  context.response.body = { message: "API is running" };
});

router.get(
  "/video_data/:videoId",
  async (context: Context & { params: { videoId: string | undefined } }) => {
    const videoId = context.params.videoId;

    if (videoId) {
      const res = await fetchYouTubeVideo(videoId);
      context.response.body = res;
    } else {
      context.response.status = 400;
      context.response.body = { error: "videoId is required" };
    }
  }
);

router.post("/create_course", authenticateToken, async (context: Context) => {
  try {
    // Access the body getter
    const body = await context.request.body.json();

    // Ensure the body type is JSON
    if (!body) {
      context.response.status = 400;
      context.response.body = { error: "Invalid content type. Expected JSON." };
      return;
    }

    const token = (context.request as any).token;
    if (!token) {
      context.response.status = 401;
      context.response.body = { error: "Token missing" };
      return;
    }

    // Parse the JSON value
    const {
      title,
      description,
      youtube_ids,
      user_id,
      difficulty,
      questionCount,
      summary_detail,
      is_public,
    } = body;

    if (
      !title ||
      !description ||
      !youtube_ids ||
      !user_id ||
      youtube_ids?.length === 0 ||
      !difficulty ||
      !questionCount ||
      !summary_detail
    ) {
      context.response.status = 400;
      context.response.body = { error: "Missing required fields." };
      return;
    }

    const { status, course_id } = await addCourse({
      title: title,
      description: description,
      courseDifficulty: difficulty,
      detailLevel: summary_detail,
      user_id: user_id,
      is_public: is_public,
    });

    if (!course_id || status === "error") {
      console.log(status);
      throw new Error("failed to add course id");
    }

    const tasks = youtube_ids?.map(
      async (youtube_id: string, index: number) => {
        try {
          console.log(`video id ${youtube_id} index ${index}`);
          await addVideoToDb(
            youtube_id,
            course_id,
            index,
            difficulty,
            questionCount,
            summary_detail
          );

          return { youtube_id, status: "success" };
        } catch (error) {
          return { youtube_id, status: "failed" };
        }
      }
    );

    const results = await Promise.allSettled(tasks);

    // Separate successes and failures
    const success: string[] = [];
    const failed: string[] = [];

    results.forEach((result) => {
      if (result.status === "fulfilled") {
        // Access value for fulfilled promises
        if (result.value.status === "success") {
          success.push(result.value.video_id);
        } else {
          failed.push(result.value.video_id);
        }
      } else if (result.status === "rejected") {
        // Handle rejected promises
        console.error("Unhandled error:", result.reason);
      }
    });

    if (failed.length > 0) {
      context.response.status = 200; // Created with errors adding
      context.response.body = {
        message: `Course '${title}' created successfully`,
        failedToAdd: failed,
        course_id,
      };
    } else {
      context.response.status = 201; // Created
      context.response.body = {
        message: `Course '${title}' created successfully!`,
        course_id,
      };
    }
  } catch (error) {
    console.error("Error processing request:", error);
    context.response.status = 500;
    context.response.body = { error: "Internal server error" };
  }
});

router.post("/delete_course", authenticateToken, async (context: Context) => {
  try {
    const body = await context.request.body.json();

    if (!body || !body.course_id) {
      context.response.status = 400;
      context.response.body = { error: "course_id is required" };
      return;
    }

    const { course_id } = body;

    // get all video ids from course_videos with course_id
    const { data: courseVideos, error: courseVideosError } = await getSupabase()
      .from("course_videos")
      .select("video_id")
      .eq("course_id", course_id);

    if (courseVideosError) {
      context.response.status = 500;
      context.response.body = {
        error: "Error fetching courses",
        courseVideosError,
      };
      return;
    }

    // delete all quizzes with video_id
    const video_ids = courseVideos.map((video) => video.video_id);
    const { data: quizData, error: quizError } = await getSupabase()
      .from("quizzes")
      .delete()
      .in("video_id", video_ids);
    if (quizError) {
      context.response.status = 500;
      context.response.body = { error: "Error deleting quizzes:", quizError };
      return;
    }

    // delete all summaries with video_id
    const { data: summaryData, error: summaryError } = await getSupabase()
      .from("summaries")
      .delete()
      .in("video_id", video_ids);
    if (summaryError) {
      context.response.status = 500;
      context.response.body = { error: "Error deleting summary", quizError };
      return;
    }

    // delete all videos with video_id
    const { data: videoData, error: videoError } = await getSupabase()
      .from("videos")
      .delete()
      .in("video_id", video_ids);
    if (videoError) {
      context.response.status = 500;
      context.response.body = { error: "Error deleting videos", quizError };
      return;
    }

    // delete all course videos with course_id
    const { data, error } = await getSupabase()
      .from("course_videos")
      .delete()
      .eq("course_id", course_id);
    if (error) {
      context.response.status = 500;
      context.response.body = {
        error: "Error deleting course videos",
        quizError,
      };
      return;
    }

    // delete videos

    const res = await getSupabase()
      .from("courses")
      .delete()
      .eq("id", course_id);

    console.log("res from deleting course", res);
    context.response.status = 200;
    context.response.body = {
      message: `Course ${course_id} deleted successfully`,
    };
  } catch (error) {
    console.error("Error processing request:", error);
    context.response.status = 500;
    context.response.body = { error: "Internal server error" };
  }
});

// the course videos api is under construction
// router.post("/course_videos", async (context: Context) => {
//   try {
//     const body = await context.request.body.json();

//     if (!body || !body.course_id) {
//       context.response.status = 400;
//       context.response.body = { error: "course_id is required" };
//       return;
//     }

//     const { course_id } = body;
//     const videos = await getCourseVideos(course_id);

//     const courseData = await getCourseData(course_id);

//     context.response.status = 200;
//     context.response.body = { videos, courseData };
//   } catch (error) {
//     console.error("Error processing request:", error);
//     context.response.status = 500;
//     context.response.body = { error: "Internal server error" };
//   }
// });

// Application Setup
const app = new Application();

const allowedOrigins = [
  "http://localhost:5173",
  "https://course-craft-nick-wylies-projects.vercel.app",
  "https://course-craft-six.vercel.app",
  "https://course-craft-git-master-nick-wylies-projects.vercel.app",
  "https://www.course-craft.tech",
  "https://course-craft.tech",
  "https://course-craft.tech/create",
];

app.use(async (ctx, next) => {
  const origin = ctx.request.headers.get("origin");
  console.log(`Request from origin: ${origin}`);

  // For debugging - log the full request
  console.log(`${ctx.request.method} ${ctx.request.url.pathname}`);

  if (origin) {
    // More flexible origin check
    if (
      allowedOrigins.includes(origin) ||
      origin.startsWith("http://localhost:") ||
      origin.includes("course-craft.tech")
    ) {
      ctx.response.headers.set("Access-Control-Allow-Origin", origin);
    } else {
      console.warn(`Blocked CORS request from ${origin}`);
      // Set to a specific allowed origin instead of "null"
      ctx.response.headers.set(
        "Access-Control-Allow-Origin",
        "https://course-craft.tech"
      );
    }
  } else {
    // If no origin header, set a default allowed origin
    ctx.response.headers.set(
      "Access-Control-Allow-Origin",
      "https://course-craft.tech"
    );
  }

  ctx.response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  ctx.response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  ctx.response.headers.set("Access-Control-Max-Age", "86400");

  // Handle preflight requests
  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }

  await next();
});

app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 8000 });

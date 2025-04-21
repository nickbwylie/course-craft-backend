import { Application, Router, Context } from "https://deno.land/x/oak/mod.ts";
import { load } from "https://deno.land/std/dotenv/mod.ts";
import { fetchYouTubeVideo } from "./youtubeApi.ts";
import { addCourse } from "./database.ts";
import {
  addVideoToDb,
  addVideoToDbUsingEmbedding,
  getVideoDataTranscriptThumbnail,
} from "./add_video_to_db.ts";
import { OPENAI_API_KEY } from "./env.ts";
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { getSupabase, setSupabase } from "./supabaseClient.ts";
import {
  PollyClient,
  SynthesizeSpeechCommand,
} from "npm:@aws-sdk/client-polly";
import { autoGenerateTitleDescription } from "./gptHandlers.ts";
import Stripe from "npm:stripe";
import { tokenPackages, TokenPackages } from "./tokenPackage.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const YOUR_DOMAIN =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5173"
    : "https://course-craft.tech";

const env = await load();
const SUPABASE_JWT_SECRET = env.SUPABASE_JWT_SECRET;

const stripe = new Stripe(env.STRIPE_TEST_SCECRET_KEY, {
  apiVersion: "2025-03-31.basil",
});

const polly = new PollyClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

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

router.post(
  "/create_course_embed",
  authenticateToken,
  async (context: Context) => {
    try {
      // Access the body getter
      const body = await context.request.body.json();

      // Ensure the body type is JSON
      if (!body) {
        context.response.status = 400;
        context.response.body = {
          error: "Invalid content type. Expected JSON.",
        };
        return;
      }

      const token = (context.request as any).token;
      if (!token) {
        context.response.status = 401;
        context.response.body = { error: "Token missing" };
        return;
      }

      const userInfo = await getSupabase()
        .from("users")
        .select("*")
        .eq("id", body.user_id)
        .single();

      if (!userInfo || !userInfo.data) {
        context.response.status = 401;
        context.response.body = { error: "User not found" };
        return;
      }

      if (userInfo.data?.credits < 1) {
        context.response.status = 401;
        context.response.body = { error: "Not enough credits" };
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

      // get video transcripts and data
      const youtubeVideoData: Record<
        string,
        {
          videoData: any;
          transcript: string;
          channelThumbnail: string;
        }
      > = {};
      const failedIds: string[] = [];

      const getVideos = youtube_ids?.map(
        async (youtube_id: string, index: number) => {
          try {
            const data = await getVideoDataTranscriptThumbnail(youtube_id);
            youtubeVideoData[youtube_id] = { ...data };
          } catch (error) {
            console.error(
              `Failed to fetch data for ID: ${youtubeVideoData}`,
              error
            );
            failedIds.push(youtube_id);
          }
        }
      );

      await Promise.allSettled(getVideos);

      if (failedIds.length > 0) {
        context.response.status = 400;
        context.response.body = {
          error: "Some YouTube videos failed to fetch",
          failed_ids: failedIds.map((r) => r),
        };
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
            const data = youtubeVideoData[youtube_id];
            await addVideoToDbUsingEmbedding(
              youtube_id,
              course_id,
              index,
              difficulty,
              questionCount,
              summary_detail,
              data.videoData,
              data.channelThumbnail,
              data.transcript
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
            success.push(result.value.youtube_id);
          } else {
            failed.push(result.value.youtube_id);
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
        // update currents users credits
        const { data, error } = await getSupabase()
          .from("users")
          .update({ credits: userInfo.data.credits - 1 })
          .eq("id", user_id);

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
  }
);

// router.post("/get_youtube_transcripts", async (context: Context) => {
//   const body = await context.request.body.json();
//   const { youtube_ids } = body;

//   if (!youtube_ids || youtube_ids.length === 0) {
//     context.response.status = 400;
//     context.response.body = { error: "youtube_ids is required" };
//     return;
//   }

//   const results: any[] = [];
//   const failedIds: string[] = [];

//   // Run all fetches in parallel
//   const promises = youtube_ids.map(async (id: string) => {
//     try {
//       const data = await getVideoDataTranscriptThumbnail(id);
//       results.push({ youtube_id: id, ...data });
//     } catch (error) {
//       console.error(`Failed to fetch data for ID: ${id}`, error);
//       failedIds.push(id);
//     }
//   });

//   await Promise.all(promises);

//   if (failedIds.length > 0) {
//     context.response.status = 400;
//     context.response.body = {
//       error: "Some YouTube videos failed to fetch",
//       failed_ids: failedIds.map((r) => r),
//     };
//     return;
//   }

//   context.response.status = 200;
//   context.response.body = {
//     success: true,
//     videos: results,
//   };
// });

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

router.post(
  "/generate_title_description",
  authenticateToken,
  async (context: Context) => {
    try {
      const body = await context.request.body.json();
      // data sent over
      // [ {channel: string, title string}
      //]
      const { videoInfo } = body;
      if (!videoInfo || videoInfo.length === 0) {
        context.response.status = 400;
        context.response.body = { error: "videoInfo is required" };
        return;
      }
      const response = await autoGenerateTitleDescription(videoInfo);
      if (!response || !response.title || !response.description) {
        context.response.status = 400;
        context.response.body = {
          error: "Failed to generate title and description",
        };
        return;
      }
      context.response.status = 200;
      context.response.body = {
        title: response.title,
        description: response.description,
      };
    } catch (error) {
      console.error("Error processing request:", error);
      context.response.status = 500;
      context.response.body = { error: "Internal server error" };
    }
  }
);

function splitTextByLength(text: string, maxChunkLength = 2800): string[] {
  const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [text]; // basic sentence split
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChunkLength) {
      chunks.push(currentChunk);
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

router.post("/text_to_speech", authenticateToken, async (context) => {
  try {
    const body = await context.request.body.json();
    const { voice, text } = body;
    const textChunks = splitTextByLength(text);

    // Define a helper function to process each text chunk.
    const synthesizeChunk = async (chunk: string): Promise<Uint8Array> => {
      const command = new SynthesizeSpeechCommand({
        OutputFormat: "mp3",
        Text: chunk,
        VoiceId: voice || "Ruth",
        Engine: "long-form",
      });

      const response = await polly.send(command);
      const audioChunks: Uint8Array[] = [];

      // Read the AudioStream from Polly.
      for await (const piece of response.AudioStream as AsyncIterable<Uint8Array>) {
        audioChunks.push(piece);
      }

      // Combine all chunks into one Uint8Array.
      const totalLength = audioChunks.reduce((sum, c) => sum + c.length, 0);
      const buffer = new Uint8Array(totalLength);
      let offset = 0;
      for (const piece of audioChunks) {
        buffer.set(piece, offset);
        offset += piece.length;
      }
      return buffer;
    };

    // Process all chunks concurrently.
    const audioBuffers: Uint8Array[] = await Promise.all(
      textChunks.map((chunk) => synthesizeChunk(chunk))
    );

    // Option: If your client supports binary streaming,
    // you might stream the binary data directly with the proper Content-Type.
    // For now, we convert each buffer to a JSON-safe array.
    context.response.status = 200;
    context.response.body = {
      audioParts: audioBuffers.map((buf) => Array.from(buf)),
    };
  } catch (err) {
    console.error("Polly Error:", err);
    context.response.status = 500;
    context.response.body = { error: "Polly TTS failed" };
  }
});

router.post("/create_payment_intent", async (context: Context) => {
  try {
    const { tokenPackage, currency = "usd" } =
      await context.request.body.json();

    if (!tokenPackage || tokenPackage === "free") {
      context.response.status = 400;
      context.response.body = { error: "tokenPackage is required" };
      return;
    }

    let amount = 0;
    switch (tokenPackage) {
      case TokenPackages.starter:
        amount = 499; // $10.00
        break;
      case TokenPackages.pro:
        amount = 999;
        break;
      case TokenPackages.expert:
        amount = 1999;
        break;
      default:
        context.response.status = 400;
        context.response.body = { error: "Invalid token package" };
        return;
    }

    // amount should be an integer in cents
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      // optional: add metadata or automatic_payment_methods
      automatic_payment_methods: { enabled: true },
    });

    context.response.status = 201;
    context.response.body = { clientSecret: paymentIntent.client_secret };
  } catch (err) {
    console.error("Stripe error:", err);
    context.response.status = 500;
    context.response.body = { error: "Unable to create payment intent" };
  }
});

router.post(
  "/create_checkout_session",
  authenticateToken,
  async (context: Context) => {
    try {
      const { userId, priceId } = await context.request.body.json();

      console.log("userId", userId);
      console.log("priceId", priceId);

      const user = await getSupabase()
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        customer: user.data?.stripe_customer_id || "", // ← pre‑fills email + ties session
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${YOUR_DOMAIN}/create?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${YOUR_DOMAIN}/token_store`,
        client_reference_id: userId, // optional: your internal user ID
        metadata: { feature: "one-time-purchase", priceId }, // any extra bits you want back
      });

      if (!session) {
        context.response.status = 500;
        context.response.body = { error: "Unable to create checkout session" };
        return;
      }

      context.response.status = 200;
      context.response.body = { url: session.url };
    } catch (err) {}
  }
);

router.post("/api/webhook/stripe", async (context: Context) => {
  try {
    const rawBody = await context.request.body.text(); // Use text() instead of json() for signature verification
    const signature = context.request.headers.get("stripe-signature");

    if (!signature) {
      context.response.status = 400;
      context.response.body = { error: "Missing stripe signature" };
      return;
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err: any) {
      console.error(`Webhook signature verification failed: ${err?.message}`);
      context.response.status = 400;
      context.response.body = { error: `Webhook Error: ${err?.message}` };
      return;
    }

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed": {
        const supabaseAdmin = createClient(
          env.SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY
        );
        const session = event.data.object as Stripe.Checkout.Session;

        const stripeCustomerId = session.customer as string;

        const paymentStatus = session.payment_status;

        console.log("paymentStatus", session?.metadata);

        let priceId = session?.metadata?.priceId;
        if (!priceId) {
          priceId = session?.line_items?.data[0]?.price?.id;
        }

        const plan = tokenPackages.find((pkg) => pkg.priceId === priceId);

        console.log("plan", plan);

        console.log("checking out success");
        console.log("session", session);

        if (!plan) break;

        if (paymentStatus === "paid") {
          // update users credits in supabase
          // First get the current user's credits
          const { data: userData, error: fetchError } = await supabaseAdmin
            .from("users")
            .select("credits")
            .eq("stripe_customer_id", stripeCustomerId)
            .single();

          if (fetchError || !userData) {
            console.error("Error fetching user credits:", fetchError);
            break;
          }

          // Then update with current credits + plan.credits
          const { data, error } = await supabaseAdmin
            .from("users")
            .update({
              credits: userData.credits + plan.tokens,
              paid: true,
            })
            .eq("stripe_customer_id", stripeCustomerId);
          console.log("updated users credits");

          if (error) {
            console.error("Error updating user credits:", error);
          }
        }
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {}
});

router.post("/create_stripe_user", async (context: Context) => {
  try {
    const body = await context.request.body.json();
    const { email, userId } = body;

    if (!email) {
      context.response.status = 400;
      context.response.body = { error: "Email is required" };
      return;
    }

    const customer = await stripe.customers.create({
      email: email, // your user’s email
      metadata: { userId: userId },
    });

    const customerId = customer.id;

    const { data: returnData, error } = await getSupabase()
      .from("users")
      .insert({
        id: userId,
        email: email,
        created_at: new Date().toISOString(),
        credits: 2,
        paid: false,
        stripe_customer_id: customerId,
      });

    context.response.status = 201;
    context.response.body = { customerId: customer.id };
    return;
  } catch (err) {
    console.error("Stripe error:", err);
    context.response.status = 500;
    context.response.body = { error: "Unable to create customer" };
  }
  context.response.status = 201;
  context.response.body = { message: "Stripe user created successfully" };
});

router.post(
  "/delete_users_account_supabase",
  authenticateToken,
  async (context: Context) => {
    const body = await context.request.body.json();
    const { userId } = body;

    if (!userId) {
      context.response.status = 400;
      context.response.body = { error: "userId is required" };
      return;
    }

    const authHeader = context.request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    if (!token) {
      console.log("token not found");

      context.response.status = 500;
      context.response.body = { error: "Error deleting user" };
      return;
    }

    const { data, error } = await getSupabase().auth.getUser(token);

    if (error || !data || !data.user.id || data.user.id !== userId) {
      context.response.status = 401;
      context.response.body = { error: "Unauthorized" };
      return;
    }

    try {
      const supabaseAdmin = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data, error } = await supabaseAdmin.auth.admin.deleteUser(userId);

      if (error) {
        console.error("Error deleting user from supabase", error);
        context.response.status = 500;
        context.response.body = { error: "Error deleting user" };
        return;
      }
    } catch (error) {
      context.response.status = 500;
      context.response.body = { error: "Error deleting user" };
      return;
    }

    context.response.status = 200;
    context.response.body = { message: "User deleted successfully" };
  }
);
// Application Setup
// Application Setup
const app = new Application();

app.use(async (ctx, next) => {
  // Allow all origins
  ctx.response.headers.set("Access-Control-Allow-Origin", "*");

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

import { logTime } from "./add_video_to_db.ts";
import { OPENAI_API_KEY } from "./env.ts";
import { openai } from "./openaiClient.ts"; // Assuming OpenAI client setup
import { encoding_for_model } from "npm:tiktoken";

// Load the tokenizer for GPT-4o-mini
const encoder = encoding_for_model("gpt-4o-mini");

function chunkText(text: string, maxChunkLength: number): string[] {
  const sentences = text.split(/(?<=[.?!])\s+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    // If adding this sentence exceeds the limit, push the current chunk and start a new one.
    if (currentChunk.length + sentence.length + 1 > maxChunkLength) {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  return chunks;
}
async function generateSummary(
  transcript: string,
  summary_detail: number // 1 to 5 (or whatever range you prefer)
): Promise<string | null> {
  // 1) Validate/normalize summaryDetail. Adjust this logic as needed.
  //    For example, if your range is 1–5:
  const validSummaryDetail = Math.min(Math.max(summary_detail, 1), 5);

  try {
    const start = performance.now();
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-nano-2025-04-14",
      messages: [
        {
          role: "system",
          content: `
            You are an expert summarizer and course creator with a knack for making complex ideas clear and engaging. The user has provided text from a video. 
            DO NOT use the words "transcript" or "YouTube" in your output—always refer to the source as "the video" or "this video."
    
            The user wants a structured summary with 3–8 distinct key points, each with a descriptive heading and an explanation. 
            Make the summary lively and approachable, avoiding overly dry or academic phrasing unless specified. 
            Where possible, weave in relatable examples, surprising insights, or short takeaways to make it course-ready.
    
            The user has requested a summary detail level of ${validSummaryDetail}:
            - Level 1 (very brief): 1–2 sentences per point, focusing on the core idea.
            - Level 3 (moderate): 3–4 sentences per point, with some context or examples.
            - Level 5 (highly detailed): 5+ sentences per point, with deep explanations, examples, and implications.
    
            Adjust the thoroughness accordingly and stay consistent across sections.
    
            Format the output as follows:
    
            ### Introduction:
            [A punchy 2–3 sentence overview that hooks the reader and previews the main topic]
    
            ### Key Point 1: [Concise, Catchy Heading]
            [Explanation tailored to the detail level, with a takeaway or example where relevant]
    
            ### Key Point 2: [Concise, Catchy Heading]
            [Explanation tailored to the detail level, with a takeaway or example where relevant]
    
            [Continue for 3–8 points, ensuring no overlap between sections]
    
            End with a concise conclusion (1–2 sentences) that ties it together and leaves the reader curious or satisfied.
          `,
        },
        {
          role: "user",
          content: transcript,
        },
      ],
      max_completion_tokens: 10000, // Increase if Level 5 summaries get cut off
      temperature: 0.6, // Slightly higher for creativity, but still focused
    });
    logTime("Time to make the summary", start);
    const summary = response.choices[0].message?.content;
    // get tokens used
    const tokenUsage = response.usage;
    console.log(`token usage from summary ${tokenUsage?.total_tokens}`);

    return summary || null;
  } catch (error) {
    console.error("Error generating summary:", error);
    return null;
  }
}

export async function generateSmartSummary(
  transcript: string,
  summary_detail: number
): Promise<string | null> {
  return await generateSummary(transcript, summary_detail);
}
/**
 * Generates a summary for each chunk and then a final summary for the combined intermediate summaries.
 */
export async function generateFinalSummary(
  transcript: string,
  summary_detail: number
): Promise<string | null> {
  // Define a max chunk length (adjust based on your token/character limits).
  const MAX_CHUNK_LENGTH = 125000; // adjust this value as needed
  const TOKEN_BUFFER = 2000; // Reserve for prompt + output

  const tokens = encoder.encode(transcript);
  console.log(`Token count: ${tokens.length}`);
  if (tokens.length < MAX_CHUNK_LENGTH) {
    // If it fits, skip chunking
    return await generateSummary(transcript, summary_detail);
  }

  const chunks = chunkText(transcript, MAX_CHUNK_LENGTH);

  // Use Promise.all to process all chunks concurrently.
  const intermediateSummaries = await Promise.all(
    chunks.map(async (chunk) => {
      const summary = await generateSummary(chunk, summary_detail);
      return summary || ""; // return empty string if no summary was produced
    })
  );

  // Filter out any empty summaries if necessary
  const validSummaries = intermediateSummaries.filter(
    (summary) => summary.length > 0
  );

  // Combine the intermediate summaries into one text.
  const combinedSummaryText = validSummaries.join("\n\n");

  // Generate a final summary based on the combined summaries.
  const finalSummary = await generateSummary(
    combinedSummaryText,
    summary_detail
  );

  return finalSummary;
}

export async function generateQuiz(
  transcript: string,
  difficulty: number,
  questionCount: number
): Promise<any[] | null> {
  if (!transcript) return null;

  // Ensure valid difficulty and question count levels
  const validDifficulty = Math.min(Math.max(difficulty, 1), 5); // 1–5
  const questionRange =
    questionCount === 1 ? "0-4" : questionCount === 2 ? "4-7" : "7-10";

  const start = performance.now();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-nano-2025-04-14",
      messages: [
        {
          role: "system",
          content: `
            Generate a quiz based on the text from a video. 
            DO NOT use the word "transcript" or "YouTube" in your output. 
            Refer to the source as "the video" or "this video."
            
            Follow this format strictly:

            [
              {
                "id": "string",             // Unique ID for the question
                "question": "string",       // The quiz question
                "choices": [                // Array of 4 possible answers
                  "string",
                  "string",
                  "string",
                  "string"
                ],
                "correctAnswer": "string",  // Correct answer
                "difficulty": 1,            // Difficulty level (1–5)
              }
            ]

            Requirements:
            - Output a JSON array with exactly ${questionRange} questions.
            - Ensure all questions follow the specified format.
            - Include a "difficulty" field with a value of ${validDifficulty}.
            - The correct answer **MUST** be one of the choices.
            - Do **NOT** include explanations or any text outside of the JSON array.
          `,
        },
        { role: "user", content: transcript },
      ],
      max_completion_tokens: 5000,
      temperature: 0.5,
    }),
  });
  logTime("time it took to make the quiz", start);

  const result = await response.json();

  console.log("quiz usage", result.usage);
  if (!result.choices || result.choices.length === 0) {
    console.error("No choices returned from OpenAI API.");
    return null;
  }

  try {
    const questions = JSON.parse(result.choices[0].message.content);

    if (!Array.isArray(questions)) throw new Error("Output is not an array.");

    for (const q of questions) {
      if (
        typeof q.id !== "string" ||
        typeof q.question !== "string" ||
        !Array.isArray(q.choices) ||
        q.choices.length !== 4 ||
        typeof q.correctAnswer !== "string" ||
        !q.choices.includes(q.correctAnswer) ||
        typeof q.difficulty !== "number" ||
        q.difficulty < 1 ||
        q.difficulty > 5
      ) {
        throw new Error("Invalid question format.");
      }
    }

    return questions; // Return validated questions
  } catch (error) {
    console.error("Invalid response format:", error);
    return null;
  }
}

export async function autoGenerateTitleDescription(
  videoInfo: { title: string; channel: string }[]
): Promise<{ title: string; description: string }> {
  const response = await openai.chat.completions.create({
    model: "gpt-4.1-nano-2025-04-14",
    messages: [
      {
        role: "system",
        content: `
You are an expert course creator and video-content strategist.
Task: Generate a course title and description based on a list of YouTube videos.

Requirements:
• Title:
  – Must be 2–60 characters (inclusive).
  – Catchy, summarizes the core theme.
• Description:
  – Must be 10–500 characters (inclusive).
  – Highlights key learning outcomes, structure, and benefits.
• Output only a JSON object with exactly two keys: "title" and "description".
  No extra text, no markdown, no explanations.

Example output:
{"title":"Mastering React Hooks","description":"In this course, you’ll learn to build dynamic React apps using Hooks—covering useState, useEffect, custom hooks, and best practices to write cleaner, more maintainable code."}
        `.trim(),
      },
      {
        role: "user",
        content: `Here’s the video info (titles + channels):\n${JSON.stringify(
          videoInfo,
          null,
          2
        )}`,
      },
    ],
    max_completion_tokens: 300,
    temperature: 0.7,
  });

  const raw = response.choices[0].message?.content;
  if (!raw) throw new Error("Failed to generate title and description.");

  // parse and return
  return JSON.parse(raw);
}

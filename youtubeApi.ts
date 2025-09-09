import { YOUTUBE_API_KEY } from "./env.ts";
import { getSubtitles } from "https://esm.sh/youtube-captions-scraper";
import protobuf from "https://esm.sh/protobufjs@7.2.4";
import axios from "https://esm.sh/axios@1.6.0";

export async function fetchChannelThumbnail(
  channelId: string | undefined
): Promise<string> {
  if (!channelId) return "";

  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${YOUTUBE_API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch channel thumbnail: ${response.statusText}`
    );
  }
  const data = await response.json();
  return data.items[0]?.snippet?.thumbnails?.default?.url || "";
}
export async function fetchYouTubeVideo(videoId: string) {
  const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${YOUTUBE_API_KEY}&part=snippet,contentDetails,statistics`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch video data: ${response.statusText}`);
  }
  return await response.json();
}
export async function getCaptions(youtube_id: string) {
  const captions = await getSubtitles({
    videoID: youtube_id, // YouTube video ID
    lang: "en", // Language code (default: 'en')
  });

  const plainText = captions.map((caption) => caption.text).join(" ");

  return plainText;
}

// code below is to get subtitles from https://github.com/algolia/youtube-captions-scraper/issues/30#issuecomment-2313432907
function getBase64Protobuf(message) {
  const root = protobuf.Root.fromJSON({
    nested: {
      Message: {
        fields: {
          param1: { id: 1, type: "string" },
          param2: { id: 2, type: "string" },
        },
      },
    },
  });
  const MessageType = root.lookupType("Message");

  const buffer = MessageType.encode(message).finish();

  return Buffer.from(buffer).toString("base64");
}

/**
 * Helper function to extract text from certain elements.
 * Inspired by Invidious' extractors_utils.cr
 * https://github.com/iv-org/invidious/blob/384a8e200c953ed5be3ba6a01762e933fd566e45/src/invidious/yt_backend/extractors_utils.cr#L1-L30
 * @param {Object} item - The item to extract text from.
 * @returns {string} The extracted text.
 */
function extractText(item) {
  return item.simpleText || item.runs?.map((run) => run.text).join("");
}

/**
 * Function to retrieve subtitles for a given YouTube video.
 * @param {Object} options - The options for retrieving subtitles
 * @param {String} options.videoId - The ID of the video
 * @param {String} options.trackKind - The track kind of the subtitles (e.g., 'asr' or 'standard')
 * @param {String} options.language - The language of the subtitles
 * @returns {Promise<Array<{ start: Number, dur: Number, text: String }>>} - The subtitles of the video
 */
async function getText({
  videoId,
  trackKind,
  language,
}: {
  videoId: string;
  trackKind: string;
  language: string;
}) {
  const message = {
    param1: videoId,
    param2: getBase64Protobuf({
      // Only include `trackKind` for automatically-generated subtitles
      param1: trackKind === "asr" ? trackKind : null,
      param2: language,
    }),
  };

  const params = getBase64Protobuf(message);

  const url = "https://www.youtube.com/youtubei/v1/get_transcript";
  const headers = { "Content-Type": "application/json" };
  const data = {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20240826.01.00",
      },
    },
    params,
  };

  const response = await axios.post(url, data, { headers });

  // Mapping inspired by Invidious' transcript.cr
  // https://github.com/iv-org/invidious/blob/432c25ad8626fee401b1f349b463515d21718ac8/src/invidious/videos/transcript.cr#L51-L101
  const initialSegments =
    response.data.actions[0].updateEngagementPanelAction.content
      .transcriptRenderer.content.transcriptSearchPanelRenderer.body
      .transcriptSegmentListRenderer.initialSegments;

  if (!initialSegments) {
    throw new Error(
      `Requested transcript does not exist for video: ${videoId}`
    );
  }

  const output = initialSegments.map((segment: any) => {
    const line =
      segment.transcriptSectionHeaderRenderer ||
      segment.transcriptSegmentRenderer;

    const { endMs, startMs, snippet } = line;

    const text = extractText(snippet);

    return {
      start: parseInt(startMs) / 1000,
      dur: (parseInt(endMs) - parseInt(startMs)) / 1000,
      text,
    };
  });

  return output;
}

export async function getSubs({ videoId }: { videoId: string }) {
  try {
    const subtitles = await getText({
      language: "en-US",
      trackKind: "standard",
      videoId,
    });

    console.log(subtitles);
    return subtitles;
  } catch (err) {
    console.error("Error:", err);
    try {
      const subtitles = await getText({
        language: "en-US",
        trackKind: "asr",
        videoId,
      });

      console.log(subtitles);
      return subtitles;
    } catch (err) {
      return "";
    }
    return "";
  }
}

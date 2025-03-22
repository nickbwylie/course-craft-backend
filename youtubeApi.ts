import { YOUTUBE_API_KEY } from "./env.ts";
import { getSubtitles } from "https://esm.sh/youtube-captions-scraper";

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

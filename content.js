chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "GET_CURRENT_VIDEO_ID") return;

  try {
    // Safety check: ensure we're on YouTube
    const isYouTube =
      window.location.hostname.includes("youtube.com") ||
      window.location.hostname.includes("youtu.be");

    if (!isYouTube) {
      sendResponse({ error: "This page is not YouTube" });
      return;
    }

    const { pathname, search } = window.location;
    let videoId = null;

    // Case 1: Standard watch page (?v=VIDEO_ID)
    const queryParams = new URLSearchParams(search);
    videoId = queryParams.get("v");

    // Case 2: Shorts URL (/shorts/VIDEO_ID)
    if (!videoId && pathname.startsWith("/shorts/")) {
      videoId = pathname.split("/shorts/")[1]?.split("/")[0];
    }

    // Case 3: Embedded player (/embed/VIDEO_ID)
    if (!videoId && pathname.startsWith("/embed/")) {
      videoId = pathname.split("/embed/")[1]?.split("/")[0];
    }

    if (!videoId) {
      sendResponse({ error: "Unable to detect video ID from URL" });
      return;
    }

    sendResponse({ videoId });
  } catch (error) {
    console.error("Video ID detection failed:", error);
    sendResponse({
      error: "Unexpected error while extracting video ID",
      details: error.message,
    });
  }

  // Required: keep the message channel open
  return true;
});

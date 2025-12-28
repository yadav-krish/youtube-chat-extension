const status = document.getElementById("status");
const videoInfo = document.getElementById("videoInfo");
const videoTitle = document.getElementById("videoTitle");
const videoUrl = document.getElementById("videoUrl");
const messages = document.getElementById("messages");
const input = document.getElementById("question");
const sendBtn = document.getElementById("ask"); // ✅ FIXED: was "sendBtn"
const counter = document.getElementById("charCounter"); // ✅ FIXED: was "charCount"
const loader = document.getElementById("loadingOverlay"); // ✅ FIXED: was "loader"

let activeVideoId = null;

// -------------------- initialization --------------------

async function initialize() {
  try {
    setStatus("loading", "Analyzing video...");

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      setStatus("error", "No active tab");
      addMessage("Could not detect active tab.", "ai", true);
      return;
    }

    console.log("Current tab URL:", tab.url);

    // Check if we're on YouTube
    const isYouTube =
      tab.url?.includes("youtube.com") || tab.url?.includes("youtu.be");

    if (!isYouTube) {
      setStatus("idle", "Not on YouTube");
      addMessage(
        "Please navigate to a YouTube video page to start chatting.",
        "ai"
      );
      return;
    }

    // Check if it's a video page specifically
    const isVideoPage =
      tab.url?.includes("youtube.com/watch") ||
      tab.url?.includes("youtu.be/") ||
      tab.url?.includes("youtube.com/shorts/") ||
      tab.url?.includes("youtube.com/embed/");

    if (!isVideoPage) {
      setStatus("idle", "No video detected");
      addMessage(
        "Please open a specific YouTube video (not the homepage or search results).",
        "ai"
      );
      return;
    }

    // Extract video ID directly from URL as fallback
    let videoId = extractVideoIdFromUrl(tab.url);

    if (videoId) {
      console.log("Video ID extracted from URL:", videoId);
      activeVideoId = videoId;
      videoTitle.textContent = "Video detected";
      videoUrl.textContent = `ID: ${activeVideoId}`;
      videoInfo.hidden = false;
      setStatus("ready", "Ready");
      addMessage("Hi! Ask me anything about this video.", "ai");
      input.focus();
      return;
    }

    // If URL extraction failed, try content script
    try {
      console.log("Attempting to use content script...");

      // Ensure content script is injected
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });
        console.log("Content script injected");
      } catch (injectErr) {
        console.log(
          "Content script already present or injection failed:",
          injectErr.message
        );
      }

      // Wait a bit for content script to be ready
      await new Promise((resolve) => setTimeout(resolve, 200));

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "GET_CURRENT_VIDEO_ID",
      });

      console.log("Content script response:", response);

      if (response?.error) {
        throw new Error(response.error);
      }

      if (response?.videoId) {
        activeVideoId = response.videoId;
        videoTitle.textContent = "Video detected";
        videoUrl.textContent = `ID: ${activeVideoId}`;
        videoInfo.hidden = false;
        setStatus("ready", "Ready");
        addMessage("Hi! Ask me anything about this video.", "ai");
        input.focus();
        return;
      }
    } catch (contentScriptErr) {
      console.error("Content script error:", contentScriptErr);
    }

    // If both methods failed
    setStatus("error", "Cannot detect video");
    addMessage(
      "Could not detect video ID. Please refresh the page and try again.",
      "ai",
      true
    );
  } catch (err) {
    console.error("Initialization error:", err);
    setStatus("error", "Init failed");
    addMessage(`Error: ${err.message}`, "ai", true);
  }
}

// -------------------- URL-based video ID extraction --------------------

function extractVideoIdFromUrl(url) {
  if (!url) return null;

  try {
    // Pattern 1: youtube.com/watch?v=VIDEO_ID
    const watchMatch = url.match(/[?&]v=([^&\n?#]+)/);
    if (watchMatch) return watchMatch[1];

    // Pattern 2: youtu.be/VIDEO_ID
    const shortMatch = url.match(/youtu\.be\/([^&\n?#]+)/);
    if (shortMatch) return shortMatch[1];

    // Pattern 3: youtube.com/shorts/VIDEO_ID
    const shortsMatch = url.match(/youtube\.com\/shorts\/([^&\n?#]+)/);
    if (shortsMatch) return shortsMatch[1];

    // Pattern 4: youtube.com/embed/VIDEO_ID
    const embedMatch = url.match(/youtube\.com\/embed\/([^&\n?#]+)/);
    if (embedMatch) return embedMatch[1];

    return null;
  } catch (err) {
    console.error("Error extracting video ID from URL:", err);
    return null;
  }
}

// -------------------- status --------------------

function setStatus(type, text) {
  const indicator = status.querySelector(".status-indicator");
  const statusText = status.querySelector(".status-text");

  const colors = {
    idle: "#9ca3af",
    loading: "#f59e0b",
    ready: "#10b981",
    error: "#ef4444",
  };

  indicator.style.background = colors[type] || colors.idle;
  statusText.textContent = text;
}

// -------------------- input handlers --------------------

input.addEventListener("input", () => {
  resizeInput();
  updateCounter();
  toggleSend();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendQuestion();
  }
});

sendBtn.addEventListener("click", sendQuestion);

function resizeInput() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 80) + "px";
}

function updateCounter() {
  const len = input.value.length;
  counter.textContent = `${len} / 500`;

  counter.style.color =
    len > 450 ? "#ea4335" : len > 400 ? "#fbbc04" : "#5f6368";
}

function toggleSend() {
  sendBtn.disabled = !input.value.trim() || !activeVideoId;
}

async function sendQuestion() {
  const text = input.value.trim();
  if (!text || !activeVideoId) return;

  addMessage(text, "user");

  input.value = "";
  resizeInput();
  updateCounter();
  toggleSend();

  setStatus("loading", "Thinking...");
  loader.hidden = false; // ✅ FIXED: was style.display

  try {
    const res = await fetch("http://127.0.0.1:8000/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: activeVideoId, question: text }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || res.status);
    }

    const data = await res.json();
    addMessage(data.answer || "No response generated.", "ai");
    setStatus("ready", "Ready");
  } catch (err) {
    addMessage(
      err.message.includes("fetch")
        ? "Backend not reachable. Make sure it's running on http://127.0.0.1:8000"
        : err.message,
      "ai",
      true
    );
    setStatus("error", "Error");
  } finally {
    loader.hidden = true; // ✅ FIXED: was style.display
    input.focus();
  }
}

function addMessage(text, sender, isError = false) {
  const msg = document.createElement("div");
  msg.className = `message ${sender}-message`;

  const avatar = document.createElement("div");
  avatar.className = `${sender}-avatar`;
  avatar.innerHTML = sender === "ai" ? aiIcon() : userIcon();

  const body = document.createElement("div");
  body.className = `message-content ${isError ? "error-message" : ""}`;
  body.innerHTML = `<p>${text}</p>`;

  msg.appendChild(avatar);
  msg.appendChild(body);
  messages.appendChild(msg);

  messages.scrollTop = messages.scrollHeight;
}

function aiIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.5 9a3 3 0 0 1 5 1.5c0 2-3 3-3 3"/>
      <path d="M12 17h.01"/>
    </svg>
  `;
}

function userIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  `;
}

// -------------------- start --------------------

initialize();

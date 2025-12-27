let activeVideoId = null;
let activeVideoTitle = null;

const input = document.getElementById("question");
const sendBtn = document.getElementById("ask");
const messages = document.getElementById("messages");
const counter = document.getElementById("charCounter");
const status = document.getElementById("status");
const loader = document.getElementById("loadingOverlay");
const videoBox = document.getElementById("videoInfo");
const videoTitle = document.getElementById("videoTitle");
const videoUrl = document.getElementById("videoUrl");

document.addEventListener("DOMContentLoaded", () => {
  init();
  bindEvents();
});

function init() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs?.length) {
      setStatus("error", "No active tab");
      return;
    }

    const tab = tabs[0];
    const videoId = getVideoId(tab.url);

    if (!videoId) {
      setStatus("error", "No video detected");
      addMessage("Open a YouTube video to start.", "ai", true);
      return;
    }

    activeVideoId = videoId;
    activeVideoTitle = tab.title;

    showVideo(tab);
    setStatus("ready", "Ready");
    input.disabled = false;
    input.focus();
  });
}

function bindEvents() {
  sendBtn.addEventListener("click", sendQuestion);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  });

  input.addEventListener("input", () => {
    resizeInput();
    updateCounter();
    toggleSend();
  });

  updateCounter();
  toggleSend();
}

function getVideoId(url) {
  try {
    const u = new URL(url);

    if (u.hostname.includes("youtube.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      if (u.pathname.startsWith("/shorts/"))
        return u.pathname.split("/shorts/")[1]?.split("/")[0];
    }

    if (u.hostname === "youtu.be") return u.pathname.slice(1);

    return null;
  } catch {
    return null;
  }
}

function showVideo(tab) {
  videoTitle.textContent = tab.title.replace(" - YouTube", "");
  videoUrl.textContent = new URL(tab.url).hostname;
  videoBox.hidden = false;
}

function setStatus(type, text) {
  const dot = status.querySelector(".status-indicator");
  const label = status.querySelector(".status-text");

  label.textContent = text;

  dot.style.background =
    type === "error" ? "#ea4335" : type === "loading" ? "#fbbc04" : "#34a853";
}

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
  loader.style.display = "flex";

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
      err.message.includes("fetch") ? "Backend not reachable." : err.message,
      "ai",
      true
    );
    setStatus("error", "Error");
  } finally {
    loader.style.display = "none";
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

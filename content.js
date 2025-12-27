console.log("YouTube Chat Extension loaded");

// Simple helper to check if this is a video page
function isVideoPage() {
  return window.location.pathname === "/watch";
}

if (isVideoPage()) {
  injectChatPanel();
}

function injectChatPanel() {
  // Avoid injecting twice
  if (document.getElementById("yt-chat-panel")) return;

  const panel = document.createElement("div");
  panel.id = "yt-chat-panel";

  panel.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 8px;">
      Chat with this video
    </div>
    <div style="font-size: 12px; color: #666;">
      Phase 1: Extension loaded ✅
    </div>
  `;

  Object.assign(panel.style, {
    position: "fixed",
    top: "80px",
    right: "20px",
    width: "300px",
    height: "200px",
    backgroundColor: "white",
    border: "1px solid #ccc",
    borderRadius: "8px",
    padding: "12px",
    zIndex: 9999,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  });

  document.body.appendChild(panel);
}

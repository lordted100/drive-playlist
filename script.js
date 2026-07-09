const CLIENT_ID = "680156678883-s7f5c805ibivvonop8mblm4cine63trr.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

let tokenClient;
let accessToken = "";
let videos = JSON.parse(localStorage.getItem("videos") || "[]");
let current = Number(localStorage.getItem("current") || 0);
let shuffle = localStorage.getItem("shuffle") === "true";
let repeat = localStorage.getItem("repeat") === "true";

const player = document.getElementById("player");
const drivePreview = document.getElementById("drivePreview");
const nowPlaying = document.getElementById("nowPlaying");
const statusBox = document.getElementById("status");
const playlistBox = document.getElementById("playlist");
const folderInput = document.getElementById("folderInput");
const connectBtn = document.getElementById("connectBtn");
const loadBtn = document.getElementById("loadBtn");
const refreshBtn = document.getElementById("refreshBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const repeatBtn = document.getElementById("repeatBtn");

folderInput.value = localStorage.getItem("folderLink") || "";

window.onload = () => {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (response) => {
      if (response.error) {
        statusBox.textContent = "Google sign-in failed.";
        return;
      }
      accessToken = response.access_token;
      statusBox.textContent = "Connected. Now load your folder.";
      connectBtn.textContent = "Reconnect to Google Drive";
    }
  });

  render();
  updateButtons();
};

connectBtn.onclick = () => {
  tokenClient.requestAccessToken({ prompt: "consent" });
};

loadBtn.onclick = loadFolder;
refreshBtn.onclick = loadFolder;
prevBtn.onclick = previousVideo;
nextBtn.onclick = nextVideo;

shuffleBtn.onclick = () => {
  shuffle = !shuffle;
  localStorage.setItem("shuffle", shuffle);
  updateButtons();
};

repeatBtn.onclick = () => {
  repeat = !repeat;
  localStorage.setItem("repeat", repeat);
  updateButtons();
};

player.addEventListener("ended", () => {
  if (repeat) {
    player.currentTime = 0;
    player.play();
  } else {
    nextVideo();
  }
});

player.addEventListener("timeupdate", () => {
  if (!videos[current]) return;
  localStorage.setItem("lastVideoId", videos[current].id);
  localStorage.setItem("lastTime", player.currentTime);
});

function updateButtons() {
  shuffleBtn.textContent = `Shuffle: ${shuffle ? "On" : "Off"}`;
  repeatBtn.textContent = `Repeat: ${repeat ? "On" : "Off"}`;
}

function getFolderId(input) {
  const folderMatch = input.match(/folders\/([^?]+)/);
  if (folderMatch) return folderMatch[1];
  return input.trim();
}

async function loadFolder() {
  const folderLink = folderInput.value.trim();

  if (!folderLink) {
    alert("Paste your Google Drive folder link first.");
    return;
  }

  if (!accessToken) {
    alert("Tap Connect to Google Drive first.");
    return;
  }

  localStorage.setItem("folderLink", folderLink);
  const folderId = getFolderId(folderLink);

  statusBox.textContent = "Loading videos from Google Drive...";

  try {
    const allFiles = [];
    let pageToken = "";

    do {
      const query = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType contains 'video/'`);
      const fields = encodeURIComponent("nextPageToken,files(id,name,mimeType,size,modifiedTime,webContentLink,webViewLink)");
      let url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=name&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      allFiles.push(...(data.files || []));
      pageToken = data.nextPageToken || "";
    } while (pageToken);

    videos = allFiles.map(file => ({
      id: file.id,
      name: file.name,
      // For Android/browser playback, the video element needs a normal public URL.
      // Make the files or folder "Anyone with the link can view" in Google Drive.
      url: file.webContentLink || `https://drive.google.com/uc?export=download&id=${file.id}`,
      viewUrl: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`
    }));

    localStorage.setItem("videos", JSON.stringify(videos));

    if (!videos.length) {
      current = 0;
      statusBox.textContent = "No videos found. Check that the folder contains MP4/video files.";
      render();
      return;
    }

    const lastVideoId = localStorage.getItem("lastVideoId");
    const lastIndex = videos.findIndex(video => video.id === lastVideoId);
    current = lastIndex >= 0 ? lastIndex : 0;

    statusBox.textContent = `${videos.length} videos loaded. Tap a video, then tap play if Android blocks autoplay.`;
    playCurrent(true);
  } catch (error) {
    console.error(error);
    statusBox.textContent = "Could not load folder. Check the folder link and Google permissions.";
    alert("Could not load the folder. Make sure your Google account can access it and the Drive API is enabled.");
  }
}

function playCurrent(restoreTime = false) {
  if (!videos.length || !videos[current]) return;

  const video = videos[current];

  // Reset both players
  player.pause();
  player.removeAttribute("src");
  player.classList.remove("hidden");
  player.load();

  drivePreview.src = "";
  drivePreview.classList.add("hidden");

  // Try several public Drive URL formats. Google is awkward with video tags,
  // especially on Android, so if these fail we fall back to the official Drive preview player.
  const directUrls = [
    `https://drive.google.com/uc?export=download&id=${video.id}`,
    `https://drive.usercontent.google.com/download?id=${video.id}&export=download&authuser=0`,
    video.url
  ].filter(Boolean);

  let attempt = 0;

  nowPlaying.textContent = video.name;
  statusBox.textContent = "Loading video...";
  localStorage.setItem("current", current);

  function tryUrl() {
    if (attempt >= directUrls.length) {
      usePreviewFallback();
      return;
    }

    player.src = directUrls[attempt++];
    player.preload = "metadata";
    player.load();

    player.onloadedmetadata = () => {
      if (restoreTime && localStorage.getItem("lastVideoId") === video.id) {
        const lastTime = Number(localStorage.getItem("lastTime") || 0);
        if (lastTime > 5 && lastTime < player.duration - 5) {
          player.currentTime = lastTime;
        }
      }
    };

    player.onerror = () => {
      tryUrl();
    };

    player.play()
      .then(() => {
        statusBox.textContent = "Playing.";
      })
      .catch(() => {
        statusBox.textContent = "Tap play on the video player. Android often blocks autoplay.";
      });
  }

  function usePreviewFallback() {
    player.classList.add("hidden");
    player.pause();
    player.removeAttribute("src");
    player.load();

    drivePreview.classList.remove("hidden");
    drivePreview.src = `https://drive.google.com/file/d/${video.id}/preview`;

    statusBox.textContent =
      "Using Google Drive preview mode. If it starts muted/paused, tap the preview player once.";
  }

  tryUrl();
  render();
}
function nextVideo() {
  if (!videos.length) return;

  if (shuffle && videos.length > 1) {
    let next;
    do {
      next = Math.floor(Math.random() * videos.length);
    } while (next === current);
    current = next;
  } else {
    current = (current + 1) % videos.length;
  }

  localStorage.setItem("lastTime", 0);
  playCurrent(false);
}

function previousVideo() {
  if (!videos.length) return;
  current = (current - 1 + videos.length) % videos.length;
  localStorage.setItem("lastTime", 0);
  playCurrent(false);
}

function render() {
  playlistBox.innerHTML = "";

  if (!videos.length) {
    playlistBox.innerHTML = '<div class="track">No playlist loaded yet.</div>';
    nowPlaying.textContent = "Nothing loaded yet";
    return;
  }

  videos.forEach((video, index) => {
    const row = document.createElement("div");
    row.className = "track" + (index === current ? " active" : "");
    row.innerHTML = `<strong>${escapeHtml(video.name)}</strong><br><small>${index + 1} of ${videos.length}</small>`;
    row.onclick = () => {
      current = index;
      localStorage.setItem("lastTime", 0);
      playCurrent(false);
    };
    playlistBox.appendChild(row);
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

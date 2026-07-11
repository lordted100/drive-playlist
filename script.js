const CLIENT_ID = "680156678883-s7f5c805ibivvonop8mblm4cine63trr.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

const TOKEN_KEY = "driveAccessToken";
const TOKEN_EXPIRY_KEY = "driveAccessTokenExpiry";

let tokenClient;
let accessToken = "";

let videos = [];
try {
  videos = JSON.parse(localStorage.getItem("videos") || "[]");
  if (!Array.isArray(videos)) videos = [];
} catch {
  videos = [];
  localStorage.removeItem("videos");
}
let current = Number(localStorage.getItem("current") || 0);
let shuffle = localStorage.getItem("shuffle") === "true";
let repeat = localStorage.getItem("repeat") === "true";

let activeBlobUrl = "";

const player = document.getElementById("player");
const nowPlaying = document.getElementById("nowPlaying");
const statusBox = document.getElementById("status");
const playlistBox = document.getElementById("playlist");
const folderInput = document.getElementById("folderInput");

const connectBtn = document.getElementById("connectBtn");
const loadBtn = document.getElementById("loadBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const repeatBtn = document.getElementById("repeatBtn");

folderInput.value = localStorage.getItem("folderLink") || "";

document.addEventListener("DOMContentLoaded", () => {
  connectBtn.onclick = connectGoogleDrive;
  loadBtn.onclick = loadFolder;
  prevBtn.onclick = previousVideo;
  nextBtn.onclick = nextVideo;

  shuffleBtn.onclick = () => {
    shuffle = !shuffle;
    localStorage.setItem("shuffle", String(shuffle));
    updateButtons();
  };

  repeatBtn.onclick = () => {
    repeat = !repeat;
    localStorage.setItem("repeat", String(repeat));
    updateButtons();
  };

  updateButtons();
  render();
  initialiseGoogleSignIn();
});

async function initialiseGoogleSignIn() {
  statusBox.textContent = "Starting Google Drive connection...";

  const googleReady = await waitForGoogleIdentity();

  if (!googleReady) {
    statusBox.textContent =
      "Google sign-in failed to load. Refresh the page or disable content blocking for this site.";
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: async (response) => {
      if (response.error || !response.access_token) {
        statusBox.textContent = "Google sign-in failed.";
        return;
      }

      saveAccessToken(response);
      connectBtn.textContent = "Google Drive connected";
      statusBox.textContent = "Connected.";

      if (folderInput.value.trim()) {
        await loadFolder();
      }
    },
    error_callback: () => {
      statusBox.textContent =
        "Automatic reconnect was blocked. Tap Connect to Google Drive once.";
    }
  });

  if (restoreAccessToken()) {
    connectBtn.textContent = "Google Drive connected";
    statusBox.textContent = "Connection restored.";

    if (folderInput.value.trim()) {
      loadFolder();
    }
  } else {
    trySilentReconnect();
  }
}

function waitForGoogleIdentity(timeoutMs = 10000) {
  return new Promise(resolve => {
    const started = Date.now();

    const check = () => {
      if (
        window.google &&
        google.accounts &&
        google.accounts.oauth2 &&
        google.accounts.oauth2.initTokenClient
      ) {
        resolve(true);
        return;
      }

      if (Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }

      setTimeout(check, 100);
    };

    check();
  });
}

function connectGoogleDrive() {
  if (!tokenClient) {
    statusBox.textContent =
      "Google sign-in is still loading. Wait a moment, then press Connect again.";
    return;
  }

  tokenClient.requestAccessToken({ prompt: "" });
}

function saveAccessToken(response) {
  accessToken = response.access_token;

  const expiresInSeconds = Number(response.expires_in || 3600);
  const expiryTime = Date.now() + (expiresInSeconds * 1000) - 60000;

  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiryTime));
}

function restoreAccessToken() {
  const savedToken = localStorage.getItem(TOKEN_KEY) || "";
  const expiryTime = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) || 0);

  if (savedToken && expiryTime > Date.now()) {
    accessToken = savedToken;
    return true;
  }

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  return false;
}

function clearAccessToken() {
  accessToken = "";
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

function trySilentReconnect() {
  statusBox.textContent = "Trying to reconnect to Google Drive...";

  setTimeout(() => {
    try {
      if (!tokenClient) {
        statusBox.textContent = "Tap Connect to Google Drive.";
        return;
      }
      tokenClient.requestAccessToken({ prompt: "" });
    } catch (error) {
      console.error(error);
      statusBox.textContent = "Tap Connect to Google Drive.";
    }
  }, 500);
}

player.addEventListener("ended", () => {
  if (repeat) {
    player.currentTime = 0;
    player.play();
  } else {
    nextVideo();
  }
});

function updateButtons() {
  shuffleBtn.textContent = `Shuffle: ${shuffle ? "On" : "Off"}`;
  repeatBtn.textContent = `Repeat: ${repeat ? "On" : "Off"}`;
}

function getFolderId(input) {
  const match = input.match(/folders\/([^?]+)/);
  return match ? match[1] : input.trim();
}

async function authenticatedFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    clearAccessToken();
    connectBtn.textContent = "Connect to Google Drive";
    statusBox.textContent = "Google connection expired. Tap Connect once.";
  }

  return response;
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

  statusBox.textContent = "Loading video list...";

  try {
    const allFiles = [];
    let pageToken = "";

    do {
      const q = encodeURIComponent(
        `'${folderId}' in parents and trashed=false and mimeType contains 'video/'`
      );

      const fields = encodeURIComponent(
        "nextPageToken,files(id,name,mimeType,size,modifiedTime)"
      );

      let url =
        `https://www.googleapis.com/drive/v3/files?q=${q}` +
        `&fields=${fields}` +
        `&orderBy=name` +
        `&pageSize=1000` +
        `&supportsAllDrives=true` +
        `&includeItemsFromAllDrives=true`;

      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const response = await authenticatedFetch(url);

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
      mimeType: file.mimeType || "video/mp4",
      size: Number(file.size || 0)
    }));

    localStorage.setItem("videos", JSON.stringify(videos));

    if (!videos.length) {
      current = 0;
      localStorage.setItem("current", "0");
      statusBox.textContent = "No videos found in that folder.";
      render();
      return;
    }

    current = Math.min(current, videos.length - 1);

    statusBox.textContent = `${videos.length} videos loaded.`;
    render();
  } catch (error) {
    console.error(error);

    if (accessToken) {
      statusBox.textContent =
        "Could not load folder. Check permissions and Drive API setup.";
    }
  }
}

async function fetchVideoBlob(video) {
  const url =
    `https://www.googleapis.com/drive/v3/files/` +
    `${encodeURIComponent(video.id)}?alt=media`;

  const response = await authenticatedFetch(url);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const blob = await response.blob();

  return {
    blob,
    url: URL.createObjectURL(blob)
  };
}

async function playCurrent() {
  if (!videos.length || !videos[current]) {
    return;
  }

  if (!accessToken) {
    alert("Reconnect to Google Drive first.");
    return;
  }

  const video = videos[current];

  nowPlaying.textContent = video.name;
  statusBox.textContent = "Buffering video...";
  localStorage.setItem("current", String(current));
  render();

  try {
    const downloaded = await fetchVideoBlob(video);

    if (activeBlobUrl) {
      URL.revokeObjectURL(activeBlobUrl);
    }

    activeBlobUrl = downloaded.url;

    player.pause();
    player.src = activeBlobUrl;
    player.load();

    await player.play().catch(() => {
      statusBox.textContent = "Ready. Tap play on the video player.";
    });

    if (!player.paused) {
      statusBox.textContent = "Playing.";
    }
  } catch (error) {
    console.error(error);

    if (accessToken) {
      statusBox.textContent =
        "Video failed to buffer. Try reconnecting to Google Drive.";
    }
  }
}

function nextVideo() {
  if (!videos.length) {
    return;
  }

  if (shuffle && videos.length > 1) {
    let next;

    do {
      next = Math.floor(Math.random() * videos.length);
    } while (next === current);

    current = next;
  } else {
    current = (current + 1) % videos.length;
  }

  playCurrent();
}

function previousVideo() {
  if (!videos.length) {
    return;
  }

  current = (current - 1 + videos.length) % videos.length;
  playCurrent();
}

function render() {
  playlistBox.innerHTML = "";

  if (!videos.length) {
    playlistBox.innerHTML =
      '<div class="track">No playlist loaded yet.</div>';
    return;
  }

  videos.forEach((video, index) => {
    const row = document.createElement("div");
    row.className = "track" + (index === current ? " active" : "");

    row.innerHTML = `
      <strong>${escapeHtml(video.name)}</strong><br>
      <small>${index + 1} of ${videos.length}</small>
    `;

    row.onclick = () => {
      current = index;
      playCurrent();
    };

    playlistBox.appendChild(row);
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

window.addEventListener("beforeunload", () => {
  if (activeBlobUrl) {
    URL.revokeObjectURL(activeBlobUrl);
  }
});

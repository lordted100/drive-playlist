const CLIENT_ID = "680156678883-s7f5c805ibivvonop8mblm4cine63trr.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

let tokenClient;
let accessToken = "";

let videos = JSON.parse(localStorage.getItem("videos") || "[]");
let current = Number(localStorage.getItem("current") || 0);
let shuffle = localStorage.getItem("shuffle") === "true";
let repeat = localStorage.getItem("repeat") === "true";

const cache = new Map();       // fileId -> { blob, url, ready }
const loading = new Map();     // fileId -> AbortController
let activeBlobUrl = "";

const player = document.getElementById("player");
const nowPlaying = document.getElementById("nowPlaying");
const statusBox = document.getElementById("status");
const bufferStatus = document.getElementById("bufferStatus");
const playlistBox = document.getElementById("playlist");
const folderInput = document.getElementById("folderInput");

const connectBtn = document.getElementById("connectBtn");
const loadBtn = document.getElementById("loadBtn");
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
      connectBtn.textContent = "Reconnect to Google Drive";
      statusBox.textContent = "Connected. Load your folder.";
    }
  });

  updateButtons();
  render();
};

connectBtn.onclick = () => tokenClient.requestAccessToken({ prompt: "consent" });
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
  localStorage.setItem("lastTime", String(player.currentTime || 0));

  // When the current video is over 20% played, make sure the next two are being prepared.
  if (player.duration && player.currentTime / player.duration > 0.2) {
    preloadUpcoming();
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

async function loadFolder() {
  const folderLink = folderInput.value.trim();
  if (!folderLink) return alert("Paste your Google Drive folder link first.");
  if (!accessToken) return alert("Tap Connect to Google Drive first.");

  localStorage.setItem("folderLink", folderLink);
  const folderId = getFolderId(folderLink);

  statusBox.textContent = "Loading video list...";
  bufferStatus.textContent = "";

  try {
    const allFiles = [];
    let pageToken = "";

    do {
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType contains 'video/'`);
      const fields = encodeURIComponent("nextPageToken,files(id,name,mimeType,size,modifiedTime)");
      let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=name&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
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

    const lastId = localStorage.getItem("lastVideoId");
    const lastIndex = videos.findIndex(v => v.id === lastId);
    current = lastIndex >= 0 ? lastIndex : 0;

    statusBox.textContent = `${videos.length} videos loaded. Preparing first video...`;
    render();

    await playCurrent(true);
  } catch (err) {
    console.error(err);
    statusBox.textContent = "Could not load folder. Check permissions and Drive API setup.";
  }
}

async function fetchVideoBlob(video, priority = false) {
  if (cache.has(video.id)) return cache.get(video.id);
  if (loading.has(video.id)) return loading.get(video.id).promise;

  const controller = new AbortController();
  const item = { controller, loaded: 0, total: video.size || 0 };

  const promise = (async () => {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(video.id)}?alt=media`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal
    });

    if (!res.ok) throw new Error(await res.text());

    const total = Number(res.headers.get("content-length") || video.size || 0);
    item.total = total;

    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loaded += value.length;
      item.loaded = loaded;

      if (priority || isUpcoming(video.id)) {
        updateBufferStatus();
      }
    }

    const blob = new Blob(chunks, { type: video.mimeType || "video/mp4" });
    const blobUrl = URL.createObjectURL(blob);
    const cached = { blob, url: blobUrl, ready: true, size: blob.size };

    cache.set(video.id, cached);
    loading.delete(video.id);
    updateBufferStatus();
    trimCache();

    return cached;
  })();

  item.promise = promise;
  loading.set(video.id, item);

  return promise;
}

function isUpcoming(fileId) {
  const upcoming = getUpcomingIndexes(2).map(i => videos[i]?.id);
  return upcoming.includes(fileId);
}

async function playCurrent(restoreTime = false) {
  if (!videos.length || !videos[current]) return;
  if (!accessToken) return alert("Reconnect to Google Drive first.");

  const video = videos[current];
  nowPlaying.textContent = video.name;
  statusBox.textContent = "Buffering video...";
  localStorage.setItem("current", String(current));
  render();

  try {
    const cached = await fetchVideoBlob(video, true);

    if (activeBlobUrl && activeBlobUrl !== cached.url) {
      // Do not revoke immediately if it is still cached.
    }

    player.src = cached.url;
    player.load();

    player.onloadedmetadata = () => {
      if (restoreTime && localStorage.getItem("lastVideoId") === video.id) {
        const lastTime = Number(localStorage.getItem("lastTime") || 0);
        if (lastTime > 5 && player.duration && lastTime < player.duration - 5) {
          player.currentTime = lastTime;
        }
      }
    };

    await player.play().catch(() => {
      statusBox.textContent = "Ready. Tap play on the video player.";
    });

    activeBlobUrl = cached.url;
    statusBox.textContent = "Playing.";
    preloadUpcoming();
  } catch (err) {
    console.error(err);
    statusBox.textContent = "Video failed to buffer. Try reconnecting to Google Drive.";
  }
}

function getUpcomingIndexes(count) {
  if (!videos.length) return [];

  const indexes = [];
  let idx = current;

  for (let n = 0; n < count; n++) {
    if (shuffle && videos.length > 1) {
      let next;
      do {
        next = Math.floor(Math.random() * videos.length);
      } while (next === idx && videos.length > 1);
      idx = next;
    } else {
      idx = (idx + 1) % videos.length;
    }

    if (!indexes.includes(idx) && idx !== current) indexes.push(idx);
  }

  return indexes;
}

function preloadUpcoming() {
  if (!accessToken || !videos.length) return;

  const upcoming = getUpcomingIndexes(2);
  for (const index of upcoming) {
    const video = videos[index];
    if (video && !cache.has(video.id) && !loading.has(video.id)) {
      fetchVideoBlob(video, false).catch(err => console.warn("Preload failed", err));
    }
  }

  updateBufferStatus();
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

  localStorage.setItem("lastTime", "0");
  playCurrent(false);
}

function previousVideo() {
  if (!videos.length) return;
  current = (current - 1 + videos.length) % videos.length;
  localStorage.setItem("lastTime", "0");
  playCurrent(false);
}

function trimCache() {
  // Keep current video + next two + previous one. Revoke older blobs to save phone storage/RAM.
  const keep = new Set();
  if (videos[current]) keep.add(videos[current].id);
  for (const i of getUpcomingIndexes(2)) {
    if (videos[i]) keep.add(videos[i].id);
  }
  const prevIndex = (current - 1 + videos.length) % videos.length;
  if (videos[prevIndex]) keep.add(videos[prevIndex].id);

  for (const [id, cached] of cache.entries()) {
    if (!keep.has(id)) {
      URL.revokeObjectURL(cached.url);
      cache.delete(id);
    }
  }
}

function updateBufferStatus() {
  const upcoming = getUpcomingIndexes(2);
  const parts = [];

  for (const index of upcoming) {
    const video = videos[index];
    if (!video) continue;

    if (cache.has(video.id)) {
      parts.push(`Ready: ${video.name}`);
    } else if (loading.has(video.id)) {
      const item = loading.get(video.id);
      const pct = item.total ? Math.round((item.loaded / item.total) * 100) : 0;
      parts.push(`Preloading ${pct}%: ${video.name}`);
    }
  }

  bufferStatus.textContent = parts.join(" | ");
  render();
}

function render() {
  playlistBox.innerHTML = "";

  if (!videos.length) {
    playlistBox.innerHTML = '<div class="track">No playlist loaded yet.</div>';
    return;
  }

  videos.forEach((video, index) => {
    const row = document.createElement("div");
    row.className = "track" + (index === current ? " active" : "");

    let state = "";
    if (cache.has(video.id)) state = "Ready";
    else if (loading.has(video.id)) {
      const item = loading.get(video.id);
      const pct = item.total ? Math.round((item.loaded / item.total) * 100) : 0;
      state = `Preloading ${pct}%`;
    }

    row.innerHTML = `
      <strong>${escapeHtml(video.name)}</strong><br>
      <small>${index + 1} of ${videos.length}${state ? " · " + state : ""}</small>
      ${state && state.startsWith("Preloading") ? `<div class="progress"><div class="bar" style="width:${state.match(/\d+/)?.[0] || 0}%"></div></div>` : ""}
    `;

    row.onclick = () => {
      current = index;
      localStorage.setItem("lastTime", "0");
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

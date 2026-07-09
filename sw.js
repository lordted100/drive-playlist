let accessToken = "";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SET_ACCESS_TOKEN") {
    accessToken = event.data.token || "";
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (!url.pathname.includes("/drive-media/")) {
    return;
  }

  event.respondWith(handleDriveMedia(event.request, url));
});

async function handleDriveMedia(request, url) {
  if (!accessToken) {
    return new Response("Missing Google access token. Reconnect to Google Drive.", {
      status: 401,
      headers: { "Content-Type": "text/plain" }
    });
  }

  const fileId = decodeURIComponent(url.pathname.split("/drive-media/")[1] || "");
  if (!fileId) {
    return new Response("Missing file id.", { status: 400 });
  }

  const driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${accessToken}`);

  const range = request.headers.get("Range");
  if (range) headers.set("Range", range);

  const driveResponse = await fetch(driveUrl, {
    method: "GET",
    headers
  });

  const responseHeaders = new Headers(driveResponse.headers);
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Accept-Ranges", "bytes");

  return new Response(driveResponse.body, {
    status: driveResponse.status,
    statusText: driveResponse.statusText,
    headers: responseHeaders
  });
}

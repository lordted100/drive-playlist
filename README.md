# Drive Playlist v1.2

Base: v1.1.

Only one feature was added:

- The currently selected video's completed Blob is stored in IndexedDB.
- After refreshing or reopening the page, that current video is restored from
  browser storage instead of being downloaded from Google Drive again.
- The saved playback time is restored.
- Upcoming preloaded videos are still memory-only and must preload again.

No existing playback, playlist, shuffle, repeat, or upcoming-preload behaviour
was intentionally changed.

Notes:
- Android Chrome may require one tap on Play after reopening.
- The cached current video uses browser storage but does not appear in Downloads.
- Chrome may remove cached site data if the device is very low on storage.

Replace these files in GitHub:
- index.html
- style.css
- script.js

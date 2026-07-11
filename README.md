# Drive Playlist — Auto Reconnect Only

This build is based directly on the uploaded `drive-playlist-blob-preload(1).zip`.

Changes made:

- Added reuse of a still-valid Google access token.
- Added an automatic silent reconnect attempt.
- Automatically reloads the saved Google Drive folder after reconnecting.
- Removed playback-position resume.
- Removed preloading of the next two videos.
- Kept the existing ordinary shuffle and repeat controls.
- Kept one video player and the existing layout.

Upload these files to the root of the GitHub repository:

- index.html
- style.css
- script.js

Google can still require one tap on Connect after its access token expires or when
the browser blocks silent authorization. A permanent refresh-token login is not
possible on a static GitHub Pages site without a secure backend.

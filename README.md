# Drive Playlist - Blob Preload Build

Upload these three files to your GitHub repository root:

- index.html
- style.css
- script.js

This version:
- uses Google OAuth to list your Drive folder
- fetches videos as temporary browser blobs
- preloads the next two videos while the current one plays
- automatically starts the next video from the preloaded blob
- does not save videos to your Downloads folder

Note:
The first video may take a few seconds to buffer.
After that, transitions should be much smoother because upcoming videos are already being prepared.

# Drive Playlist v1.1

Base: the exact uploaded working `drive-playlist-blob-preload(1).zip`.

Only Google connection behaviour was changed:

- Reuses the existing access token until it expires.
- Attempts a silent reconnect when the token is no longer valid.
- The Connect button reuses the existing Google session where possible.

No playback, playlist, shuffle, repeat, resume-position, or preload code was changed.

Replace these files in GitHub:
- index.html
- style.css
- script.js

Google can still require one Connect tap after the access token expires or if Chrome blocks silent authorization.

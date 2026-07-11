# Drive Playlist — Auto Reconnect Only, Button Fix

This is the same requested build, with one technical correction:

- Google Identity Services is now allowed to finish loading before OAuth is initialized.
- Button handlers are attached immediately after the page loads.
- Corrupt/stale local playlist storage can no longer stop the JavaScript.
- No resume-position feature.
- No next-two-video preloading.
- Existing ordinary shuffle and repeat remain unchanged.

Replace:
- index.html
- style.css
- script.js

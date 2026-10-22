<img width="2000" height="2000" alt="Kolli" src="https://github.com/user-attachments/assets/64fe9247-2a25-4599-9227-95f777b3d749" />

# Kolli

Kolli matches people who want to watch the same movie or show. Visitors can join with a display name; Google sign-in is not required. After a match, share a Kosmi room invite link in the lobby, watch together, then finish the session and rate each other.

## Run locally

Kolli is served by its Express backend. Do not open `public/index.html` directly as a `file://` URL; API requests and guest sessions need the server.

1. Install Node.js and MongoDB.
2. Set `MONGODB_URI` (or `MONGO_URL`) and a private `JWT_SECRET` in your environment.
3. Run `npm install`, then `npm start`.
4. Open `http://localhost:3000`.

Google OAuth is optional. To enable it, configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL`. TMDB credentials are optional; search uses the built-in sample titles when they are not configured.

If hosting the static front end separately, set the `kolli-api-base` meta tag in `public/index.html` to the backend's HTTPS origin and set `CLIENT_URL` on the backend to the front-end origin. Production auth cookies use `SameSite=None; Secure` for that cross-origin setup.

Kosmi rooms are created on Kosmi itself. Share the room's HTTPS invite URL in the Kolli lobby; Kolli syncs it to both matched users and attempts to embed it. If Kosmi does not allow embedding that room, use the provided open-in-new-tab link.

# Hevi Explorer — Private Media Vault

A self-hosted private media vault and local file manager that runs on Replit and other Node.js environments, letting users browse, manage, and stream files through a browser.

## Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla JS + CSS, served from `public/`
- **Runtime port**: 5000
- **Replit workflow**: `Start application` runs `node server.js`
- **Replit default root**: `files/` inside the workspace unless `ROOT_DIR` is explicitly set

## Project Structure

```
server.js              - Express HTTP server + Socket.io signaling hub (AeroGrab), API routes, indexing, thumbnails, file streaming, cloud backend
files/                 - Default browseable file root on Replit, created automatically at startup
public/
  index.html           - SPA shell (includes AeroGrab UI: toggle, permission dialog, wake panel, animation stage)
  style.css            - UI styles (includes AeroGrab styles)
  brand.svg            - Hevi Explorer logo and favicon
  app.js               - Frontend application logic (includes cloud, openFile hook for AeroGrab)
  aerograb.js          - AeroGrab client: Socket.io, MediaPipe 12fps gesture detection, WebRTC P2P, session management
  aerograb-animation.js- AeroGrab Fly animations: Energy Squeeze, Rocket Launch, Landing, Progress Ring
  iv.js                - Advanced image viewer module
  sw.js                - Service worker (v13, caches AeroGrab files)
data/
  index.json     - Persistent file index and category caches
  thumbs/        - Server-side thumbnail cache
  userstate.json - User state (recent files, favorites, view preferences)
  server_secret.key - AES-256-GCM master key for credential encryption (auto-generated)
  cloud_devices.json - Device registry for cross-device cloud account sharing
  profiles/{did}/cloud_creds.json - Per-device encrypted cloud credentials
package.json     - npm manifest
```

## Dependencies

- `express` for the HTTP server and API routes
- `compression` for gzip response compression
- `socket.io` for AeroGrab real-time signaling (WebSocket, session management)
- Node UDP (`dgram`) for AeroGrab zero-config same-WiFi discovery between independently running Hevi servers
- `exifr` for image metadata extraction
- `music-metadata` for audio artwork and tag metadata
- `heic2any` for browser-side HEIC/HEIF conversion when the user requests a preview
- `googleapis` for Google Drive OAuth2 and API
- `dropbox` for Dropbox SDK
- `megajs` for MEGA cloud storage (CommonJS, v1)
- `node-fetch` (v2) and `isomorphic-fetch` for OneDrive/Dropbox token refresh HTTP calls
- CDN (browser-only): `socket.io-client`, `@mediapipe/hands`, `@mediapipe/camera_utils`, `jszip`, `anime.js`

## Replit Compatibility

The app is configured for Replit with:

- Node.js 20 in `.replit`
- A web workflow on port 5000
- Server binding to `0.0.0.0`
- A safe Replit default file root at `files/`
- Path traversal protection via server-side path resolution under `ROOT_DIR`
- Hidden-file mode indexes all readable filesystem entries, including dot-prefixed folders, `.nomedia` folders, trash/deleted-style folders, and WhatsApp `.Statuses`; turning Hidden Files off filters those paths from browse, search, and category views

## Running

```bash
npm start
```

Override root directory:

```bash
ROOT_DIR=/home/runner/workspace/files node server.js
ROOT_DIR=/sdcard node server.js
ROOT_DIR=/storage/emulated/0 node server.js
ROOT_DIR=/home node server.js
ROOT_DIR=/ node server.js
```

## Features

- Cloud Storage Integration: connect Google Drive, Dropbox, OneDrive, and MEGA with BYOK credentials; AES-256-GCM encrypted storage per device; OAuth popup flows; cross-device account sharing; in-app cloud file browser with breadcrumb navigation; file proxy for direct viewing; delete and share controls
- Browse files and folders under the configured root directory
- Home page storage summary with a compact used/free bar and a Manage details modal showing Images, Videos, Audio, Documents, Archives, APKs, Other, and System usage
- Bottom navigation includes a right-side WAN shortcut that opens a standalone Cloudflare Tunnel control panel for start/stop, public URL copy, QR code, refresh, and install flow
- Custom Hevi Explorer branding with an SVG app logo, favicon, lock-screen mark, header lockup, and sidebar mark
- Premium About page with English product copy, privacy-focused storytelling, route-aware animations, and back-button-safe navigation
- Category filtering for videos, images, audio, files, archives, and APKs
- Video player with range streaming, capped chunks, seeking gestures, resume support, and preview thumbnails
- Advanced image viewer with zoom, pan, metadata, and filters
- Native image formats use standard previews; HEIC/HEIF uses on-demand viewer conversion; RAW/Pro image formats show static fallback cards with download support
- Music player with queue, artwork extraction, visualizer, sleep timer, and drag-to-reorder queue
- Text/code viewer
- Extension-specific file icons for PDF, fonts, temporary files, code files, office documents, archives, and OPUS voice audio
- Archive preview fallback explains when a compressed file cannot be viewed and suggests downloading/extracting it
- File upload
- New folder creation
- File/folder deletion, with root deletion blocked
- Search across indexed files
- Grid/list view toggle
- Persistent recent files and favorites
- AeroGrab same-WiFi Auto LAN mode: independent Termux/Kali Hevi instances broadcast presence over UDP and relay signaling server-to-server, so users can keep using their own local app without typing another device's IP.
- AeroGrab live gesture mode: bottom-right camera preview with on-device MediaPipe hand landmarks, live curl-ratio debug label, fist-to-grab and open-palm-to-catch detection, plus manual grab fallback.

## Performance

- Server-side pagination for listings, search, and categories
- About page animations are activated only while the About subpage is open and are stopped when the user exits the page
- Persistent file index stored in `data/index.json`
- Background index refresh and filesystem watcher when available
- Image thumbnail caches for media previews
- HEIC/HEIF, RAW, DNG, PSD, AI, and TIFF-style formats are excluded from automatic server-side thumbnail and preview generation
- Video thumbnails and timeline previews are generated in the browser with canvas instead of server-side FFmpeg work
- 4 MB video chunk cap for safer streaming in constrained environments

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ls?path=&page=0&limit=50` | List directory contents |
| GET | `/api/search?q=&path=&page=0&limit=50` | Search indexed files |
| GET | `/api/category/:cat?page=0&limit=50` | List files by category |
| GET | `/file?path=` | Stream/serve a file |
| GET | `/file?path=&dl=1` | Download a file |
| POST | `/api/upload?path=` | Upload file(s) |
| POST | `/api/mkdir?path=` | Create folder |
| DELETE | `/api/delete?path=` | Delete file/folder |
| GET | `/api/info` | Server/runtime info |
| GET | `/api/index/status` | File index status |
| POST | `/api/index/rebuild` | Rebuild file index in the background |
| GET | `/api/storage` | Disk used/free summary and category-wise storage breakdown |
| GET | `/api/userstate` | Read persistent user state |
| POST | `/api/userstate/recent` | Add a recent file |
| DELETE | `/api/userstate/recent` | Clear recent files |
| POST | `/api/userstate/favorite` | Toggle favorite file |
| GET | `/api/cloud/accounts` | List connected cloud accounts for this device |
| POST | `/api/cloud/connect` | Add a new cloud account (MEGA direct login) |
| GET | `/api/cloud/:accountId/oauth/start` | Begin OAuth flow for Google Drive / Dropbox / OneDrive |
| GET | `/api/cloud/callback/google` | Google Drive OAuth callback |
| GET | `/api/cloud/callback/dropbox` | Dropbox OAuth callback |
| GET | `/api/cloud/callback/onedrive` | OneDrive OAuth callback |
| GET | `/api/cloud/:accountId/ls` | List files in a cloud folder |
| GET | `/api/cloud/:accountId/file` | Proxy a cloud file for viewing/streaming |
| DELETE | `/api/cloud/:accountId` | Disconnect a cloud account |
| POST | `/api/cloud/:accountId/share` | Share a cloud account with another device |
| POST | `/api/aerograb/lan/wake` | Internal same-WiFi AeroGrab wake relay between local servers |
| POST | `/api/aerograb/lan/drop` | Internal same-WiFi AeroGrab receiver approval relay |
| POST | `/api/aerograb/lan/signal` | Internal same-WiFi WebRTC signaling relay |

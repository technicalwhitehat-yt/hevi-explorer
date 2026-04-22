
<br/>
<br/>

---

<div align="center">

# AeroGrab Technology Blueprint

## Touchless Gesture-Controlled P2P File Transfer System
### with LAN-Aware Distributed Hevi Network

### by Technical White Hat (TWH)

**Document Version:** 3.0 — Latest Stable (v10)
**Classification:** Internal Engineering Blueprint
**Author:** Technical White Hat (TWH), Independent Developer
**Created:** April 18, 2026 | **Updated:** April 22, 2026
**Platform:** TWH Eco System Technology (Hevi Explorer)
**Status:** 🟢 v1 → v10 ALL SHIPPED — Auto LAN discovery, MediaPipe Tasks Vision gestures, in-app open, cancel both-sides, heating-optimised, history, tutorial — all live in production

</div>

---

<br/>

> *"The future of file transfer is not about cables, not about clouds — it's about intention. You grab, you throw, someone catches."*
> — Technical White Hat (TWH), Creator of AeroGrab

<br/>

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Vision & Motivation](#2-vision--motivation)
3. [The Problem AeroGrab v2 Solves](#3-the-problem-aerograb-v2-solves)
4. [How AeroGrab Works — Plain English (v2 Model)](#4-how-aerograb-works--plain-english-v2-model)
5. [Core Technical Architecture — Distributed LAN Model](#5-core-technical-architecture--distributed-lan-model)
6. [LAN Discovery & Device Registry System](#6-lan-discovery--device-registry-system)
7. [The P2P Bridge System — No Server File Routing](#7-the-p2p-bridge-system--no-server-file-routing)
8. [Intelligent File Selection Matrix](#8-intelligent-file-selection-matrix)
9. [Gesture Recognition Engine](#9-gesture-recognition-engine)
10. [Privacy & Permission Model](#10-privacy--permission-model)
11. [AeroGrab Fly — UI Animation Strategy](#11-aerograb-fly--ui-animation-strategy)
12. [Session Lifecycle & State Management](#12-session-lifecycle--state-management)
13. [Folder Transfer & Auto-Zip Protocol](#13-folder-transfer--auto-zip-protocol)
14. [Error Handling & Edge Cases](#14-error-handling--edge-cases)
15. [Developer Implementation Guide](#15-developer-implementation-guide)
16. [Function Reference](#16-function-reference)
17. [Phased Rollout Plan](#17-phased-rollout-plan)
18. [Technology Stack Summary](#18-technology-stack-summary)

---

<br/>

## 1. Executive Summary

AeroGrab is a gesture-controlled, peer-to-peer file transfer system built for the TWH Eco System Technology (Hevi Explorer). Users on the same Wi-Fi/LAN each run their **own** Hevi Explorer instance — serving their own files from their own device. AeroGrab connects these independent instances, lets them discover each other automatically, and enables file transfer by physical gesture: close your fist to grab a file, open your palm to catch it.

**v1 (Implemented):** Single-server model. AeroGrab built as an overlay on a centralized Hevi Explorer — gesture detection, WebRTC P2P data channel, animations, socket signaling all working.

**v2 (This Document):** Distributed model. Each device runs its own Hevi Explorer. Instances auto-discover each other on the LAN. AeroGrab transfers files between genuinely separate devices with separate file stores.

The system is engineered around three non-negotiable principles:

**Speed** — File data travels directly between devices via a WebRTC P2P Bridge. The signaling server handles only the "who is who" handshake — never the file bytes.

**Privacy** — Camera feed never leaves the device. MediaPipe runs entirely in-browser, on-device. Server receives only gesture event strings, never video or file content.

**Simplicity** — Despite sophisticated internals, AeroGrab has zero learning curve. Each device on the network sees all other devices. You pick, you grab, someone catches. Done.

---

<br/>

## 2. Vision & Motivation

### Why AeroGrab?

File transfer on local networks today is either clunky (USB cables, SMB shares, AirDrop menus) or requires cloud intermediaries (WhatsApp, Google Drive) that are unnecessary when devices are sitting in the same room.

AeroGrab v2 is the answer for **Hevi Explorer's natural use case**: you have 10 phones in a family, a classroom, or an office — all on the same Wi-Fi. Every person runs Hevi Explorer on their own phone. They can see each other's devices on the network, and sending a file is as natural as physically handing it to someone.

### Who Built This?

AeroGrab was conceived and architected by **Technical White Hat (TWH)**, the developer behind Hevi Explorer — TWH Eco System Technology. The technology was designed from scratch, inspired by the concept of physical intuition: transferring a file should feel as natural as handing someone a physical object.

---

<br/>

## 3. The Problem AeroGrab v2 Solves

### The v1 Architectural Flaw

In v1, all devices browsed **one shared** Hevi Explorer server. If Device A grabbed a file and Device B caught it:
- Both devices were looking at the **same files** (from the same server)
- "Receiving" a file meant getting a browser download of something already on the server
- This was redundant — Device B could already just click download

```
v1 Problem:
  Device A ──sees──→ [Host Server's Files]
  Device B ──sees──→ [Host Server's Files]   ← same files!
  AeroGrab: transfers file from host to... device B browser download
  But device B already had access. Redundant.
```

### The v2 Solution: Separate Instances, LAN-Aware

```
v2 Solution:
  Device A → runs Hevi Explorer → serves ITS OWN files (phone A's storage)
  Device B → runs Hevi Explorer → serves ITS OWN files (phone B's storage)
  Device C → runs Hevi Explorer → serves ITS OWN files (phone C's storage)

  All three discover each other automatically on the same WiFi.
  Device A grabs a file → it fetches from ITS OWN server (localhost:5000)
  Device B catches it → gets the file as a download to ITS LOCAL storage
  Genuinely P2P. Files are truly transferred between different devices.
```

---

<br/>

## 4. How AeroGrab Works — Plain English (v2 Model)

Imagine 20 phones in a classroom. Each phone is running Hevi Explorer. They are all on the same school Wi-Fi.

**When any phone joins the network:**
Hevi Explorer automatically announces itself — *"I am Phone 7, I am online."* Every other phone's Hevi Explorer immediately updates: *"20 devices on this network."* A device list appears in a new "Network" tab showing all 20 phones — their names, avatars, and online status.

**Sending a file (Phone A → Phone B):**
1. Phone A opens a photo in Hevi Explorer
2. Phone A enables AeroGrab, makes a fist — *"I am grabbing this photo"*
3. All 20 phones receive a wake-up signal: *"Phone A is sending something!"*
4. Phone B opens its palm — *"I will catch it"*
5. Server applies **First Confirmed Receiver Wins** — Phone B gets the transfer
6. Direct P2P WebRTC connection opens between Phone A and Phone B
7. Photo travels directly A→B at full Wi-Fi speed — no server in the middle
8. Phone B's browser downloads the photo to its local storage

**The server's role in v2:** Only coordination. It maintains the device registry (who is online), brokers WebRTC handshakes, and enforces session rules. It never touches a single byte of file content.

---

<br/>

## 5. Core Technical Architecture — Distributed LAN Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                AeroGrab v2 — Distributed LAN Architecture                │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐    Heartbeat + Signal    ┌──────────────────────────┐
  │   DEVICE A       │ ←──────────────────────→ │   SIGNALING SERVER       │
  │  Hevi Explorer   │                          │  (Central Coordinator)   │
  │  localhost:5000  │                          │  ─────────────────────── │
  │  Own files only  │ ←──────────────────────→ │  • Device Registry       │
  │  MediaPipe ON    │    Heartbeat + Signal    │  • Session Management    │
  └────────┬─────────┘                          │  • WebRTC Relay Only     │
           │                                    │  • NEVER sees file bytes │
           │  Direct WebRTC File Transfer       └──────────┬───────────────┘
           │  (P2P Data Channel)                           │
           │  Device A's file → Device B's download        │ Heartbeat + Signal
           │                                               │
  ┌────────▼─────────┐                          ┌──────────▼───────────────┐
  │   DEVICE B       │                          │   DEVICES C, D, E...     │
  │  Hevi Explorer   │                          │  Hevi Explorer each      │
  │  localhost:5000  │                          │  localhost:5000 each     │
  │  Own files only  │                          │  Own files, own storage  │
  │  MediaPipe ON    │                          │  Online, awaiting signal │
  └──────────────────┘                          └──────────────────────────┘

  KEY PRINCIPLES:
  1. Each device has its own Hevi Explorer instance and its own file storage
  2. File bytes NEVER pass through the signaling server
  3. Server only knows: who is online, who grabbed, who caught
  4. LAN discovery is automatic — no manual IP entry
```

### Architecture Layers

| Layer | Technology | Purpose |
|---|---|---|
| LAN Discovery | Socket.io rooms + Heartbeat | Devices find each other automatically on same network |
| Device Registry | Server-side Map + broadcast | Maintain live list of all online Hevi instances |
| Gesture Detection | Google MediaPipe Hands (JS) | On-device, 12fps hand landmark tracking |
| Signaling | Socket.io (WebSocket) | Lightweight coordination between devices and server |
| File Transfer | WebRTC Data Channel | Direct P2P encrypted file streaming |
| File Serving | Each device's own Node.js | Each device serves its own files from own storage |
| Animation | CSS Keyframes + anime.js | Latency-masking UI animations |

---

<br/>

## 6. LAN Discovery & Device Registry System

This is the **core new feature of v2**. It is what makes AeroGrab genuinely useful.

### The Problem with Manual Discovery

Older tools require users to manually enter IP addresses or scan QR codes. This creates friction and breaks the "just works" promise. AeroGrab v2 uses automatic LAN discovery.

### How Discovery Works

Every Hevi Explorer instance, when it starts, connects to the signaling server and registers itself:

```javascript
// On startup (client side)
socket.emit('HEVI_ANNOUNCE', {
  deviceId:   'uuid-unique-per-install',   // generated once, stored in localStorage
  deviceName: 'Rahul Ka Phone',            // from device hostname or user-set
  avatar:     '📱',                        // emoji or initials
  version:    '1.0.0',
});
```

The server maintains a **Device Registry**:

```javascript
// Server side — in-memory Map
const heviDevices = new Map();
// Key: socket.id
// Value: { deviceId, deviceName, avatar, joinedAt, lastSeen }
```

When any device registers, the server broadcasts the updated device list to ALL connected devices:

```javascript
// Server broadcasts to everyone
io.emit('HEVI_PEERS_UPDATE', {
  devices: [...heviDevices.values()],
  total:   heviDevices.size,
});
```

### Heartbeat System

Every device sends a heartbeat every 15 seconds. If a device misses 2 consecutive heartbeats (30 seconds), it is removed from the registry and all other devices are notified.

```
Client → Server: HEVI_HEARTBEAT (every 15s)
Server → All:    HEVI_PEERS_UPDATE (when any device joins, leaves, or times out)
```

### Network Tab in Hevi Explorer

A new **"Network"** section appears in Hevi Explorer showing:

```
┌────────────────────────────────────────────────┐
│  🌐 Hevi Network — 4 devices online           │
│  ────────────────────────────────────────────  │
│  📱 Rahul Ka Phone        ● Online   [Send →]  │
│  💻 Laptop Ghar           ● Online   [Send →]  │
│  📱 Bhai Ka Phone         ● Online   [Send →]  │
│  📟 Tablet                ● Online   [Send →]  │
└────────────────────────────────────────────────┘
```

### Targeted vs Broadcast Transfer

**v1 Behavior:** Grab → everyone wakes up → first palm wins
**v2 Behavior (two modes):**

| Mode | Trigger | Behavior |
|---|---|---|
| **Broadcast** | Fist gesture (no target) | Everyone gets wake-up, first palm wins |
| **Targeted** | Tap device in Network tab → then fist | Only that specific device gets the wake-up |

Targeted mode is more private and more precise — like pointing at someone before throwing.

### LAN vs WAN

The signaling server can be:
- **Deployed on Replit** (accessible from internet) — works over 4G/5G too, as long as both devices connect to same signaling server
- **Running on local device** (one phone runs the server, others connect via LAN IP) — fully offline, zero internet dependency

For Termux users: one device runs `node server.js` on port 5000. All other devices connect to `http://[that-device-ip]:5000`. They all auto-discover each other.

### Cross-Server Auto LAN Discovery (v3+) — UDP Broadcast Bridge

The "every device runs its own server" model creates a problem: by default, devices on different localhost servers can't see each other through Socket.io alone. v3 added a **UDP broadcast bridge** so two phones each running their own Hevi can still discover each other on the same WiFi without anyone connecting to anyone else's URL.

| Component | Detail |
|---|---|
| **Discovery port** | UDP `45555` (override `AEROGRAB_DISCOVERY_PORT`, disable `AEROGRAB_LAN_DISCOVERY=0`). |
| **Announce packet** | Each server broadcasts `{ serverId, name, port, ts }` every 3 s. |
| **Peer TTL** | 12 s. Missing 4 announces → drop from `lanServers` Map. |
| **Cross-server signalling** | HTTP relay endpoints on every Hevi: `POST /api/aerograb/lan/{wake,drop,signal,end}`. A remote server posts a signalling event addressed to one of our local sockets. |
| **Composite peer IDs** | `lan:<serverId>:<socketId>` — embedded inside `webrtc_signal`, `WAKE_UP_CAMERAS`, `DROP_HERE`, `SESSION_END`, `TRANSFER_APPROVED` payloads. |
| **Combined device list** | Server merges `heviDevices` + `lanServers` and tags each with `source: 'local' \| 'lan'` so the UI labels cards "Online · Auto LAN". |

Result: two phones each open `http://localhost:5000` on their own device, never enter each other's URL, and still see each other in the Hevi Network panel within ~5 s.

### Stale-Device Sweep

A `setInterval` on the server runs every 15 s and removes any registered device with `lastSeen > 45 s`, then re-broadcasts `HEVI_PEERS_UPDATE`. This kills ghost entries from browsers that crashed or lost network without a clean disconnect.

---

<br/>

## 7. The P2P Bridge System — No Server File Routing

### The AeroGrab Solution: P2P Bridge

AeroGrab uses **WebRTC Data Channels** for actual file transfer. WebRTC creates a direct, encrypted, peer-to-peer connection between two browsers.

```
Traditional (BAD):    Sender → Server RAM → Receiver  (2x bandwidth, bottleneck)

AeroGrab P2P (GOOD):  Sender ─────────────────────────→ Receiver (direct, full LAN speed)
                                    ↑
                      Server only handles "who connects to whom" (WebRTC signaling)
```

### WebRTC Signaling Flow

```
Step 1: Sender creates WebRTC Offer → sends to Signaling Server
Step 2: Server forwards Offer to Receiver
Step 3: Receiver creates WebRTC Answer → sends to Server
Step 4: Server forwards Answer to Sender
Step 5: P2P connection established — Server steps out completely
Step 6: File streams directly Sender → Receiver at full LAN/WiFi speed
```

### How Sender Reads the File

The sender fetches the file from **its own local Hevi Explorer server** (`/file?path=...`). Since each device's browser is pointed at its own `localhost:5000`, this naturally reads from the sender's own storage:

```javascript
const resp = await fetch(`/file?path=${encodeURIComponent(payload.path)}`);
const blob = await resp.blob();
// Blob is then streamed via WebRTC to the receiver
```

### Chunking, Buffering & Back-Pressure (current stable values)

| Constant | Value | Purpose |
|---|---|---|
| `CHUNK_SIZE` | **512 KB** (524,288 B) | Each WebRTC `dataChannel.send()` payload. Larger than the old 64 KB → fewer JS round-trips → much higher throughput on LAN. |
| `BUFFER_HIGH_WATER` | **8 MB** | When `dataChannel.bufferedAmount` exceeds this, the sender pauses pulling more bytes. (Was 16 MB — halved to reduce RAM pressure on phones.) |
| `BUFFER_LOW_WATER` | **2 MB** | `bufferedAmountLowThreshold` — sender resumes when buffer drains below this. |
| `SUPER_CHUNK` | **4 MB** read-ahead | The blob is sliced and `arrayBuffer()`-decoded in 4 MB super-chunks, then sent as 8× 512 KB chunks. Cuts FileReader overhead 8×. |
| Drain-and-close | bufferedAmount → 0 + 800 ms | After queuing `__TRANSFER_DONE__`, sender waits for the buffer to fully drain, then waits another 800 ms before closing the peer connection. Without this, the last chunks + DONE marker were silently dropped. |

### Receiver-Side Save Path — In-App Open (v6+)

The current stable receiver does **not** trigger a browser download into the OS Downloads folder. Instead:

1. Chunks assemble into a `Blob` in RAM.
2. The blob is `POST`ed to the receiver's OWN local server at `POST /api/aerograb/save?name=...&type=...` (raw `application/octet-stream` body).
3. Server writes it to `${ROOT_DIR}/HeviExplorer/<safeName>` with sanitised filename, collision resolution (`foo (1).jpg` → `foo (2).jpg`), and a 2 GB cap. Folder is auto-created on first use.
4. Server returns the file as a Hevi-shaped item and incrementally indexes the folder.
5. Client calls `window.openFile(item)` → file opens in Hevi's native viewer (image / video / audio / PDF / archive / text) **in the same tab** — no new window, no popup blocker, no leaving Hevi.
6. Receiver-side belt-and-suspenders: if `_recvReceived >= _recvMeta.size` and the DONE marker hasn't arrived after 250 ms, finalise anyway.

The bytes only ever live on the receiver's own device — the `/api/aerograb/save` endpoint listens on `localhost`, never reachable from another device.

### Performance Comparison

| Metric | Cloud Transfer | Server-Buffered | AeroGrab P2P |
|---|---|---|---|
| Max file size | Cloud plan limits | Server RAM limit | Unlimited |
| Speed | Internet speed | LAN speed ÷ 2 | Full LAN speed |
| Privacy | Files on cloud | Files on local server | Files never leave devices |
| Server load | High | High | Near zero |
| Works offline | No | Yes | Yes |
| Multiple transfers simultaneous | Limited | Very limited | Yes (independent P2P sessions) |

---

<br/>

## 8. Intelligent File Selection Matrix

AeroGrab uses a context-aware system to determine exactly what gets transferred when the user makes the grab gesture.

| User's Current State | What AeroGrab Grabs | Transfer Type |
|---|---|---|
| File open in viewer | That specific open file | Single Object (Priority Override) |
| Files selected (select mode) | All selected files | Batch Array |
| Folder highlighted/targeted | Entire folder contents | Zipped Archive |
| Nothing active | Last opened/viewed file | Single Object (Fallback) |

### Priority Override Rule

If the user has 5 files selected but then opens an image in the viewer — AeroGrab grabs the **currently viewed image**. What you're looking at = what you want to share. This mirrors natural human intuition.

---

<br/>

## 9. Gesture Recognition Engine

### Technology: Google MediaPipe Tasks Vision — `GestureRecognizer`

The current stable engine uses **MediaPipe Tasks Vision `GestureRecognizer`** (the off-the-shelf Google model), NOT a hand-crafted curl-ratio classifier. The model is loaded once from Google's CDN (`storage.googleapis.com`), cached by the browser, and then runs entirely on-device with WASM/GPU acceleration.

```
Loaded once (~7 MB), cached forever:
  GestureRecognizer.createFromOptions({
    baseOptions: { modelAssetPath: 'gesture_recognizer.task' },
    runningMode: 'VIDEO',
    numHands: 1,
  })
```

The recogniser returns a labelled gesture per frame (`Closed_Fist`, `Open_Palm`, `Thumb_Up`, `Victory`, `Pointing_Up`, `ILoveYou`, `None`) plus a confidence score (`categoryScore`) and 21 hand landmarks (used for the live skeleton overlay + the hand-bbox guard).

### Gesture Mapping

| Model Label | AeroGrab Action | Confidence Floor |
|---|---|---|
| **`Closed_Fist`** | Grab (sender) | `categoryScore ≥ 0.88` |
| **`Open_Palm`**   | Catch (receiver) | `categoryScore ≥ 0.88` |
| All others (`Thumb_Up`, `Victory`, `Pointing_Up`, `ILoveYou`, `None`) | Ignored — explicitly rejected | — |

### Anti-Misfire Gate (the v6 hardening)

A misfire-prone gesture engine ruins the whole product, so the firing path is gated by **five independent guards** that all have to agree before a gesture triggers:

| Guard | Constant | Default | Purpose |
|---|---|---|---|
| ML confidence floor | `ML_MIN_CONFIDENCE` | `0.88` | Reject low-confidence noise from Tasks Vision. |
| Hand bbox size | `MIN_HAND_BBOX` | `0.18` | Hand must cover ≥18 % of frame. Tiny far-away detections are treated as neutral. |
| Frame-debounce hold | `FIRE_FRAME_COUNT` | `10` (~0.8 s @ 12 fps) | Same gesture must persist this many consecutive frames. |
| Neutral-arm gap | `NEUTRAL_ARM_FRAMES` | `4` | At least 4 consecutive neutral/relaxed frames are required BEFORE every fire — blocks FIST→OPEN and OPEN→FIST snap re-triggers. |
| Cooldown lockout | `GESTURE_COOLDOWN_MS` | `3500` ms | Absolute lockout after any fire. |

Live debug label exposes which gate is blocking, e.g. `🔍 hand too small 11%`, `↺ relax hand first (2/4)`, `· neutral 91% (n3/4)`, `✊ Closed_Fist 92% (6/10)`.

### Adaptive 3-Tier ML FPS (heating mitigation)

To stop phones from heating up while AeroGrab idles, the ML loop runs at one of three tiers, switched dynamically based on detection state:

| Tier | FPS | Trigger |
|---|---|---|
| **Active** | 12 | A hand is currently detected in frame |
| **Idle**   | 5  | No hand for ~3 s |
| **Standby**| 2  | No hand for ~10 s, or browser tab hidden |

When the tab is hidden (`visibilitychange`), the loop drops to standby and the camera track is `track.enabled = false`'d so the sensor is electrically idle. Returning to the tab re-enables and ramps back to active on first hand detection.

### Camera Configuration

| Parameter | Value | Reason |
|---|---|---|
| Resolution | **256 × 192** | Just enough pixels for a 21-point landmark model. Halves shader cost vs 320×240. |
| Frame rate | **12 fps** (active tier) | Battery-efficient, plenty for gesture detection. |
| facingMode | `'user'` (with `OverconstrainedError` retry) | Front camera; falls back to default cam on desktops. |
| `track.enabled` | toggled on `visibilitychange` | Sensor parked when tab hidden. |
| `_processingHands` flag | concurrency guard | Prevents overlapping `recognizeForVideo()` calls. |

### Live HUD (the bottom-right preview)

A 168 × 126 px draggable overlay shows the live mirrored camera feed + the 21-point landmark skeleton (drawn with mirrored x-coords so it matches the user's view) + the live debug label + a manual `✊ Grab` fallback button. Drag handle (`⋮⋮ drag`) repositions the preview anywhere on screen; position is persisted in `localStorage['ag_preview_pos']`.

### Manual Override

A `✊ Grab` button on the camera overlay bypasses gesture detection entirely — useful when camera conditions are poor or for users who prefer UI interaction.

### Manual Override

A `✊ Grab` button appears below the camera preview when AeroGrab is active. This bypasses gesture detection entirely — useful when camera conditions are poor or for users who prefer UI interaction.

---

<br/>

## 10. Privacy & Permission Model

### One-Time Permission Request

On first enable, AeroGrab shows a custom explanation dialog before the browser's native prompt:

```
┌───────────────────────────────────────────────────┐
│  🎯 AeroGrab needs your camera                    │
│                                                   │
│  AeroGrab uses your camera to detect hand          │
│  gestures (fist to grab, open palm to catch).     │
│                                                   │
│  ✅ Your camera feed NEVER leaves this device     │
│  ✅ No video is recorded or stored                │
│  ✅ No data is sent to any server                 │
│  ✅ Only gesture events ("fist detected") are     │
│     transmitted — never images or video           │
│                                                   │
│  [Enable AeroGrab]        [Not Now]               │
└───────────────────────────────────────────────────┘
```

### What the Server Sees

The server receives only these events — never any media or file content:

```
HEVI_ANNOUNCE         → { deviceId, deviceName, avatar }
HEVI_HEARTBEAT        → { deviceId }
FILE_GRABBED          → { sessionId, metadata: { name, size, type } }
DROP_HERE             → { sessionId }
webrtc_signal         → { to, signal } (encrypted WebRTC SDP/ICE — not file content)
SESSION_END           → { sessionId }
```

**Zero bytes of actual file content ever reach the server.**

### What Stays Local Forever

- Camera video frames
- Actual file bytes
- File content
- User's file paths (only metadata like filename and size are signaled)

### .gitignore Privacy

The `.gitignore` excludes all user data so personal files are never accidentally committed to version control:

```
files/          ← User's personal files
uploads/
thumbnails/
*.db            ← Local database / index files
*.sqlite
.env            ← Secrets
```

---

<br/>

## 11. AeroGrab Fly — UI Animation Strategy

The "AeroGrab Fly" is the visual experience layer. Its primary engineering purpose is **latency masking**.

### Phase 1: Energy Squeeze (Sender, 0s–1.5s)
Particle effect intensifies around the file thumbnail as fist closes. Masks WebRTC signaling setup time (~500ms).

### Phase 2: Rocket Launch (Sender, 1.5s–4s)
File thumbnail is packed into a glowing box, loaded into a rocket, and launches off-screen. Screen shows: *"File in air — waiting for receiver..."* Masks P2P connection and file chunking preparation.

### Phase 3: Receiver Landing (Receiver, on palm detection)
Rocket descends, box opens revealing the file thumbnail. Masks first chunks arriving.

### Phase 4: Progress Ring (Large files)
Box transforms into a circular progress ring filling clockwise. Fills with real percentage from WebRTC transfer progress. At 100%, bursts open. Provides accurate feedback for any file size.

---

<br/>

## 12. Session Lifecycle & State Management

### Session States

```
IDLE → ENABLED → GRAB_TRIGGERED → BROADCASTING → RECEIVING → COMPLETE → IDLE
                                        ↓
                                 TIMEOUT (60s) → CANCELLED → IDLE
```

### First Confirmed Receiver Wins

When multiple devices show open palm simultaneously:
- Server timestamps each `DROP_HERE` with millisecond precision
- Earliest timestamp wins
- All others get: *"File was caught by another device"*

### 60-Second Timeout

If no receiver responds within 60 seconds:
- Server sends `SESSION_EXPIRED` to sender
- Sender sees: *"No one caught it. File is still safe on your device."*
- All devices return to idle

---

<br/>

## 13. Folder Transfer & Auto-Zip Protocol

### Validation Rules

| Rule | Limit | Error |
|---|---|---|
| Max folder size | 1 GB | "AeroGrab Limit: Folder exceeds 1GB maximum" |
| Max file count | 20 files | "AeroGrab Limit: Folder contains more than 20 files" |
| Empty folder | Not allowed | "AeroGrab: Cannot transfer an empty folder" |

### Process

1. Validate (size + count) — fail fast before any compression
2. Zip folder in-browser using JSZip (held in ArrayBuffer, never written to disk)
3. Stream zip via P2P Bridge as single binary blob
4. Receiver gets `.zip` as browser download

---

<br/>

## 14. Error Handling & Edge Cases

| Scenario | Detection | Response |
|---|---|---|
| No hand detected | Tasks Vision returns empty `gestures[]` | Debug label: "👁 N \| no hand"; ML loop drops to idle/standby tier after 3 s / 10 s |
| Recogniser model fails to load | `createFromOptions` rejection | Toast "AeroGrab: Hand AI failed to load." + retry button |
| HTTP origin blocks camera | `!window.isSecureContext` | Show clipboard-copyable HTTPS URL via auto-generated self-signed cert (`https://<lan-ip>:5443`) |
| Camera permission denied | `NotAllowedError` | "Camera access denied. Browser Settings → Site permissions → Camera → Allow." |
| Camera in use by another app | `NotReadableError` | "Camera is being used by another app." |
| Camera doesn't support facingMode | `OverconstrainedError` | Auto-retry without `facingMode` constraint (desktop cameras) |
| Receiver disconnects mid-transfer | WebRTC `iceconnectionstate` → `failed`/`disconnected` | "Connection lost. Resend?" + auto-cleanup of session |
| Multiple senders grab simultaneously | Each creates independent session | Sessions are isolated by `sessionId` |
| Session timeout (60 s) | Server timer | "Transfer expired. File still on your device." |
| Folder too large/many files | Pre-transfer validation | Specific error dialog (1 GB / 20 files cap) |
| No file to grab | `getAeroGrabPayload()` returns null | "No file to grab. Open or select a file first." |
| Device leaves network mid-transfer | 15 s heartbeat sweep + 45 s TTL | Device removed from registry, all notified |
| Stray browser cache | Service worker `lhost-shell-v19` (network-first for `/aerograb*.js`) | Cache version bump on every gesture-engine change forces eviction |

### Cancel Flow — Both-Sides Reliable (current stable)

The cancel button has its own hardened path because earlier versions had two recurring bugs: (a) cancel only worked on one side, (b) late-arriving WebRTC chunks would re-create the receiver UI 1–2 seconds after the user had pressed cancel. The current stable design:

| Mechanism | Where | Purpose |
|---|---|---|
| Sticky `_cancelDisabled` guard | client | Set to `true` the moment user presses cancel; any late `onmessage` chunks are dropped without re-instantiating the receiver UI. |
| `armCancelButton()` | client | Called at the start of every new transfer to reset the sticky guard. Without this, the second transfer would never be cancellable. |
| `TRANSFER_CANCEL_RELAY` socket event | client → server → other peer | Backup signal in case the WebRTC channel is already torn down. Server forwards by `sessionId` so cross-server LAN peers also receive it. |
| Symmetric teardown | both sides | On cancel, both sides: close `RTCPeerConnection`, null out `_dataChannel`/`_recvBuffer`/`_recvMeta`, hide animation stage, toast "Transfer cancelled". |

---

<br/>

## 15. Developer Implementation Guide

### Current State (v1 → v10 — All Shipped, Stable in Production)

```
─── Core signalling & sessions ───
✅ Socket.io signaling server (FILE_GRABBED, DROP_HERE, webrtc_signal, SESSION_END, TRANSFER_CANCEL_RELAY)
✅ 60s timeout + First-Confirmed-Receiver-Wins rule
✅ Server-side sessions 100% in-memory, never written to disk

─── Network discovery ───
✅ HEVI_ANNOUNCE / HEVI_HEARTBEAT / HEVI_PEERS_UPDATE  (v2)
✅ Device Registry (heviDevices Map) with 15s sweep + 45s TTL  (v2 + April-20 fix)
✅ Cross-server UDP broadcast on port 45555 (v3) — devices on different localhost servers see each other
✅ Composite peer IDs `lan:<serverId>:<socketId>` carried inside signalling payloads
✅ HTTP relay endpoints `/api/aerograb/lan/{wake,drop,signal,end}`
✅ Combined device list with `source: 'local' | 'lan'` tagging
✅ Hevi Network sidebar panel + auto-expand + pulse on new peer
✅ Targeted "Send →" per-device selection + broadcast fallback

─── Camera & gesture engine ───
✅ MediaPipe Tasks Vision GestureRecognizer (off-the-shelf model, ~7 MB, browser-cached)
✅ Camera 256×192 @ 12 fps, single getUserMedia call (stream reused into recogniser)
✅ Adaptive 3-tier ML loop: 12 fps active / 5 fps idle / 2 fps standby + visibilitychange park
✅ Anti-misfire 5-guard gate: ML conf 0.88 + bbox 0.18 + 10-frame hold + 4-frame neutral arm + 3.5 s cooldown
✅ Live HUD with mirrored landmark overlay + draggable preview (position persisted)
✅ Manual ✊ Grab fallback button
✅ Permissions-Policy header + isSecureContext guard + named-error camera handling
✅ Auto-generated self-signed SSL cert (10-year, RSA 2048) on PORT+443 for LAN HTTPS

─── File transfer ───
✅ WebRTC P2P data channel: 512 KB chunks, 8 MB high water, 2 MB low water, 4 MB super-chunk read-ahead
✅ Drain-and-close (bufferedAmount → 0 + 800 ms wait) before peerConn.close()
✅ Receiver auto-finalise belt-and-suspenders (250 ms grace if DONE marker missing)
✅ Folder auto-zip with JSZip (1 GB / 20 file caps)
✅ Save to `${ROOT_DIR}/HeviExplorer/<safeName>` via POST /api/aerograb/save
✅ Filename collision resolution (foo (1).jpg … foo (9999).jpg → foo-<ts>.jpg)
✅ 2 GB upload cap with stream byte-counting + abort/cleanup
✅ Incremental folder index update on save
✅ Cancel: sticky _cancelDisabled guard + armCancelButton + TRANSFER_CANCEL_RELAY socket fallback

─── UX / animation ───
✅ Animation Engine v2.0 (v7): SVG rocket comet, conic glow, radar dish, sky beam, shockwave, confetti
✅ Live receiver progress (v8): _pendingRecvPct cache so progress arrives before card mount don't get lost
✅ "Recent AeroGrab" history panel below Cloud Storage (v8) — 30-entry localStorage, dedup by path, HEAD check on click
✅ Permission dialog with privacy explanation (one-time, localStorage remembered)
✅ Wake-up notification panel with sender name + filename + Catch button
✅ First-run 3-step tutorial overlay (v9), runs BEFORE camera permission, replayable via aeroGrab.replayTutorial()
✅ Privacy .gitignore (files/, uploads/, thumbnails/, *.db, .env excluded)
✅ prefers-reduced-motion respected throughout animation engine

─── Cache hygiene ───
✅ Service worker bumped to lhost-shell-v19 / lhost-thumbs-v19, network-first for /aerograb*.js
✅ Per-script ?v= cache busters bumped on every release
```

### File Structure (current)

```
hevi-explorer/
├── server.js                    ← Express + Socket.io + AeroGrab signalling + UDP discovery
│                                  + /api/aerograb/save + /api/aerograb/lan/{wake,drop,signal,end}
│                                  + heviDevices + lanServers + ensureSslCert
├── start.sh                     ← Auto-update wrapper (git pull --ff-only on boot, npm reinstall on package.json change)
├── public/
│   ├── app.js                   ← Hevi Explorer main app (browse/upload/viewer)
│   ├── aerograb.js              ← All AeroGrab client logic (IIFE, ~1100 lines)
│   ├── aerograb-animation.js    ← Animation Engine v2.0 (SVG-driven scenes)
│   ├── index.html               ← UI markup + inline Hevi Network script + tutorial overlay
│   ├── style.css                ← Styles incl. AeroGrab + history + tutorial blocks
│   └── sw.js                    ← Service worker (lhost-shell-v19)
├── AeroGrab_Blueprint.md        ← This document (engineering spec)
└── AeroGrab_MasterPrompt.md     ← AI handoff document with v3-v10 changelog
```

### Coding Conventions

1. **Keep aerograb.js isolated** — all AeroGrab logic stays inside `(function AeroGrab() { ... })()` IIFE.
2. **No shared globals** — communicate with app.js only through `window.aeroGrab*`, `window.aeroGrabSetOpenFile`, `window.openFile`, `window.onHeviPeersUpdate`, `window.heviSendTo`.
3. **Server sessions / device registry are in-memory only** — never written to disk.
4. **Toast notifications** use `toast(msg, type)` — types: `'success'`, `'error'`, `'warn'`, `''`.
5. **CSS accent** is `--accent: #25f4d0` — all AeroGrab UI uses this colour.
6. **Device IDs** are generated once via `crypto.randomUUID()` and stored in `localStorage('ag_device_id')`.
7. **2D landmark math only** — never use z-axis from Tasks Vision landmarks.
8. **Cache-bust** every `aerograb*.js` change with both the per-script `?v=N` query AND a service-worker version bump.
9. **Bump service worker** (`lhost-shell-vN`) on any change touching cached assets.
10. **Naming**: `HEVI_*` for network/peer events, transfer events keep their established names.

### Socket Events Reference (current stable)

```
Client → Server:
  HEVI_ANNOUNCE          { deviceId, deviceName, avatar }              ← on connect + reconnect
  HEVI_HEARTBEAT         { deviceId }                                    ← every 15s
  FILE_GRABBED           { sessionId, metadata, targetId? }              ← grab (targetId optional, can be lan:<serverId>:<socketId>)
  DROP_HERE              { sessionId }
  webrtc_signal          { to, signal }                                  ← peer ID may be local socket.id or lan:<serverId>:<socketId>
  SESSION_END            { sessionId }
  TRANSFER_CANCEL_RELAY  { sessionId }                                   ← backup cancel signal (out-of-band of WebRTC)

Server → Client:
  HEVI_PEERS_UPDATE      { devices: [{ ..., source: 'local'|'lan' }], total: N }
  WAKE_UP_CAMERAS        { senderId, senderName, metadata, sessionId }
  YOU_ARE_RECEIVER       { sessionId, peerId }                           ← signals which device won the catch race
  TRANSFER_APPROVED      { peerId, sessionId }
  TRANSFER_TAKEN         { sessionId }                                   ← losing palms get this
  SESSION_EXPIRED        { sessionId }
  TRANSFER_CANCEL_RELAY  { sessionId }                                   ← forwarded cancel
  webrtc_signal          { from, signal }

Server-internal HTTP (cross-server LAN bridge):
  POST /api/aerograb/lan/wake    { ... }
  POST /api/aerograb/lan/drop    { ... }
  POST /api/aerograb/lan/signal  { ... }
  POST /api/aerograb/lan/end     { ... }

Server-internal HTTP (receiver save):
  POST /api/aerograb/save?name=<encoded>&type=<encoded>
       body: raw bytes (Content-Type: application/octet-stream)
       → 200 { ok: true, item, folder: 'HeviExplorer' }
```

---

<br/>

## 16. Function Reference (current stable)

### Client (`public/aerograb.js`)

| Function | Description |
|---|---|
| `toggleAeroGrab(bool)` | Enable/disable AeroGrab; runs first-run tutorial → permission dialog → camera + recogniser lifecycle |
| `showTutorial()` | Promise-based 3-step first-run overlay; returns `false` if user skips |
| `showPermissionDialog()` | Custom privacy explanation before browser camera prompt |
| `requestCameraPermission()` | Single getUserMedia call (256×192, facingMode:'user', OverconstrainedError fallback); returns the live `MediaStream` for reuse |
| `initRecognizer(stream)` | Load Tasks Vision GestureRecognizer, attach reused stream, start adaptive ML loop |
| `processGestureResults(results)` | Per-frame callback — runs the 5-guard anti-misfire gate, updates debug label, fires `onGestureDetected` |
| `onGestureDetected(gesture)` | Route `Closed_Fist`→`initiateGrab`, `Open_Palm`→`signalReadyToReceive` (gated by `_wakePayload`) |
| `initiateGrab()` | Get payload, emit FILE_GRABBED, start sender animation, `armCancelButton()` |
| `getAeroGrabPayload()` | Read app state → priority: open viewer file → selected files → folder → last opened |
| `signalReadyToReceive()` | Emit DROP_HERE, start receiver landing animation |
| `openP2PBridge(peerId, role)` | Create RTCPeerConnection, set up 512 KB data channel, wire ICE/SDP signalling |
| `startFileTransfer()` | Fetch file from own `/file?path=...`, stream via WebRTC |
| `streamFileOverBridge(blob, name)` | 4 MB super-chunk read → 8× 512 KB sends; respects `BUFFER_HIGH_WATER` (8 MB); drain-and-close on completion |
| `onChunkReceived(event)` | Drop-if-`_cancelDisabled`; assemble into `_recvBuffer`; update progress; call `finaliseReceivedFile` on DONE or auto-finalise |
| `finaliseReceivedFile()` | Snapshot meta+buffer → `saveAndOpenInHevi()` → fallback to anchor download |
| `saveAndOpenInHevi(blob, meta)` | POST to `/api/aerograb/save` → on success call `window.openFile(item)` |
| `recordReceiveHistory(item)` | Push to `localStorage['aerograb_history']` (cap 30, dedup by path) |
| `armCancelButton()` | Reset sticky `_cancelDisabled = false` at start of every transfer |
| `cancelTransfer()` | Set sticky guard, close peerConn, emit TRANSFER_CANCEL_RELAY, hide animation |
| `deactivateAeroGrab()` | Stop recogniser, stop camera tracks, clear state |
| `wireDraggablePreview()` | Mouse + touch drag for live HUD; persist `{x,y}` to `localStorage['ag_preview_pos']` |
| `announceToNetwork()` | Emit HEVI_ANNOUNCE on connect AND reconnect |
| `startHeartbeat()` / `stopHeartbeat()` | 15 s interval → emit HEVI_HEARTBEAT |
| `getOrCreateDeviceId()` / `getDeviceName()` / `getDeviceAvatar()` | localStorage-persisted identity helpers |
| `replayTutorial()` | Wipes `aerograb_tutorial_seen` flag and re-shows first-run overlay |

### Public API surface (`window.aeroGrab`)

```js
window.aeroGrab = {
  toggle:         toggleAeroGrab,
  isOn:           () => _enabled,
  grab:           initiateGrab,
  catch:          signalReadyToReceive,
  cancel:         cancelTransfer,
  setTarget:      (peerId) => { _targetSocketId = peerId || null; },  // accepts lan:<srv>:<sock>
  mySocketId:     () => _socket?.id,
  replayTutorial: replayTutorial,
};
window.aeroGrabSetOpenFile = (fileMeta) => { _activeOpenFile = fileMeta; };
```

### Server (`server.js`)

| Function | Description |
|---|---|
| `registerDevice(socket, info)` | Add to `heviDevices` Map, broadcast HEVI_PEERS_UPDATE |
| `removeDevice(socketId)` | Remove from Map on disconnect, clean up active sessions, broadcast update |
| `heartbeatSweep()` | 15 s setInterval → remove devices with `lastSeen > 45 s`, re-broadcast |
| `broadcastPeersUpdate()` | `io.emit('HEVI_PEERS_UPDATE', { devices: merged(local + lan), total })` |
| `handleFileGrabbed(socket, data)` | Creates session; supports `targetId` for directed wake-up; relays to LAN servers if targetId is `lan:...` |
| `ensureSslCert()` | Generates 10-year RSA-2048 self-signed cert with SAN for all current LAN IPs; cached in `data/ssl/`; regenerated when LAN IPs change |
| `startUdpDiscovery()` | UDP socket on port 45555; broadcast announce every 3 s; expire peers after 12 s |
| `POST /api/aerograb/save` | Receiver-side endpoint — sanitised filename, collision resolution, 2 GB cap, returns Hevi-shaped item, calls `incrementalUpdateDir` |
| `POST /api/aerograb/lan/{wake,drop,signal,end}` | Cross-server signalling relays for UDP-discovered peers |

---

<br/>

## 17. Phased Rollout Plan

### ✅ Phase 1 — Foundation (SHIPPED)
Socket.io signalling, camera permission, MediaPipe + 12 fps loop, basic gesture detection.

### ✅ Phase 2 — File Transfer Core (SHIPPED)
WebRTC P2P data channel, file chunking, folder auto-zip (JSZip), session management (60 s timeout, First-Wins rule).

### ✅ Phase 3 — Experience Layer (SHIPPED)
Sender/Receiver animations, progress ring, wake-up notification panel, green dot, sidebar toggle, context menu, camera preview, debug label, manual Grab button.

### ✅ Phase 3.5 — Gesture Debug & Stabilisation (SHIPPED)
Concurrent-processing guard, live debug output, manual Grab fallback.

### ✅ Phase 4 — LAN Discovery & Device Registry (SHIPPED — v2)
`HEVI_ANNOUNCE` / `HEVI_HEARTBEAT` / `HEVI_PEERS_UPDATE`, server-side `heviDevices` Map, Hevi Network sidebar panel, device name + avatar, live counter, auto-expand + pulse on first peer.

### ✅ Phase 5 — Targeted Transfer (SHIPPED — v2)
Per-device "Send →" button, bidirectional, device-aware wake-up notification.

### ✅ Phase 6 — Cross-Server Auto LAN Discovery (SHIPPED — v3)
UDP broadcast on port 45555, composite `lan:<serverId>:<socketId>` peer IDs, HTTP relay endpoints, combined device list with `source` tagging.

### ✅ Phase 7 — Reliability Hardening (SHIPPED — v3 + v4)
Drain-and-close before peerConn.close(), receiver auto-finalise grace, `_cancelDisabled` sticky guard, `TRANSFER_CANCEL_RELAY` socket fallback, `armCancelButton()` reset.

### ✅ Phase 8 — ML Engine Upgrade (SHIPPED — v5 + v6)
Migrated from custom curl-ratio classifier to MediaPipe Tasks Vision `GestureRecognizer`. 5-guard anti-misfire gate. Hand-bbox size guard. Neutral-arm pre-fire gap.

### ✅ Phase 9 — In-App Open + Save (SHIPPED — v6)
`POST /api/aerograb/save` endpoint, `${ROOT_DIR}/HeviExplorer/` folder, collision resolution, `window.openFile(item)` integration — no more popup blocker, no new tab.

### ✅ Phase 10 — Premium Animation Engine v2.0 (SHIPPED — v7)
SVG rocket comet, conic glow, radar dish, sky beam, shockwave, confetti, progress shimmer cap, draw-on checkmark, `prefers-reduced-motion` respected.

### ✅ Phase 11 — UX Polish (SHIPPED — v8 + v9)
Live receiver progress (cache-replay on card mount), Recent AeroGrab history panel, first-run 3-step tutorial overlay, draggable HUD with persisted position.

### ✅ Phase 12 — Heating & Battery Optimisation (SHIPPED — v10, April 2026)
Adaptive 3-tier ML loop (12/5/2 fps), camera 256×192, `track.enabled` parking on `visibilitychange`, sender UI tick 30→10 fps, WebRTC buffer 16→8 MB, service-worker thumb cache LRU cap 200.

### 🔲 Phase 13 — Future
- TURN server support (for 4G/5G where STUN alone fails)
- Transfer resume on connection drop
- Multiple simultaneous transfers (different sessions independent)
- Speed indicator during transfer (MB/s)
- Device name customisation UI (currently auto-detected from userAgent)

---

<br/>

## 18. Technology Stack Summary (current stable)

| Component | Technology | Version | Source |
|---|---|---|---|
| Server Runtime | Node.js | ≥18 | Pre-installed |
| HTTP framework | Express | ^4.x | npm |
| Realtime Signalling | Socket.io | ^4.8.3 | CDN + npm |
| **Gesture AI** | **MediaPipe Tasks Vision `GestureRecognizer`** | latest | CDN (`@mediapipe/tasks-vision`) + Google CDN model |
| P2P Transfer | WebRTC Data Channel | Native browser API | — |
| File Compression | JSZip | 3.10.1 | CDN |
| Animation | Custom SVG + CSS keyframes | — | inline |
| Camera Access | `getUserMedia` | Native browser API | — |
| Self-Signed SSL | `selfsigned` | ^5.x | npm |
| LAN Discovery | UDP datagram (`dgram`) | Node native | — |
| Device Identity | `crypto.randomUUID()` | Native browser API | — |
| UI Framework | Vanilla JS + HTML5 | — | — |
| Styling | CSS3 Custom Properties | — | — |
| Accent Colour | `#25f4d0` | — | TWH Eco System branding |
| Service Worker | `lhost-shell-v19` / `lhost-thumbs-v19` | network-first for `/aerograb*.js`, LRU thumb cache cap 200 | — |

### CDN Scripts (current `index.html`)

```html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script type="module">
  import { GestureRecognizer, FilesetResolver }
    from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs';
  // GestureRecognizer model fetched from storage.googleapis.com (~7 MB, browser-cached)
</script>
<script src="/aerograb-animation.js?v=5"></script>
<script src="/aerograb.js?v=10"></script>
```

The legacy `@mediapipe/hands` and `@mediapipe/camera_utils` script tags have been **removed** — Tasks Vision replaces both.

---

<div align="center">

**AeroGrab Blueprint v3.0 — Latest Stable (v10)**
**by Technical White Hat (TWH)**
**TWH Eco System Technology**

*"You grab. You throw. Someone catches."*

</div>

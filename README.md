# Hevi Explorer

A private media vault and local-first web-based file manager.
Run it on Termux (Android), Kali Linux, Windows, macOS, or any machine — access your files from any browser.

---

## Quick Start (One Command)

**Termux / Kali Linux / Any Linux / macOS:**
```bash
git clone <your-repo-url> hevi-explorer
cd hevi-explorer
bash start.sh
```

**Windows (double-click or PowerShell):**
```powershell
git clone <your-repo-url> hevi-explorer
cd hevi-explorer
.\start.bat
```

The setup script will automatically:
- Detect your platform (Termux / Kali / Ubuntu / Arch / Fedora / Windows / macOS)
- Install Node.js if missing or too old
- Install FFmpeg if missing (for video thumbnails + HEIC)
- Install p7zip / 7-Zip if missing (for RAR/7z archives)
- Run `npm install` with auto-retry on failure
- Start Hevi Explorer

---

## Features

- Browse, upload (up to 2 GB per file, streamed) and manage files & folders
- Stream audio / video with a full-featured player
- Image viewer with HEIC/HEIF support (disk-cached conversion)
- PDF viewer
- Archive preview: ZIP, APK, TAR, GZ, RAR, 7Z
- Category views: Audio, Videos, Images, Files, Archives, APKs
- Cloud integration: Google Drive, Dropbox, OneDrive, MEGA
- WAN tunnel via cloudflared (public HTTPS link + QR code)
- PWA — installable, works offline after first visit
- Auto cache cleanup every 24 h (removes stale thumbnails older than 30 days)

---

## Requirements

- **Node.js 18+**
- **npm**
- FFmpeg *(optional — for video thumbnails and HEIC preview)*

---

## Setup & Usage

### Termux (Android)

```bash
# 1. Install dependencies
pkg update && pkg install nodejs git ffmpeg p7zip

# 2. Go into the project folder
cd hevi-explorer

# 3. Install Node packages
npm install

# 4. Start
node server.js
```

Open your browser and go to:
```
http://localhost:5000
```

**Tips for Termux:**
- Server auto-detects `/sdcard` as root directory
- To browse a specific folder: `ROOT_DIR=/sdcard/Movies node server.js`
- For WAN access: go to WAN tab inside the app → tap "Install cloudflared" → Start Tunnel
- To keep running after closing terminal: `nohup node server.js &`
- Use `termux-wake-lock` to prevent Android from sleeping

---

### Kali Linux / Any Linux

```bash
# 1. Install Node.js (if not installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# 2. Install FFmpeg (optional but recommended)
sudo apt install -y ffmpeg p7zip-full

# 3. Go into the project folder
cd hevi-explorer

# 4. Install Node packages
npm install

# 5. Start
node server.js
```

Open:
```
http://localhost:5000
```

**Tips for Kali:**
- Running as root? Server auto-detects `/root` as home
- To browse a specific folder: `ROOT_DIR=/home/kali/Documents node server.js`
- For WAN access: go to WAN tab → Install cloudflared → Start Tunnel

---

### Windows

```powershell
# 1. Install Node.js from https://nodejs.org (LTS version recommended)

# 2. Install FFmpeg (optional):
winget install ffmpeg
# OR download from https://ffmpeg.org/download.html and add to PATH

# 3. Open PowerShell or Command Prompt in the project folder
cd C:\path\to\hevi-explorer

# 4. Install Node packages
npm install

# 5. Start
node server.js
```

Open:
```
http://localhost:5000
```

**Tips for Windows:**
- To browse a specific folder (PowerShell): `$env:ROOT_DIR="D:\Movies"; node server.js`
- To browse a specific folder (CMD): `set ROOT_DIR=D:\Movies && node server.js`
- For RAR/7z archive preview: install 7-Zip from https://7-zip.org
- For WAN access: go to WAN tab → follow the winget/choco instructions shown

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ROOT_DIR` | Override auto-detected root directory | `/sdcard`, `D:\Files` |
| `PORT` | Override default port (5000) | `8080` |
| `FFMPEG_PATH` | Override auto-detected ffmpeg binary | `/usr/local/bin/ffmpeg` |

---

## Auto-detection Logic

The server automatically picks the best root directory:

| Environment | Auto Root |
|-------------|-----------|
| Replit | `./files/` (inside project) |
| Termux | `/sdcard` or `/storage/emulated/0` |
| Kali / Linux (root user) | `/root` |
| Kali / Linux (normal user) | Home directory (`~`) |
| Windows / macOS | Home directory |

---

## Run in Background

**Termux:**
```bash
nohup node server.js &
```

**Linux (pm2):**
```bash
npm install -g pm2
pm2 start server.js --name hevi-explorer
pm2 save
```

**Windows (pm2):**
```powershell
npm install -g pm2
pm2 start server.js --name hevi-explorer
pm2 save
```

---

## License

ISC

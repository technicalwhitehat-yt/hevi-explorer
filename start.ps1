# ═══════════════════════════════════════════════════════════════
#  Hevi Explorer — Smart Auto-Setup & Launcher (Windows)
#  Usage: .\start.ps1
#         (If blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned)
# ═══════════════════════════════════════════════════════════════

$ErrorActionPreference = "Continue"

function ok($msg)   { Write-Host "  [OK] $msg"   -ForegroundColor Green }
function info($msg) { Write-Host "  [>>] $msg"   -ForegroundColor Cyan }
function warn($msg) { Write-Host "  [!!] $msg"   -ForegroundColor Yellow }
function err($msg)  { Write-Host "  [XX] $msg"   -ForegroundColor Red }

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║      Hevi Explorer - Smart Auto-Setup        ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Auto-update from GitHub ─────────────────────────────────────
# Force-pulls latest commit on every start. Local edits are auto-stashed first.
# Skip with: $env:HEVI_NO_UPDATE=1 ; .\start.ps1
function Invoke-AutoUpdate {
    if ($env:HEVI_NO_UPDATE -eq "1") { info "Auto-update skipped (HEVI_NO_UPDATE=1)"; return }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { warn "git not found — skipping auto-update"; return }
    if (-not (Test-Path ".git")) { warn "Not a git repo — skipping auto-update"; return }

    info "Checking for updates from GitHub..."
    git ls-remote --heads origin *> $null
    if ($LASTEXITCODE -ne 0) { warn "GitHub unreachable — starting with current code"; return }

    $branch = (git rev-parse --abbrev-ref HEAD 2>$null)
    if (-not $branch) { $branch = "main" }
    git fetch origin $branch --quiet 2>$null
    if ($LASTEXITCODE -ne 0) { warn "git fetch failed — continuing"; return }

    $localSha  = (git rev-parse HEAD 2>$null)
    $remoteSha = (git rev-parse "origin/$branch" 2>$null)

    # Detect runtime-dirty working tree
    git diff --quiet 2>$null;        $dirty1 = ($LASTEXITCODE -ne 0)
    git diff --cached --quiet 2>$null; $dirty2 = ($LASTEXITCODE -ne 0)
    $isDirty = $dirty1 -or $dirty2

    if ($localSha -eq $remoteSha) {
        if ($isDirty) {
            info "Resetting runtime-modified tracked files..."
            git reset --hard "origin/$branch" --quiet 2>$null
        }
        ok ("Already up to date ($branch @ " + $localSha.Substring(0,7) + ")")
        return
    }

    info ("New version found - updating " + $localSha.Substring(0,7) + " -> " + $remoteSha.Substring(0,7) + "...")

    if ($isDirty) {
        $stashMsg = "hevi-autoupdate-" + [int][double]::Parse((Get-Date -UFormat %s))
        git stash push -u -m $stashMsg --quiet 2>$null
        if ($LASTEXITCODE -eq 0) { info "Local changes stashed as: $stashMsg (recover with: git stash list)" }
    }

    git reset --hard "origin/$branch" --quiet
    if ($LASTEXITCODE -eq 0) {
        ok ("Updated to " + $remoteSha.Substring(0,7))
        # If package.json/lock changed, force a fresh npm install
        git diff --quiet $localSha $remoteSha -- package.json package-lock.json 2>$null
        if ($LASTEXITCODE -ne 0) {
            info "Dependencies changed — will reinstall"
            (Get-Item "package.json").LastWriteTime = Get-Date
        }
    } else {
        warn "Update failed — starting with current code"
    }
}
Invoke-AutoUpdate

# ── Check Node.js ───────────────────────────────────────────────
function Get-NodeOk {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return $false }
    $ver = (node -e "process.stdout.write(process.version)") 2>$null
    if ($ver -match "v(\d+)") {
        return ([int]$Matches[1]) -ge 18
    }
    return $false
}

function Install-Node {
    info "Installing Node.js via winget..."
    $result = winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements 2>&1
    if ($LASTEXITCODE -ne 0) {
        warn "winget failed. Trying chocolatey..."
        $choco = Get-Command choco -ErrorAction SilentlyContinue
        if ($choco) {
            choco install nodejs-lts -y 2>&1
        } else {
            err "Cannot auto-install Node.js."
            err "Please download from: https://nodejs.org"
            err "Then re-run this script."
            Read-Host "Press Enter to exit"
            exit 1
        }
    }
    # Refresh PATH so node is available in this session
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")
}

if (Get-NodeOk) {
    $nodeVer = (node -e "process.stdout.write(process.version)") 2>$null
    ok "Node.js $nodeVer — OK"
} else {
    warn "Node.js not found or older than v18"
    Install-Node
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")
    if (Get-NodeOk) {
        $nodeVer = (node -e "process.stdout.write(process.version)") 2>$null
        ok "Node.js $nodeVer installed"
    } else {
        err "Node.js install failed. Please install from: https://nodejs.org"
        err "Then re-run this script."
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# ── Check FFmpeg ────────────────────────────────────────────────
function Get-FFmpegOk {
    $ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($ffmpeg) { return $true }
    $paths = @(
        "C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        "C:\ffmpeg\bin\ffmpeg.exe",
        "$env:USERPROFILE\ffmpeg\bin\ffmpeg.exe"
    )
    foreach ($p in $paths) { if (Test-Path $p) { return $true } }
    return $false
}

function Install-FFmpeg {
    info "Installing FFmpeg via winget..."
    winget install ffmpeg --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        $choco = Get-Command choco -ErrorAction SilentlyContinue
        if ($choco) {
            info "Trying chocolatey..."
            choco install ffmpeg -y 2>&1 | Out-Null
        } else {
            warn "FFmpeg auto-install failed."
            warn "Download from: https://ffmpeg.org/download.html"
            warn "Video thumbnails & HEIC preview will be disabled."
            return
        }
    }
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")
}

if (Get-FFmpegOk) {
    ok "FFmpeg found"
} else {
    warn "FFmpeg not found — attempting install..."
    Install-FFmpeg
    if (Get-FFmpegOk) { ok "FFmpeg installed" }
    else { warn "FFmpeg unavailable — video thumbnails disabled" }
}

# ── Check 7-Zip ─────────────────────────────────────────────────
function Get-7ZipOk {
    $z = Get-Command 7z -ErrorAction SilentlyContinue
    if ($z) { return $true }
    $paths = @(
        "C:\Program Files\7-Zip\7z.exe",
        "C:\Program Files (x86)\7-Zip\7z.exe"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) {
            $env:Path += ";$(Split-Path $p)"
            return $true
        }
    }
    return $false
}

function Install-7Zip {
    info "Installing 7-Zip via winget..."
    winget install 7zip.7zip --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        $choco = Get-Command choco -ErrorAction SilentlyContinue
        if ($choco) { choco install 7zip -y 2>&1 | Out-Null }
        else { warn "7-Zip unavailable — RAR/7z archive preview disabled." }
    }
    # Add 7-Zip to PATH for this session
    $p64 = "C:\Program Files\7-Zip"
    if (Test-Path "$p64\7z.exe") { $env:Path += ";$p64" }
}

if (Get-7ZipOk) {
    ok "7-Zip found"
} else {
    warn "7-Zip not found — attempting install..."
    Install-7Zip
    if (Get-7ZipOk) { ok "7-Zip installed" }
    else { warn "7-Zip unavailable — RAR/7z preview disabled" }
}

# ── npm install with retry ──────────────────────────────────────
$needsInstall = $true
if (Test-Path "node_modules") {
    $pkgTime  = (Get-Item "package.json").LastWriteTime
    $lockTime = if (Test-Path "node_modules\.package-lock.json") {
        (Get-Item "node_modules\.package-lock.json").LastWriteTime
    } else { [datetime]::MinValue }
    if ($lockTime -gt $pkgTime) {
        ok "node_modules already up to date"
        $needsInstall = $false
    }
}

if ($needsInstall) {
    info "Installing Node packages..."
    $npmResult = npm install 2>&1
    if ($LASTEXITCODE -eq 0) {
        ok "npm install complete"
    } else {
        warn "npm install failed — retrying with --legacy-peer-deps..."
        $npmResult = npm install --legacy-peer-deps 2>&1
        if ($LASTEXITCODE -eq 0) {
            ok "npm install complete (legacy mode)"
        } else {
            warn "Clearing npm cache and retrying..."
            npm cache clean --force 2>&1 | Out-Null
            $npmResult = npm install --legacy-peer-deps 2>&1
            if ($LASTEXITCODE -eq 0) {
                ok "npm install complete (after cache clear)"
            } else {
                err "npm install failed. Check your internet connection."
                err "Try running: npm install --legacy-peer-deps"
                Read-Host "Press Enter to exit"
                exit 1
            }
        }
    }
}

# ── Launch ──────────────────────────────────────────────────────
Write-Host ""
ok "All set! Starting Hevi Explorer..."
Write-Host ""
node server.js

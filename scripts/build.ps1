# =============================================================================
# Downlink Build Script for Windows
# =============================================================================
# This script downloads the required binaries (yt-dlp, ffmpeg) for Windows
# and builds the Tauri application.
#
# Usage:
#   .\scripts\build.ps1                    # Build for Windows x64
#   .\scripts\build.ps1 -DownloadOnly      # Only download binaries
#   .\scripts\build.ps1 -Clean             # Clean binaries and rebuild
#
# =============================================================================

param(
    [switch]$DownloadOnly,
    [switch]$Clean,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$BinariesDir = Join-Path $ProjectDir "src-tauri\binaries"

# Rust target for Windows x64
$RustTarget = "x86_64-pc-windows-msvc"

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Show-Usage {
    Write-Host "Downlink Build Script for Windows"
    Write-Host ""
    Write-Host "Usage: .\scripts\build.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -DownloadOnly    Only download binaries, don't build"
    Write-Host "  -Clean           Clean binaries before downloading"
    Write-Host "  -Help            Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\scripts\build.ps1                # Build for Windows x64"
    Write-Host "  .\scripts\build.ps1 -DownloadOnly  # Only download binaries"
    Write-Host "  .\scripts\build.ps1 -Clean         # Clean and rebuild"
}

function Download-YtDlp {
    $OutputFile = Join-Path $BinariesDir "yt-dlp-$RustTarget.exe"

    if (Test-Path $OutputFile) {
        Write-Info "yt-dlp already exists, skipping..."
        return
    }

    Write-Info "Downloading yt-dlp for Windows..."

    $Url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"

    Invoke-WebRequest -Uri $Url -OutFile $OutputFile -UseBasicParsing

    Write-Success "Downloaded yt-dlp"
}

function Download-FFmpeg {
    $OutputFile = Join-Path $BinariesDir "ffmpeg-$RustTarget.exe"

    if (Test-Path $OutputFile) {
        Write-Info "ffmpeg already exists, skipping..."
        return
    }

    Write-Info "Downloading ffmpeg for Windows..."

    $TempDir = Join-Path $env:TEMP "downlink-ffmpeg-$(Get-Random)"
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

    try {
        # Download ffmpeg essentials from gyan.dev
        $ZipFile = Join-Path $TempDir "ffmpeg.zip"
        $Url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

        Write-Info "Downloading ffmpeg from $Url (this may take a while)..."
        Invoke-WebRequest -Uri $Url -OutFile $ZipFile -UseBasicParsing

        Write-Info "Extracting ffmpeg..."
        Expand-Archive -Path $ZipFile -DestinationPath $TempDir -Force

        # Find ffmpeg.exe in the extracted folder
        $FFmpegExe = Get-ChildItem -Path $TempDir -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1

        if ($FFmpegExe) {
            Copy-Item -Path $FFmpegExe.FullName -Destination $OutputFile
            Write-Success "Downloaded ffmpeg"
        } else {
            Write-Error "Could not find ffmpeg.exe in downloaded archive"
            exit 1
        }
    }
    finally {
        # Cleanup temp directory
        if (Test-Path $TempDir) {
            Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Download-Binaries {
    # Create binaries directory if it doesn't exist
    if (-not (Test-Path $BinariesDir)) {
        New-Item -ItemType Directory -Path $BinariesDir -Force | Out-Null
    }

    Download-YtDlp
    Download-FFmpeg
}

function Build-App {
    Write-Info "Building Downlink for Windows x64..."

    Push-Location $ProjectDir

    try {
        # Install npm dependencies if needed
        if (-not (Test-Path "node_modules")) {
            Write-Info "Installing npm dependencies..."
            npm install
        }

        # Build with Tauri
        Write-Info "Running Tauri build..."
        npm run tauri:build -- --target $RustTarget

        Write-Success "Build complete!"

        # Show output location
        Write-Info "Build artifacts:"

        $NsisDir = Join-Path $ProjectDir "src-tauri\target\$RustTarget\release\bundle\nsis"
        $MsiDir = Join-Path $ProjectDir "src-tauri\target\$RustTarget\release\bundle\msi"

        # Also check default release path
        $DefaultNsisDir = Join-Path $ProjectDir "src-tauri\target\release\bundle\nsis"
        $DefaultMsiDir = Join-Path $ProjectDir "src-tauri\target\release\bundle\msi"

        if (Test-Path $NsisDir) {
            Get-ChildItem $NsisDir
        } elseif (Test-Path $DefaultNsisDir) {
            Get-ChildItem $DefaultNsisDir
        }

        if (Test-Path $MsiDir) {
            Get-ChildItem $MsiDir
        } elseif (Test-Path $DefaultMsiDir) {
            Get-ChildItem $DefaultMsiDir
        }
    }
    finally {
        Pop-Location
    }
}

function Clean-Binaries {
    Write-Info "Cleaning binaries..."

    if (Test-Path $BinariesDir) {
        Remove-Item -Path $BinariesDir -Recurse -Force
    }

    New-Item -ItemType Directory -Path $BinariesDir -Force | Out-Null

    Write-Success "Binaries cleaned"
}

# =============================================================================
# Main
# =============================================================================

if ($Help) {
    Show-Usage
    exit 0
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  Downlink Build Script for Windows    " -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# Clean if requested
if ($Clean) {
    Clean-Binaries
}

# Download binaries
Download-Binaries

# Build if not download-only
if (-not $DownloadOnly) {
    Build-App
}

Write-Host ""
Write-Success "Done!"

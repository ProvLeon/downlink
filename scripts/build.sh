#!/bin/bash

# =============================================================================
# Downlink Build Script
# =============================================================================
# This script downloads the required binaries (yt-dlp, ffmpeg) for the target
# platform and builds the Tauri application.
#
# Usage:
#   ./scripts/build.sh              # Build for current platform
#   ./scripts/build.sh --target macos-x64
#   ./scripts/build.sh --target macos-arm64
#   ./scripts/build.sh --target macos-universal
#   ./scripts/build.sh --target windows-x64
#   ./scripts/build.sh --target linux-x64
#   ./scripts/build.sh --download-only   # Only download binaries, don't build
#   ./scripts/build.sh --clean           # Clean binaries and rebuild
#
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BINARIES_DIR="$PROJECT_DIR/src-tauri/binaries"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect current platform
detect_platform() {
    local os=$(uname -s)
    local arch=$(uname -m)

    case "$os" in
        Darwin)
            case "$arch" in
                arm64) echo "macos-arm64" ;;
                x86_64) echo "macos-x64" ;;
                *) echo "unknown" ;;
            esac
            ;;
        Linux)
            case "$arch" in
                x86_64) echo "linux-x64" ;;
                aarch64) echo "linux-arm64" ;;
                *) echo "unknown" ;;
            esac
            ;;
        MINGW*|MSYS*|CYGWIN*)
            echo "windows-x64"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# Get Rust target triple from our platform name
get_rust_target() {
    case "$1" in
        macos-arm64) echo "aarch64-apple-darwin" ;;
        macos-x64) echo "x86_64-apple-darwin" ;;
        macos-universal) echo "universal-apple-darwin" ;;
        windows-x64) echo "x86_64-pc-windows-msvc" ;;
        windows-x86) echo "i686-pc-windows-msvc" ;;
        linux-x64) echo "x86_64-unknown-linux-gnu" ;;
        linux-arm64) echo "aarch64-unknown-linux-gnu" ;;
        *) echo "" ;;
    esac
}

# Download yt-dlp for a specific platform
download_ytdlp() {
    local platform=$1
    local rust_target=$(get_rust_target "$platform")
    local output_file="$BINARIES_DIR/yt-dlp-$rust_target"

    if [[ "$platform" == "windows-"* ]]; then
        output_file="${output_file}.exe"
    fi

    if [[ -f "$output_file" ]]; then
        log_info "yt-dlp for $platform already exists, skipping..."
        return 0
    fi

    log_info "Downloading yt-dlp for $platform..."

    local url=""
    case "$platform" in
        macos-arm64|macos-x64)
            url="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
            ;;
        windows-x64|windows-x86)
            url="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
            ;;
        linux-x64)
            url="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux"
            ;;
        linux-arm64)
            url="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64"
            ;;
        *)
            log_error "Unknown platform: $platform"
            return 1
            ;;
    esac

    curl -L -o "$output_file" "$url"
    chmod +x "$output_file"
    log_success "Downloaded yt-dlp for $platform"
}

# Download ffmpeg for a specific platform
download_ffmpeg() {
    local platform=$1
    local rust_target=$(get_rust_target "$platform")
    local output_file="$BINARIES_DIR/ffmpeg-$rust_target"

    if [[ "$platform" == "windows-"* ]]; then
        output_file="${output_file}.exe"
    fi

    if [[ -f "$output_file" ]]; then
        log_info "ffmpeg for $platform already exists, skipping..."
        return 0
    fi

    log_info "Downloading ffmpeg for $platform..."

    local temp_dir=$(mktemp -d)

    case "$platform" in
        macos-arm64|macos-x64)
            # evermeet.cx provides macOS builds
            curl -L -o "$temp_dir/ffmpeg.zip" "https://evermeet.cx/ffmpeg/getrelease/zip"
            unzip -o "$temp_dir/ffmpeg.zip" -d "$temp_dir"
            mv "$temp_dir/ffmpeg" "$output_file"
            ;;
        windows-x64)
            # Use gyan.dev builds for Windows
            local ffmpeg_url="https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
            curl -L -o "$temp_dir/ffmpeg.zip" "$ffmpeg_url"
            unzip -o "$temp_dir/ffmpeg.zip" -d "$temp_dir"
            # Find the ffmpeg.exe in the extracted folder
            local ffmpeg_exe=$(find "$temp_dir" -name "ffmpeg.exe" -type f | head -1)
            if [[ -n "$ffmpeg_exe" ]]; then
                mv "$ffmpeg_exe" "$output_file"
            else
                log_error "Could not find ffmpeg.exe in downloaded archive"
                rm -rf "$temp_dir"
                return 1
            fi
            ;;
        linux-x64)
            # Use johnvansickle.com static builds for Linux
            curl -L -o "$temp_dir/ffmpeg.tar.xz" "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
            tar -xf "$temp_dir/ffmpeg.tar.xz" -C "$temp_dir"
            local ffmpeg_bin=$(find "$temp_dir" -name "ffmpeg" -type f -executable | head -1)
            if [[ -n "$ffmpeg_bin" ]]; then
                mv "$ffmpeg_bin" "$output_file"
            else
                log_error "Could not find ffmpeg in downloaded archive"
                rm -rf "$temp_dir"
                return 1
            fi
            ;;
        linux-arm64)
            curl -L -o "$temp_dir/ffmpeg.tar.xz" "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz"
            tar -xf "$temp_dir/ffmpeg.tar.xz" -C "$temp_dir"
            local ffmpeg_bin=$(find "$temp_dir" -name "ffmpeg" -type f -executable | head -1)
            if [[ -n "$ffmpeg_bin" ]]; then
                mv "$ffmpeg_bin" "$output_file"
            else
                log_error "Could not find ffmpeg in downloaded archive"
                rm -rf "$temp_dir"
                return 1
            fi
            ;;
        *)
            log_error "Unknown platform: $platform"
            rm -rf "$temp_dir"
            return 1
            ;;
    esac

    rm -rf "$temp_dir"
    chmod +x "$output_file"
    log_success "Downloaded ffmpeg for $platform"
}

# Download all binaries for a platform
download_binaries() {
    local platform=$1

    mkdir -p "$BINARIES_DIR"

    # For macos-universal, we need both architectures
    if [[ "$platform" == "macos-universal" ]]; then
        download_ytdlp "macos-arm64"
        download_ytdlp "macos-x64"
        download_ffmpeg "macos-arm64"
        download_ffmpeg "macos-x64"
    else
        download_ytdlp "$platform"
        download_ffmpeg "$platform"
    fi
}

# Build the application
build_app() {
    local platform=$1
    local rust_target=$(get_rust_target "$platform")

    log_info "Building Downlink for $platform (target: $rust_target)..."

    cd "$PROJECT_DIR"

    # Install npm dependencies if needed
    if [[ ! -d "node_modules" ]]; then
        log_info "Installing npm dependencies..."
        npm install
    fi

    # Build with Tauri
    if [[ "$platform" == "macos-universal" ]]; then
        npm run tauri:build -- --target universal-apple-darwin
    elif [[ -n "$rust_target" ]]; then
        npm run tauri:build -- --target "$rust_target"
    else
        npm run tauri:build
    fi

    log_success "Build complete!"

    # Show output location
    log_info "Build artifacts:"
    case "$platform" in
        macos-*)
            ls -la "$PROJECT_DIR/src-tauri/target/release/bundle/macos/" 2>/dev/null || true
            ls -la "$PROJECT_DIR/src-tauri/target/release/bundle/dmg/" 2>/dev/null || true
            ;;
        windows-*)
            ls -la "$PROJECT_DIR/src-tauri/target/release/bundle/nsis/" 2>/dev/null || true
            ls -la "$PROJECT_DIR/src-tauri/target/release/bundle/msi/" 2>/dev/null || true
            ;;
        linux-*)
            ls -la "$PROJECT_DIR/src-tauri/target/release/bundle/deb/" 2>/dev/null || true
            ls -la "$PROJECT_DIR/src-tauri/target/release/bundle/appimage/" 2>/dev/null || true
            ;;
    esac
}

# Clean binaries
clean_binaries() {
    log_info "Cleaning binaries..."
    rm -rf "$BINARIES_DIR"
    mkdir -p "$BINARIES_DIR"
    log_success "Binaries cleaned"
}

# Show usage
show_usage() {
    echo "Downlink Build Script"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --target <platform>   Build for specific platform:"
    echo "                        macos-x64, macos-arm64, macos-universal"
    echo "                        windows-x64"
    echo "                        linux-x64, linux-arm64"
    echo "  --download-only       Only download binaries, don't build"
    echo "  --clean               Clean binaries before downloading"
    echo "  --help                Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                           # Build for current platform"
    echo "  $0 --target windows-x64      # Build for Windows x64"
    echo "  $0 --download-only           # Only download binaries"
    echo "  $0 --clean --target macos-arm64  # Clean and rebuild for macOS ARM64"
}

# =============================================================================
# Main
# =============================================================================

TARGET=""
DOWNLOAD_ONLY=false
CLEAN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --target)
            TARGET="$2"
            shift 2
            ;;
        --download-only)
            DOWNLOAD_ONLY=true
            shift
            ;;
        --clean)
            CLEAN=true
            shift
            ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Detect platform if not specified
if [[ -z "$TARGET" ]]; then
    TARGET=$(detect_platform)
    if [[ "$TARGET" == "unknown" ]]; then
        log_error "Could not detect platform. Please specify with --target"
        exit 1
    fi
    log_info "Detected platform: $TARGET"
fi

# Validate target
RUST_TARGET=$(get_rust_target "$TARGET")
if [[ -z "$RUST_TARGET" && "$TARGET" != "macos-universal" ]]; then
    log_error "Invalid target: $TARGET"
    show_usage
    exit 1
fi

# Clean if requested
if [[ "$CLEAN" == true ]]; then
    clean_binaries
fi

# Download binaries
download_binaries "$TARGET"

# Build if not download-only
if [[ "$DOWNLOAD_ONLY" == false ]]; then
    build_app "$TARGET"
fi

log_success "Done!"

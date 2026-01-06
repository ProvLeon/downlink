# Auto-Updates Setup Guide

Downlink v0.1.1+ supports automatic updates using Tauri's built-in updater. This guide explains how to set up the auto-update infrastructure for releases.

## Overview

The auto-update system works as follows:

1. When Downlink starts, it checks a remote `latest.json` file for updates
2. If a new version is available, users see a notification banner
3. Users can download and install the update from Settings → Updates
4. After installation, the app restarts with the new version

## Prerequisites

- GitHub repository with releases enabled
- GitHub Actions for CI/CD
- Tauri CLI installed locally for key generation

## Setup Instructions

### 1. Generate Signing Keys

Tauri requires update packages to be signed. Generate a key pair:

```bash
# Install Tauri CLI if not already installed
cargo install tauri-cli

# Generate a new key pair
cargo tauri signer generate -w ~/.tauri/downlink.key
```

This creates:
- **Private key**: `~/.tauri/downlink.key` (keep this SECRET!)
- **Public key**: Displayed in terminal (save this)

The public key looks like:
```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEU2QzA0NzYyMUVFQzQ4RjUKUldUd...
```

### 2. Configure GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets → Actions):

| Secret Name | Value |
|------------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/downlink.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password you set during key generation |

### 3. Update tauri.conf.json

Replace the placeholder public key in `src-tauri/tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/YOUR_USERNAME/downlink/releases/latest/download/latest.json"
      ],
      "pubkey": "YOUR_PUBLIC_KEY_HERE"
    }
  }
}
```

### 4. Create a Release

When you push a tag (e.g., `v0.1.1`), GitHub Actions will:

1. Build the app for all platforms
2. Sign the update packages
3. Generate `latest.json` with update metadata
4. Upload everything to the GitHub release

```bash
# Create and push a new version tag
git tag v0.1.1
git push origin v0.1.1
```

## How It Works

### latest.json Structure

The `latest.json` file contains update information:

```json
{
  "version": "0.1.1",
  "notes": "Release notes here",
  "pub_date": "2025-01-06T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "...",
      "url": "https://github.com/.../Downlink_0.1.1_aarch64.dmg.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "...",
      "url": "https://github.com/.../Downlink_0.1.1_x64.dmg.tar.gz"
    },
    "windows-x86_64": {
      "signature": "...",
      "url": "https://github.com/.../Downlink_0.1.1_x64-setup.nsis.zip"
    },
    "linux-x86_64": {
      "signature": "...",
      "url": "https://github.com/.../Downlink_0.1.1_amd64.AppImage.tar.gz"
    }
  }
}
```

### Update Flow

```
┌─────────────────┐
│   App Starts    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Check latest.json│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     No      ┌─────────────────┐
│ Update Available?├────────────►│   Continue      │
└────────┬────────┘              └─────────────────┘
         │ Yes
         ▼
┌─────────────────┐
│ Show Notification│
└────────┬────────┘
         │ User clicks "Update"
         ▼
┌─────────────────┐
│ Download Update │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Verify Signature│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Install & Restart│
└─────────────────┘
```

## Troubleshooting

### "Could not fetch a valid release JSON"

This error occurs when:
- No release exists yet with a `latest.json` file
- The endpoint URL is incorrect
- Network issues prevent fetching the file

**Solution**: Create a release with the proper workflow, or check the endpoint URL.

### "Signature verification failed"

This occurs when:
- The public key in `tauri.conf.json` doesn't match the private key used to sign
- The update file was corrupted during download

**Solution**: Ensure the public key matches and try again.

### Updates not showing

Check that:
1. The version in `latest.json` is higher than the current app version
2. The `pub_date` is not in the future
3. The platform key matches your OS (e.g., `darwin-aarch64` for M1 Mac)

## Security Notes

- **Never commit your private key** to the repository
- Store the private key securely (password manager, encrypted backup)
- The public key is safe to commit and share
- All updates are verified against the public key before installation

## Testing Locally

To test the update flow locally:

1. Build version 0.1.0 and install it
2. Update version to 0.1.1 in `tauri.conf.json` and `Cargo.toml`
3. Create a mock `latest.json` pointing to local files
4. Use a local HTTP server or modify the endpoint temporarily

```bash
# Serve latest.json locally for testing
python -m http.server 8080
```

Then temporarily change the endpoint:
```json
"endpoints": ["http://localhost:8080/latest.json"]
```

## References

- [Tauri Updater Plugin Documentation](https://v2.tauri.app/plugin/updater/)
- [Tauri Signer Documentation](https://v2.tauri.app/reference/cli/#signer)
- [GitHub Actions for Tauri](https://github.com/tauri-apps/tauri-action)

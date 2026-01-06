# Setting Up Downloads for Downlink

This guide explains how to make your Downlink app available for public download.

## Option 1: GitHub Releases (Recommended)

GitHub Releases is the easiest and most common way to distribute desktop apps.

### Step 1: Create a GitHub Repository

```bash
cd downlink
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/downlink.git
git push -u origin main
```

### Step 2: Create a Release (Automatic)

The repository includes a GitHub Actions workflow that automatically builds and creates releases.

1. Tag your release:
```bash
git tag v0.1.0
git push origin v0.1.0
```

2. Go to your repository → Actions → Watch the build progress

3. Once complete, go to Releases → Edit the draft release → Publish

### Step 2 (Alternative): Create a Release (Manual)

1. Build the app locally:
```bash
./scripts/build.sh  # macOS/Linux
# or
.\scripts\build.ps1  # Windows
```

2. Go to your GitHub repository → Releases → "Create a new release"

3. Tag: `v0.1.0`, Title: `Downlink v0.1.0`

4. Upload the files from `src-tauri/target/release/bundle/`:
   - macOS: `dmg/Downlink_0.1.0_x64.dmg` and/or `_aarch64.dmg`
   - Windows: `nsis/Downlink_0.1.0_x64-setup.exe` and `msi/*.msi`
   - Linux: `deb/*.deb`, `rpm/*.rpm`, `appimage/*.AppImage`

5. Click "Publish release"

### Download URLs

Once published, your download URLs will be:
```
https://github.com/YOUR_USERNAME/downlink/releases/latest/download/Downlink_0.1.0_x64.dmg
https://github.com/YOUR_USERNAME/downlink/releases/latest/download/Downlink_0.1.0_x64-setup.exe
https://github.com/YOUR_USERNAME/downlink/releases/latest/download/downlink_0.1.0_amd64.deb
```

---

## Option 2: GitHub Pages Landing Page

Host a beautiful download page at `https://YOUR_USERNAME.github.io/downlink`

### Step 1: Update the Landing Page

Edit `docs/index.html` and replace all instances of `YOUR_USERNAME` with your GitHub username.

### Step 2: Add a Screenshot

Take a screenshot of your app and save it as `docs/screenshot.png`

### Step 3: Enable GitHub Pages

1. Go to your repository → Settings → Pages
2. Source: "Deploy from a branch"
3. Branch: `main`, Folder: `/docs`
4. Click Save

Your site will be live at `https://YOUR_USERNAME.github.io/downlink` within a few minutes.

---

## Option 3: Other Hosting Platforms

### Netlify (Free)

1. Go to [netlify.com](https://netlify.com)
2. Drag and drop your `docs` folder
3. Get a free URL like `https://random-name.netlify.app`
4. Optionally connect a custom domain

### Vercel (Free)

1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Set the root directory to `docs`
4. Deploy

### Your Own Server

Upload the files to any web server:
- The `docs/index.html` for the landing page
- Host the release files anywhere accessible via HTTPS

---

## Option 4: Direct File Hosting

If you just want to share files without a landing page:

### Google Drive
1. Upload the files to Google Drive
2. Right-click → Share → "Anyone with the link"
3. Share the download link

### Dropbox
1. Upload files to Dropbox
2. Share → Create link
3. Change `?dl=0` to `?dl=1` for direct download

### OneDrive
1. Upload files to OneDrive
2. Share → "Anyone with the link can download"

---

## Recommended Approach

For a professional open-source app:

1. **Use GitHub Releases** for hosting the actual files (free, reliable, fast CDN)
2. **Use GitHub Pages** for a landing page (free, easy to update)
3. **Use the GitHub Actions workflow** for automated builds

This gives you:
- Automatic builds for all platforms
- Version history
- Download statistics
- Professional appearance
- Zero hosting costs

---

## Updating the Landing Page

After creating a new release, update the version numbers in `docs/index.html`:

1. Update the version badge text
2. Update download URLs if the version changed
3. Commit and push:
```bash
git add docs/index.html
git commit -m "Update to v0.2.0"
git push
```

The site will automatically update within minutes.

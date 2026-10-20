# Route Lab

A mobile web app that shows a full-screen OpenStreetMap (via Leaflet) and, after you tap **Start**, follows your live GPS position with a marker, an accuracy circle, and a readout of latitude, longitude and accuracy in metres.

Plain HTML/CSS/JS — no build step. All of the app's own files use relative paths, so it works from any GitHub Pages URL (including `username.github.io/repo-name/`).

## Files

```
index.html   page structure
style.css    layout, full-screen map, safe-area handling for notched phones
app.js       map, GPS tracking, follow mode, error handling
.nojekyll    tells GitHub Pages to serve files as-is
```

Leaflet 1.9.4 loads from the unpkg CDN with integrity hashes. Map tiles come from tile.openstreetmap.org.

## Publish on GitHub Pages

1. Create a new public repository (e.g. `route-lab`) on GitHub.
2. Upload `index.html`, `style.css`, `app.js`, `.nojekyll` and this README to the repository root (**Add file → Upload files**, then commit).
3. Go to **Settings → Pages**. Under *Build and deployment*, set **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)**, and save.
4. After a minute, your app is live at `https://<your-username>.github.io/route-lab/`.

GitHub Pages serves over HTTPS, which browsers require for GPS.

## Using it on a phone

- Open the https:// link in **Safari** (iPhone) or **Chrome** (Android) and tap **Start**.
- Allow location access when asked.
- Drag the map to look around; tap **Follow me** to snap back to your position.
- Tap **Stop** to pause tracking.
- Optional: *Share → Add to Home Screen* (iPhone) or *⋮ → Add to Home screen* (Android) for an app-like icon.

### If location doesn't work

- **iPhone:** Settings → Privacy & Security → Location Services must be on, and *Safari Websites* set to "While Using the App". Then reload the page.
- **Android:** turn on Location in quick settings; in Chrome tap the icon left of the address bar → Permissions → Location → Allow.
- Indoors, accuracy can be 20–100 m or worse; it improves outdoors.
- Browsers pause GPS when the screen is off or the tab is in the background; tracking resumes when you return. While tracking, the app asks the screen to stay on where the browser supports it.

## Local testing

Geolocation needs HTTPS or `localhost`. On a computer you can run `python3 -m http.server` in this folder and open `http://localhost:8000`. To test on a phone, use the GitHub Pages URL.

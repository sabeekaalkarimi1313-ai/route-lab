(function () {
  'use strict';

  // ---------- Elements ----------
  var el = {
    status: document.getElementById('status'),
    lat: document.getElementById('lat'),
    lng: document.getElementById('lng'),
    acc: document.getElementById('acc'),
    message: document.getElementById('message'),
    startBtn: document.getElementById('startBtn'),
    recenterBtn: document.getElementById('recenterBtn')
  };

  if (typeof L === 'undefined') {
    showMessage('The map library could not load. Check your internet connection and reload.');
    setStatus('error', 'Offline');
    el.startBtn.disabled = true;
    return;
  }

  // ---------- Map ----------
  var map = L.map('map', {
    zoomControl: true,
    attributionControl: false,
    maxZoom: 21,
    tap: false // avoids a known double-tap issue on iOS with older Leaflet tap handling
  }).setView([20, 0], 2);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxNativeZoom: 19, // OSM tiles stop at 19; zoom 20–21 just enlarges them
    maxZoom: 21,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  L.control.attribution({ position: 'topright' }).addTo(map);

  // Shared with treasure.js
  window.RouteLab = { map: map };

  var meIcon = L.divIcon({
    className: 'me-marker',
    html: '<div class="me-dot"></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  var marker = null;
  var accuracyCircle = null;

  // ---------- State ----------
  var watchId = null;
  var following = true;       // map auto-centres on you until you drag it
  var hasFix = false;
  var lastPos = null;
  var wakeLock = null;

  // When the user drags the map, stop auto-following until they tap "Follow me".
  map.on('dragstart', function () {
    if (watchId !== null && following) {
      following = false;
      el.recenterBtn.hidden = false;
    }
  });

  // ---------- UI helpers ----------
  function setStatus(kind, text) {
    el.status.className = 'status status-' + kind;
    el.status.textContent = text;
  }

  function showMessage(text, info) {
    el.message.textContent = text;
    el.message.className = 'message' + (info ? ' info' : '');
    el.message.hidden = false;
  }

  function clearMessage() {
    el.message.hidden = true;
    el.message.textContent = '';
  }

  function setRunningUI(running) {
    el.startBtn.textContent = running ? 'Stop' : 'Start';
    el.startBtn.classList.toggle('is-stop', running);
    if (!running) el.recenterBtn.hidden = true;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  // ---------- Geolocation ----------
  function onPosition(pos) {
    var lat = pos.coords.latitude;
    var lng = pos.coords.longitude;
    var acc = pos.coords.accuracy;
    var latlng = L.latLng(lat, lng);
    lastPos = latlng;

    el.lat.textContent = lat.toFixed(6);
    el.lng.textContent = lng.toFixed(6);
    el.acc.textContent = '±' + Math.round(acc) + ' m';

    if (!marker) {
      marker = L.marker(latlng, { icon: meIcon, keyboard: false, interactive: false }).addTo(map);
      accuracyCircle = L.circle(latlng, {
        radius: acc,
        color: '#2563eb',
        weight: 1,
        fillColor: '#2563eb',
        fillOpacity: 0.12,
        interactive: false
      }).addTo(map);
    } else {
      marker.setLatLng(latlng);
      accuracyCircle.setLatLng(latlng);
      accuracyCircle.setRadius(acc);
    }

    if (!hasFix) {
      hasFix = true;
      map.setView(latlng, 17, { animate: true });
    } else if (following) {
      map.panTo(latlng, { animate: true, duration: 0.5 });
    }

    setStatus('live', acc <= 30 ? 'Live' : 'Live · low accuracy');
    clearMessage();

    // Let the treasure hunt (and anything else) react to the new position.
    var evt;
    try {
      evt = new CustomEvent('routelab:position', { detail: { latlng: latlng, accuracy: acc } });
    } catch (e) { // very old browsers
      evt = document.createEvent('CustomEvent');
      evt.initCustomEvent('routelab:position', false, false, { latlng: latlng, accuracy: acc });
    }
    window.dispatchEvent(evt);
  }

  function onError(err) {
    // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
    if (err.code === 1) {
      stop();
      setStatus('error', 'Blocked');
      if (isIOS()) {
        showMessage('Location access is blocked. On iPhone: Settings → Privacy & Security → Location Services → turn on, then Safari Websites → "While Using the App". Reload this page and tap Start.');
      } else {
        showMessage('Location access is blocked. Tap the icon left of the address bar → Permissions → Location → Allow, then reload and tap Start. Also make sure phone Location is on.');
      }
    } else if (err.code === 3) {
      // Timeouts are common indoors; keep watching and tell the user.
      setStatus('searching', 'Searching…');
      showMessage('Still waiting for GPS. Moving near a window or outdoors helps.', true);
    } else {
      setStatus('searching', 'No signal');
      showMessage('Position unavailable right now. Check that Location is turned on for your phone.', true);
    }
  }

  function start() {
    if (!window.isSecureContext) {
      setStatus('error', 'Needs HTTPS');
      showMessage('GPS only works over HTTPS. Open the GitHub Pages https:// address.');
      return;
    }
    if (!('geolocation' in navigator)) {
      setStatus('error', 'Unsupported');
      showMessage('This browser does not support location.');
      return;
    }

    following = true;
    el.recenterBtn.hidden = true;
    setRunningUI(true);
    setStatus('searching', 'Searching…');
    showMessage('Waiting for your location — allow access if your browser asks.', true);

    // Must be called directly from the tap so iOS shows the permission prompt.
    watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000
    });

    requestWakeLock();
  }

  function stop() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    setRunningUI(false);
    releaseWakeLock();
    if (hasFix) setStatus('idle', 'Paused');
  }

  // ---------- Screen wake lock (keeps the screen on while tracking, where supported) ----------
  function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () { /* not critical */ });
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(function () {});
      wakeLock = null;
    }
  }

  // Phones pause GPS when the page is hidden. When it comes back, restart the watch
  // so updates resume reliably on both iOS Safari and Android Chrome.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(onPosition, onError, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000
      });
      requestWakeLock();
    }
  });

  // ---------- Buttons ----------
  el.startBtn.addEventListener('click', function () {
    if (watchId === null) start(); else stop();
  });

  el.recenterBtn.addEventListener('click', function () {
    following = true;
    el.recenterBtn.hidden = true;
    if (lastPos) map.setView(lastPos, Math.max(map.getZoom(), 16), { animate: true });
  });

  // ---------- Test mode: open the page with ?test and tap the map to "walk" ----------
  if (/[?&]test\b/.test(window.location.search)) {
    setStatus('idle', 'Test mode');
    showMessage('Test mode: tap the map to move yourself. Zoom in first.', true);
    map.on('click', function (e) {
      onPosition({ coords: { latitude: e.latlng.lat, longitude: e.latlng.lng, accuracy: 5 } });
      setStatus('live', 'Test mode');
    });
  }

  // Keep the map sized correctly when the phone rotates or browser bars collapse.
  window.addEventListener('resize', function () { map.invalidateSize(); });
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { map.invalidateSize(); }, 300);
  });
})();

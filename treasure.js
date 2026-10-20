/* Route Lab — Treasure Hunt
 * Hides a treasure about 10 m from you. Walk to it using the arrow,
 * the distance readout and the warmer/colder hints.
 * Listens for the 'routelab:position' event fired by app.js.
 */
(function () {
  'use strict';

  var RL = window.RouteLab;
  if (!RL || !RL.map) return;
  var map = RL.map;

  // ---------- Settings ----------
  var HIDE_DISTANCE = 10;   // metres from you where the treasure is hidden
  var MIN_FOUND_RADIUS = 4; // you must get at least this close…
  var MAX_FOUND_RADIUS = 6; // …but we relax up to this when GPS is fuzzy
  var MAX_START_ACCURACY = 25; // wait for a fix at least this good before hiding

  // ---------- Elements ----------
  var el = {
    hunt: document.getElementById('hunt'),
    arrow: document.getElementById('huntArrow'),
    dist: document.getElementById('huntDist'),
    hint: document.getElementById('huntHint'),
    score: document.getElementById('foundCount'),
    rehide: document.getElementById('rehideBtn'),
    celebrate: document.getElementById('celebrate'),
    celebrateText: document.getElementById('celebrateText'),
    playAgain: document.getElementById('playAgainBtn'),
    confetti: document.getElementById('confetti')
  };

  // ---------- State ----------
  var me = null;            // latest L.LatLng
  var accuracy = Infinity;
  var treasure = null;      // L.LatLng of the hidden treasure
  var treasureMarker = null;
  var zoneCircle = null;
  var guideLine = null;
  var lastDist = null;
  var found = false;
  var startedAt = 0;
  var walked = 0;
  var lastWalkPoint = null;
  var score = loadScore();

  el.score.textContent = score;

  // ---------- Icons ----------
  var chestIcon = L.divIcon({
    className: 'treasure-marker',
    html: '<div class="treasure-chest" aria-label="Treasure">💰</div>',
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });
  var openedIcon = L.divIcon({
    className: 'treasure-marker',
    html: '<div class="treasure-chest is-found" aria-label="Found treasure">✨</div>',
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });

  // ---------- Geometry helpers ----------
  // Point `metres` away from `from` in direction `bearingDeg` (0 = north).
  function offset(from, metres, bearingDeg) {
    var R = 6378137;
    var b = bearingDeg * Math.PI / 180;
    var lat1 = from.lat * Math.PI / 180;
    var lng1 = from.lng * Math.PI / 180;
    var d = metres / R;
    var lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
    var lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1),
                                 Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return L.latLng(lat2 * 180 / Math.PI, lng2 * 180 / Math.PI);
  }

  function bearing(a, b) {
    var lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var y = Math.sin(dLng) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function compass(deg) {
    var names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    return names[Math.round(deg / 45) % 8];
  }

  function foundRadius() {
    return Math.min(MAX_FOUND_RADIUS, Math.max(MIN_FOUND_RADIUS, accuracy * 0.4));
  }

  // ---------- Game flow ----------
  function hideTreasure() {
    if (!me) return;
    clearTreasure();

    var dir = Math.random() * 360;
    treasure = offset(me, HIDE_DISTANCE, dir);
    found = false;
    lastDist = null;
    startedAt = Date.now();
    walked = 0;
    lastWalkPoint = me;

    zoneCircle = L.circle(treasure, {
      radius: foundRadius(),
      color: '#d97706',
      weight: 2,
      dashArray: '4 6',
      fillColor: '#fbbf24',
      fillOpacity: 0.15,
      interactive: false
    }).addTo(map);

    treasureMarker = L.marker(treasure, { icon: chestIcon, keyboard: false, interactive: false, zIndexOffset: 500 }).addTo(map);

    guideLine = L.polyline([me, treasure], {
      color: '#d97706',
      weight: 3,
      dashArray: '2 8',
      opacity: 0.8,
      interactive: false
    }).addTo(map);

    // 10 m is tiny on a map — zoom right in so both you and the treasure are visible.
    map.setView(me, 20, { animate: true });

    el.hunt.hidden = false;
    el.hint.textContent = 'Treasure hidden ' + HIDE_DISTANCE + ' m to the ' + compass(dir) + '. Follow the arrow!';
    update();
  }

  function clearTreasure() {
    [treasureMarker, zoneCircle, guideLine].forEach(function (layer) {
      if (layer) map.removeLayer(layer);
    });
    treasureMarker = zoneCircle = guideLine = null;
    treasure = null;
  }

  function update() {
    if (!treasure || !me || found) return;

    var d = me.distanceTo(treasure);
    var b = bearing(me, treasure);
    var r = foundRadius();

    zoneCircle.setRadius(r);
    guideLine.setLatLngs([me, treasure]);

    el.dist.textContent = Math.max(0, Math.round(d)) + ' m';
    el.arrow.style.transform = 'rotate(' + b + 'deg)';

    if (d <= r) {
      celebrate();
      return;
    }

    var hint;
    if (d <= r + 2) {
      hint = 'Super hot! 🔥 Almost there!';
    } else if (lastDist === null) {
      hint = el.hint.textContent; // keep the opening hint
    } else if (d < lastDist - 1) {
      hint = 'Warmer! 🙂 Keep going ' + compass(b) + '.';
    } else if (d > lastDist + 1) {
      hint = 'Colder… 🥶 Turn around — go ' + compass(b) + '.';
    } else {
      hint = null; // no real change, keep the previous hint
    }
    if (hint) el.hint.textContent = hint;
    if (accuracy > 15) el.hint.textContent = el.hint.textContent.replace(/ \(GPS is fuzzy here\)$/, '') + ' (GPS is fuzzy here)';

    // Only move the reference point when the change is real, so jitter
    // doesn't flip between warmer and colder while you stand still.
    if (lastDist === null || Math.abs(d - lastDist) > 1) lastDist = d;
  }

  function celebrate() {
    found = true;
    score += 1;
    saveScore(score);
    el.score.textContent = score;

    if (treasureMarker) treasureMarker.setIcon(openedIcon);
    if (guideLine) { map.removeLayer(guideLine); guideLine = null; }

    el.dist.textContent = '0 m';
    el.hint.textContent = 'You found it! 🎉';

    var secs = Math.round((Date.now() - startedAt) / 1000);
    var time = Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2);
    el.celebrateText.textContent = 'Found in ' + time + ' after walking about ' + Math.round(walked) +
      ' m. Treasures found: ' + score + '.';

    if (navigator.vibrate) {
      try { navigator.vibrate([120, 60, 120, 60, 300]); } catch (e) { /* ignore */ }
    }

    burstConfetti();
    el.celebrate.hidden = false;
  }

  function burstConfetti() {
    var colors = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#a855f7', '#fde047'];
    el.confetti.innerHTML = '';
    for (var i = 0; i < 60; i++) {
      var piece = document.createElement('span');
      piece.className = 'confetti-piece';
      piece.style.left = (Math.random() * 100) + '%';
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = (Math.random() * 0.6) + 's';
      piece.style.animationDuration = (1.8 + Math.random() * 1.4) + 's';
      piece.style.transform = 'rotate(' + Math.round(Math.random() * 360) + 'deg)';
      el.confetti.appendChild(piece);
    }
  }

  // ---------- Score storage (best-effort; works without it) ----------
  function loadScore() {
    try { return parseInt(localStorage.getItem('routelab.treasures') || '0', 10) || 0; }
    catch (e) { return 0; }
  }
  function saveScore(n) {
    try { localStorage.setItem('routelab.treasures', String(n)); } catch (e) { /* ignore */ }
  }

  // ---------- Events ----------
  window.addEventListener('routelab:position', function (e) {
    me = e.detail.latlng;
    accuracy = e.detail.accuracy;

    // Rough "distance walked" — ignore tiny GPS wobble.
    if (lastWalkPoint) {
      var step = me.distanceTo(lastWalkPoint);
      if (step > 1.5) { walked += step; lastWalkPoint = me; }
    }

    if (!treasure) {
      if (accuracy <= MAX_START_ACCURACY) {
        hideTreasure();
      } else {
        el.hunt.hidden = false;
        el.dist.textContent = '…';
        el.hint.textContent = 'Waiting for a sharper GPS signal (±' + Math.round(accuracy) +
          ' m) before hiding the treasure. Try stepping outside.';
      }
      return;
    }
    update();
  });

  el.rehide.addEventListener('click', hideTreasure);

  el.playAgain.addEventListener('click', function () {
    el.celebrate.hidden = true;
    el.confetti.innerHTML = '';
    hideTreasure();
  });
})();

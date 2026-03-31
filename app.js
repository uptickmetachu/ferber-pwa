// Ferber intervals in minutes: [day][check-in index]
// After the last explicit interval, repeat the last value
const FERBER_INTERVALS = {
  1: [3, 5, 10],
  2: [5, 10, 12],
  3: [10, 12, 15],
  4: [12, 15, 17],
  5: [15, 17, 20],
  6: [17, 20, 25],
  7: [20, 25, 30],
};

let state = {
  day: 1,
  checkInIndex: 0,
  totalSeconds: 0,
  remainingSeconds: 0,
  paused: false,
  intervalId: null,
  sessionStart: null,
  checkIns: 0,
  wakeLock: null,
};

// DOM elements
const $ = (id) => document.getElementById(id);
const setupScreen = $("setup-screen");
const timerScreen = $("timer-screen");
const alertScreen = $("alert-screen");
const completeScreen = $("complete-screen");

const timerMinutes = $("timer-minutes");
const timerSeconds = $("timer-seconds");
const timerRingProgress = $("timer-ring-progress");
const checkLabel = $("check-label");
const dayLabel = $("day-label");
const currentInterval = $("current-interval");
const nextInterval = $("next-interval");
const intervalsList = $("intervals-list");

// Utilities
function getInterval(day, index) {
  const intervals = FERBER_INTERVALS[day];
  if (index < intervals.length) return intervals[index];
  return intervals[intervals.length - 1];
}

function formatMinutes(min) {
  return `${min} min`;
}

function pad(n) {
  return n.toString().padStart(2, "0");
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

// Wake Lock
async function requestWakeLock() {
  if ("wakeLock" in navigator) {
    try {
      state.wakeLock = await navigator.wakeLock.request("screen");
      state.wakeLock.addEventListener("release", () => {
        state.wakeLock = null;
      });
    } catch (_) {
      // Silently fail - not critical
    }
  }
}

function releaseWakeLock() {
  if (state.wakeLock) {
    state.wakeLock.release();
    state.wakeLock = null;
  }
}

// Re-acquire wake lock when page becomes visible again
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.intervalId && !state.paused) {
    requestWakeLock();
  }
});

// Vibration
function vibrate(pattern) {
  if ("vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

function alertVibration() {
  // Long repeating pattern to get attention
  vibrate([300, 200, 300, 200, 300, 200, 600]);
}

function stopVibration() {
  if ("vibrate" in navigator) {
    navigator.vibrate(0);
  }
}

// Screen management
function showScreen(screen) {
  [setupScreen, timerScreen, alertScreen, completeScreen].forEach((s) =>
    s.classList.remove("active")
  );
  screen.classList.add("active");
}

// Render intervals preview
function renderIntervals(day) {
  const intervals = FERBER_INTERVALS[day];
  intervalsList.innerHTML = "";
  intervals.forEach((min, i) => {
    const chip = document.createElement("div");
    chip.className = "interval-chip";
    chip.innerHTML = `${min}<span class="suffix">min</span>`;
    intervalsList.appendChild(chip);
  });
  const repeatChip = document.createElement("div");
  repeatChip.className = "interval-chip repeat";
  repeatChip.textContent = `${intervals[intervals.length - 1]}min repeat`;
  intervalsList.appendChild(repeatChip);
}

// Day selector
document.querySelectorAll(".day-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".day-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.day = parseInt(btn.dataset.day);
    renderIntervals(state.day);
  });
});

// Timer ring
const RING_CIRCUMFERENCE = 2 * Math.PI * 90; // ~565.48

function updateRing(fraction) {
  const offset = RING_CIRCUMFERENCE * (1 - fraction);
  timerRingProgress.style.strokeDashoffset = offset;
}

// Timer display
function updateTimerDisplay() {
  const mins = Math.floor(state.remainingSeconds / 60);
  const secs = state.remainingSeconds % 60;
  timerMinutes.textContent = pad(mins);
  timerSeconds.textContent = pad(secs);

  const fraction = state.totalSeconds > 0 ? state.remainingSeconds / state.totalSeconds : 0;
  updateRing(fraction);
}

// Start a check-in interval
function startInterval() {
  const minutes = getInterval(state.day, state.checkInIndex);
  state.totalSeconds = minutes * 60;
  state.remainingSeconds = state.totalSeconds;
  state.paused = false;

  checkLabel.textContent = `Check-in #${state.checkInIndex + 1}`;
  dayLabel.textContent = `Day ${state.day}`;
  currentInterval.textContent = formatMinutes(minutes);

  const nextMin = getInterval(state.day, state.checkInIndex + 1);
  if (nextMin === minutes) {
    nextInterval.textContent = `${formatMinutes(nextMin)} (repeat)`;
  } else {
    nextInterval.textContent = formatMinutes(nextMin);
  }

  timerScreen.classList.remove("paused");
  $("pause-btn").textContent = "Pause";
  updateTimerDisplay();
  showScreen(timerScreen);

  requestWakeLock();
  startTicking();
}

function startTicking() {
  clearInterval(state.intervalId);
  state.intervalId = setInterval(() => {
    if (state.paused) return;

    state.remainingSeconds--;
    updateTimerDisplay();

    if (state.remainingSeconds <= 0) {
      clearInterval(state.intervalId);
      state.intervalId = null;
      triggerAlert();
    }
  }, 1000);
}

function triggerAlert() {
  state.checkIns++;
  $("alert-check-number").textContent = `Check-in #${state.checkInIndex + 1}`;
  showScreen(alertScreen);
  alertVibration();

  // Keep vibrating every 5 seconds
  state.alertVibrateId = setInterval(() => {
    alertVibration();
  }, 5000);
}

function stopAlert() {
  stopVibration();
  if (state.alertVibrateId) {
    clearInterval(state.alertVibrateId);
    state.alertVibrateId = null;
  }
}

// Controls
$("start-btn").addEventListener("click", () => {
  state.checkInIndex = 0;
  state.checkIns = 0;
  state.sessionStart = Date.now();
  startInterval();
});

$("pause-btn").addEventListener("click", () => {
  state.paused = !state.paused;
  if (state.paused) {
    timerScreen.classList.add("paused");
    $("pause-btn").textContent = "Resume";
    releaseWakeLock();
  } else {
    timerScreen.classList.remove("paused");
    $("pause-btn").textContent = "Pause";
    requestWakeLock();
  }
});

$("skip-btn").addEventListener("click", () => {
  clearInterval(state.intervalId);
  state.intervalId = null;
  state.checkIns++;
  state.checkInIndex++;
  startInterval();
});

$("stop-btn").addEventListener("click", () => {
  endSession();
});

$("checked-btn").addEventListener("click", () => {
  stopAlert();
  state.checkInIndex++;
  startInterval();
});

$("end-session-btn").addEventListener("click", () => {
  stopAlert();
  endSession();
});

$("restart-btn").addEventListener("click", () => {
  showScreen(setupScreen);
});

function endSession() {
  clearInterval(state.intervalId);
  state.intervalId = null;
  stopAlert();
  releaseWakeLock();

  const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
  const summary = $("session-summary");
  summary.innerHTML = `
    <div class="summary-row">
      <span class="label">Training day</span>
      <span>Day ${state.day}</span>
    </div>
    <div class="summary-row">
      <span class="label">Check-ins</span>
      <span>${state.checkIns}</span>
    </div>
    <div class="summary-row">
      <span class="label">Total time</span>
      <span>${formatDuration(elapsed)}</span>
    </div>
  `;
  showScreen(completeScreen);
}

// Service worker registration
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// Init
renderIntervals(1);

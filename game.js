// Simple Google Apps Script endpoint
const GAS_URL = "https://script.google.com/macros/s/AKfycbwRxNSJ7fY_97txC7B4d_Tklzm373d-Bi1TBj3N4M_2DBONDAgDhviIJWT1nouZkMborA/exec";
const TOPICS = window.TOPICS || {};

// DOM references
const playerNameInput = document.getElementById("playerName");
const topicSelect = document.getElementById("topicSelect");
const startBtn = document.getElementById("startBtn");

const gameSection = document.getElementById("gameSection");
const topicLabel = document.getElementById("topicLabel");
const scoreDisplay = document.getElementById("scoreDisplay");
const multiplierDisplay = document.getElementById("multiplierDisplay");
const livesDisplay = document.getElementById("livesDisplay");
const questionText = document.getElementById("questionText");
const answersContainer = document.getElementById("answersContainer");
const feedbackEl = document.getElementById("feedback");

const gameOverPanel = document.getElementById("gameOverPanel");
const finalScoreEl = document.getElementById("finalScore");
const lastGameTopicEl = document.getElementById("lastGameTopic");
const restartBtn = document.getElementById("restartBtn");

// Leaderboard DOM (will just show a static message for now)
const leaderboardTabs = Array.from(document.querySelectorAll(".lb-tab"));
const leaderboardTitle = document.getElementById("leaderboardTitle");
const leaderboardContainer = document.getElementById("leaderboardContainer");
const topicLeaderboardContainer = document.getElementById("topicLeaderboardContainer");

// Game state
let currentQuestions = [];
let currentTopicKey = "all";
let score = 0;
let multiplier = 1;
let lives = 3;
let index = 0;
const MAX_MULTIPLIER = 5;

// --------- Utility helpers ----------
function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getTopicLabel(key) {
  if (key === "all") return "All Topics";
  const topic = TOPICS[key];
  return topic ? topic.label : key;
}

// Build a flat question list. For "all", mix from every topic.
function buildQuestionSet(topicKey) {
  if (topicKey === "all") {
    const all = [];
    Object.entries(TOPICS).forEach(([key, t]) => {
      t.questions.forEach(q => {
        all.push({ ...q, __topicKey: key });
      });
    });
    return shuffle(all);
  } else {
    const t = TOPICS[topicKey];
    if (!t) return [];
    const qs = t.questions.map(q => ({ ...q, __topicKey: topicKey }));
    return shuffle(qs);
  }
}

// ---------- Game flow ----------
function resetGameState(topicKey) {
  currentTopicKey = topicKey;
  currentQuestions = buildQuestionSet(topicKey);
  score = 0;
  multiplier = 1;
  lives = 3;
  index = 0;

  scoreDisplay.textContent = score.toString();
  multiplierDisplay.textContent = "x" + multiplier;
  livesDisplay.textContent = lives.toString();
  feedbackEl.textContent = "";
  feedbackEl.className = "feedback";
  topicLabel.textContent = getTopicLabel(topicKey);
}

function showQuestion() {
  if (lives <= 0 || index >= currentQuestions.length) {
    endGame();
    return;
  }

  const q = currentQuestions[index];
  questionText.textContent = q.q;
  answersContainer.innerHTML = "";
  feedbackEl.textContent = "";
  feedbackEl.className = "feedback";

  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => handleAnswer(i === q.answerIndex, btn));
    answersContainer.appendChild(btn);
  });
}

function handleAnswer(correct, clickedBtn) {
  // disable all buttons for this question
  const buttons = Array.from(answersContainer.querySelectorAll("button"));
  buttons.forEach(b => (b.disabled = true));

  const q = currentQuestions[index];
  buttons.forEach((b, i) => {
    if (i === q.answerIndex) {
      b.classList.add("correct");
    }
  });

  if (correct) {
    clickedBtn.classList.add("correct");
    feedbackEl.textContent = "Correct! + " + (100 * multiplier);
    feedbackEl.className = "feedback correct";
    score += 100 * multiplier;
    multiplier = Math.min(MAX_MULTIPLIER, multiplier + 1);
  } else {
    clickedBtn.classList.add("wrong");
    feedbackEl.textContent = "Wrong! Multiplier reset.";
    feedbackEl.className = "feedback wrong";
    lives -= 1;
    multiplier = 1;
  }

  scoreDisplay.textContent = score.toString();
  multiplierDisplay.textContent = "x" + multiplier;
  livesDisplay.textContent = lives.toString();

  index += 1;

  setTimeout(() => {
    if (lives <= 0 || index >= currentQuestions.length) {
      endGame();
    } else {
      showQuestion();
    }
  }, 850);
}

function endGame() {
  gameSection.classList.add("hidden");
  gameOverPanel.classList.remove("hidden");

  finalScoreEl.textContent = score.toString();
  lastGameTopicEl.textContent = getTopicLabel(currentTopicKey);

  const name = (playerNameInput.value || "Anonymous").trim();
  // Fire-and-forget: log score via simple GET so CORS doesn't block it
  submitScore(name, currentTopicKey, score, currentQuestions.length);
}

// ---------- Score logging (no CORS readback) ----------

// Uses a tracking-pixel-style GET request. Browser doesn't care about CORS
// because we never read the response; we just let Google log it.
function submitScore(name, topicKey, score, questionsPlayed) {
  try {
    const params = new URLSearchParams();
    params.append("action", "submitScore");
    params.append("name", name);
    params.append("topic", topicKey);
    params.append("score", String(score));
    params.append("questionsPlayed", String(questionsPlayed));
    params.append("timestamp", new Date().toISOString());

    const img = new Image();
    img.src = GAS_URL + "?" + params.toString();
  } catch (err) {
    console.error("Error creating score beacon:", err);
  }
}

// ---------- Leaderboard UI (static message for now) ----------

function initLeaderboardsStatic() {
  leaderboardTitle.textContent = "All Time Top Scores";
  leaderboardContainer.innerHTML =
    "<p class='leaderboard-note'>Scores are being recorded in your Google Sheet (Sheet1). " +
    "Open the sheet to see full all-time / weekly / topic champions. " +
    "We can wire live leaderboards later if needed.</p>";

  topicLeaderboardContainer.innerHTML =
    "<p class='leaderboard-note'>Per-topic champions are visible in the sheet (filter by Topic ID).</p>";
}

function setupLeaderboardTabs() {
  leaderboardTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      leaderboardTabs.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

// ---------- UI wiring ----------
function populateTopicSelect() {
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All Topics (mixed)";
  topicSelect.appendChild(allOption);

  Object.entries(TOPICS).forEach(([key, t]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = t.label || key;
    topicSelect.appendChild(opt);
  });

  topicSelect.value = "all";
}

function startGameHandler() {
  const topicKey = topicSelect.value || "all";
  if (!Object.keys(TOPICS).length) {
    alert("Topic data not loaded – check questions.js.");
    return;
  }

  resetGameState(topicKey);
  gameOverPanel.classList.add("hidden");
  gameSection.classList.remove("hidden");
  showQuestion();
}

function restartGameHandler() {
  gameOverPanel.classList.add("hidden");
  gameSection.classList.add("hidden");
}

// ---------- Init ----------
populateTopicSelect();
setupLeaderboardTabs();
initLeaderboardsStatic();

startBtn.addEventListener("click", startGameHandler);
restartBtn.addEventListener("click", restartGameHandler);

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

// Leaderboard
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
  submitScore(name, currentTopicKey, score, currentQuestions.length)
    .then(() => {
      loadLeaderboard(currentPeriod);
      loadTopicLeaderboard();
    })
    .catch(() => {});
}

// ---------- Leaderboard communication ----------
let currentPeriod = "all";

async function submitScore(name, topicKey, score, questionsPlayed) {
  try {
    const formData = new URLSearchParams();
    formData.append("action", "submitScore");
    formData.append("name", name);
    formData.append("topic", topicKey);
    formData.append("score", String(score));
    formData.append("questionsPlayed", String(questionsPlayed));
    formData.append("timestamp", new Date().toISOString());

    await fetch(GAS_URL, {
      method: "POST",
      body: formData
    });
  } catch (err) {
    console.error("Error submitting score:", err);
  }
}

async function loadLeaderboard(period = "all") {
  try {
    const url = GAS_URL + "?action=getLeaderboard&period=" + encodeURIComponent(period);
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    renderLeaderboard(data || [], leaderboardContainer);
    const label = period === "today" ? "Today" : period === "week" ? "This Week" : "All Time";
    leaderboardTitle.textContent = label + " Top Scores";
  } catch (err) {
    console.error("Error loading leaderboard:", err);
    leaderboardContainer.innerHTML = "<p class='leaderboard-note'>Could not load leaderboard yet.</p>";
  }
}

async function loadTopicLeaderboard() {
  try {
    const url = GAS_URL + "?action=getTopicChampions";
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    renderTopicLeaderboard(data || [], topicLeaderboardContainer);
  } catch (err) {
    console.error("Error loading topic leaderboard:", err);
    topicLeaderboardContainer.innerHTML = "<p class='leaderboard-note'>Topic champions not available yet.</p>";
  }
}

function renderLeaderboard(rows, container) {
  if (!Array.isArray(rows) || rows.length === 0) {
    container.innerHTML = "<p class='leaderboard-note'>No scores yet. Be the first!</p>";
    return;
  }

  const limited = rows.slice(0, 20);
  const html = [
    "<div class='leaderboard-row header'><span>#</span><span>Name</span><span>Topic</span><span>Score</span></div>",
    ...limited.map((row, idx) => {
      const rank = idx + 1;
      const name = row.name || "Unknown";
      const topic = getTopicLabel(row.topic || row.topicId || "all");
      const score = row.score ?? 0;
      return `<div class="leaderboard-row"><span>${rank}</span><span>${escapeHtml(
        name
      )}</span><span>${escapeHtml(topic)}</span><span>${score}</span></div>`;
    })
  ].join("");

  container.innerHTML = html;
}

function renderTopicLeaderboard(rows, container) {
  if (!Array.isArray(rows) || rows.length === 0) {
    container.innerHTML = "<p class='leaderboard-note'>No topic champions yet.</p>";
    return;
  }

  const html = [
    "<div class='leaderboard-row header'><span>#</span><span>Topic</span><span>Name</span><span>Score</span></div>",
    ...rows.map((row, idx) => {
      const rank = idx + 1;
      const topic = getTopicLabel(row.topic || row.topicId || "all");
      const name = row.name || "Unknown";
      const score = row.score ?? 0;
      return `<div class="leaderboard-row"><span>${rank}</span><span>${escapeHtml(
        topic
      )}</span><span>${escapeHtml(name)}</span><span>${score}</span></div>`;
    })
  ].join("");

  container.innerHTML = html;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function setupLeaderboardTabs() {
  leaderboardTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      leaderboardTabs.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentPeriod = btn.dataset.period || "all";
      loadLeaderboard(currentPeriod);
    });
  });
}

// ---------- Init ----------
populateTopicSelect();
setupLeaderboardTabs();
loadLeaderboard("all");
loadTopicLeaderboard();

startBtn.addEventListener("click", startGameHandler);
restartBtn.addEventListener("click", restartGameHandler);

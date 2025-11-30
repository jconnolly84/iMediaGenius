// iMedia Arcade Revision - Game Logic with Google Sheets logging + live leaderboard + SFX

// === CONFIG: Google Apps Script endpoint (score logger + leaderboard) ===
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbzrw-GfhZm1Lxtm4kUHqUmUV1rzYbBRJ875twjme9SObdLeNu9AwzwerrM70N9YiLTKCg/exec";
const TOPICS = window.TOPICS || {};

// === DOM REFERENCES ===
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
const questionCard = document.getElementById("questionCard");

const gameOverPanel = document.getElementById("gameOverPanel");
const finalScoreEl = document.getElementById("finalScore");
const lastGameTopicEl = document.getElementById("lastGameTopic");
const restartBtn = document.getElementById("restartBtn");

// Leaderboard DOM
const leaderboardTabs = Array.from(document.querySelectorAll(".lb-tab"));
const leaderboardTitle = document.getElementById("leaderboardTitle");
const leaderboardContainer = document.getElementById("leaderboardContainer");
const topicLeaderboardContainer = document.getElementById("topicLeaderboardContainer");

// === SOUND EFFECTS ===
// These expect audio files to exist in the same folder as index.html
// (or update the filenames below to match your assets)
let sfxCorrect, sfxWrong, sfxStart, sfxGameOver;

function initSfx() {
  try {
    sfxCorrect = new Audio("sfx-correct.mp3");
    sfxWrong = new Audio("sfx-wrong.mp3");
    sfxStart = new Audio("sfx-start.mp3");
    sfxGameOver = new Audio("sfx-gameover.mp3");

    [sfxCorrect, sfxWrong, sfxStart, sfxGameOver].forEach(a => {
      if (!a) return;
      a.volume = 0.5;
    });
  } catch (err) {
    console.warn("SFX not initialised (missing files is fine):", err);
  }
}

function playSfx(audioObj) {
  if (!audioObj) return;
  try {
    audioObj.currentTime = 0;
    audioObj.play().catch(() => {});
  } catch {
    // ignore autoplay issues
  }
}

// === GAME STATE ===
let currentQuestions = [];
let currentTopicKey = "all";
let score = 0;
let multiplier = 1;
let lives = 3;
let index = 0;
const MAX_MULTIPLIER = 5;

// === UTILS ===
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

// === GAME FLOW ===
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

  questionCard.classList.remove("flash-correct", "flash-wrong");
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
  questionCard.classList.remove("flash-correct", "flash-wrong");

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
    feedbackEl.textContent = "Correct! +" + 100 * multiplier;
    feedbackEl.className = "feedback correct";
    score += 100 * multiplier;
    multiplier = Math.min(MAX_MULTIPLIER, multiplier + 1);
    playSfx(sfxCorrect);
    questionCard.classList.add("flash-correct");
  } else {
    clickedBtn.classList.add("wrong");
    feedbackEl.textContent = "Wrong! Multiplier reset.";
    feedbackEl.className = "feedback wrong";
    lives -= 1;
    multiplier = 1;
    playSfx(sfxWrong);
    questionCard.classList.add("flash-wrong");
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
  }, 900);
}

function endGame() {
  gameSection.classList.add("hidden");
  gameOverPanel.classList.remove("hidden");

  finalScoreEl.textContent = score.toString();
  lastGameTopicEl.textContent = getTopicLabel(currentTopicKey);

  const name = (playerNameInput.value || "Anonymous").trim();
  submitScore(name, currentTopicKey, score, currentQuestions.length);

  playSfx(sfxGameOver);

  // refresh leaderboard shortly after saving
  setTimeout(loadLeaderboard, 800);
}

// === SCORE LOGGING (fire-and-forget GET) ===
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
    console.log("Submitting score to:", img.src);
  } catch (err) {
    console.error("Error creating score beacon:", err);
  }
}

// === LEADERBOARD LOADING & RENDERING (JSONP) ===

// JSONP callback that Apps Script will call with an array of scores
function renderLeaderboardFromScript(entries) {
  if (!entries || !entries.length) {
    leaderboardContainer.innerHTML =
      "<p class='leaderboard-note'>No scores yet. Play a game to be the first on the board!</p>";
    return;
  }

  const rowsHtml = entries
    .map((e, i) => {
      const place = i + 1;
      const topic = e.topicLabel || e.topicId || "All Topics";
      const name = e.name || "Anonymous";
      return `
        <tr>
          <td>${place}</td>
          <td>${name}</td>
          <td>${e.score}</td>
          <td>${topic}</td>
        </tr>`;
    })
    .join("");

  leaderboardContainer.innerHTML = `
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Score</th>
          <th>Topic</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>`;
}

// JSONP loader – adds a <script> tag pointing at your Apps Script
function loadLeaderboard() {
  leaderboardContainer.innerHTML =
    "<p class='leaderboard-note'>Loading leaderboard...</p>";

  const callbackName = "renderLeaderboardFromScript";
  const script = document.createElement("script");
  script.src =
    GAS_URL +
    "?action=getTopScores&limit=10&callback=" +
    callbackName +
    "&_=" +
    Date.now(); // cache-buster
  document.body.appendChild(script);
}

// === STATIC TEXT + TABS ===
function initLeaderboardsStatic() {
  leaderboardTitle.textContent = "All Time Top Scores";
  // leaderboardContainer is filled by loadLeaderboard()
  topicLeaderboardContainer.innerHTML =
    "<p class='leaderboard-note'>Per-topic champions are visible in the sheet (filter by Topic ID).</p>";
}

function setupLeaderboardTabs() {
  leaderboardTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      leaderboardTabs.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // For now, all tabs show same top-10 list.
      // Later we can pass extra filters (week/today) via query params.
      loadLeaderboard();
    });
  });
}

// === UI WIRING ===
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
  playSfx(sfxStart);
  showQuestion();
}

function restartGameHandler() {
  gameOverPanel.classList.add("hidden");
  gameSection.classList.add("hidden");
}

// === INIT ===
populateTopicSelect();
setupLeaderboardTabs();
initLeaderboardsStatic();
initSfx();
loadLeaderboard();

startBtn.addEventListener("click", startGameHandler);
restartBtn.addEventListener("click", restartGameHandler);

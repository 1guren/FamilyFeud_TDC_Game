const SOUNDS = {
  start: "start.mp3",
  reveal: "reveal.mp3",
  strike: "strike.mp3",
  threeStrikes: "three-strikes.mp3",
  winner: "winner.mp3",
  round1: "round1.mp3",
  round2: "round2.mp3",
};

const audioCache = {};
const activeAudioClones = new Set();

Object.entries(SOUNDS).forEach(([name, file]) => {
  if (!file) return;
  const audio = new Audio(file);
  audio.preload = "auto";
  audioCache[name] = audio;
});

function playSound(name, overlap = false) {
  const audio = audioCache[name];
  if (!audio) return;

  if (overlap) {
    const clone = audio.cloneNode();
    clone.currentTime = 0;
    activeAudioClones.add(clone);
    const cleanup = () => activeAudioClones.delete(clone);
    clone.addEventListener("ended", cleanup, { once: true });
    clone.addEventListener("error", cleanup, { once: true });
    clone.play().catch(cleanup);
    return;
  }

  audio.pause();
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function stopAllSounds() {
  Object.values(audioCache).forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });

  activeAudioClones.forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
  activeAudioClones.clear();
}

/* =====================================================
   GAME DATA - 3 ROUNDS, 3 QUESTIONS EACH
===================================================== */

const rounds = [
  {
    title: "CLASSROOM CHRONICLES",
    questions: [
      {
        q: "Name something a teacher does when the class is being too noisy.",
        a: [
          ["Shush / Be Quiet", 34],
          ["Scold / Get Angry", 13],
          ["Wait / Stare in Silence", 13],
          ["Shout / Raise Voice", 11],
          ["Get Attention", 9],
          ["Bang / Clap / Tap", 7],
        ],
      },
      {
        q: "Name something a teacher usually does before starting a class.",
        a: [
          ["Check Attendance", 35],
          ["Greet Students", 24],
          ["Opening Prayer", 22],
          ["Prepare Materials", 8],
          ["Icebreaker / Energizer", 3],
          ["Review Last Lesson", 3],
        ],
      },
      {
        q: "Name something that can make a classroom suddenly become quiet.",
        a: [
          ["Teacher Gets Angry", 27],
          ["Recitation", 16],
          ["Quiz / Exam", 13],
          ["Teacher Enters", 13],
          ["Teacher Goes Silent", 10],
          ["Activity / Discussion", 9],
        ],
      },
    ],
  },
  {
    title: "TEACHER THINGS",
    questions: [
      {
        q: "Name something you will almost always find inside a teacher's bag.",
        a: [
          ["Laptop / Tablet", 30],
          ["Pens", 24],
          ["Whiteboard Markers", 17],
          ["Cellphone", 8],
          ["Papers", 8],
          ["Lesson Plans", 4],
        ],
      },
      {
        q: "Name something teachers do during their free period.",
        a: [
          ["Eat / Snack", 34],
          ["Rest / Sleep", 15],
          ["Chat / Gossip", 12],
          ["Use Phone", 11],
          ["Check Papers", 10],
          ["Lesson Planning", 8],
        ],
      },
      {
        q: "Name something teachers commonly bring to school.",
        a: [
          ["Laptop / Tablet", 41],
          ["Bag", 14],
          ["Tumbler", 8],
          ["Phone", 7],
          ["Markers / Pens", 7],
          ["Lesson Materials", 6],
        ],
      },
    ],
  },
  {
    title: "FINAL ROUND",
    questions: [
      {
        q: "Name something teachers hear from students almost every semester.",
        a: [
          ["Grades", 12],
          ["Deadline Extension", 11],
          ["Quizzes", 9],
          ["Exams", 9],
          ["Greetings", 8],
          ["Ang Hirap", 7],
        ],
      },
      {
        q: "Name something students suddenly become interested in when class is almost over.",
        a: [
          ["Going Home / Uwian", 18],
          ["The Time / Clock", 16],
          ["Early Dismissal", 10],
          ["Food", 9],
          ["Break Time", 7],
          ["Packing Bags", 4],
        ],
      },
      {
        q: "Name something that can make students suddenly become very quiet.",
        a: [
          ["Recitation", 21],
          ["Surprise Quiz", 14],
          ["Angry Teacher", 14],
          ["Exam Announcement", 10],
          ["Serious Teacher", 6],
          ["Teacher's Question", 5],
        ],
      },
    ],
  },
];

/* =====================================================
   STATE
===================================================== */

let currentRound = 0;
let currentQuestion = 0;
let teamOneScore = 0;
let teamTwoScore = 0;
let teamOneName = "TEAM 1";
let teamTwoName = "TEAM 2";
let screen = "intro"; // intro | game | result

// faceoff: waiting for the first team to buzz
// normal: Team A (face-off winner) builds the Question Bank with up to 3 strikes
// steal: Team B gets exactly ONE answer to steal the ENTIRE Question Bank
// ended: bank has been awarded; hidden answers can be revealed without adding points
let phase = "faceoff";
let controllingTeam = null; // Team A: winner of the face-off
let activeTeam = null; // team currently answering
let strikes = 0;
let questionBank = 0;
let bankOwner = null; // provisional owner while the question is still active
let questionWinner = null; // team that actually received the bank when the question ended
let wrongStateGuardUntil = 0; // rapid extra X presses still animate/sound but cannot spill into a new phase

let messageTimer;
const history = [];

/* =====================================================
   ELEMENTS
===================================================== */

const $ = (id) => document.getElementById(id);

const introScreen = $("intro-screen");
const gameScreen = $("game-screen");
const resultScreen = $("result-screen");
const questionElement = $("question");
const answersContainer = $("answers-container");
const strikeOverlay = $("strike-overlay");
const messageOverlay = $("message-overlay");
const hostPanel = $("host-panel");
const strikeBoxes = document.querySelectorAll(".strike");
const nextBtn = $("next-btn");
const nextLabel = $("next-label");
const revealRemainingBtn = $("reveal-remaining-btn");
const teamOneInput = $("team-one-input");
const teamTwoInput = $("team-two-input");
const teamCards = document.querySelectorAll(".team-card");
const controlStatus = $("control-status");
const questionBankElement = $("question-bank");
const strikeSection = document.querySelector(".strike-section");

/* =====================================================
   HELPERS
===================================================== */

function getTeamName(team) {
  return team === 1 ? teamOneName : teamTwoName;
}

function otherTeam(team) {
  return team === 1 ? 2 : 1;
}

function getAnswerCards() {
  return [...answersContainer.querySelectorAll(".answer-card")];
}

function hiddenAnswerCount() {
  return getAnswerCards().filter((card) => !card.classList.contains("revealed")).length;
}

function showScreen(name) {
  stopAllSounds();
  screen = name;
  introScreen.classList.toggle("hidden", name !== "intro");
  gameScreen.classList.toggle("hidden", name !== "game");
  resultScreen.classList.toggle("hidden", name !== "result");
}

function showMessage(title, subtitle = "", duration = 1600) {
  clearTimeout(messageTimer);
  messageOverlay.innerHTML = `<h2>${title}</h2><p>${subtitle}</p>`;
  messageOverlay.classList.remove("show");
  void messageOverlay.offsetWidth;
  messageOverlay.classList.add("show");
  messageTimer = setTimeout(() => messageOverlay.classList.remove("show"), duration);
}

function showBigX(count = 1) {
  const flash = document.createElement("div");
  const displayCount = Math.max(1, Math.min(count, 3));
  flash.className = `strike-flash n${displayCount}`;
  flash.innerHTML = '<span class="big-x">X</span>'.repeat(displayCount);
  strikeOverlay.appendChild(flash);
  flash.addEventListener("animationend", () => flash.remove(), { once: true });
  setTimeout(() => flash.remove(), 1500);
}

function flashTeam(team) {
  const card = teamCards[team - 1];
  if (!card) return;
  card.classList.remove("flash");
  void card.offsetWidth;
  card.classList.add("flash");
  setTimeout(() => card.classList.remove("flash"), 700);
}

/* =====================================================
   GAME START / QUESTION LOAD
===================================================== */

function startGame() {
  if (screen !== "intro") return;

  teamOneName = teamOneInput.value.trim() || "TEAM 1";
  teamTwoName = teamTwoInput.value.trim() || "TEAM 2";
  $("team-one-name").textContent = teamOneName;
  $("team-two-name").textContent = teamTwoName;

  history.length = 0;
  currentRound = 0;
  currentQuestion = 0;
  teamOneScore = 0;
  teamTwoScore = 0;

  showScreen("game");
  playSound("start");
  loadQuestion(true);
}

function loadQuestion(showBanner = false) {
  const round = rounds[currentRound];
  const item = round.questions[currentQuestion];

  $("round-number").textContent = currentRound + 1;
  $("round-title").textContent = round.title;
  $("question-number").textContent = currentQuestion + 1;
  $("question-total").textContent = round.questions.length;

  questionElement.textContent = item.q;
  phase = "faceoff";
  controllingTeam = null;
  activeTeam = null;
  strikes = 0;
  questionBank = 0;
  bankOwner = null;
  questionWinner = null;
  wrongStateGuardUntil = 0;

  createAnswers(item.a);
  renderGameState();

  if (showBanner) {
    showMessage(`ROUND ${currentRound + 1}`, round.title, 2200);
    if (currentRound < 2) playSound(`round${currentRound + 1}`);
  }
}

function createAnswers(answers) {
  answersContainer.innerHTML = "";
  answersContainer.style.gridTemplateRows = `repeat(${Math.ceil(answers.length / 2)}, 1fr)`;

  answers.forEach(([text, points], index) => {
    const card = document.createElement("div");
    card.className = "answer-card";
    card.dataset.points = String(points);
    card.dataset.owner = "";
    card.innerHTML = `
      <span class="answer-number">${index + 1}</span>
      <span class="answer-text">${text}</span>
      <span class="answer-points">${points}</span>`;
    card.addEventListener("click", () => revealScoredAnswer(card));
    answersContainer.appendChild(card);
  });
}

/* =====================================================
   BUZZER / CONTROL / SCORING
===================================================== */

function selectBuzzTeam(team) {
  if (screen !== "game" || phase !== "faceoff") return;

  saveState();
  controllingTeam = team;
  activeTeam = team;
  bankOwner = team;
  wrongStateGuardUntil = 0;
  phase = "normal";
  strikes = 0;
  showMessage(`${getTeamName(team)} BUZZED FIRST!`, "NORMAL PHASE · BUILD THE QUESTION BANK", 1300);
  flashTeam(team);
  renderGameState();
}

function revealScoredAnswer(card) {
  if (screen !== "game" || card.classList.contains("revealed")) return;

  if (phase === "faceoff") {
    showMessage("FACE-OFF FIRST", "SELECT THE TEAM THAT BUZZED FIRST", 1200);
    return;
  }

  if (phase === "ended") return;

  saveState();

  const points = Number(card.dataset.points) || 0;
  const answeringTeam = activeTeam;
  card.classList.add("revealed");
  card.classList.remove("unclaimed");
  card.dataset.owner = String(answeringTeam);

  // Correct answers build the temporary Question Bank. Permanent team totals
  // change only when the bank is awarded at the end of the question.
  questionBank += points;

  if (phase === "normal") {
    bankOwner = controllingTeam;
  } else if (phase === "steal") {
    bankOwner = answeringTeam;
  }

  playSound("reveal");
  flashTeam(answeringTeam);

  // Team B has exactly ONE steal answer. If it is correct, its answer value is
  // added to the Question Bank, Team B wins the ENTIRE bank, and the question ends.
  if (phase === "steal") {
    awardQuestionBank(answeringTeam, `${getTeamName(answeringTeam)} STOLE THE BANK!`);
    return;
  }

  if (hiddenAnswerCount() === 0) {
    awardQuestionBank(controllingTeam, "ALL ANSWERS REVEALED");
  } else {
    renderGameState();
  }
}

/* =====================================================
   WRONG ANSWERS / STRIKES / STEALS
===================================================== */

function addWrongAnswer() {
  if (screen !== "game") return;

  // Every press ALWAYS produces a fresh X animation and overlapping buzzer sound.
  // Game-state changes are capped by the current phase rules.
  const visualCount = phase === "normal" ? Math.min(strikes + 1, 3) : 1;
  showBigX(visualCount);
  playSound("strike", true);

  if (phase === "faceoff") {
    showMessage("WRONG ANSWER", "WAITING FOR BUZZER", 850);
    return;
  }

  // Once the question is over, extra X presses remain harmless but still animate/sound.
  if (phase === "ended") return;

  // A fast burst of X presses must not let an accidental 4th click become the
  // stealing team's one steal miss. Visual/audio feedback still happens above every time.
  if (Date.now() < wrongStateGuardUntil) return;

  saveState();

  if (phase === "normal") {
    strikes = Math.min(strikes + 1, 3);

    if (strikes >= 3) {
      const stealingTeam = otherTeam(controllingTeam);
      phase = "steal";
      activeTeam = stealingTeam;
      strikes = 0;
          wrongStateGuardUntil = Date.now() + 650;
      showMessage(
        "THREE STRIKES!",
        `${getTeamName(stealingTeam)} STEAL · 1 STRIKE`,
        1600,
      );
      playSound("threeStrikes", true);
    }

    renderGameState();
    return;
  }

  if (phase === "steal") {
    strikes = 1;

    // Team B gets exactly ONE steal answer. A miss means Team A wins the
    // existing Question Bank immediately, even if hidden answers remain.
    awardQuestionBank(
      controllingTeam,
      `${getTeamName(activeTeam)} FAILED THE STEAL · ${getTeamName(controllingTeam)} WINS THE BANK`,
    );
  }
}

function awardQuestionBank(team, reason = "QUESTION COMPLETE") {
  if (phase === "ended" || !team) return;

  questionWinner = team;
  bankOwner = team;
  wrongStateGuardUntil = 0;
  if (team === 1) teamOneScore += questionBank;
  else teamTwoScore += questionBank;

  phase = "ended";
  activeTeam = null;
  strikes = 0;

  const hidden = hiddenAnswerCount();
  const bankText = `${getTeamName(team)} WINS ${questionBank} POINT${questionBank === 1 ? "" : "S"}`;
  const subtitle = hidden > 0
    ? `${bankText} · REVEAL REMAINING ANSWERS OR CONTINUE`
    : `${bankText} · READY FOR THE NEXT QUESTION`;

  flashTeam(team);
  showMessage(reason, subtitle, 1750);
  renderGameState();
}

function revealRemainingAnswers() {
  if (screen !== "game" || phase !== "ended" || hiddenAnswerCount() === 0) return;

  saveState();
  getAnswerCards().forEach((card) => {
    if (card.classList.contains("revealed")) return;
    card.classList.add("revealed", "unclaimed");
    card.dataset.owner = "none";
  });

  // One reveal cue for the batch; no points are awarded.
  playSound("reveal");
  showMessage("REMAINING ANSWERS", "REVEALED · NO POINTS AWARDED", 1200);
  renderGameState();
}

/* =====================================================
   UI STATE
===================================================== */

function updateScoreboard() {
  $("team-one-score").textContent = teamOneScore;
  $("team-two-score").textContent = teamTwoScore;

  const ownerLabel = bankOwner ? ` · ${getTeamName(bankOwner)} ${phase === "ended" ? "WON" : "CONTROLS"}` : "";
  questionBankElement.innerHTML = `<span>QUESTION BANK</span><strong>${questionBank}</strong><small>${ownerLabel}</small>`;
  questionBankElement.classList.toggle("awarded", phase === "ended" && questionWinner !== null);
}

function renderStrikeIndicators() {
  const isSingleStrikePhase = phase === "steal";
  strikeSection.classList.toggle("single-strike", isSingleStrikePhase);
  strikeSection.classList.toggle("inactive", phase === "faceoff" || phase === "ended");

  strikeBoxes.forEach((box, index) => {
    box.classList.toggle("active", index < strikes);
  });
}

function updateControlIndicator() {
  if (phase === "faceoff") {
    controlStatus.innerHTML = `<strong>FACE-OFF</strong><span>WAITING FOR BUZZER · CLICK A TEAM SCORECARD OR USE A / L</span>`;
  } else if (phase === "normal") {
    const remaining = Math.max(0, 3 - strikes);
    controlStatus.innerHTML = `<strong>${getTeamName(activeTeam)} IN CONTROL</strong><span>NORMAL (3 STRIKES) · USED ${strikes}/3 · ${remaining} REMAINING · BUILDING THE BANK</span>`;
  } else if (phase === "steal") {
    const remaining = Math.max(0, 1 - strikes);
    controlStatus.innerHTML = `<strong>${getTeamName(activeTeam)} STEAL ATTEMPT</strong><span>STEAL (1 ANSWER) · USED ${strikes}/1 · ${remaining} REMAINING · ONE CORRECT ANSWER WINS THE ${questionBank}-POINT BANK</span>`;
  } else {
    const hidden = hiddenAnswerCount();
    const winnerText = questionWinner ? `${getTeamName(questionWinner)} WON ${questionBank} POINT${questionBank === 1 ? "" : "S"}` : "BANK NOT AWARDED";
    controlStatus.innerHTML = `<strong>QUESTION ENDED</strong><span>${winnerText}${hidden ? ` · ${hidden} ANSWER${hidden === 1 ? "" : "S"} STILL HIDDEN` : " · ALL ANSWERS SHOWN"}</span>`;
  }

  teamCards.forEach((card, index) => {
    const team = index + 1;
    card.classList.toggle("control", activeTeam === team && phase !== "ended");
    card.classList.toggle("buzz-ready", phase === "faceoff");
  });
}

function updateButtons() {
  const round = rounds[currentRound];
  const lastQuestion = currentQuestion >= round.questions.length - 1;
  const lastRound = currentRound >= rounds.length - 1;
  const isFinalQuestion = lastQuestion && lastRound;

  nextBtn.classList.toggle("last", isFinalQuestion);
  nextBtn.classList.toggle("locked", phase !== "ended");
  nextBtn.setAttribute("aria-disabled", phase !== "ended" ? "true" : "false");

  nextLabel.textContent = isFinalQuestion
    ? "SHOW FINAL RESULT"
    : lastQuestion
      ? "NEXT ROUND"
      : "NEXT QUESTION";

  const canRevealRemaining = phase === "ended" && hiddenAnswerCount() > 0;
  revealRemainingBtn.classList.toggle("hidden", !canRevealRemaining);
  $("reveal-remaining-host-btn").disabled = !canRevealRemaining;

  $("team-one-btn").disabled = phase !== "faceoff";
  $("team-two-btn").disabled = phase !== "faceoff";
}

function renderGameState() {
  updateScoreboard();
  renderStrikeIndicators();
  updateControlIndicator();
  updateButtons();
}

/* =====================================================
   QUESTION / ROUND NAVIGATION
===================================================== */

function advanceGame() {
  if (screen !== "game") return;

  if (phase !== "ended") {
    showMessage("QUESTION IN PROGRESS", "FINISH THE QUESTION BEFORE CONTINUING", 1100);
    return;
  }

  saveState();
  const round = rounds[currentRound];

  if (currentQuestion < round.questions.length - 1) {
    currentQuestion++;
    loadQuestion(false);
  } else if (currentRound < rounds.length - 1) {
    currentRound++;
    currentQuestion = 0;
    loadQuestion(true);
  } else {
    showResult();
  }
}

function showResult() {
  $("final-one").textContent = teamOneScore;
  $("final-two").textContent = teamTwoScore;
  $("final-one-name").textContent = teamOneName;
  $("final-two-name").textContent = teamTwoName;

  const tied = teamOneScore === teamTwoScore;
  const winner = tied ? "IT'S A TIE!" : teamOneScore > teamTwoScore ? teamOneName : teamTwoName;

  $("result-label").textContent = tied ? "FINAL RESULT" : "THE WINNER IS";
  const el = $("winner-name");
  el.textContent = winner.toUpperCase();
  el.style.fontSize = `min(20vh, ${(88 / (Math.max(winner.length, 5) * 0.8)).toFixed(1)}vw)`;

  showScreen("result");
  playSound("winner");
}

/* =====================================================
   UNDO
===================================================== */

function saveState() {
  if (screen !== "game") return;

  history.push({
    round: currentRound,
    question: currentQuestion,
    one: teamOneScore,
    two: teamTwoScore,
    phase,
    controllingTeam,
    activeTeam,
    strikes,
    questionBank,
    bankOwner,
    questionWinner,
    answers: getAnswerCards().map((card) => ({
      revealed: card.classList.contains("revealed"),
      unclaimed: card.classList.contains("unclaimed"),
      owner: card.dataset.owner || "",
    })),
  });

  if (history.length > 300) history.shift();
}

function undo() {
  const state = history.pop();
  if (!state) return;

  clearTimeout(messageTimer);
  messageOverlay.classList.remove("show");
  strikeOverlay.innerHTML = "";

  showScreen("game");
  currentRound = state.round;
  currentQuestion = state.question;
  teamOneScore = state.one;
  teamTwoScore = state.two;

  loadQuestion(false);

  phase = state.phase;
  controllingTeam = state.controllingTeam;
  activeTeam = state.activeTeam;
  strikes = state.strikes;
  questionBank = state.questionBank;
  bankOwner = state.bankOwner;
  questionWinner = state.questionWinner;
  wrongStateGuardUntil = 0;

  state.answers.forEach((answerState, index) => {
    const card = answersContainer.children[index];
    if (!card || !answerState.revealed) return;
    card.style.animation = "none";
    card.classList.add("revealed");
    if (answerState.unclaimed) card.classList.add("unclaimed");
    card.dataset.owner = answerState.owner;
  });

  renderGameState();
}

/* =====================================================
   CONTROLS

   Answer cards / 1-6 = reveal a correct answer; during Normal it grows the bank, during Steal it wins the bank
   A = Team 1 buzz | L = Team 2 buzz
   X = wrong answer (unlimited; sound/animation always replay)
   V = reveal remaining unclaimed answers after question ends
   U = undo | N = next question / round / final result | H = show/hide host controls
   F = fullscreen | R = restart from result screen
===================================================== */

$("start-game-btn").addEventListener("click", startGame);
$("strike-btn").addEventListener("click", addWrongAnswer);
$("team-one-btn").addEventListener("click", () => selectBuzzTeam(1));
$("team-two-btn").addEventListener("click", () => selectBuzzTeam(2));
$("reveal-remaining-host-btn").addEventListener("click", revealRemainingAnswers);
$("undo-btn").addEventListener("click", undo);
$("next-question-host-btn").addEventListener("click", advanceGame);
revealRemainingBtn.addEventListener("click", revealRemainingAnswers);

teamCards[0].addEventListener("click", () => selectBuzzTeam(1));
teamCards[1].addEventListener("click", () => selectBuzzTeam(2));

nextBtn.addEventListener("click", () => {
  advanceGame();
  nextBtn.blur();
});

document.addEventListener("keydown", (event) => {
  if (event.target.tagName === "INPUT") {
    if (event.key === "Enter") startGame();
    return;
  }

  const key = event.key.toLowerCase();

  if (key === "f") {
    document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen().catch(() => {});
    return;
  }

  if (key === "u" && screen !== "intro") undo();
  else if (screen === "intro" && (key === "enter" || key === " ")) startGame();
  else if (screen === "result" && key === "r") showScreen("intro");
  else if (screen === "game") {
    if (key === "x") addWrongAnswer();
    else if (key === "a") selectBuzzTeam(1);
    else if (key === "l") selectBuzzTeam(2);
    else if (key === "v") revealRemainingAnswers();
    else if (key === "n") advanceGame();
    else if (key === "h") hostPanel.classList.toggle("show");
    else if (/^[1-6]$/.test(key)) answersContainer.children[Number(key) - 1]?.click();
  }
});

/* =====================================================
   STAGE BULBS (intro screen border lights)
===================================================== */

function buildBulbs() {
  const box = $("bulbs");
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pad = 18;
  const step = 42;
  const points = [];

  for (let x = pad; x <= w - pad; x += step) {
    points.push([x, pad], [x, h - pad]);
  }
  for (let y = pad + step; y <= h - pad - step; y += step) {
    points.push([pad, y], [w - pad, y]);
  }

  box.innerHTML = "";
  points.forEach(([x, y]) => {
    const bulb = document.createElement("span");
    bulb.className = "bulb" + (Math.round((x + y) / step) % 2 ? " odd" : "");
    bulb.style.left = `${x}px`;
    bulb.style.top = `${y}px`;
    box.appendChild(bulb);
  });
}

buildBulbs();
window.addEventListener("resize", buildBulbs);

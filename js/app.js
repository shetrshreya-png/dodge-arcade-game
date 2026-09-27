const startButton = document.querySelector('#start-button');
const startScreen = document.querySelector('.start-screen');
const gameScreen = document.querySelector('#game-screen');
const playfield = document.querySelector('#playfield');
const gamePlayer = document.querySelector('#game-player');
const obstacleField = document.querySelector('#game-obstacles');
const collisionMessage = document.querySelector('#collision-message');
const gameTimer = document.querySelector('#game-timer');
const finalWarning = document.querySelector('#final-warning');
const gameScore = document.querySelector('#game-score');
const gameBest = document.querySelector('#game-best');
const gameOver = document.querySelector('#game-over');
const finalScore = document.querySelector('#final-score');
const finalBestScore = document.querySelector('#final-best-score');
const newBestMessage = document.querySelector('#new-best');
const bestMatchMessage = document.querySelector('#best-match');
const soCloseMessage = document.querySelector('#so-close');
const playAgainButton = document.querySelector('#play-again-button');
const nicknameForm = document.querySelector('#nickname-form');
const nicknameInput = document.querySelector('#nickname-input');
const nicknameStatus = document.querySelector('#nickname-status');
const leaderboardOpenButton = document.querySelector('#leaderboard-open-button');
const leaderboardOverlay = document.querySelector('#leaderboard-overlay');
const leaderboardCloseButton = document.querySelector('#leaderboard-close-button');
const leaderboardStatus = document.querySelector('#leaderboard-status');
const leaderboardRows = document.querySelector('#leaderboard-rows');
const bestScoreStorageKey = 'dodgePersonalBest';
const baseSpawnInterval = 650;
const minimumSpawnInterval = 400;
const maximumSpeedIncrease = 0.55;

let personalBest = Math.max(0, Number.parseInt(window.localStorage.getItem(bestScoreStorageKey), 10) || 0);
gameBest.textContent = `BEST: ${personalBest}`;
let roundPersonalBest = personalBest;
let playerNickname = '';

let playerPosition = 50;
let activePointerId = null;
let pointerOffsetX = 0;
let pendingPointerX = null;
let pointerAnimationFrame = null;
let obstacles = [];
let obstacleAnimationFrame = null;
let timerInterval = null;
let remainingTime = 30;
let roundStartTime = 0;
let score = 0;
let lastObstacleFrame = 0;
let obstacleSpawnTime = 0;
let waveSpawnTime = 0;
let scoreSubmitted = false;
const pendingNicknameSubmissions = new Set();
let nicknameCheckInProgress = false;

nicknameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    nicknameInput.setCustomValidity('Enter a nickname.');
    nicknameStatus.textContent = 'NICKNAME REQUIRED';
    nicknameStatus.hidden = false;
    nicknameInput.reportValidity();
    return;
  }

  nicknameInput.setCustomValidity('');
  if (nicknameCheckInProgress) return;
  nicknameCheckInProgress = true;
  startButton.disabled = true;
  nicknameInput.readOnly = true;
  nicknameStatus.textContent = 'CHECKING NICKNAME...';
  nicknameStatus.hidden = false;

  try {
    if (await nicknameExistsInLeaderboard(nickname)) {
      nicknameStatus.textContent = 'Nickname already taken. Please choose a different one.';
      return;
    }

    nicknameStatus.hidden = true;
    playerNickname = nickname;
    startButton.classList.add('is-pressed');
    window.setTimeout(() => startButton.classList.remove('is-pressed'), 180);
    startScreen.hidden = true;
    gameScreen.hidden = false;
    startNewRound();
  } catch (error) {
    console.error('Failed to verify leaderboard nickname:', error);
    nicknameStatus.textContent = 'Unable to verify nickname. Please try again.';
    nicknameStatus.hidden = false;
  } finally {
    nicknameCheckInProgress = false;
    startButton.disabled = false;
    nicknameInput.readOnly = false;
  }
});

playAgainButton.addEventListener('click', startNewRound);

leaderboardOpenButton.addEventListener('click', () => {
  leaderboardOverlay.hidden = false;
  leaderboardCloseButton.focus();
  loadLeaderboard();
});

leaderboardCloseButton.addEventListener('click', closeLeaderboard);

leaderboardOverlay.addEventListener('click', (event) => {
  if (event.target === leaderboardOverlay) closeLeaderboard();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !leaderboardOverlay.hidden) closeLeaderboard();
});

nicknameInput.addEventListener('input', () => {
  nicknameInput.setCustomValidity('');
  nicknameStatus.hidden = true;
});

function startNewRound() {
  stopRoundLoops();
  scoreSubmitted = false;
  obstacles.forEach((obstacle) => obstacle.element.remove());
  obstacles = [];
  playerPosition = 50;
  gamePlayer.style.left = `${playerPosition}%`;
  collisionMessage.hidden = true;
  finalWarning.hidden = true;
  gameOver.hidden = true;
  playfield.focus();
  startRoundTimer();
  startObstacleLoop();
}

function startRoundTimer() {
  if (timerInterval !== null) window.clearInterval(timerInterval);
  roundStartTime = performance.now();
  roundPersonalBest = personalBest;
  score = 0;
  gameScore.textContent = 'SCORE 0000  COMBO x1';
  remainingTime = 30;
  gameTimer.textContent = remainingTime;
  timerInterval = window.setInterval(() => {
    remainingTime -= 1;
    gameTimer.textContent = remainingTime;
    finalWarning.hidden = remainingTime > 10 || remainingTime === 0;
    if (remainingTime === 0) {
      updateScore(roundStartTime + 30000);
      stopGameplay(false);
    }
  }, 1000);
}

function spawnObstacle(xPosition = null, movesHorizontally = null) {
  const obstacle = document.createElement('div');
  const size = Math.max(18, Math.min(34, playfield.clientWidth * 0.045));
  const difficulty = getDifficultyProgress(performance.now());
  const x = xPosition ?? Math.random() * (playfield.clientWidth - size);
  const shouldMoveHorizontally = movesHorizontally ?? Math.random() < 0.25;
  obstacle.className = 'game-obstacle';
  obstacle.style.left = `${x}px`;
  obstacle.style.width = `${size}px`;
  obstacle.style.top = `${-size}px`;
  obstacleField.appendChild(obstacle);
  obstacles.push({
    element: obstacle,
    x,
    size,
    movesHorizontally: shouldMoveHorizontally,
    horizontalDirection: Math.random() < 0.5 ? -1 : 1,
    horizontalSpeed: playfield.clientWidth * 0.14,
    y: -size,
    speed: playfield.clientHeight * (0.22 + Math.random() * 0.2) * (1 + maximumSpeedIncrease * difficulty)
  });
}

function spawnObstacleWave() {
  const obstacleCount = 2 + Math.floor(Math.random() * 3);
  const obstacleSize = Math.max(18, Math.min(34, playfield.clientWidth * 0.045));
  const clearLaneWidth = Math.max(72, playfield.clientWidth * 0.32);
  const waveWidth = Math.max(obstacleSize, playfield.clientWidth - clearLaneWidth);
  const waveStart = Math.random() < 0.5 ? 0 : playfield.clientWidth - waveWidth;
  const obstacleSpacing = (waveWidth - obstacleSize) / (obstacleCount - 1);

  for (let index = 0; index < obstacleCount; index += 1) {
    spawnObstacle(waveStart + obstacleSpacing * index, false);
  }
}

function getDifficultyProgress(timestamp) {
  return Math.min(1, Math.max(0, (timestamp - roundStartTime) / 30000));
}

function getSpawnInterval(timestamp) {
  const difficulty = getDifficultyProgress(timestamp);
  return baseSpawnInterval - (baseSpawnInterval - minimumSpawnInterval) * difficulty;
}

function getWaveSpawnInterval(timestamp) {
  return 10000 - 3000 * getDifficultyProgress(timestamp);
}

function updateObstacles(timestamp) {
  const elapsed = timestamp - lastObstacleFrame;
  lastObstacleFrame = timestamp;
  updateScore(timestamp);

  if (timestamp - obstacleSpawnTime >= getSpawnInterval(timestamp)) {
    spawnObstacle();
    obstacleSpawnTime = timestamp;
  }
  if (timestamp - waveSpawnTime >= getWaveSpawnInterval(timestamp)) {
    spawnObstacleWave();
    waveSpawnTime = timestamp;
  }

  obstacles = obstacles.filter((obstacle) => {
    obstacle.y += obstacle.speed * elapsed / 1000;
    obstacle.element.style.top = `${obstacle.y}px`;
    if (obstacle.movesHorizontally) {
      const maximumX = playfield.clientWidth - obstacle.size;
      obstacle.x += obstacle.horizontalDirection * obstacle.horizontalSpeed * elapsed / 1000;
      if (obstacle.x <= 0 || obstacle.x >= maximumX) {
        obstacle.x = Math.max(0, Math.min(maximumX, obstacle.x));
        obstacle.horizontalDirection *= -1;
      }
      obstacle.element.style.left = `${obstacle.x}px`;
    }
    if (hasCollision(obstacle.element)) {
      stopGameplay();
      return true;
    }
    if (obstacle.y > playfield.clientHeight) {
      obstacle.element.remove();
      return false;
    }
    return true;
  });

  if (obstacleAnimationFrame === null) return;
  obstacleAnimationFrame = window.requestAnimationFrame(updateObstacles);
}

function updateScore(timestamp) {
  const elapsed = Math.min(30000, Math.max(0, timestamp - roundStartTime));
  const firstTier = Math.min(elapsed, 7000);
  const secondTier = Math.max(0, Math.min(elapsed, 15000) - 7000);
  const thirdTier = Math.max(0, Math.min(elapsed, 23000) - 15000);
  const fourthTier = Math.max(0, elapsed - 23000);
  const multiplier = elapsed >= 23000 ? 4 : elapsed >= 15000 ? 3 : elapsed >= 7000 ? 2 : 1;

  score = Math.floor((firstTier + secondTier * 2 + thirdTier * 3 + fourthTier * 4) / 100);
  gameScore.textContent = `SCORE ${String(score).padStart(4, '0')}  COMBO x${multiplier}`;
  updatePersonalBest();
}

function updatePersonalBest(currentScore = score) {
  if (currentScore <= personalBest) return;
  personalBest = currentScore;
  window.localStorage.setItem(bestScoreStorageKey, String(personalBest));
  gameBest.textContent = `BEST: ${personalBest}`;
}

function hasCollision(obstacleElement) {
  const playerRect = gamePlayer.getBoundingClientRect();
  const obstacleRect = obstacleElement.getBoundingClientRect();
  const playerPolygons = getPlayerCollisionPolygons(playerRect);
  const obstaclePolygon = getObstacleCollisionPolygon(obstacleRect);
  const playerBounds = getPolygonBounds(playerPolygons.flat());
  const obstacleBounds = getPolygonBounds(obstaclePolygon);
  const hasHorizontalOverlap = playerBounds.left < obstacleBounds.right
    && playerBounds.right > obstacleBounds.left;
  const hasVerticalOverlap = playerBounds.top < obstacleBounds.bottom
    && playerBounds.bottom > obstacleBounds.top;

  return hasHorizontalOverlap
    && hasVerticalOverlap
    && playerPolygons.some((playerPolygon) => polygonsOverlap(playerPolygon, obstaclePolygon));
}

function getPlayerCollisionPolygons(playerRect) {
  const coreLeft = playerRect.left + 15;
  const coreTop = playerRect.top + 8;
  const coreWidth = 24;
  const coreHeight = 54;
  const wingSize = 23;
  const wingTop = playerRect.top + 36;
  const leftWingLeft = playerRect.left;
  const rightWingLeft = playerRect.right - wingSize;
  const core = [
    { x: coreLeft + coreWidth / 2, y: coreTop },
    { x: coreLeft + coreWidth, y: coreTop + coreHeight * .24 },
    { x: coreLeft + coreWidth * .82, y: coreTop + coreHeight },
    { x: coreLeft + coreWidth * .18, y: coreTop + coreHeight },
    { x: coreLeft, y: coreTop + coreHeight * .24 }
  ];

  return [core, getRotatedSquare(leftWingLeft, wingTop, wingSize), getRotatedSquare(rightWingLeft, wingTop, wingSize)];
}

function getRotatedSquare(left, top, size) {
  const centerX = left + size / 2;
  const centerY = top + size / 2;
  const halfDiagonal = size / Math.sqrt(2);
  return [
    { x: centerX, y: centerY - halfDiagonal },
    { x: centerX + halfDiagonal, y: centerY },
    { x: centerX, y: centerY + halfDiagonal },
    { x: centerX - halfDiagonal, y: centerY }
  ];
}

function getObstacleCollisionPolygon(rect) {
  return [
    { x: rect.left + rect.width / 2, y: rect.top },
    { x: rect.right, y: rect.top + rect.height / 2 },
    { x: rect.left + rect.width / 2, y: rect.bottom },
    { x: rect.left, y: rect.top + rect.height / 2 }
  ];
}

function getPolygonBounds(polygon) {
  const xValues = polygon.map((point) => point.x);
  const yValues = polygon.map((point) => point.y);
  return {
    left: Math.min(...xValues),
    right: Math.max(...xValues),
    top: Math.min(...yValues),
    bottom: Math.max(...yValues)
  };
}

function polygonsOverlap(firstPolygon, secondPolygon) {
  const polygons = [firstPolygon, secondPolygon];
  const axes = polygons.flatMap((polygon) => polygon.map((point, index) => {
    const nextPoint = polygon[(index + 1) % polygon.length];
    return { x: nextPoint.y - point.y, y: point.x - nextPoint.x };
  }));

  return axes.every((axis) => {
    const firstProjection = projectPolygon(firstPolygon, axis);
    const secondProjection = projectPolygon(secondPolygon, axis);
    return firstProjection.max >= secondProjection.min
      && secondProjection.max >= firstProjection.min;
  });
}

function projectPolygon(polygon, axis) {
  const values = polygon.map((point) => point.x * axis.x + point.y * axis.y);
  return { min: Math.min(...values), max: Math.max(...values) };
}

function stopRoundLoops() {
  if (obstacleAnimationFrame !== null) {
    window.cancelAnimationFrame(obstacleAnimationFrame);
    obstacleAnimationFrame = null;
  }
  if (timerInterval !== null) {
    window.clearInterval(timerInterval);
    timerInterval = null;
  }
}

function stopGameplay(showCollision = true) {
  const finalRoundScore = score;
  if (scoreSubmitted) return;
  scoreSubmitted = true;
  stopRoundLoops();
  if (showCollision) collisionMessage.hidden = false;
  const previousPersonalBest = roundPersonalBest;
  updatePersonalBest(finalRoundScore);
  finalScore.textContent = String(finalRoundScore).padStart(4, '0');
  finalBestScore.textContent = String(personalBest);
  newBestMessage.hidden = finalRoundScore <= previousPersonalBest;
  bestMatchMessage.hidden = finalRoundScore !== previousPersonalBest;
  soCloseMessage.hidden = previousPersonalBest === 0
    || finalRoundScore >= previousPersonalBest
    || finalRoundScore < previousPersonalBest * 0.9;
  gameOver.hidden = false;
  submitFinalScore(finalRoundScore);
}

async function submitFinalScore(finalRoundScore) {
  const nicknameKey = playerNickname.toLowerCase();
  if (pendingNicknameSubmissions.has(nicknameKey)) return;
  pendingNicknameSubmissions.add(nicknameKey);

  try {
    if (await nicknameExistsInLeaderboard(playerNickname)) {
      console.log('Leaderboard entry already exists for nickname:', playerNickname);
      return;
    }

    const { error } = await window.supabaseClient
      .from('leaderboard')
      .insert({ player_name: playerNickname, score: finalRoundScore });

    if (error) {
      console.error('Failed to save leaderboard score:', error);
      return;
    }
    console.log('First leaderboard score saved:', playerNickname, finalRoundScore);
  } catch (error) {
    console.error('Failed to save leaderboard score:', error);
  } finally {
    pendingNicknameSubmissions.delete(nicknameKey);
  }
}

async function nicknameExistsInLeaderboard(nickname) {
  const { data: existingEntries, error } = await window.supabaseClient
    .from('leaderboard')
    .select('player_name')
    .ilike('player_name', nickname.replace(/[\\%_]/g, '\\$&'))
    .limit(1);

  if (error) throw error;
  return (existingEntries?.length ?? 0) > 0;
}

async function loadLeaderboard() {
  leaderboardRows.replaceChildren();
  leaderboardStatus.textContent = 'LOADING SCORES...';
  leaderboardStatus.hidden = false;

  try {
    const { data: entries, error } = await window.supabaseClient
      .from('leaderboard')
      .select('player_name, score')
      .order('score', { ascending: false })
      .order('player_name', { ascending: true })
      .limit(10);

    if (error) throw error;
    if (entries.length === 0) {
      leaderboardStatus.textContent = 'NO SCORES YET';
      return;
    }

    entries.forEach((entry, index) => {
      const row = document.createElement('tr');
      if (entry.player_name.toLowerCase() === playerNickname.toLowerCase()) {
        row.classList.add('leaderboard-current-player');
      }
      [String(index + 1), entry.player_name, String(entry.score)].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      leaderboardRows.appendChild(row);
    });
    leaderboardStatus.hidden = true;
  } catch (error) {
    console.error('Failed to load leaderboard:', error);
    leaderboardStatus.textContent = 'LEADERBOARD UNAVAILABLE';
  }
}

function closeLeaderboard() {
  leaderboardOverlay.hidden = true;
  leaderboardOpenButton.focus();
}

function startObstacleLoop() {
  if (obstacleAnimationFrame !== null) return;
  const now = performance.now();
  lastObstacleFrame = now;
  obstacleSpawnTime = now - baseSpawnInterval;
  waveSpawnTime = now;
  obstacleAnimationFrame = window.requestAnimationFrame(updateObstacles);
}

function movePlayer(direction, distance = 5) {
  const halfPlayerWidth = gamePlayer.offsetWidth / 2;
  const boundary = (halfPlayerWidth / playfield.clientWidth) * 100;
  playerPosition = Math.max(boundary, Math.min(100 - boundary, playerPosition + direction * distance));
  gamePlayer.style.left = `${playerPosition}%`;
}

playfield.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    movePlayer(event.key === 'ArrowLeft' ? -1 : 1);
  }
});

playfield.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  if (event.target.closest('button, a, input, select, textarea, label')) return;
  event.preventDefault();
  activePointerId = event.pointerId;
  playfield.setPointerCapture(activePointerId);
  const playerRect = gamePlayer.getBoundingClientRect();
  pointerOffsetX = event.clientX - (playerRect.left + playerRect.width / 2);
});

playfield.addEventListener('pointermove', (event) => {
  if (event.pointerId !== activePointerId) return;
  event.preventDefault();
  pendingPointerX = event.clientX;
  if (pointerAnimationFrame === null) {
    pointerAnimationFrame = window.requestAnimationFrame(updatePlayerFromPointer);
  }
});

function updatePlayerFromPointer() {
  pointerAnimationFrame = null;
  if (pendingPointerX === null) return;

  const playfieldRect = playfield.getBoundingClientRect();
  const fieldWidth = playfieldRect.width;
  if (fieldWidth === 0) return;
  const halfPlayerWidth = Math.min(gamePlayer.offsetWidth / 2, fieldWidth / 2);
  const playerCenterX = Math.max(
    halfPlayerWidth,
    Math.min(fieldWidth - halfPlayerWidth, pendingPointerX - playfieldRect.left - pointerOffsetX)
  );
  const nextPlayerPosition = playerCenterX / fieldWidth * 100;
  pendingPointerX = null;

  if (Math.abs(nextPlayerPosition - playerPosition) < 0.01) return;
  playerPosition = nextPlayerPosition;
  gamePlayer.style.left = `${playerPosition}%`;
}

function stopPointerTracking(event) {
  if (event.pointerId !== activePointerId) return;
  if (event.type === 'pointerup') pendingPointerX = event.clientX;
  if (pointerAnimationFrame !== null) {
    window.cancelAnimationFrame(pointerAnimationFrame);
    pointerAnimationFrame = null;
  }
  updatePlayerFromPointer();
  pendingPointerX = null;
  activePointerId = null;
  pointerOffsetX = 0;
}

playfield.addEventListener('pointerup', stopPointerTracking);
playfield.addEventListener('pointercancel', stopPointerTracking);
playfield.addEventListener('lostpointercapture', stopPointerTracking);
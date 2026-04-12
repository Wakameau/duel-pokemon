const socket = io();

const homeScreen = document.getElementById("homeScreen");
const roomScreen = document.getElementById("roomScreen");

const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCodeInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const homeMessage = document.getElementById("homeMessage");

const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const roomStatus = document.getElementById("roomStatus");

const player1Name = document.getElementById("player1Name");
const player2Name = document.getElementById("player2Name");
const player1Score = document.getElementById("player1Score");
const player2Score = document.getElementById("player2Score");

const player1StatsList = document.getElementById("player1StatsList");
const player2StatsList = document.getElementById("player2StatsList");

const pokemonSprite = document.getElementById("pokemonSprite");
const pokemonName = document.getElementById("pokemonName");
const roundLabel = document.getElementById("roundLabel");
const suddenDeathLabel = document.getElementById("suddenDeathLabel");
const revealZone = document.getElementById("revealZone");
const gameMessage = document.getElementById("gameMessage");

const startGameBtn = document.getElementById("startGameBtn");
const restartGameBtn = document.getElementById("restartGameBtn");
const statButtons = [...document.querySelectorAll(".stat-btn")];
const copyCodeBtn = document.getElementById("copyCodeBtn");

const STAT_ORDER = [
  { key: "hp", label: "HP" },
  { key: "attack", label: "ATTAQUE" },
  { key: "spAttack", label: "ATTAQUE SPÉ" },
  { key: "defense", label: "DÉFENSE" },
  { key: "spDefense", label: "DÉFENSE SPÉ" },
  { key: "speed", label: "VITESSE" }
];

let mySocketId = null;
let myRoomState = null;
let activeAnimations = {};
let animationLockUntil = 0;

socket.on("connect", () => {
  mySocketId = socket.id;
});

function showScreen(screen) {
  homeScreen.classList.remove("active");
  roomScreen.classList.remove("active");
  screen.classList.add("active");
}

function setMessage(text, target = gameMessage) {
  target.textContent = text || "";
}

function getPlayerByIndex(index) {
  if (!myRoomState || !myRoomState.players[index]) return null;
  return myRoomState.players[index];
}

function isHost() {
  return !!myRoomState && myRoomState.hostId === mySocketId;
}

function resetBoardVisual() {
  revealZone.innerHTML = "";
}

function getAnimKey(playerId, statKey) {
  return `${playerId}:${statKey}`;
}

function animateCount(element, target, onDone = null) {
  if (typeof target !== "number") {
    element.textContent = target;
    if (onDone) onDone();
    return;
  }

  if (target <= 1) {
    element.textContent = target;
    if (onDone) onDone();
    return;
  }

  let current = 1;
  element.textContent = current;

  const speed = target >= 120 ? 14 : target >= 80 ? 18 : 24;

  const interval = setInterval(() => {
    current += 1;
    element.textContent = current;

    if (current >= target) {
      clearInterval(interval);
      element.textContent = target;
      if (onDone) onDone();
    }
  }, speed);
}

function createStatRow(statKey, statLabel, value = null, playerId = null) {
  const row = document.createElement("div");
  row.className = "stat-row";
  row.dataset.statKey = statKey;

  const label = document.createElement("div");
  label.className = "stat-label";
  label.textContent = `${statLabel}:`;

  const box = document.createElement("div");
  box.className = "stat-value-box";

  const animKey = playerId ? getAnimKey(playerId, statKey) : null;
  const animatedValue = animKey ? activeAnimations[animKey] : undefined;

  const valueEl = document.createElement("div");

  if (animatedValue !== undefined) {
    valueEl.className = "stat-value";
    valueEl.textContent = animatedValue;
  } else if (value !== null && value !== undefined) {
    valueEl.className = "stat-value";
    valueEl.textContent = value;
  } else {
    valueEl.className = "stat-empty";
    valueEl.textContent = "-";
  }

  box.appendChild(valueEl);
  row.appendChild(label);
  row.appendChild(box);

  return row;
}

function renderPlayerStatsColumns() {
  if (!myRoomState) return;

  const p1 = myRoomState.players[0];
  const p2 = myRoomState.players[1];

  const p1Values = myRoomState.playerStatValues?.[p1?.id] || {};
  const p2Values = myRoomState.playerStatValues?.[p2?.id] || {};

  player1StatsList.innerHTML = "";
  player2StatsList.innerHTML = "";

  for (const stat of STAT_ORDER) {
    const p1Value = Object.prototype.hasOwnProperty.call(p1Values, stat.key)
      ? p1Values[stat.key]
      : null;

    const p2Value = Object.prototype.hasOwnProperty.call(p2Values, stat.key)
      ? p2Values[stat.key]
      : null;

    player1StatsList.appendChild(
      createStatRow(stat.key, stat.label, p1Value, p1?.id)
    );

    player2StatsList.appendChild(
      createStatRow(stat.key, stat.label, p2Value, p2?.id)
    );
  }
}

function renderUsedStats() {
  const myChoice = myRoomState?.choices?.[mySocketId] || null;
  const myUsedStats = myRoomState?.usedStatsByPlayer?.[mySocketId] || [];

  statButtons.forEach((btn) => {
    const stat = btn.dataset.stat;
    btn.classList.remove("used", "selected");

    const disabledBecauseUsed =
      !myRoomState?.suddenDeath && myUsedStats.includes(stat);
    const iAlreadyChose = !!myChoice;

    if (disabledBecauseUsed) {
      btn.classList.add("used");
    }

    if (myChoice === stat) {
      btn.classList.add("selected");
    }

    btn.disabled = !myRoomState?.started || disabledBecauseUsed || iAlreadyChose;
  });
}

function renderRoom(room) {
  myRoomState = room;
  showScreen(roomScreen);

  roomCodeDisplay.textContent = room.code;
  roomStatus.textContent = room.started ? "Partie en cours" : "Salon en attente";

  const p1 = getPlayerByIndex(0);
  const p2 = getPlayerByIndex(1);

  player1Name.textContent = p1 ? p1.name : "Joueur 1";
  player2Name.textContent = p2 ? p2.name : "Joueur 2";
  player1Score.textContent = p1 ? p1.score : "0";
  player2Score.textContent = p2 ? p2.score : "0";

  roundLabel.textContent = room.suddenDeath ? "Mort subite" : `Tour ${room.round}`;
  suddenDeathLabel.classList.toggle("hidden", !room.suddenDeath);

  if (room.currentPokemon) {
    pokemonSprite.src = room.currentPokemon.sprite;
    pokemonSprite.style.visibility = "visible";
    pokemonName.textContent = room.currentPokemon.name;
  } else {
    pokemonSprite.src = "";
    pokemonSprite.style.visibility = "hidden";
    pokemonName.textContent = "En attente du lancement...";
  }

  startGameBtn.classList.toggle("hidden", room.started || !isHost());
  restartGameBtn.classList.toggle(
    "hidden",
    room.started || !isHost() || !room.winnerId
  );
  startGameBtn.disabled = !!(isHost() && room.players.length < 2);

  renderPlayerStatsColumns();
  renderUsedStats();
}

function showReveal(text) {
  const pill = document.createElement("div");
  pill.className = "reveal-pill";
  pill.textContent = text;
  revealZone.appendChild(pill);
}

createRoomBtn.addEventListener("click", () => {
  const name = playerNameInput.value.trim();

  if (!name) {
    setMessage("Entre un pseudo.", homeMessage);
    return;
  }

  socket.emit("createRoom", { name });
  setMessage("", homeMessage);
});

joinRoomBtn.addEventListener("click", () => {
  const name = playerNameInput.value.trim();
  const code = roomCodeInput.value.trim().toUpperCase();

  if (!name) {
    setMessage("Entre un pseudo.", homeMessage);
    return;
  }

  if (!code) {
    setMessage("Entre un code salon.", homeMessage);
    return;
  }

  socket.emit("joinRoom", { code, name });
  setMessage("", homeMessage);
});

startGameBtn.addEventListener("click", () => {
  resetBoardVisual();
  setMessage("");
  socket.emit("startGame");
});

restartGameBtn.addEventListener("click", () => {
  resetBoardVisual();
  setMessage("");
  socket.emit("restartGame");
});

statButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!myRoomState?.started) return;
    socket.emit("chooseStat", { statKey: btn.dataset.stat });
    setMessage("Choix envoyé...");
  });
});

socket.on("roomState", (room) => {
  myRoomState = room;

  if (Date.now() < animationLockUntil) {
    return;
  }

  renderRoom(room);
});

socket.on("gameStarted", ({ pokemon }) => {
  resetBoardVisual();
  setMessage("La partie commence !");
  pokemonSprite.src = pokemon.sprite;
  pokemonSprite.style.visibility = "visible";
  pokemonName.textContent = pokemon.name;
});

socket.on("turnResult", ({ picks }) => {
  revealZone.innerHTML = "";

  for (const pick of picks) {
    showReveal(`${pick.playerName} : ${pick.statLabel} = ${pick.value}`);
  }

  if (!myRoomState) {
    setMessage("Tour terminé.");
    return;
  }

  animationLockUntil = Date.now() + 3500;

  const p1 = myRoomState.players[0];
  const p2 = myRoomState.players[1];

  const p1Values = myRoomState.playerStatValues?.[p1?.id] || {};
  const p2Values = myRoomState.playerStatValues?.[p2?.id] || {};

  player1StatsList.innerHTML = "";
  player2StatsList.innerHTML = "";

  for (const stat of STAT_ORDER) {
    const p1Value = Object.prototype.hasOwnProperty.call(p1Values, stat.key)
      ? p1Values[stat.key]
      : null;

    const p2Value = Object.prototype.hasOwnProperty.call(p2Values, stat.key)
      ? p2Values[stat.key]
      : null;

    player1StatsList.appendChild(
      createStatRow(stat.key, stat.label, p1Value, p1?.id)
    );

    player2StatsList.appendChild(
      createStatRow(stat.key, stat.label, p2Value, p2?.id)
    );
  }

  for (const pick of picks) {
    const key = getAnimKey(pick.playerId, pick.statKey);
    activeAnimations[key] = 1;

    const targetList = pick.playerId === p1?.id ? player1StatsList : player2StatsList;
    const row = [...targetList.querySelectorAll(".stat-row")].find(
      (r) => r.dataset.statKey === pick.statKey
    );

    if (!row) continue;

    const valueEl = row.querySelector(".stat-value, .stat-empty");
    if (!valueEl) continue;

    valueEl.className = "stat-value";

    animateCount(valueEl, pick.value, () => {
      activeAnimations[key] = pick.value;
    });
  }

  setMessage("Tour terminé.");

  setTimeout(() => {
    animationLockUntil = 0;
    if (myRoomState) {
      renderRoom(myRoomState);
    }
  }, 3600);
});

socket.on("nextPokemon", ({ pokemon, round }) => {
  revealZone.innerHTML = "";
  setMessage("Nouveau Pokémon !");
  pokemonSprite.src = pokemon.sprite;
  pokemonSprite.style.visibility = "visible";
  pokemonName.textContent = pokemon.name;

  if (!myRoomState?.suddenDeath) {
    roundLabel.textContent = `Tour ${round}`;
  }
});

socket.on("suddenDeath", ({ pokemon, message }) => {
  revealZone.innerHTML = "";
  setMessage(message || "Égalité ! Mort subite !");
  pokemonSprite.src = pokemon.sprite;
  pokemonSprite.style.visibility = "visible";
  pokemonName.textContent = pokemon.name;
  roundLabel.textContent = "Mort subite";
});

socket.on("gameOver", ({ winnerId, winnerName, score1, score2, suddenDeath }) => {
  if (winnerId === mySocketId) {
    setMessage(
      `Victoire ! ${winnerName} gagne (${score1} - ${score2})${
        suddenDeath ? " après mort subite" : ""
      }.`
    );
  } else {
    setMessage(
      `${winnerName} gagne (${score1} - ${score2})${
        suddenDeath ? " après mort subite" : ""
      }.`
    );
  }
});

socket.on("errorMessage", (message) => {
  if (roomScreen.classList.contains("active")) {
    setMessage(message);
  } else {
    setMessage(message, homeMessage);
  }
});

copyCodeBtn.addEventListener("click", () => {
  const code = roomCodeDisplay.textContent;

  if (!code || code === "-") return;

  navigator.clipboard.writeText(code);

  copyCodeBtn.textContent = "✅";

  setTimeout(() => {
    copyCodeBtn.textContent = "📋";
  }, 1000);
});
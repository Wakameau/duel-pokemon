const socket = io();

const homeScreen = document.getElementById("homeScreen");
const roomScreen = document.getElementById("roomScreen");

const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCodeInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const homeMessage = document.getElementById("homeMessage");

const gameModeSelect = document.getElementById("gameModeSelect");
const genButtons = [...document.querySelectorAll(".gen-toggle")];
const selectAllGensBtn = document.getElementById("selectAllGensBtn");
const clearAllGensBtn = document.getElementById("clearAllGensBtn");

const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const roomStatus = document.getElementById("roomStatus");
const roomModeDisplay = document.getElementById("roomModeDisplay");
const roomGensDisplay = document.getElementById("roomGensDisplay");

const teamAPlayers = document.getElementById("teamAPlayers");
const teamBPlayers = document.getElementById("teamBPlayers");
const playersGrid = document.getElementById("playersGrid");
const ffaLayout = document.getElementById("ffaLayout");

const roundLabel = document.getElementById("roundLabel");
const suddenDeathLabel = document.getElementById("suddenDeathLabel");
const pokemonSprite = document.getElementById("pokemonSprite");
const pokemonName = document.getElementById("pokemonName");
const centerSubText = document.getElementById("centerSubText");
const revealZone = document.getElementById("revealZone");

const startGameBtn = document.getElementById("startGameBtn");
const restartGameBtn = document.getElementById("restartGameBtn");
const gameMessage = document.getElementById("gameMessage");

const leftSide = document.getElementById("leftSide");
const rightSide = document.getElementById("rightSide");

const duelOverlay = document.getElementById("duelOverlay");
const duelLeftName = document.getElementById("duelLeftName");
const duelRightName = document.getElementById("duelRightName");
const duelLeftScore = document.getElementById("duelLeftScore");
const duelRightScore = document.getElementById("duelRightScore");

const STAT_ORDER = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"];

const STAT_LABELS = {
  hp: "HP",
  attack: "ATTAQUE",
  defense: "DÉFENSE",
  spAttack: "ATTAQUE SPÉ",
  spDefense: "DÉFENSE SPÉ",
  speed: "VITESSE"
};

let mySocketId = null;
let currentRoom = null;
let selectedGens = [1, 2, 3, 4, 5, 6, 7, 8, 9];
let lastTurnAnimatedStats = [];
let duelOverlayTimeout = null;

socket.on("connect", () => {
  mySocketId = socket.id;
});

function showScreen(screen) {
  homeScreen.classList.remove("active");
  roomScreen.classList.remove("active");
  screen.classList.add("active");
}

function setMessage(el, text, isError = false) {
  el.textContent = text || "";
  el.classList.toggle("error", !!isError);
}

function getPlayerName() {
  return (playerNameInput.value || "").trim().slice(0, 20) || "Joueur";
}

function getSelectedGenerations() {
  const gens = genButtons
    .filter((btn) => btn.classList.contains("active"))
    .map((btn) => Number(btn.dataset.gen));

  return gens.length ? gens : [1, 2, 3, 4, 5, 6, 7, 8, 9];
}

function updateGenButtonsUI() {
  genButtons.forEach((btn) => {
    const gen = Number(btn.dataset.gen);
    btn.classList.toggle("active", selectedGens.includes(gen));
  });
}

function formatGenerations(gens = []) {
  if (!gens.length || gens.length === 9) return "Toutes";
  return gens.map((g) => `GEN ${g}`).join(", ");
}

function getPokemonImage(pokemon) {
  if (!pokemon) return "";
  return pokemon.image || pokemon.sprite || pokemon.artwork || pokemon.front || "";
}

function getPokemonDisplayName(pokemon) {
  if (!pokemon) return "En attente...";
  return pokemon.name || pokemon.nom || "Pokémon";
}

function isHost(room) {
  return room && room.hostId === mySocketId;
}

function getMyPlayer(room) {
  if (!room) return null;
  return room.players.find((p) => p.id === mySocketId) || null;
}

function getOpponentPlayer(room) {
  if (!room) return null;
  return room.players.find((p) => p.id !== mySocketId) || null;
}

function getMyChosenStat(room) {
  if (!room || !room.choices) return null;
  return room.choices[mySocketId] || null;
}

function isMyTurn(room) {
  if (!room || !room.started) return false;

  if (
    (room.mode === "ffa" || room.mode === "2v2") &&
    room.suddenDeath &&
    Array.isArray(room.suddenDeathPlayerIds) &&
    room.suddenDeathPlayerIds.length
  ) {
    return room.suddenDeathPlayerIds.includes(mySocketId);
  }

  return !!getMyPlayer(room);
}

function isJustRevealed(playerId, statKey) {
  return lastTurnAnimatedStats.some(
    (item) => item.playerId === playerId && item.statKey === statKey
  );
}

function playerWasJustRevealed(playerId) {
  return lastTurnAnimatedStats.some((item) => item.playerId === playerId);
}

function animateCountUp(element, endValue, duration = 700) {
  const finalValue = Number(endValue ?? element.dataset.finalValue ?? 0) || 0;
  const startTime = performance.now();

  element.textContent = "0";
  element.classList.add("animating-number");

  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.round(finalValue * eased);

    element.textContent = String(currentValue);

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = String(finalValue);
      setTimeout(() => {
        element.classList.remove("animating-number");
      }, 120);
    }
  }

  requestAnimationFrame(update);
}

function animateBigScore(element, endValue, duration = 1200) {
  const finalValue = Number(endValue) || 0;
  const startTime = performance.now();

  element.textContent = "0";
  element.classList.add("pop");

  setTimeout(() => {
    element.classList.remove("pop");
  }, 320);

  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.round(finalValue * eased);

    element.textContent = String(currentValue);

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = String(finalValue);
    }
  }

  requestAnimationFrame(update);
}

function showDuelOverlay(leftName, leftValue, rightName, rightValue, options = {}) {
  if (!duelOverlay) return;

  const {
    leftDuration = 1300,
    rightDuration = 1300,
    hideAfter = 2100
  } = options;

  if (duelOverlayTimeout) {
    clearTimeout(duelOverlayTimeout);
    duelOverlayTimeout = null;
  }

  duelLeftName.textContent = leftName || "Joueur A";
  duelRightName.textContent = rightName || "Joueur B";
  duelLeftScore.textContent = "0";
  duelRightScore.textContent = "0";

  duelOverlay.classList.remove("hidden");

  requestAnimationFrame(() => {
    animateBigScore(duelLeftScore, leftValue, leftDuration);
    animateBigScore(duelRightScore, rightValue, rightDuration);
  });

  duelOverlayTimeout = setTimeout(() => {
    duelOverlay.classList.add("hidden");
  }, hideAfter);
}

function queueRevealAnimations(data) {
  if (!data?.picks?.length) return;

  data.picks.forEach((pick, index) => {
    setTimeout(() => {
      const statEl = document.querySelector(
        `.stat-value[data-player-id="${pick.playerId}"][data-stat-key="${pick.statKey}"]`
      );

      if (statEl) {
        animateCountUp(statEl, pick.value, 650);
      }

      const scoreEl = document.querySelector(
        `.total-score[data-player-id="${pick.playerId}"]`
      );

      if (scoreEl) {
        animateCountUp(scoreEl, pick.newScore, 700);
      }
    }, index * 220);
  });

  setTimeout(() => {
    lastTurnAnimatedStats = [];
    if (currentRoom) {
      renderPlayers(currentRoom);
    }
  }, data.picks.length * 220 + 950);
}

function createPlayerCard(room, player, side = "left") {
  const card = document.createElement("div");
  card.className = "player-card";

  if (player.id === mySocketId) {
    card.classList.add("me");
  }

  if (!player.connected) {
    card.classList.add("disconnected");
  }

  const header = document.createElement("div");
  header.className = "player-header";

  const name = document.createElement("div");
  name.className = "player-name";
  name.textContent = player.name;

  const score = document.createElement("div");
  score.className = "player-score";
  score.textContent = `${player.score} pts`;

  header.appendChild(name);
  header.appendChild(score);
  card.appendChild(header);

  const statsList = document.createElement("div");
  statsList.className = "stats-list";

  const usedStats = room.usedStatsByPlayer?.[player.id] || [];
  const values = room.playerStatValues?.[player.id] || {};
  const alreadyPicked = !!room.choices?.[player.id];
  const isMe = player.id === mySocketId;
  const myTurn = isMyTurn(room);

  STAT_ORDER.forEach((statKey) => {
    const row = document.createElement("div");
    row.className = "stat-row";

    const label = document.createElement("div");
    label.className = "stat-label";
    label.textContent = `${STAT_LABELS[statKey]} :`;

    const valueBox = document.createElement("div");
    valueBox.className = "stat-value-box";

    const isUsed = usedStats.includes(statKey);
    const statValue = values[statKey];
    const chosenNow = room.choices?.[player.id] === statKey;

    if (isMe) {
      if (typeof statValue !== "undefined") {
        const justRevealed = isJustRevealed(player.id, statKey);

        const value = document.createElement("div");
        value.className = "stat-value";
        value.textContent = justRevealed ? "0" : String(statValue);
        value.dataset.playerId = player.id;
        value.dataset.statKey = statKey;
        value.dataset.finalValue = statValue;
        valueBox.appendChild(value);
      } else if (room.started && myTurn && !alreadyPicked && !isUsed) {
        const btn = document.createElement("button");
        btn.className = "stat-pick-btn";
        btn.textContent = "";
        btn.addEventListener("click", () => {
          socket.emit("chooseStat", { statKey });
        });
        valueBox.appendChild(btn);
      } else if (chosenNow) {
        const hidden = document.createElement("div");
        hidden.className = "stat-hidden";
        valueBox.appendChild(hidden);
      } else if (isUsed) {
        const hidden = document.createElement("div");
        hidden.className = "stat-hidden";
        valueBox.appendChild(hidden);
      } else {
        const disabled = document.createElement("div");
        disabled.className = "stat-disabled";
        valueBox.appendChild(disabled);
      }
    } else {
      if (typeof statValue !== "undefined") {
        const justRevealed = isJustRevealed(player.id, statKey);

        const value = document.createElement("div");
        value.className = "stat-value";
        value.textContent = justRevealed ? "0" : String(statValue);
        value.dataset.playerId = player.id;
        value.dataset.statKey = statKey;
        value.dataset.finalValue = statValue;
        valueBox.appendChild(value);
      } else {
        const empty = document.createElement("div");
        empty.className = "stat-empty";
        empty.textContent = "-";
        valueBox.appendChild(empty);
      }
    }

    if (side === "right") {
      row.appendChild(valueBox);
      row.appendChild(label);
      row.classList.add("reverse");
    } else {
      row.appendChild(label);
      row.appendChild(valueBox);
    }

    statsList.appendChild(row);
  });

  card.appendChild(statsList);

  const totalBox = document.createElement("div");
  totalBox.className = "total-box";

  const totalTitle = document.createElement("div");
  totalTitle.className = "total-title";
  totalTitle.textContent = "Total";

  const totalScore = document.createElement("div");
  totalScore.className = "total-score";
  totalScore.textContent = playerWasJustRevealed(player.id) ? "0" : String(player.score);
  totalScore.dataset.playerId = player.id;
  totalScore.dataset.finalValue = player.score;

  totalBox.appendChild(totalTitle);
  totalBox.appendChild(totalScore);
  card.appendChild(totalBox);

  return card;
}

function render1v1(room) {
  ffaLayout.classList.add("hidden");
  leftSide.classList.remove("hidden");
  rightSide.classList.remove("hidden");

  teamAPlayers.innerHTML = "";
  teamBPlayers.innerHTML = "";

  const leftPlayer = room.players.find((p) => p.id === mySocketId) || room.players[0];
  const rightPlayer = room.players.find((p) => p.id !== leftPlayer?.id) || room.players[1];

  if (leftPlayer) {
    teamAPlayers.appendChild(createPlayerCard(room, leftPlayer, "left"));
  }

  if (rightPlayer) {
    teamBPlayers.appendChild(createPlayerCard(room, rightPlayer, "right"));
  }
}

function render2v2(room) {
  ffaLayout.classList.add("hidden");
  leftSide.classList.remove("hidden");
  rightSide.classList.remove("hidden");

  teamAPlayers.innerHTML = "";
  teamBPlayers.innerHTML = "";

  const team1 = room.players.slice(0, 2);
  const team2 = room.players.slice(2, 4);

  const myInTeam1 = team1.some((p) => p.id === mySocketId);

  const leftTeam = myInTeam1 ? team1 : team2;
  const rightTeam = myInTeam1 ? team2 : team1;
  const leftScore = myInTeam1 ? room.team1Score : room.team2Score;
  const rightScore = myInTeam1 ? room.team2Score : room.team1Score;

  const team1Title = document.createElement("div");
  team1Title.className = "team-title";
  team1Title.textContent = `ÉQUIPE — ${leftScore ?? 0} pts`;
  teamAPlayers.appendChild(team1Title);

  leftTeam.forEach((player) => {
    teamAPlayers.appendChild(createPlayerCard(room, player, "left"));
  });

  const team2Title = document.createElement("div");
  team2Title.className = "team-title";
  team2Title.textContent = `ADVERSAIRES — ${rightScore ?? 0} pts`;
  teamBPlayers.appendChild(team2Title);

  rightTeam.forEach((player) => {
    teamBPlayers.appendChild(createPlayerCard(room, player, "right"));
  });
}

function renderFFA(room) {
  leftSide.classList.add("hidden");
  rightSide.classList.add("hidden");
  ffaLayout.classList.remove("hidden");

  playersGrid.innerHTML = "";

  const playersOrdered = [...room.players].sort((a, b) => {
    if (a.id === mySocketId) return -1;
    if (b.id === mySocketId) return 1;
    return b.score - a.score;
  });

  playersOrdered.forEach((player) => {
    const side = player.id === mySocketId ? "left" : "right";
    playersGrid.appendChild(createPlayerCard(room, player, side));
  });
}

function renderPlayers(room) {
  if (room.mode === "ffa") {
    renderFFA(room);
    return;
  }

  if (room.mode === "2v2") {
    render2v2(room);
    return;
  }

  render1v1(room);
}

function renderPokemon(pokemon) {
  if (!pokemon) {
    pokemonSprite.src = "";
    pokemonSprite.style.visibility = "hidden";
    pokemonName.textContent = "En attente...";
    return;
  }

  const image = getPokemonImage(pokemon);

  if (image) {
    pokemonSprite.src = image;
    pokemonSprite.style.visibility = "visible";
  } else {
    pokemonSprite.src = "";
    pokemonSprite.style.visibility = "hidden";
  }

  pokemonName.textContent = getPokemonDisplayName(pokemon);
}

function renderCenterText(room) {
  if (!room.started) {
    centerSubText.textContent = "En attente";
    return;
  }

  const chosen = getMyChosenStat(room);

  if (!isMyTurn(room)) {
    centerSubText.textContent = "Tu ne joues pas ce tour";
    return;
  }

  if (chosen) {
    centerSubText.textContent = "Choix verrouillé";
    return;
  }

  centerSubText.textContent = "Choisis une statistique";
}

function renderRound(room) {
  roundLabel.textContent = `Tour ${room.round || 1}`;
  suddenDeathLabel.classList.toggle("hidden", !room.suddenDeath);
}

function renderButtons(room) {
  startGameBtn.classList.toggle("hidden", room.started || !isHost(room));
  restartGameBtn.classList.toggle("hidden", room.started || !isHost(room) || !room.winners?.length);
}

function renderRoomMeta(room) {
  roomCodeDisplay.textContent = room.code;
  roomModeDisplay.textContent = `Mode : ${room.mode.toUpperCase()}`;
  roomGensDisplay.textContent = `Gen : ${formatGenerations(room.generations)}`;

  if (!room.started) {
    roomStatus.textContent = "En attente...";
  } else if (room.suddenDeath) {
    roomStatus.textContent = "Mort subite";
  } else {
    roomStatus.textContent = "Partie en cours";
  }
}

function renderRoom(room) {
  currentRoom = room;
  showScreen(roomScreen);
  renderRoomMeta(room);
  renderRound(room);
  renderPokemon(room.currentPokemon);
  renderCenterText(room);
  renderButtons(room);
  renderPlayers(room);
}

function showRevealResult(data) {
  revealZone.innerHTML = "";

  if (!data?.picks?.length) return;

  data.picks.forEach((pick) => {
    const row = document.createElement("div");
    row.className = "reveal-row";
    row.textContent = `${pick.playerName} • ${pick.statLabel} = ${pick.value} • Score : ${pick.newScore}`;
    revealZone.appendChild(row);
  });
}

function showGameOver(data) {
  if (!data) return;

  if (data.mode === "2v2") {
    const names1 = (data.team1 || []).map((p) => p.name).join(" + ");
    const names2 = (data.team2 || []).map((p) => p.name).join(" + ");

    if ((data.team1Score ?? 0) > (data.team2Score ?? 0)) {
      setMessage(gameMessage, `Victoire : ${names1} (${data.team1Score} à ${data.team2Score})`);
    } else if ((data.team2Score ?? 0) > (data.team1Score ?? 0)) {
      setMessage(gameMessage, `Victoire : ${names2} (${data.team2Score} à ${data.team1Score})`);
    } else {
      setMessage(gameMessage, "Égalité parfaite");
    }

    return;
  }

  if (data.ranking) {
    const rankingText = data.ranking
      .map((p, i) => `${i + 1}. ${p.name} (${p.score})`)
      .join(" | ");

    if (data.winnerName) {
      setMessage(gameMessage, `Vainqueur : ${data.winnerName} — ${rankingText}`);
    } else {
      setMessage(gameMessage, rankingText);
    }

    return;
  }

  if (data.winnerName) {
    setMessage(gameMessage, `Vainqueur : ${data.winnerName}`);
  }
}

createRoomBtn.addEventListener("click", () => {
  const name = getPlayerName();
  const mode = gameModeSelect.value;
  const generations = getSelectedGenerations();

  socket.emit("createRoom", {
    name,
    mode,
    generations
  });

  setMessage(homeMessage, "");
});

joinRoomBtn.addEventListener("click", () => {
  const name = getPlayerName();
  const code = (roomCodeInput.value || "").trim().toUpperCase();

  if (!code) {
    setMessage(homeMessage, "Entre un code salon.", true);
    return;
  }

  socket.emit("joinRoom", { code, name });
});

startGameBtn.addEventListener("click", () => {
  socket.emit("startGame");
});

restartGameBtn.addEventListener("click", () => {
  socket.emit("restartGame");
});

copyCodeBtn.addEventListener("click", async () => {
  const code = roomCodeDisplay.textContent.trim();
  if (!code || code === "-") return;

  try {
    await navigator.clipboard.writeText(code);
    const old = copyCodeBtn.textContent;
    copyCodeBtn.textContent = "✅";
    setTimeout(() => {
      copyCodeBtn.textContent = old;
    }, 1000);
  } catch {
    //
  }
});

selectAllGensBtn.addEventListener("click", () => {
  selectedGens = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  updateGenButtonsUI();
});

clearAllGensBtn.addEventListener("click", () => {
  selectedGens = [];
  updateGenButtonsUI();
});

genButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const gen = Number(btn.dataset.gen);

    if (selectedGens.includes(gen)) {
      selectedGens = selectedGens.filter((g) => g !== gen);
    } else {
      selectedGens.push(gen);
      selectedGens.sort((a, b) => a - b);
    }

    updateGenButtonsUI();
  });
});

roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});

playerNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    createRoomBtn.click();
  }
});

socket.on("roomState", (room) => {
  renderRoom(room);
});

socket.on("gameStarted", ({ pokemon }) => {
  revealZone.innerHTML = "";
  setMessage(gameMessage, "");
  renderPokemon(pokemon);

  if (currentRoom) {
    currentRoom.currentPokemon = pokemon;
  }
});

socket.on("turnResult", (data) => {
  lastTurnAnimatedStats = (data.picks || []).map((pick) => ({
    playerId: pick.playerId,
    statKey: pick.statKey
  }));

  if (currentRoom) {
    currentRoom.usedStatsByPlayer = data.usedStatsByPlayer || {};
    currentRoom.playerStatValues = data.playerStatValues || {};
    currentRoom.choices = {};
  }

  showRevealResult(data);

  if (currentRoom) {
    renderPlayers(currentRoom);
    renderCenterText(currentRoom);
  }

  requestAnimationFrame(() => {
    queueRevealAnimations(data);
  });

  if (currentRoom && currentRoom.mode === "1v1" && data?.picks?.length >= 2) {
    const me = getMyPlayer(currentRoom);
    const opponent = getOpponentPlayer(currentRoom);

    const myPick = data.picks.find((p) => p.playerId === mySocketId);
    const enemyPick = data.picks.find((p) => p.playerId !== mySocketId);

    if (me && opponent && myPick && enemyPick) {
      showDuelOverlay(
        me.name,
        myPick.value,
        opponent.name,
        enemyPick.value,
        {
          hideAfter: 2100,
          leftDuration: 1200,
          rightDuration: 1200
        }
      );
    }
  }
});

socket.on("nextPokemon", ({ pokemon, round }) => {
  if (currentRoom) {
    currentRoom.currentPokemon = pokemon;
    currentRoom.round = round;
    currentRoom.choices = {};
  }

  revealZone.innerHTML = "";
  renderPokemon(pokemon);
  roundLabel.textContent = `Tour ${round}`;

  if (currentRoom) {
    renderCenterText(currentRoom);
    renderPlayers(currentRoom);
  }
});

socket.on("suddenDeath", ({ message, pokemon }) => {
  if (currentRoom) {
    currentRoom.suddenDeath = true;
    currentRoom.currentPokemon = pokemon;
    currentRoom.choices = {};
    currentRoom.round = 1;
  }

  setMessage(gameMessage, message || "Mort subite !");
  suddenDeathLabel.classList.remove("hidden");
  revealZone.innerHTML = "";
  renderPokemon(pokemon);

  if (currentRoom) {
    renderCenterText(currentRoom);
    renderPlayers(currentRoom);
  }
});

socket.on("gameOver", (data) => {
  showGameOver(data);
  restartGameBtn.classList.remove("hidden");
  startGameBtn.classList.add("hidden");
});

socket.on("errorMessage", (message) => {
  setMessage(homeMessage, message, true);
  setMessage(gameMessage, message, true);
});

updateGenButtonsUI();
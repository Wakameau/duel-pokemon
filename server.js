const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const pokemonFile = path.join(__dirname, "data", "pokemon.json");

if (!fs.existsSync(pokemonFile)) {
  console.error("Le fichier data/pokemon.json est introuvable.");
  console.error("Lance d'abord : npm run build:pokemon");
  process.exit(1);
}

const POKEMONS = JSON.parse(fs.readFileSync(pokemonFile, "utf-8"));

const STAT_KEYS = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"];

const STAT_LABELS = {
  hp: "HP",
  attack: "ATTAQUE",
  defense: "DÉFENSE",
  spAttack: "ATTAQUE SPÉ",
  spDefense: "DÉFENSE SPÉ",
  speed: "VITESSE"
};

const ALL_GENS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const rooms = {};

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return rooms[code] ? generateRoomCode() : code;
}

function getModePlayerLimit(mode) {
  if (mode === "1v1") return 2;
  if (mode === "2v2") return 4;
  if (mode === "ffa") return 6;
  return 2;
}

function getModeMinPlayers(mode) {
  if (mode === "1v1") return 2;
  if (mode === "2v2") return 4;
  if (mode === "ffa") return 3;
  return 2;
}

function normalizeMode(mode) {
  if (mode === "1v1" || mode === "2v2" || mode === "ffa") return mode;
  return "1v1";
}

function normalizeGenerations(generations) {
  if (!Array.isArray(generations)) return [...ALL_GENS];

  const cleaned = [...new Set(
    generations
      .map((g) => Number(g))
      .filter((g) => ALL_GENS.includes(g))
  )].sort((a, b) => a - b);

  return cleaned.length ? cleaned : [...ALL_GENS];
}

function getAllowedPokemons(room, excludedIds = []) {
  const generations = normalizeGenerations(room.generations);

  const filtered = POKEMONS.filter((pokemon) => {
    const pokemonGen = Number(pokemon.gen);
    return generations.includes(pokemonGen) && !excludedIds.includes(pokemon.id);
  });

  if (filtered.length > 0) return filtered;

  return POKEMONS.filter((pokemon) => !excludedIds.includes(pokemon.id));
}

function getRandomPokemonForRoom(room, excludedIds = []) {
  const pool = getAllowedPokemons(room, excludedIds);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getPlayer(room, socketId) {
  return room.players.find((p) => p.id === socketId);
}

function getActivePlayers(room) {
  if (room.mode === "ffa" && room.suddenDeath && room.suddenDeathPlayerIds.length) {
    return room.players.filter((p) => room.suddenDeathPlayerIds.includes(p.id));
  }

  if (room.mode === "2v2" && room.suddenDeath && room.suddenDeathPlayerIds.length) {
    return room.players.filter((p) => room.suddenDeathPlayerIds.includes(p.id));
  }

  return room.players;
}

function getTeam1(room) {
  return room.players.slice(0, 2);
}

function getTeam2(room) {
  return room.players.slice(2, 4);
}

function sumScores(players) {
  return players.reduce((sum, p) => sum + (p.score || 0), 0);
}

function sanitizeRoom(room) {
  return {
    code: room.code,
    mode: room.mode,
    generations: room.generations,
    hostId: room.hostId,
    started: room.started,
    suddenDeath: room.suddenDeath,
    suddenDeathPlayerIds: room.suddenDeathPlayerIds,
    round: room.round,
    winnerId: room.winnerId,
    winners: room.winners,
    currentPokemon: room.currentPokemon,
    usedStatsByPlayer: room.usedStatsByPlayer,
    playerStatValues: room.playerStatValues,
    choices: room.choices,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: p.connected
    })),
    team1Score: room.mode === "2v2" ? sumScores(getTeam1(room)) : null,
    team2Score: room.mode === "2v2" ? sumScores(getTeam2(room)) : null
  };
}

function emitRoomState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  io.to(roomCode).emit("roomState", sanitizeRoom(room));
}

function resetMatch(room) {
  room.started = true;
  room.suddenDeath = false;
  room.suddenDeathPlayerIds = [];
  room.usedPokemonIds = [];
  room.round = 1;
  room.winnerId = null;
  room.winners = [];
  room.choices = {};
  room.usedStatsByPlayer = {};
  room.playerStatValues = {};

  room.players.forEach((p) => {
    p.score = 0;
    room.usedStatsByPlayer[p.id] = [];
    room.playerStatValues[p.id] = {};
  });

  room.currentPokemon = getRandomPokemonForRoom(room);

  if (room.currentPokemon) {
    room.usedPokemonIds.push(room.currentPokemon.id);
  }
}

function startSuddenDeath(room, tiedPlayerIds = []) {
  room.suddenDeath = true;
  room.suddenDeathPlayerIds = [...tiedPlayerIds];
  room.usedPokemonIds = [];
  room.round = 1;
  room.choices = {};
  room.usedStatsByPlayer = {};
  room.playerStatValues = {};

  room.players.forEach((p) => {
    room.usedStatsByPlayer[p.id] = [];
    room.playerStatValues[p.id] = {};
  });

  room.currentPokemon = getRandomPokemonForRoom(room);

  if (room.currentPokemon) {
    room.usedPokemonIds.push(room.currentPokemon.id);
  }
}

function finishGame(room, winners) {
  room.started = false;
  room.winners = winners.map((p) => ({
    id: p.id,
    name: p.name,
    score: p.score
  }));
  room.winnerId = winners.length === 1 ? winners[0].id : null;

  if (room.mode === "ffa") {
    const ranking = [...room.players]
      .sort((a, b) => b.score - a.score)
      .map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score
      }));

    io.to(room.code).emit("gameOver", {
      winnerId: winners.length === 1 ? winners[0].id : null,
      winnerName: winners.length === 1 ? winners[0].name : null,
      winners: room.winners,
      suddenDeath: room.suddenDeath,
      ranking
    });

    return;
  }

  if (room.mode === "2v2") {
    const team1 = getTeam1(room);
    const team2 = getTeam2(room);
    const team1Score = sumScores(team1);
    const team2Score = sumScores(team2);

    io.to(room.code).emit("gameOver", {
      mode: "2v2",
      suddenDeath: room.suddenDeath,
      team1,
      team2,
      team1Score,
      team2Score,
      winners: room.winners
    });

    return;
  }

  const [p1, p2] = room.players;

  io.to(room.code).emit("gameOver", {
    mode: "1v1",
    winnerId: winners[0].id,
    winnerName: winners[0].name,
    score1: p1?.score ?? 0,
    score2: p2?.score ?? 0,
    suddenDeath: room.suddenDeath
  });
}

function resolveTurn(room) {
  const activePlayers = getActivePlayers(room);

  if (!activePlayers.length) return;
  if (!activePlayers.every((p) => room.choices[p.id])) return;

  const pokemon = room.currentPokemon;
  const picks = [];

  for (const player of activePlayers) {
    const statKey = room.choices[player.id];
    const value = Number(pokemon[statKey]) || 0;

    player.score += value;

    if (!room.usedStatsByPlayer[player.id]) {
      room.usedStatsByPlayer[player.id] = [];
    }

    if (!room.playerStatValues[player.id]) {
      room.playerStatValues[player.id] = {};
    }

    if (!room.usedStatsByPlayer[player.id].includes(statKey)) {
      room.usedStatsByPlayer[player.id].push(statKey);
    }

    room.playerStatValues[player.id][statKey] = value;

    picks.push({
      playerId: player.id,
      playerName: player.name,
      statKey,
      statLabel: STAT_LABELS[statKey],
      value,
      newScore: player.score
    });
  }

  room.choices = {};

  io.to(room.code).emit("turnResult", {
    pokemon,
    picks,
    usedStatsByPlayer: room.usedStatsByPlayer,
    playerStatValues: room.playerStatValues,
    suddenDeath: room.suddenDeath
  });

  const everyoneFinished = activePlayers.every(
    (p) => (room.usedStatsByPlayer[p.id] || []).length >= 6
  );

  if (!everyoneFinished) {
    room.round += 1;
    room.currentPokemon = getRandomPokemonForRoom(room, room.usedPokemonIds);

    if (room.currentPokemon) {
      room.usedPokemonIds.push(room.currentPokemon.id);
    }

    io.to(room.code).emit("nextPokemon", {
      pokemon: room.currentPokemon,
      round: room.round
    });

    emitRoomState(room.code);
    return;
  }

  if (room.mode === "ffa") {
    const contestPlayers = getActivePlayers(room);
    const bestScore = Math.max(...contestPlayers.map((p) => p.score));
    const leaders = contestPlayers.filter((p) => p.score === bestScore);

    if (leaders.length === 1) {
      finishGame(room, leaders);
    } else {
      startSuddenDeath(room, leaders.map((p) => p.id));
      io.to(room.code).emit("suddenDeath", {
        message: "Égalité en tête ! Mort subite !",
        pokemon: room.currentPokemon,
        playerIds: room.suddenDeathPlayerIds
      });
    }

    emitRoomState(room.code);
    return;
  }

  if (room.mode === "2v2") {
    const team1 = getTeam1(room);
    const team2 = getTeam2(room);
    const team1Score = sumScores(team1);
    const team2Score = sumScores(team2);

    if (team1Score > team2Score) {
      finishGame(room, team1);
    } else if (team2Score > team1Score) {
      finishGame(room, team2);
    } else {
      const tiedIds = [...team1, ...team2].map((p) => p.id);

      startSuddenDeath(room, tiedIds);
      io.to(room.code).emit("suddenDeath", {
        message: "Égalité entre les équipes ! Mort subite !",
        pokemon: room.currentPokemon,
        playerIds: room.suddenDeathPlayerIds
      });
    }

    emitRoomState(room.code);
    return;
  }

  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);
  const topScore = sortedPlayers[0].score;
  const leaders = sortedPlayers.filter((p) => p.score === topScore);

  if (leaders.length === 1) {
    finishGame(room, leaders);
  } else {
    startSuddenDeath(room, leaders.map((p) => p.id));
    io.to(room.code).emit("suddenDeath", {
      message: "Égalité ! Mort subite !",
      pokemon: room.currentPokemon,
      playerIds: room.suddenDeathPlayerIds
    });
  }

  emitRoomState(room.code);
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name, mode, generations }) => {
    const cleanName = String(name || "").trim().slice(0, 20) || "Joueur 1";
    const normalizedMode = normalizeMode(mode);
    const normalizedGenerations = normalizeGenerations(generations);
    const code = generateRoomCode();

    rooms[code] = {
      code,
      mode: normalizedMode,
      generations: normalizedGenerations,
      hostId: socket.id,
      started: false,
      suddenDeath: false,
      suddenDeathPlayerIds: [],
      round: 1,
      winnerId: null,
      winners: [],
      currentPokemon: null,
      usedPokemonIds: [],
      usedStatsByPlayer: {},
      playerStatValues: {},
      choices: {},
      players: [
        {
          id: socket.id,
          name: cleanName,
          score: 0,
          connected: true
        }
      ]
    };

    socket.join(code);
    socket.data.roomCode = code;
    emitRoomState(code);
  });

  socket.on("joinRoom", ({ code, name }) => {
    const roomCode = String(code || "").trim().toUpperCase();
    const cleanName = String(name || "").trim().slice(0, 20) || "Joueur";
    const room = rooms[roomCode];

    if (!room) {
      socket.emit("errorMessage", "Salon introuvable.");
      return;
    }

    if (room.started) {
      socket.emit("errorMessage", "La partie a déjà commencé.");
      return;
    }

    const maxPlayers = getModePlayerLimit(room.mode);

    if (room.players.length >= maxPlayers) {
      socket.emit("errorMessage", "Ce salon est déjà plein.");
      return;
    }

    room.players.push({
      id: socket.id,
      name: cleanName,
      score: 0,
      connected: true
    });

    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    emitRoomState(roomCode);
  });

  socket.on("startGame", () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room) return;

    if (room.hostId !== socket.id) {
      socket.emit("errorMessage", "Seul l'hôte peut lancer la partie.");
      return;
    }

    const minPlayers = getModeMinPlayers(room.mode);

    if (room.players.length < minPlayers) {
      socket.emit(
        "errorMessage",
        `Il faut au moins ${minPlayers} joueurs pour lancer ce mode.`
      );
      return;
    }

    resetMatch(room);

    io.to(roomCode).emit("gameStarted", {
      pokemon: room.currentPokemon
    });

    emitRoomState(roomCode);
  });

  socket.on("chooseStat", ({ statKey }) => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room || !room.started) return;

    const player = getPlayer(room, socket.id);
    if (!player) return;

    const activePlayers = getActivePlayers(room);
    const playerIsActive = activePlayers.some((p) => p.id === socket.id);

    if (!playerIsActive) {
      socket.emit("errorMessage", "Tu ne joues pas ce tour.");
      return;
    }

    if (!STAT_KEYS.includes(statKey)) {
      socket.emit("errorMessage", "Stat invalide.");
      return;
    }

    const playerUsedStats = room.usedStatsByPlayer[socket.id] || [];

    if (playerUsedStats.includes(statKey)) {
      socket.emit("errorMessage", "Tu as déjà utilisé cette stat.");
      return;
    }

    if (room.choices[socket.id]) {
      socket.emit("errorMessage", "Tu as déjà choisi une stat pour ce tour.");
      return;
    }

    room.choices[socket.id] = statKey;
    emitRoomState(roomCode);

    const everyonePicked = activePlayers.every((p) => !!room.choices[p.id]);
    if (everyonePicked) {
      resolveTurn(room);
    }
  });

  socket.on("restartGame", () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room) return;

    if (room.hostId !== socket.id) {
      socket.emit("errorMessage", "Seul l'hôte peut relancer une partie.");
      return;
    }

    const minPlayers = getModeMinPlayers(room.mode);

    if (room.players.length < minPlayers) {
      socket.emit(
        "errorMessage",
        `Il faut au moins ${minPlayers} joueurs pour relancer ce mode.`
      );
      return;
    }

    resetMatch(room);

    io.to(roomCode).emit("gameStarted", {
      pokemon: room.currentPokemon
    });

    emitRoomState(roomCode);
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;

    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (player) {
      player.connected = false;
    }

    io.to(roomCode).emit("errorMessage", "Un joueur s'est déconnecté.");
    emitRoomState(roomCode);

    setTimeout(() => {
      const currentRoom = rooms[roomCode];
      if (!currentRoom) return;

      currentRoom.players = currentRoom.players.filter((p) => p.connected);

      if (currentRoom.players.length === 0) {
        delete rooms[roomCode];
        return;
      }

      if (!currentRoom.players.find((p) => p.id === currentRoom.hostId)) {
        currentRoom.hostId = currentRoom.players[0].id;
      }

      currentRoom.started = false;
      currentRoom.choices = {};
      currentRoom.usedStatsByPlayer = {};
      currentRoom.playerStatValues = {};
      currentRoom.suddenDeath = false;
      currentRoom.suddenDeathPlayerIds = [];
      currentRoom.winnerId = null;
      currentRoom.winners = [];
      currentRoom.currentPokemon = null;
      currentRoom.usedPokemonIds = [];
      currentRoom.round = 1;

      currentRoom.players.forEach((p) => {
        p.score = 0;
      });

      emitRoomState(roomCode);
    }, 1000);
  });
});

server.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
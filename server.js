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

const rooms = {};

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return rooms[code] ? generateRoomCode() : code;
}

function getRandomPokemon(excludedIds = []) {
  const available = POKEMONS.filter((p) => !excludedIds.includes(p.id));
  const list = available.length > 0 ? available : POKEMONS;
  return list[Math.floor(Math.random() * list.length)];
}

function getPlayer(room, socketId) {
  return room.players.find((p) => p.id === socketId);
}

function sanitizeRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    started: room.started,
    suddenDeath: room.suddenDeath,
    round: room.round,
    winnerId: room.winnerId,
    currentPokemon: room.currentPokemon,
    usedStatsByPlayer: room.usedStatsByPlayer,
    playerStatValues: room.playerStatValues,
    choices: room.choices,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: p.connected
    }))
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
  room.usedPokemonIds = [];
  room.round = 1;
  room.winnerId = null;
  room.choices = {};
  room.usedStatsByPlayer = {};
  room.playerStatValues = {};

  room.players.forEach((p) => {
    p.score = 0;
    room.usedStatsByPlayer[p.id] = [];
    room.playerStatValues[p.id] = {};
  });

  room.currentPokemon = getRandomPokemon();

  if (room.currentPokemon) {
    room.usedPokemonIds.push(room.currentPokemon.id);
  }
}

function startSuddenDeath(room) {
  room.suddenDeath = true;
  room.usedPokemonIds = [];
  room.round = 1;
  room.choices = {};
  room.usedStatsByPlayer = {};
  room.playerStatValues = {};

  room.players.forEach((p) => {
    room.usedStatsByPlayer[p.id] = [];
    room.playerStatValues[p.id] = {};
  });

  room.currentPokemon = getRandomPokemon();

  if (room.currentPokemon) {
    room.usedPokemonIds.push(room.currentPokemon.id);
  }
}

function finishGame(room, winner) {
  room.started = false;
  room.winnerId = winner.id;

  const [p1, p2] = room.players;

  io.to(room.code).emit("gameOver", {
    winnerId: winner.id,
    winnerName: winner.name,
    score1: p1.score,
    score2: p2.score,
    suddenDeath: room.suddenDeath
  });
}

function resolveTurn(room) {
  const [p1, p2] = room.players;
  const stat1 = room.choices[p1.id];
  const stat2 = room.choices[p2.id];

  if (!stat1 || !stat2) return;

  const pokemon = room.currentPokemon;
  const val1 = pokemon[stat1];
  const val2 = pokemon[stat2];

  p1.score += val1;
  p2.score += val2;

  if (!room.usedStatsByPlayer[p1.id]) room.usedStatsByPlayer[p1.id] = [];
  if (!room.usedStatsByPlayer[p2.id]) room.usedStatsByPlayer[p2.id] = [];

  if (!room.playerStatValues[p1.id]) room.playerStatValues[p1.id] = {};
  if (!room.playerStatValues[p2.id]) room.playerStatValues[p2.id] = {};

  if (!room.usedStatsByPlayer[p1.id].includes(stat1)) {
    room.usedStatsByPlayer[p1.id].push(stat1);
  }

  if (!room.usedStatsByPlayer[p2.id].includes(stat2)) {
    room.usedStatsByPlayer[p2.id].push(stat2);
  }

  room.playerStatValues[p1.id][stat1] = val1;
  room.playerStatValues[p2.id][stat2] = val2;

  io.to(room.code).emit("turnResult", {
    pokemon,
    picks: [
      {
        playerId: p1.id,
        playerName: p1.name,
        statKey: stat1,
        statLabel: STAT_LABELS[stat1],
        value: val1,
        newScore: p1.score
      },
      {
        playerId: p2.id,
        playerName: p2.name,
        statKey: stat2,
        statLabel: STAT_LABELS[stat2],
        value: val2,
        newScore: p2.score
      }
    ],
    usedStatsByPlayer: room.usedStatsByPlayer,
    playerStatValues: room.playerStatValues,
    suddenDeath: room.suddenDeath
  });

  room.choices = {};

  const p1Finished = (room.usedStatsByPlayer[p1.id] || []).length >= 6;
  const p2Finished = (room.usedStatsByPlayer[p2.id] || []).length >= 6;
  const endNormal = !room.suddenDeath && p1Finished && p2Finished;
  const endSudden = room.suddenDeath;

  if (endNormal || endSudden) {
    if (p1.score > p2.score) {
      finishGame(room, p1);
    } else if (p2.score > p1.score) {
      finishGame(room, p2);
    } else {
      startSuddenDeath(room);
      io.to(room.code).emit("suddenDeath", {
        message: "Égalité ! Mort subite !",
        pokemon: room.currentPokemon
      });
    }

    emitRoomState(room.code);
    return;
  }

  room.round += 1;
  room.currentPokemon = getRandomPokemon(room.usedPokemonIds);

  if (room.currentPokemon) {
    room.usedPokemonIds.push(room.currentPokemon.id);
  }

  io.to(room.code).emit("nextPokemon", {
    pokemon: room.currentPokemon,
    round: room.round
  });

  emitRoomState(room.code);
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }) => {
    const cleanName = String(name || "").trim().slice(0, 20) || "Joueur 1";
    const code = generateRoomCode();

    rooms[code] = {
      code,
      hostId: socket.id,
      started: false,
      suddenDeath: false,
      round: 1,
      winnerId: null,
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
    const cleanName = String(name || "").trim().slice(0, 20) || "Joueur 2";
    const room = rooms[roomCode];

    if (!room) {
      socket.emit("errorMessage", "Salon introuvable.");
      return;
    }

    if (room.players.length >= 2) {
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

    if (room.players.length !== 2) {
      socket.emit("errorMessage", "Il faut 2 joueurs pour lancer la partie.");
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

    if (!STAT_KEYS.includes(statKey)) {
      socket.emit("errorMessage", "Stat invalide.");
      return;
    }

    const playerUsedStats = room.usedStatsByPlayer[socket.id] || [];

    if (!room.suddenDeath && playerUsedStats.includes(statKey)) {
      socket.emit("errorMessage", "Tu as déjà utilisé cette stat.");
      return;
    }

    room.choices[socket.id] = statKey;
    emitRoomState(roomCode);

    if (room.players.length === 2 && room.players.every((p) => room.choices[p.id])) {
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

    if (room.players.length !== 2) {
      socket.emit("errorMessage", "Il faut 2 joueurs.");
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
      emitRoomState(roomCode);
    }, 1000);
  });
});

server.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
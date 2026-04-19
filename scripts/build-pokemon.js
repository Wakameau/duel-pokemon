const fs = require("fs");
const path = require("path");

const OUTPUT = path.join(__dirname, "../data/pokemon.json");

const MAX_POKEMON = 1025; // gen 1 → 9

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Erreur API: " + url);
  return res.json();
}

function extractGen(genName) {
  // ex: generation-iii → 3
  const map = {
    "generation-i": 1,
    "generation-ii": 2,
    "generation-iii": 3,
    "generation-iv": 4,
    "generation-v": 5,
    "generation-vi": 6,
    "generation-vii": 7,
    "generation-viii": 8,
    "generation-ix": 9
  };

  return map[genName] || 1;
}

function getFrenchName(names) {
  const fr = names.find((n) => n.language.name === "fr");
  return fr ? fr.name : names[0].name;
}

async function build() {
  const list = [];

  for (let id = 1; id <= MAX_POKEMON; id++) {
    try {
      console.log("Pokémon", id);

      const [pokemon, species] = await Promise.all([
        fetchJSON(`https://pokeapi.co/api/v2/pokemon/${id}`),
        fetchJSON(`https://pokeapi.co/api/v2/pokemon-species/${id}`)
      ]);

      const name = getFrenchName(species.names);
      const gen = extractGen(species.generation.name);

      list.push({
        id,
        name,
        gen,
        sprite:
          pokemon.sprites.other["official-artwork"].front_default ||
          pokemon.sprites.front_default,

        hp: pokemon.stats[0].base_stat,
        attack: pokemon.stats[1].base_stat,
        defense: pokemon.stats[2].base_stat,
        spAttack: pokemon.stats[3].base_stat,
        spDefense: pokemon.stats[4].base_stat,
        speed: pokemon.stats[5].base_stat
      });
    } catch (err) {
      console.log("Erreur Pokémon", id);
    }
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(list, null, 2), "utf-8");
  console.log("✅ pokemon.json généré !");
}

build();
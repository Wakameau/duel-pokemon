const fs = require("fs");
const path = require("path");

const API_BASE = "https://pokeapi.co/api/v2";

const REGIONAL_SUFFIXES = ["-alola", "-galar", "-hisui", "-paldea"];

const EXCLUDED_PARTS = [
  "-mega",
  "-gmax",
  "-totem",
  "-starter",
  "-build",
  "-mode",
  "-cloak",
  "-school",
  "-busted",
  "-eternamax",
  "-crowned",
  "-origin",
  "-complete",
  "-ultra",
  "-therian",
  "-ash",
  "-blade",
  "-shield",
  "-sunny",
  "-rainy",
  "-snowy",
  "-resolute",
  "-pirouette",
  "-ordinary",
  "-aria",
  "-ice",
  "-shadow",
  "-white",
  "-black",
  "-zen",
  "-trash",
  "-sandy",
  "-plant",
  "-male",
  "-female"
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} sur ${url}`);
  }
  return res.json();
}

function shouldKeepPokemonName(apiName) {
  const isRegional = REGIONAL_SUFFIXES.some((suffix) => apiName.endsWith(suffix));
  if (isRegional) return true;

  return !EXCLUDED_PARTS.some((part) => apiName.includes(part));
}

function getStat(stats, statName) {
  const stat = stats.find((s) => s.stat.name === statName);
  return stat ? stat.base_stat : 0;
}

function getRegionalLabel(apiName) {
  if (apiName.endsWith("-alola")) return "d'Alola";
  if (apiName.endsWith("-galar")) return "de Galar";
  if (apiName.endsWith("-hisui")) return "de Hisui";
  if (apiName.endsWith("-paldea")) return "de Paldea";
  return "";
}

function getFrenchSpeciesName(speciesData) {
  const fr = speciesData.names.find((entry) => entry.language.name === "fr");
  if (fr?.name) return fr.name;

  const fallback = speciesData.name || "Pokemon";
  return fallback
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function buildPokemonList() {
  console.log("Récupération de la liste complète...");
  const listData = await fetchJson(`${API_BASE}/pokemon?limit=100000&offset=0`);

  const entries = listData.results.filter((entry) => shouldKeepPokemonName(entry.name));
  const pokemonList = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    try {
      const pokemonData = await fetchJson(entry.url);

      const artwork =
        pokemonData?.sprites?.other?.["official-artwork"]?.front_default ||
        pokemonData?.sprites?.front_default;

      if (!artwork) {
        continue;
      }

      const speciesData = await fetchJson(pokemonData.species.url);

      const baseFrenchName = getFrenchSpeciesName(speciesData);
      const regionalLabel = getRegionalLabel(pokemonData.name);
      const finalName = regionalLabel
        ? `${baseFrenchName} ${regionalLabel}`
        : baseFrenchName;

      pokemonList.push({
        id: pokemonData.id,
        apiName: pokemonData.name,
        name: finalName,
        sprite: artwork,
        hp: getStat(pokemonData.stats, "hp"),
        attack: getStat(pokemonData.stats, "attack"),
        defense: getStat(pokemonData.stats, "defense"),
        spAttack: getStat(pokemonData.stats, "special-attack"),
        spDefense: getStat(pokemonData.stats, "special-defense"),
        speed: getStat(pokemonData.stats, "speed")
      });

      if ((i + 1) % 25 === 0) {
        console.log(`${i + 1}/${entries.length} traités`);
      }

      await sleep(35);
    } catch (error) {
      console.error(`Erreur sur ${entry.name}: ${error.message}`);
    }
  }

  pokemonList.sort((a, b) => {
    if (a.id !== b.id) return a.id - b.id;
    return a.name.localeCompare(b.name, "fr");
  });

  return pokemonList;
}

async function main() {
  const pokemonList = await buildPokemonList();

  const outDir = path.join(__dirname, "..", "data");
  const outFile = path.join(outDir, "pokemon.json");

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(pokemonList, null, 2), "utf-8");

  console.log(`Terminé : ${pokemonList.length} Pokémon sauvegardés`);
  console.log(`Fichier : ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
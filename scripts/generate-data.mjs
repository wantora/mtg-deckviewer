import {readFile, mkdir, writeFile, readdir} from "node:fs/promises";
import {join, basename, dirname} from "node:path";
import https from "node:https";
import Database from "better-sqlite3";

const OVERRIDE_CARDS = [
  "https://api.scryfall.com/cards/thb/250",
  "https://api.scryfall.com/cards/thb/251",
  "https://api.scryfall.com/cards/thb/252",
  "https://api.scryfall.com/cards/thb/253",
  "https://api.scryfall.com/cards/thb/254",
];

function removeDiacriticalMarks(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
}

function checkLegal(legalities) {
  for (const legality of Object.values(legalities)) {
    if (legality !== "not_legal") {
      return true;
    }
  }
  return false;
}

function getArenaName(cardObject) {
  if (cardObject.layout === "split") {
    return cardObject.name;
  } else if (cardObject.card_faces) {
    return cardObject.card_faces[0].name;
  } else {
    return cardObject.name;
  }
}

function getName(cardObject) {
  let name;
  if (cardObject.card_faces) {
    name = cardObject.card_faces[0].name;
  } else {
    name = cardObject.name;
  }

  return name;
}

function parseTypeLine(typeLine) {
  return typeLine
    .match(/^[\w ]+/)[0]
    .trimEnd()
    .split(/ +/);
}

function getColor(cardObject) {
  if (parseTypeLine(cardObject.type_line).includes("Land")) {
    return cardObject.color_identity;
  } else {
    if (cardObject.colors) {
      return cardObject.colors;
    } else if (cardObject.card_faces) {
      return cardObject.card_faces[0].colors;
    }
  }
  return null;
}

function getArenaAvailable(cardObject) {
  return (
    cardObject.legalities.historic !== "not_legal" ||
    cardObject.legalities.timeless !== "not_legal"
  );
}

function getImage(cardObject) {
  let imageUris = null;
  if (cardObject.image_uris) {
    imageUris = cardObject.image_uris;
  } else if (cardObject.card_faces && cardObject.card_faces[0].image_uris) {
    imageUris = cardObject.card_faces[0].image_uris;
  }

  if (imageUris) {
    return imageUris.normal;
  } else {
    return null;
  }
}

function oracleCardsParser(oracleCardsData) {
  const cards = [];
  const cardNames = {};

  for (const cardObject of oracleCardsData) {
    if (!checkLegal(cardObject.legalities)) {
      continue;
    }

    const card = {
      name: getArenaName(cardObject),
      cmc: cardObject.cmc,
      type: parseTypeLine(cardObject.type_line),
      color: getColor(cardObject),
      arena: getArenaAvailable(cardObject),
      uri: cardObject.scryfall_uri,
      image: getImage(cardObject),
    };
    cards.push(card);
    const index = cards.length - 1;

    const name = getName(cardObject);
    cardNames[name] = index;
    cardNames[removeDiacriticalMarks(name)] = index;
  }

  return {cards, cardNames};
}

function httpGet(uri) {
  return new Promise((resolve, reject) => {
    https.get(
      uri,
      {
        headers: {
          "User-Agent": "mtg-deckviewer/1.0",
          Accept: "*/*",
        },
      },
      (res) => {
        res.setEncoding("utf8");
        let rawData = "";
        res.on("data", (chunk) => {
          rawData += chunk;
        });
        res.on("end", () => {
          setTimeout(() => {
            resolve(rawData);
          }, 100);
        });
      }
    );
  });
}

async function cacheHttpGet(uri) {
  const cacheFile = join("cache", basename(uri));

  try {
    return await readFile(cacheFile, {encoding: "utf8"});
    // eslint-disable-next-line no-unused-vars
  } catch (error) {
    const data = await httpGet(uri);

    await mkdir(dirname(cacheFile), {recursive: true});
    await writeFile(cacheFile, data);
    return data;
  }
}

async function getDatabaseFile() {
  const dir = join(
    process.env.PROGRAMFILES,
    "Wizards of the Coast/MTGA/MTGA_Data/Downloads/Raw"
  );

  let dbFile = null;
  let dbVersion = Infinity;

  try {
    for (const file of await readdir(dir)) {
      if (file.match(/^Raw_CardDatabase_.*\.mtga$/)) {
        const f = join(dir, file);
        const db = new Database(f, {readonly: true});
        const row = db
          .prepare("SELECT Version FROM Versions WHERE Type = 'GRP'")
          .get();
        db.close();

        if (row.Version < dbVersion) {
          dbFile = f;
          dbVersion = row.Version;
        }
      }
    }
  } catch (error) {
    console.error(error);
    return null;
  }

  return dbFile;
}

(async () => {
  const oracleCardsInfo = JSON.parse(
    await httpGet("https://api.scryfall.com/bulk-data/oracle-cards")
  );
  const oracleCardsData = JSON.parse(
    await cacheHttpGet(oracleCardsInfo.download_uri)
  );

  const cardData = oracleCardsParser(oracleCardsData);
  cardData.updatedAt = Date.parse(oracleCardsInfo.updated_at);

  for (const url of OVERRIDE_CARDS) {
    const cardObject = JSON.parse(await httpGet(url));
    const card = cardData.cards[cardData.cardNames[cardObject.name]];
    card.uri = cardObject.scryfall_uri;
    card.image = getImage(cardObject);
  }

  const dbFile = await getDatabaseFile();
  if (dbFile) {
    const db = new Database(dbFile, {readonly: true});
    const dbCards = db.prepare("SELECT TitleId FROM Cards WHERE TitleId != 0");
    const dbLocalizations = db.prepare(
      "SELECT enUS, ptBR, frFR, itIT, deDE, esES, jaJP, koKR FROM Localizations WHERE LocId = ?"
    );

    for (const card of dbCards.iterate()) {
      const loc = dbLocalizations.get(card.TitleId);
      if (Object.hasOwn(cardData.cardNames, loc.enUS)) {
        const index = cardData.cardNames[loc.enUS];

        for (const name of Object.values(loc)) {
          if (!Object.hasOwn(cardData.cardNames, name)) {
            cardData.cardNames[name] = index;
          }
        }

        cardData.cardNames[loc.jaJP.replace(/（[^）]*）/g, "")] = index;
      }
    }
  } else {
    console.info("MTGA database not found");
  }

  const outputFile = "src/data.json";
  await mkdir(dirname(outputFile), {recursive: true});
  await writeFile(outputFile, JSON.stringify(cardData));
})();

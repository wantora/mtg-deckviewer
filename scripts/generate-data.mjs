import {mkdir, writeFile, readdir, stat} from "node:fs/promises";
import {createWriteStream, createReadStream} from "node:fs";
import {join, basename, dirname} from "node:path";
import {PassThrough} from "node:stream";
import {pipeline} from "node:stream/promises";
import {createInterface} from "node:readline";
import {createGunzip, createGzip} from "node:zlib";
import https from "node:https";
import Database from "better-sqlite3";

const OVERRIDE_CARDS = new Set([
  "thb/250",
  "thb/251",
  "thb/252",
  "thb/253",
  "thb/254",
]);

const HTTP_HEADERS = {
  "User-Agent": "mtg-deckviewer/1.0",
  Accept: "*/*",
  "Accept-Encoding": "gzip",
};

async function httpStreamGet(uri) {
  const cacheFile = join("cache", uri.replace(/[^\w%&+\-.=@]+/g, "_") + ".gz");

  try {
    const cacheStat = await stat(cacheFile);
    if (Date.now() - cacheStat.mtimeMs < 86400000) {
      const stream = createReadStream(cacheFile).pipe(createGunzip());
      stream.setEncoding("utf8");
      return stream;
    }
  } catch {
    // pass
  }

  await mkdir(dirname(cacheFile), {recursive: true});
  return new Promise((resolve, reject) => {
    https.get(uri, {headers: HTTP_HEADERS}, async (res) => {
      let stream;
      if (res.headers["content-encoding"] === "gzip") {
        res.pipe(createWriteStream(cacheFile));
        stream = res.pipe(createGunzip());
      } else {
        res.pipe(createGzip()).pipe(createWriteStream(cacheFile));
        stream = res.pipe(new PassThrough());
      }
      stream.setEncoding("utf8");
      resolve(stream);
    });
  });
}

async function parseJSONStream(stream, callback) {
  return pipeline([
    createInterface({input: stream}),
    async function* (source, {signal}) {
      for await (const chunk of source) {
        if (chunk.startsWith("{")) {
          callback(JSON.parse(chunk.replace(/,$/, "")));
        }
      }
      yield "";
    },
  ]);
}

function removeDiacriticalMarks(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
}

class CardData {
  static #TODAY = new Date().toISOString().slice(0, 10);
  #cardObject;

  constructor(cardObject) {
    this.#cardObject = cardObject;
  }
  checkLegal() {
    return (
      Object.values(this.#cardObject.legalities).some(
        (value) => value !== "not_legal"
      ) ||
      (this.#cardObject.released_at > CardData.#TODAY &&
        this.#cardObject.set_type !== "memorabilia" &&
        this.#cardObject.set_type !== "token")
    );
  }

  get object() {
    return this.#cardObject;
  }
  get arenaName() {
    if (this.#cardObject.keywords.includes("Aftermath")) {
      return this.#cardObject.card_faces.map((face) => face.name).join(" /// ");
    } else if (this.#cardObject.layout === "split") {
      return this.#cardObject.name;
    } else if (this.#cardObject.card_faces) {
      return this.#cardObject.card_faces[0].name;
    } else {
      return this.#cardObject.name;
    }
  }
  get indexName() {
    return this.#getIndexName("name");
  }
  get printedIndexName() {
    return this.#getIndexName("printed_name");
  }
  get typeLine() {
    return this.#cardObject.type_line
      .match(/^[\w ]+/)[0]
      .trimEnd()
      .split(/ +/);
  }
  get color() {
    if (this.typeLine.includes("Land")) {
      return this.#cardObject.color_identity;
    } else {
      if (this.#cardObject.colors) {
        return this.#cardObject.colors;
      } else if (this.#cardObject.card_faces) {
        return this.#cardObject.card_faces[0].colors;
      }
    }
    return null;
  }
  get image() {
    let imageUris = null;
    if (this.#cardObject.image_uris) {
      imageUris = this.#cardObject.image_uris;
    } else if (
      this.#cardObject.card_faces &&
      this.#cardObject.card_faces[0].image_uris
    ) {
      imageUris = this.#cardObject.card_faces[0].image_uris;
    }

    if (imageUris) {
      return imageUris.normal;
    } else {
      return null;
    }
  }

  #getIndexName(propName) {
    let name;
    if (this.#cardObject.card_faces) {
      name = this.#cardObject.card_faces[0][propName];
    } else {
      name = this.#cardObject[propName];
    }

    return removeDiacriticalMarks(name);
  }
}

async function cardsParser({oracleCards, allCards}) {
  const cards = [];
  const cardNames = {};

  await parseJSONStream(oracleCards, (entry) => {
    const cardData = new CardData(entry);
    if (cardData.checkLegal()) {
      const card = {
        name: cardData.arenaName,
        cmc: cardData.object.cmc,
        type: cardData.typeLine,
        color: cardData.color,
        uri: cardData.object.scryfall_uri,
        image: cardData.image,
      };
      cards.push(card);
      const index = cards.length - 1;
      cardNames[cardData.indexName] = index;
    }
  });

  await parseJSONStream(allCards, (entry) => {
    const cardData = new CardData(entry);
    if (
      cardData.object.lang === "en" &&
      OVERRIDE_CARDS.has(
        cardData.object.set + "/" + cardData.object.collector_number
      )
    ) {
      const card = cards[cardNames[cardData.indexName]];
      card.uri = cardData.object.scryfall_uri;
      card.image = cardData.image;
    } else if (
      cardData.object.lang === "en" &&
      (cardData.object.card_faces
        ? cardData.object.card_faces[0].printed_name
        : cardData.object.printed_name) &&
      cardData.checkLegal()
    ) {
      const key = cardData.printedIndexName;
      if (!cardNames[key]) {
        cardNames[key] = cardNames[cardData.indexName];
      }
    }
  });

  return {
    cards,
    cardNames,
  };
}

async function getDatabaseFile() {
  const dirs = [
    join(
      process.env["ProgramFiles"],
      "Wizards of the Coast/MTGA/MTGA_Data/Downloads/Raw"
    ),
    join(
      process.env["ProgramFiles(x86)"],
      "Steam/steamapps/common/MTGA/MTGA_Data/Downloads/Raw"
    ),
  ];

  let dbFile = null;
  let dbVersion = Infinity;
  let files;

  for (const dir of dirs) {
    try {
      files = (await readdir(dir)).map((file) => join(dir, file));
      break;
    } catch {
      // pass
    }
  }

  try {
    for (const file of files) {
      if (basename(file).match(/^Raw_CardDatabase_.*\.mtga$/)) {
        const db = new Database(file, {readonly: true});
        const row = db
          .prepare("SELECT Version FROM Versions WHERE Type = 'GRP'")
          .get();
        db.close();

        if (row.Version < dbVersion) {
          dbFile = file;
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
  const bulkData = await (
    await fetch("https://api.scryfall.com/bulk-data", {headers: HTTP_HEADERS})
  ).json();

  const oracleCardsInfo = bulkData.data.find((o) => o.type === "oracle_cards");
  const cardData = await cardsParser({
    oracleCards: await httpStreamGet(oracleCardsInfo.download_uri),
    allCards: await httpStreamGet(
      bulkData.data.find((o) => o.type === "all_cards").download_uri
    ),
  });
  cardData.updatedAt = Date.parse(oracleCardsInfo.updated_at);

  const dbFile = await getDatabaseFile();
  if (dbFile) {
    const db = new Database(dbFile, {readonly: true});
    const dbCards = db.prepare("SELECT TitleId FROM Cards WHERE TitleId != 0");
    const dbLocalizations = new Map(
      ["deDE", "enUS", "esES", "frFR", "itIT", "jaJP", "koKR", "ptBR"].map(
        (lang) => [
          lang,
          db.prepare(
            `SELECT Loc FROM Localizations_${lang} WHERE (Formatted = 0 OR Formatted = 1) AND LocId = ? ORDER BY Formatted ASC`
          ),
        ]
      )
    );
    const getMTGAIndexName = (lang, titleId) => {
      return removeDiacriticalMarks(dbLocalizations.get(lang).get(titleId).Loc);
    };

    for (const card of dbCards.iterate()) {
      const enUSname = getMTGAIndexName("enUS", card.TitleId);
      if (Object.hasOwn(cardData.cardNames, enUSname)) {
        const index = cardData.cardNames[enUSname];

        for (const lang of dbLocalizations.keys()) {
          let name = getMTGAIndexName(lang, card.TitleId);
          if (enUSname === "Hustle") {
            name = name.replace(/ \/\/ .*$/, "");
          }

          if (!cardData.cardNames[name]) {
            cardData.cardNames[name] = index;
          }
          if (lang === "jaJP") {
            const jaName = name.replace(/（[^）]*）/g, "");
            if (!cardData.cardNames[jaName]) {
              cardData.cardNames[jaName] = index;
            }
          }
        }
      }
    }
  } else {
    console.info("MTGA database not found");
  }

  const outputFile = "src/data.json";
  await mkdir(dirname(outputFile), {recursive: true});
  await writeFile(outputFile, JSON.stringify(cardData));
})();

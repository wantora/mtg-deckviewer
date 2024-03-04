"use strict";

const fsPromises = require("node:fs/promises");
const https = require("node:https");
const path = require("node:path");

const OVERRIDE_CARDS = [
  "https://api.scryfall.com/cards/thb/250",
  "https://api.scryfall.com/cards/thb/251",
  "https://api.scryfall.com/cards/thb/252",
  "https://api.scryfall.com/cards/thb/253",
  "https://api.scryfall.com/cards/thb/254",
];

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

function getNormalizedName(cardObject) {
  let name;
  if (cardObject.card_faces) {
    name = cardObject.card_faces[0].name;
  } else {
    name = cardObject.name;
  }

  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
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

    cardNames[getNormalizedName(cardObject)] = index;
  }

  return {cards, cardNames};
}

function httpGet(uri) {
  return new Promise((resolve, reject) => {
    https.get(uri, (res) => {
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
    });
  });
}

async function cacheHttpGet(uri) {
  const cacheFile = path.join("cache", path.basename(uri));

  try {
    return await fsPromises.readFile(cacheFile, {encoding: "utf8"});
  } catch (error) {
    const data = await httpGet(uri);

    await fsPromises.mkdir(path.dirname(cacheFile), {recursive: true});
    await fsPromises.writeFile(cacheFile, data);
    return data;
  }
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

  const outputFile = "src/data.json";
  await fsPromises.mkdir(path.dirname(outputFile), {recursive: true});
  await fsPromises.writeFile(outputFile, JSON.stringify(cardData));
})();

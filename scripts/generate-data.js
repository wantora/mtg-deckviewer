"use strict";

const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
const {Readable} = require("node:stream");
const {pipeline} = require("node:stream/promises");
const StreamArray = require("stream-json/streamers/StreamArray");

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

function getImage(cardObject) {
  if (cardObject.image_uris) {
    return cardObject.image_uris.small;
  } else if (cardObject.card_faces && cardObject.card_faces[0].image_uris) {
    return cardObject.card_faces[0].image_uris.small;
  }
  return null;
}

function oracleCardsParser() {
  const cards = [];
  const cardNames = {};

  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const stream = new WritableStream({
    write(chunk) {
      const cardObject = chunk.value;

      if (!checkLegal(cardObject.legalities)) {
        return;
      }

      const card = {
        name: getArenaName(cardObject),
        cmc: cardObject.cmc,
        type: parseTypeLine(cardObject.type_line),
        color: getColor(cardObject),
        uri: cardObject.scryfall_uri,
        image: getImage(cardObject),
      };
      cards.push(card);
      const index = cards.length - 1;

      if (cardObject.card_faces) {
        cardNames[cardObject.card_faces[0].name] = index;
      } else {
        cardNames[cardObject.name] = index;
      }
    },
    close() {
      resolve({cards, cardNames});
    },
    abort() {
      reject();
    },
  });

  return {stream, promise};
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
        resolve(rawData);
      });
    });
  });
}

async function cacheHttpGet(uri) {
  const cacheFile = path.join("cache", path.basename(uri));

  if (fs.existsSync(cacheFile)) {
    return fs.createReadStream(cacheFile);
  } else {
    fs.mkdirSync(path.dirname(cacheFile), {recursive: true});

    const res = await new Promise((resolve, reject) => {
      https.get(uri, (r) => {
        resolve(r);
      });
    });

    const streams = Readable.toWeb(res).tee();
    pipeline(streams[0], fs.createWriteStream(cacheFile));
    return streams[1];
  }
}

(async () => {
  const oracleCardsData = JSON.parse(
    await httpGet("https://api.scryfall.com/bulk-data/oracle-cards")
  );
  const oracleCards = oracleCardsParser();

  await pipeline(
    await cacheHttpGet(oracleCardsData.download_uri),
    StreamArray.withParser(),
    oracleCards.stream
  );

  const cardData = await oracleCards.promise;
  cardData.updatedAt = Date.parse(oracleCardsData.updated_at);

  const outputFile = "src/data.json";

  fs.mkdirSync(path.dirname(outputFile), {recursive: true});
  fs.writeFileSync(outputFile, JSON.stringify(cardData));
})();

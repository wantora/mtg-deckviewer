function checkLand(type) {
  if (type.includes("Land")) {
    return 1;
  } else {
    return 0;
  }
}

function getColorOrder(color) {
  if (color.length === 0) {
    return 100;
  } else {
    return color.length;
  }
}

const COLOR_NAMES = ["W", "U", "B", "R", "G"];
function getColorNameOrder(colorName) {
  const index = COLOR_NAMES.indexOf(colorName);
  if (index === -1) {
    return 100;
  } else {
    return index;
  }
}

function compareCards(a, b) {
  const land = checkLand(a.data.type) - checkLand(b.data.type);
  if (land !== 0) {
    return land;
  }
  const cmc = a.data.cmc - b.data.cmc;
  if (cmc !== 0) {
    return cmc;
  }
  const color = getColorOrder(a.data.color) - getColorOrder(b.data.color);
  if (color !== 0) {
    return color;
  }
  const colorName =
    getColorNameOrder(a.data.color[0]) - getColorNameOrder(b.data.color[0]);
  if (colorName !== 0) {
    return colorName;
  }
  if (a.data.name < b.data.name) {
    return -1;
  }
  if (a.data.name > b.data.name) {
    return 1;
  }
  return 0;
}

function getCardData(str, cardData) {
  const index = cardData.cardNames[str.replace(/ *\/{1,2} *.*$/, "")];
  if (index === undefined) {
    return {
      name: str,
      cmc: 0,
      type: [],
      color: [],
      uri: null,
      image: null,
    };
  } else {
    return cardData.cards[index];
  }
}

const SECTION_NAMES = ["Commander", "Companion", "Deck", "Sideboard"];

export default class Decklist {
  constructor(decklistText, cardData) {
    this.name = null;
    this.sections = [];

    if (!cardData) {
      return;
    }

    const sectionMap = new Map(SECTION_NAMES.map((name) => [name, new Map()]));

    for (const sectionSrc of decklistText.trim().split(/\n{2,}/)) {
      const lines = sectionSrc
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");

      let cardMap;
      if (lines[0] === "About") {
        // https://magic.wizards.com/en/news/mtg-arena/mtg-arena-announcements-february-19-2024
        lines.shift();
        for (const line of lines) {
          const m = line.match(/^Name (.*)$/);
          if (m) {
            this.name = m[1];
          }
        }
        continue;
      } else if (SECTION_NAMES.includes(lines[0])) {
        cardMap = sectionMap.get(lines.shift());
      } else if (sectionMap.get("Deck").size === 0) {
        cardMap = sectionMap.get("Deck");
      } else {
        cardMap = sectionMap.get("Sideboard");
      }

      for (const line of lines) {
        const m = line.match(/^(\d+)\s+(.*?)(?:\s+\(\w*\)\s+\d*)?$/);
        const count = m ? parseInt(m[1], 10) : 1;
        const name = m ? m[2] : line;
        const data = getCardData(name, cardData);

        if (cardMap.has(data.name)) {
          cardMap.get(data.name).count += count;
        } else {
          cardMap.set(data.name, {count, data});
        }
      }
    }

    for (const name of SECTION_NAMES) {
      const cardMap = sectionMap.get(name);
      if (cardMap.size > 0) {
        this.sections.push({
          name: name,
          cards: Array.from(cardMap.values()).sort(compareCards),
        });
      }
    }
  }
  toArenaDecklist() {
    const texts = this.sections.map((section) => {
      const cards = section.cards.map(
        (card) => `${card.count} ${card.data.name}`
      );
      return `${section.name}\n${cards.join("\n")}`;
    });

    if (this.name) {
      texts.unshift(`About\nName ${this.name}`);
    }

    return texts.join("\n\n") + "\n";
  }
}

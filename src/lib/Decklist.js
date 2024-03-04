const COLOR_NAMES = ["W", "U", "B", "R", "G"];
export const SECTION_NAMES = ["Commander", "Companion", "Deck", "Sideboard"];

function compareNumber(fn) {
  return (a, b) => fn(a) - fn(b);
}

function compareString(fn) {
  return (a, b) => {
    const aStr = fn(a);
    const bStr = fn(b);
    if (aStr < bStr) {
      return -1;
    }
    if (aStr > bStr) {
      return 1;
    }
    return 0;
  };
}

function compareFns(fns) {
  return (a, b) => {
    for (const fn of fns) {
      const order = fn(a, b);
      if (order !== 0) {
        return order;
      }
    }
    return 0;
  };
}

const compareCardFns = [
  compareNumber((card) => (card.data.type.includes("Land") ? 1 : 0)),
  compareNumber((card) => card.data.cmc),
  compareNumber((card) => {
    return card.data.color.length === 0 ? 100 : card.data.color.length;
  }),
  compareNumber((card) => {
    const index = COLOR_NAMES.indexOf(card.data.color[0]);
    return index === -1 ? 100 : index;
  }),
  compareString((card) => card.data.name),
];

function getCardData(str, cardData) {
  const name = str
    .replace(/ *\/{1,2} *.*$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");

  const index = cardData.cardNames[name];
  if (index === undefined) {
    return {
      name: str,
      cmc: 0,
      type: [],
      color: [],
      arena: false,
      uri: null,
      image: null,
    };
  } else {
    return cardData.cards[index];
  }
}

function newSectionMap() {
  return new Map(SECTION_NAMES.map((name) => [name, new Map()]));
}

function generateSections(sectionMap) {
  const sections = [];
  for (const name of SECTION_NAMES) {
    const cardMap = sectionMap.get(name);
    if (cardMap.size > 0) {
      sections.push({
        name: name,
        cards: Array.from(cardMap.values()).sort(compareFns(compareCardFns)),
      });
    }
  }
  return sections;
}

export function compareDecklist(decklists) {
  const commonMap = newSectionMap();
  const diffMaps = decklists.map(() => newSectionMap());

  const sectionMaps = decklists.map((decklist) => decklist.sectionMap);

  for (const [sectionName, cardMap] of sectionMaps[0]) {
    for (const [cardName, card] of cardMap) {
      const minCount = Math.min(
        ...sectionMaps.map(
          (s) => (s.get(sectionName).get(cardName) || {count: 0}).count
        )
      );

      if (minCount > 0) {
        commonMap.get(sectionName).set(cardName, {
          count: minCount,
          data: card.data,
        });

        sectionMaps.forEach((sectionMap, index) => {
          const c = sectionMap.get(sectionName).get(cardName);
          if (c) {
            const count = c.count - minCount;
            if (count > 0) {
              diffMaps[index].get(sectionName).set(cardName, {
                count: count,
                data: card.data,
              });
            }
          }
        });
      }
    }
  }

  sectionMaps.forEach((sectionMap, index) => {
    for (const [sectionName, cardMap] of sectionMap) {
      for (const [cardName, card] of cardMap) {
        if (!commonMap.get(sectionName).has(cardName)) {
          diffMaps[index].get(sectionName).set(cardName, card);
        }
      }
    }
  });

  return [commonMap, ...diffMaps].map((sectionMap) =>
    generateSections(sectionMap)
  );
}

export default class Decklist {
  constructor(decklistText, cardData) {
    this.name = null;
    this.sectionMap = newSectionMap();

    if (!cardData) {
      return;
    }

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
        cardMap = this.sectionMap.get(lines.shift());
      } else if (this.sectionMap.get("Deck").size === 0) {
        cardMap = this.sectionMap.get("Deck");
      } else {
        cardMap = this.sectionMap.get("Sideboard");
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
  }
  get sections() {
    return generateSections(this.sectionMap);
  }
  get arenaUnavailableCards() {
    const unavailableCards = [];
    for (const section of this.sections) {
      for (const card of section.cards) {
        if (!card.data.arena) {
          unavailableCards.push(card);
        }
      }
    }
    return unavailableCards;
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

const COLOR_NAMES = ["W", "U", "B", "R", "G"];
export const SECTION_NAMES = ["Commander", "Companion", "Deck", "Sideboard"];

const SECTION_NAME_LOC = new Map([
  // enUS
  ["About", "About"],
  ["Commander", "Commander"],
  ["Companion", "Companion"],
  ["Deck", "Deck"],
  ["Sideboard", "Sideboard"],

  // ptBR
  ["Comandante", "Commander"],
  ["Companheiro", "Companion"],
  ["Deck", "Deck"],
  ["Reserva", "Sideboard"],

  // frFR
  ["Commandant", "Commander"],
  ["Compagnon", "Companion"],
  ["Deck", "Deck"],
  ["Réserve", "Sideboard"],

  // itIT
  ["Comandante", "Commander"],
  ["Compagno", "Companion"],
  ["Mazzo", "Deck"],
  ["Sideboard", "Sideboard"],

  // deDE
  ["Kommandeur", "Commander"],
  ["Gefährte", "Companion"],
  ["Deck", "Deck"],
  ["Sideboard", "Sideboard"],

  // esES
  ["Comandante", "Commander"],
  ["Compañero", "Companion"],
  ["Mazo", "Deck"],
  ["Sideboard", "Sideboard"],

  // jaJP
  ["統率者", "Commander"],
  ["相棒", "Companion"],
  ["デッキ", "Deck"],
  ["サイドボード", "Sideboard"],

  // koKR
  ["커맨더", "Commander"],
  ["단짝", "Companion"],
  ["덱", "Deck"],
  ["사이드보드", "Sideboard"],
]);

function removeDiacriticalMarks(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
}

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
  compareNumber((card) =>
    card.data.color.length === 0 ? 100 : card.data.color.length
  ),
  compareNumber((card) => {
    const index = COLOR_NAMES.indexOf(card.data.color[0]);
    return index === -1 ? 100 : index;
  }),
  compareString((card) => card.data.name),
];

function getCardData(str, cardData) {
  let name = str.replace(/ *(?:\/|\/\/|&&) *.*$/, "");
  if (!Object.hasOwn(cardData.cardNames, name)) {
    name = removeDiacriticalMarks(name);
  }

  if (Object.hasOwn(cardData.cardNames, name)) {
    return cardData.cards[cardData.cardNames[name]];
  } else {
    return {
      name: str,
      cmc: 0,
      type: [],
      color: [],
      uri: null,
      image: null,
    };
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
      const cards = Array.from(cardMap.values()).sort(
        compareFns(compareCardFns)
      );
      const typeCount = {
        land: 0,
        creature: 0,
        spell: 0,
      };

      for (const card of cards) {
        if (card.data.type.includes("Land")) {
          typeCount.land += card.count;
        } else if (card.data.type.includes("Creature")) {
          typeCount.creature += card.count;
        } else {
          typeCount.spell += card.count;
        }
      }

      sections.push({
        name: name,
        cards: cards,
        typeCount: typeCount,
      });
    }
  }
  return sections;
}

function parseDecklistText(text) {
  let sections = [];
  let currentSection = {name: null, lines: []};
  sections.push(currentSection);

  let lines = text.trim().split("\n");

  // fix reddit decklist
  if (lines.every((s, i) => s === "" || !lines[i + 1])) {
    const newLines = lines.filter((s, i) => !(s === "" && lines[i - 1]));
    if (newLines.length >= 3) {
      lines = newLines;
    }
  }

  for (const line of lines.map((s) => s.trim())) {
    if (line === "" || SECTION_NAME_LOC.has(line)) {
      currentSection = {
        name: SECTION_NAME_LOC.has(line) ? SECTION_NAME_LOC.get(line) : null,
        lines: [],
      };
      sections.push(currentSection);
    } else {
      currentSection.lines.push(line);
    }
  }

  sections = sections.filter((section) => section.lines.length > 0);

  for (const section of sections) {
    if (section.name === null) {
      if (sections.some((s) => s.name === "Deck")) {
        section.name = "Sideboard";
      } else {
        section.name = "Deck";
      }
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

    for (const section of parseDecklistText(decklistText)) {
      if (section.name === "About") {
        // https://magic.wizards.com/en/news/mtg-arena/mtg-arena-announcements-february-19-2024
        for (const line of section.lines) {
          const m = line.match(/^Name (.*)$/);
          if (m) {
            this.name = m[1];
          }
        }
      } else {
        const cardMap = this.sectionMap.get(section.name);

        for (const line of section.lines) {
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
  }
  get sections() {
    return generateSections(this.sectionMap);
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

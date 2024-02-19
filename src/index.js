import {
  createApp,
  ref,
  computed,
} from "https://cdnjs.cloudflare.com/ajax/libs/vue/3.4.18/vue.esm-browser.prod.min.js";
import BalloonMessage from "./components/BalloonMessage.js";

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

function parseDecklist(src, cardData) {
  const sectionMap = new Map(SECTION_NAMES.map((name) => [name, new Map()]));
  let deckName = null;

  for (const sectionSrc of src.trim().split(/\n{2,}/)) {
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
          deckName = m[1];
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

  const sections = [];

  for (const name of SECTION_NAMES) {
    const cardMap = sectionMap.get(name);
    if (cardMap.size > 0) {
      sections.push({
        name: name,
        cards: Array.from(cardMap.values()).sort(compareCards),
      });
    }
  }

  return {name: deckName, sections: sections};
}

function getBackgroundImage(card) {
  const image = card.data.image;
  if (image) {
    return {backgroundImage: `url(${image})`};
  } else {
    return {};
  }
}

function getDeckURL(decklist) {
  if (decklist.trim().length === 0) {
    return null;
  } else {
    const url = new URL(location.origin + location.pathname);
    url.searchParams.set("deck", decklist);

    return url.href;
  }
}

createApp({
  components: {
    BalloonMessage,
  },
  setup() {
    const decklistText = ref("");
    const deck = computed(() => {
      if (cardData.value) {
        return parseDecklist(decklistText.value, cardData.value);
      } else {
        return {name: null, sections: []};
      }
    });
    const cardData = ref(null);
    const showCopyArenaDecklistMessage = ref(false);

    async function copyArenaDecklist() {
      let text =
        deck.value.sections
          .map(
            (section) =>
              `${section.name}\n${section.cards.map((card) => `${card.count} ${card.data.name}`).join("\n")}`
          )
          .join("\n\n") + "\n";

      if (deck.value.name) {
        text = `About\nName ${deck.value.name}\n\n${text}`;
      }

      await navigator.clipboard.writeText(text);
      showCopyArenaDecklistMessage.value = true;

      setTimeout(() => {
        showCopyArenaDecklistMessage.value = false;
      }, 1000);
    }

    (async () => {
      const res = await fetch("data.json");
      cardData.value = await res.json();
    })();

    const search = new URLSearchParams(location.search);
    if (search.has("deck")) {
      decklistText.value = search.get("deck");
    }

    return {
      decklistText,
      deck,
      cardData,
      getBackgroundImage,
      getDeckURL,
      copyArenaDecklist,
      showCopyArenaDecklistMessage,
    };
  },
}).mount("#app");

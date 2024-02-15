import {
  createApp,
  ref,
  computed,
} from "https://cdnjs.cloudflare.com/ajax/libs/vue/3.4.18/vue.esm-browser.prod.min.js";

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

function parseDecklist(src, cardData) {
  const sections = [];

  for (const sectionSrc of src.trim().split(/\n{2,}/)) {
    const lines = sectionSrc
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    const section = {
      cards: null,
      name: null,
    };
    const cards = new Map();

    if (
      lines[0] === "Companion" ||
      lines[0] === "Commander" ||
      lines[0] === "Deck" ||
      lines[0] === "Sideboard"
    ) {
      section.name = lines.shift();
    } else if (sections.every((sec) => sec.name !== "Deck")) {
      section.name = "Deck";
    } else {
      section.name = "Sideboard";
    }

    for (const line of lines) {
      const m = line.match(/^(\d+)\s+(.*?)(?:\s+\(\w*\)\s+\d*)?$/);
      const count = m ? parseInt(m[1], 10) : 1;
      const name = m ? m[2] : line;
      const data = getCardData(name, cardData);

      const card = cards.get(data.name);
      if (card) {
        card.count += count;
      } else {
        cards.set(data.name, {count, data});
      }
    }
    section.cards = Array.from(cards.values()).sort(compareCards);

    if (section.cards.length > 0) {
      sections.push(section);
    }
  }

  return sections;
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
  setup() {
    const decklist = ref("");
    const deck = computed(() => {
      if (cardData.value) {
        return parseDecklist(decklist.value, cardData.value);
      } else {
        return [];
      }
    });
    const cardData = ref(null);

    (async () => {
      const res = await fetch("data.json");
      cardData.value = await res.json();
    })();

    const search = new URLSearchParams(location.search);
    if (search.has("deck")) {
      decklist.value = search.get("deck");
    }

    return {
      decklist,
      deck,
      cardData,
      getBackgroundImage,
      getDeckURL,
    };
  },
}).mount("#app");

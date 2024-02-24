import {
  createApp,
  ref,
  shallowRef,
  computed,
} from "https://cdnjs.cloudflare.com/ajax/libs/vue/3.4.18/vue.esm-browser.prod.min.js";
import CopyButton from "./components/CopyButton.js";
import Decklist, {SECTION_NAMES, compareDecklist} from "./lib/Decklist.js";

function getBackgroundImage(imageUrl) {
  if (imageUrl) {
    return {backgroundImage: `url(${imageUrl})`};
  } else {
    return {};
  }
}

function getCopyMessage(decklist) {
  const arenaUnavailableCards = decklist.arenaUnavailableCards;
  if (arenaUnavailableCards.length > 0) {
    return (
      "Copied!\nUnavailable cards:\n" +
      arenaUnavailableCards.map((card) => card.data.name).join("\n")
    );
  } else {
    return "Copied!";
  }
}

createApp({
  components: {
    CopyButton,
  },
  setup() {
    const compareMode = ref(false);
    const decklistTexts = ref([""]);
    const decklists = computed(() =>
      decklistTexts.value.map((text) => new Decklist(text, cardData.value))
    );
    const sectionsList = computed(() => {
      if (compareMode.value && decklists.value.length > 1) {
        return compareDecklist(decklists.value);
      } else {
        return decklists.value.map((decklist) => decklist.sections);
      }
    });
    const cardData = shallowRef(null);

    function getPermalink() {
      const url = new URL(location.origin + location.pathname);
      for (const text of decklistTexts.value) {
        if (text.trim() !== "") {
          url.searchParams.append("deck", text);
        }
      }

      return url.href;
    }

    function getSectionIndex(name) {
      return SECTION_NAMES.indexOf(name);
    }

    (async () => {
      const res = await fetch("data.json");
      cardData.value = await res.json();
    })();

    const search = new URLSearchParams(location.search);
    if (search.has("deck")) {
      search.getAll("deck").forEach((text, index) => {
        decklistTexts.value[index] = text;
      });
    }

    return {
      compareMode,
      decklistTexts,
      decklists,
      sectionsList,
      cardData,
      getBackgroundImage,
      getCopyMessage,
      getPermalink,
      getSectionIndex,
    };
  },
}).mount("#app");

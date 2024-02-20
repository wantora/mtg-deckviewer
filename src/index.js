import {
  createApp,
  ref,
  shallowRef,
  computed,
} from "https://cdnjs.cloudflare.com/ajax/libs/vue/3.4.18/vue.esm-browser.prod.min.js";
import CopyButton from "./components/CopyButton.js";
import Decklist, {SECTION_NAMES} from "./lib/Decklist.js";

function getBackgroundImage(imageUrl) {
  if (imageUrl) {
    return {backgroundImage: `url(${imageUrl})`};
  } else {
    return {};
  }
}

createApp({
  components: {
    CopyButton,
  },
  setup() {
    const decklistTexts = ref([""]);
    const decklists = computed(() =>
      decklistTexts.value.map((text) => new Decklist(text, cardData.value))
    );
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
      decklistTexts,
      decklists,
      cardData,
      getBackgroundImage,
      getPermalink,
      getSectionIndex,
    };
  },
}).mount("#app");

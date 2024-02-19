import {
  createApp,
  ref,
  shallowRef,
  computed,
} from "https://cdnjs.cloudflare.com/ajax/libs/vue/3.4.18/vue.esm-browser.prod.min.js";
import BalloonMessage from "./components/BalloonMessage.js";
import Decklist from "./lib/Decklist.js";

function getBackgroundImage(imageUrl) {
  if (imageUrl) {
    return {backgroundImage: `url(${imageUrl})`};
  } else {
    return {};
  }
}

createApp({
  components: {
    BalloonMessage,
  },
  setup() {
    const decklistText = ref("");
    const deck = computed(
      () => new Decklist(decklistText.value, cardData.value)
    );
    const cardData = shallowRef(null);
    const showCopyArenaDecklistMessage = ref(false);

    async function copyArenaDecklist() {
      await navigator.clipboard.writeText(deck.value.toArenaDecklist());
      showCopyArenaDecklistMessage.value = true;

      setTimeout(() => {
        showCopyArenaDecklistMessage.value = false;
      }, 1000);
    }

    function getPermalink() {
      const url = new URL(location.origin + location.pathname);
      url.searchParams.set("deck", decklistText.value);

      return url.href;
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
      getPermalink,
      copyArenaDecklist,
      showCopyArenaDecklistMessage,
    };
  },
}).mount("#app");

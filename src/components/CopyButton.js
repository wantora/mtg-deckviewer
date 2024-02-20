import {ref} from "https://cdnjs.cloudflare.com/ajax/libs/vue/3.4.18/vue.esm-browser.prod.min.js";

export default {
  setup() {
    const showBalloon = ref(false);

    async function copyText(text) {
      await navigator.clipboard.writeText(text);
      showBalloon.value = true;

      setTimeout(() => {
        showBalloon.value = false;
      }, 1000);
    }

    return {
      showBalloon,
      copyText,
    };
  },
  props: {
    text: String,
  },
  template: `
  <button @click="copyText(text)"><slot>Copy</slot></button>
  <transition name="BalloonMessage">
    <span v-if="showBalloon" class="BalloonMessage">Copied!</span>
  </transition>
  `,
};

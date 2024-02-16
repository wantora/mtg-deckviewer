export default {
  props: {
    show: Boolean,
  },
  template: `
  <transition name="BalloonMessage">
    <span v-if="show" class="BalloonMessage">
      <slot>message</slot>
    </span>
  </transition>
  `,
};

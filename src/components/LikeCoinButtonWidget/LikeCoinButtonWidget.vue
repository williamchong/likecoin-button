<template>
  <div :style="rootStyle">
    <hr
      v-if="isStickyBottomLayout"
      :style="hrStyle"
    >
    <svg
      :style="svgStyle"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 480 180"
    >
      <slot
        v-bind="identitySlotProps"
        name="identity"
      >
        <Identity v-bind="identitySlotProps" />
      </slot>
      <!-- Avatar Label -->
      <foreignObject
        :y="labelY"
        x="202"
        width="68"
        height="32"
      >
        <div :style="labelStyle">{{ avatarLabel }}</div>
      </foreignObject>

      <!-- Save button -->
      <slot
        v-bind="saveSlotProps"
        name="save-button"
      >
        <SaveButton v-bind="saveSlotProps" />
      </slot>
      <!-- Save Button Label -->
      <foreignObject
        :y="labelY"
        x="144"
        width="52"
        height="32"
      >
        <div :style="labelStyle">{{ saveButtonLabel }}</div>
      </foreignObject>

      <!-- Like Button -->
      <slot name="like-button">
        <LikeButton />
      </slot>
      <!-- Like Button Label -->
      <foreignObject
        :y="labelY"
        x="28"
        width="100"
        height="32"
      >
        <div :style="labelStyle">{{ likeButtonLabel }}</div>
      </foreignObject>
    </svg>
  </div>
</template>

<script>
import Identity from '../Identity/Identity';
import LikeButton from '../LikeButtonV2/LikeButtonV2';
import SaveButton from '../SaveButton/SaveButton';

export const LAYOUT_DEFAULT = 'default';
export const LAYOUT_STICKY_BOTTOM = 'sticky-bottom';
export const LAYOUTS = [LAYOUT_DEFAULT, LAYOUT_STICKY_BOTTOM];

export default {
  name: 'likecoin-button-widget',
  components: {
    Identity,
    LikeButton,
    SaveButton,
  },
  props: {
    layout: {
      type: String,
      validator: value => LAYOUTS.includes(value),
      default: LAYOUT_DEFAULT,
    },
    likeButtonLabel: {
      type: String,
      default: '',
    },
    saveButtonLabel: {
      type: String,
      default: '',
    },
    avatarLabel: {
      type: String,
      default: '',
    },
    avatarURL: {
      type: String,
      default: '',
    },
    displayName: {
      type: String,
      default: '',
    },
  },
  computed: {
    isStickyBottomLayout() {
      return this.layout === LAYOUT_STICKY_BOTTOM;
    },
    rootStyle() {
      const style = {};
      if (this.isStickyBottomLayout) {
        style.background = '#fff';
        style.marginTop = '28px';
        style.height = '100px';
      }
      return style;
    },
    hrStyle() {
      return {
        border: 'none',
        height: '3px',
        margin: 0,
        padding: 0,
        backgroundImage: 'linear-gradient(90deg,#d2f0f0,#f0e6b4)',
      };
    },
    svgStyle() {
      const style = {
        display: 'inline-block',
        width: '100%',
        userSelect: 'none',
      };
      if (this.isStickyBottomLayout) {
        style.marginTop = '-52px';
        style.marginLeft = '-10px';
        style.maxWidth = '400px';
      } else {
        style.maxWidth = '480px';
      }
      return style;
    },
    identitySlotProps() {
      return {
        x: 209,
        y: 63,
      };
    },
    saveSlotProps() {
      return {
        x: 148,
        y: 78,
      };
    },
    labelY() {
      return 140;
    },
    labelStyle() {
      return {
        color: '#9B9B9B',
        fontFamily: 'Arial, serif',
        fontSize: '14px',
        textAlign: 'center',
        width: '100%',
      };
    },
  },
};
</script>
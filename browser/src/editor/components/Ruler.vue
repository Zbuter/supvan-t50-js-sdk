<script setup lang="ts">
import { computed } from "vue";

import { buildRulerScale } from "../services/ruler";

const props = defineProps<{
  orientation: "horizontal" | "vertical";
  lengthMillimeters: number;
  lengthPixels: number;
}>();

const scale = computed(() => buildRulerScale(props.lengthMillimeters, props.lengthPixels));
</script>

<template>
  <div
    class="paper-ruler"
    :class="`paper-ruler--${orientation}`"
    :style="orientation === 'horizontal' ? { width: `${lengthPixels}px` } : { height: `${lengthPixels}px` }"
    aria-hidden="true"
  >
    <template v-for="tick in scale.ticks" :key="`${orientation}-${tick.value}`">
      <span
        class="paper-ruler__tick"
        :class="{ 'paper-ruler__tick--major': tick.major }"
        :style="orientation === 'horizontal' ? { left: `${tick.position}px` } : { top: `${tick.position}px` }"
      />
      <span
        v-if="tick.major"
        class="paper-ruler__label"
        :class="{ 'paper-ruler__label--origin': tick.value === 0 }"
        :style="orientation === 'horizontal' ? { left: `${tick.position}px` } : { top: `${tick.position}px` }"
      >{{ tick.label }}</span>
    </template>
    <span v-if="orientation === 'horizontal'" class="paper-ruler__unit">mm</span>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

import type { LabelEditor } from "../composables/useLabelEditor";

const props = defineProps<{
  editor: LabelEditor;
  displayWidth: number;
  displayHeight: number;
}>();

const viewport = ref<HTMLElement>();
const canvasElement = ref<HTMLCanvasElement>();
let fitFrame: number | undefined;

function fit(): void {
  if (!viewport.value) return;
  const style = getComputedStyle(viewport.value);
  const horizontalPadding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
  const verticalPadding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
  props.editor.fitToArea(
    Math.max(1, viewport.value.clientWidth - horizontalPadding),
    Math.max(1, viewport.value.clientHeight - verticalPadding),
  );
}

function scheduleFit(): void {
  if (fitFrame !== undefined) cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => {
    fitFrame = undefined;
    fit();
  });
}

function zoomWithWheel(event: WheelEvent): void {
  props.editor.zoomWithWheel(event);
}

watch(
  () => [props.editor.label.width, props.editor.label.height, props.editor.previewRotation.value],
  scheduleFit,
  { flush: "post" },
);

onMounted(async () => {
  if (!canvasElement.value || !viewport.value) return;
  await props.editor.initialize(canvasElement.value);
  if (!viewport.value) return;
});

onBeforeUnmount(() => {
  if (fitFrame !== undefined) cancelAnimationFrame(fitFrame);
  void props.editor.dispose();
});
</script>

<template>
  <div ref="viewport" class="canvas-viewport" @wheel="zoomWithWheel">
    <div class="paper-ruler paper-ruler--horizontal" :style="{ width: `${displayWidth}px` }" />
    <div class="paper-ruler paper-ruler--vertical" :style="{ height: `${displayHeight}px` }" />
    <div
      class="paper-wrap"
      :style="{ width: `${displayWidth}px`, height: `${displayHeight}px` }"
      :data-size="`${editor.label.width} x ${editor.label.height} mm`"
    >
      <canvas ref="canvasElement" aria-label="可编辑标签画布" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import type { LabelEditor } from "../composables/useLabelEditor";
import { RULER_SIZE } from "../services/ruler";
import Ruler from "./Ruler.vue";

const props = defineProps<{
  editor: LabelEditor;
  displayWidth: number;
  displayHeight: number;
}>();

const viewport = ref<HTMLElement>();
const canvasElement = ref<HTMLCanvasElement>();
let fitFrame: number | undefined;
const spacePressed = ref(false);
const panning = ref(false);
let panPointerId: number | undefined;
let panStartX = 0;
let panStartY = 0;
let panScrollLeft = 0;
let panScrollTop = 0;

const horizontalLengthMillimeters = computed(() =>
  props.editor.previewRotation.value % 2 === 0 ? props.editor.label.width : props.editor.label.height,
);
const verticalLengthMillimeters = computed(() =>
  props.editor.previewRotation.value % 2 === 0 ? props.editor.label.height : props.editor.label.width,
);

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

function fit(): void {
  if (!viewport.value) return;
  const style = getComputedStyle(viewport.value);
  const horizontalPadding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
  const verticalPadding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
  props.editor.fitToArea(
    Math.max(1, viewport.value.clientWidth - horizontalPadding - RULER_SIZE),
    Math.max(1, viewport.value.clientHeight - verticalPadding - RULER_SIZE),
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

function handleKeyDown(event: KeyboardEvent): void {
  if (event.code !== "Space" || isTypingTarget(event.target)) return;
  spacePressed.value = true;
  event.preventDefault();
}

function handleKeyUp(event: KeyboardEvent): void {
  if (event.code === "Space") spacePressed.value = false;
}

function startPan(event: PointerEvent): void {
  const isMiddleButton = event.button === 1;
  const isSpacePan = event.button === 0 && spacePressed.value;
  if (!viewport.value || (!isMiddleButton && !isSpacePan)) return;
  event.preventDefault();
  event.stopPropagation();
  panning.value = true;
  panPointerId = event.pointerId;
  panStartX = event.clientX;
  panStartY = event.clientY;
  panScrollLeft = viewport.value.scrollLeft;
  panScrollTop = viewport.value.scrollTop;
  viewport.value.setPointerCapture?.(event.pointerId);
}

function movePan(event: PointerEvent): void {
  if (!panning.value || panPointerId !== event.pointerId || !viewport.value) return;
  event.preventDefault();
  event.stopPropagation();
  viewport.value.scrollLeft = panScrollLeft - (event.clientX - panStartX);
  viewport.value.scrollTop = panScrollTop - (event.clientY - panStartY);
}

function stopPan(event?: PointerEvent): void {
  if (!panning.value || (event && panPointerId !== event.pointerId)) return;
  event?.preventDefault();
  event?.stopPropagation();
  const pointerId = event?.pointerId ?? panPointerId;
  if (pointerId !== undefined && viewport.value?.hasPointerCapture?.(pointerId)) viewport.value.releasePointerCapture(pointerId);
  panning.value = false;
  panPointerId = undefined;
}

function handleBlur(): void {
  spacePressed.value = false;
  stopPan();
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
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", handleBlur);
});

onBeforeUnmount(() => {
  if (fitFrame !== undefined) cancelAnimationFrame(fitFrame);
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
  window.removeEventListener("blur", handleBlur);
  spacePressed.value = false;
  stopPan();
  void props.editor.dispose();
});
</script>

<template>
  <div
    ref="viewport"
    class="canvas-viewport"
    :class="{ 'is-panning': panning, 'space-pan-ready': spacePressed }"
    @wheel="zoomWithWheel"
    @pointerdown.capture="startPan"
    @pointermove.capture="movePan"
    @pointerup.capture="stopPan"
    @pointercancel.capture="stopPan"
  >
    <div
      class="canvas-stage"
      :style="{ width: `${displayWidth + RULER_SIZE}px`, height: `${displayHeight + RULER_SIZE}px` }"
    >
      <Ruler
        orientation="horizontal"
        :length-millimeters="horizontalLengthMillimeters"
        :length-pixels="displayWidth"
      />
      <Ruler
        orientation="vertical"
        :length-millimeters="verticalLengthMillimeters"
        :length-pixels="displayHeight"
      />
      <div
        class="paper-wrap"
        :style="{ width: `${displayWidth}px`, height: `${displayHeight}px` }"
        :data-size="`${editor.label.width} x ${editor.label.height} mm`"
      >
        <canvas ref="canvasElement" aria-label="可编辑标签画布" />
      </div>
    </div>
  </div>
</template>

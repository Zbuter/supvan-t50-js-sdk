<script setup lang="ts">
import { Copy, Minus, Plus, RotateCw, Trash2 } from "@lucide/vue";
import { computed } from "vue";

import type { SelectionModel } from "../types";

const props = defineProps<{
  selection: SelectionModel;
  zoom: number;
  dotsPerMm: number;
  paperWidth: number;
  rotated: boolean;
}>();

const emit = defineEmits<{
  scale: [factor: number];
  rotate: [delta: number];
  duplicate: [];
  remove: [];
}>();

const placement = computed(() => {
  const scale = props.zoom * props.dotsPerMm;
  const objectWidth = props.selection.width * scale;
  const objectHeight = props.selection.height * scale;
  const objectLeft = props.rotated
    ? props.paperWidth - (props.selection.y * scale + objectHeight)
    : props.selection.x * scale;
  const objectTop = props.rotated ? props.selection.x * scale : props.selection.y * scale;
  const displayWidth = props.rotated ? objectHeight : objectWidth;
  const displayHeight = props.rotated ? objectWidth : objectHeight;
  const desiredLeft = Math.max(0, objectLeft + displayWidth / 2);
  // Keep the toolbar inside the canvas column. Without this clamp, a QR code
  // near the right edge makes the toolbar overlap the inspector panel.
  const toolbarHalfWidth = 152;
  const minLeft = toolbarHalfWidth;
  const maxLeft = Math.max(minLeft, props.paperWidth - toolbarHalfWidth);
  const left = Math.min(maxLeft, Math.max(minLeft, desiredLeft));
  const safeObjectTop = Math.max(0, objectTop);
  const objectBottom = safeObjectTop + Math.max(24, displayHeight);
  // Put the toolbar above the object when possible. For objects near the top
  // edge, place it below so the canvas viewport does not clip the controls.
  const above = safeObjectTop >= 52;
  const top = above ? safeObjectTop - 50 : objectBottom + 8;
  return { left: `${left}px`, top: `${top}px`, below: !above };
});
</script>

<template>
  <div
    class="selection-popover"
    :class="{ 'is-below': placement.below }"
    :style="placement"
    role="toolbar"
    aria-label="选中对象快捷操作"
    @pointerdown.stop
    @mousedown.stop
  >
    <button type="button" title="放大对象" @click.stop="emit('scale', 1.1)">
      <Plus :size="15" />
      <span>放大</span>
    </button>
    <button type="button" title="缩小对象" @click.stop="emit('scale', 0.9)">
      <Minus :size="15" />
      <span>缩小</span>
    </button>
    <button type="button" title="顺时针旋转 15°" @click.stop="emit('rotate', 15)">
      <RotateCw :size="15" />
      <span>旋转</span>
    </button>
    <button type="button" title="复制对象" @click.stop="emit('duplicate')">
      <Copy :size="15" />
      <span>复制</span>
    </button>
    <button class="is-danger" type="button" title="删除对象" @click.stop="emit('remove')">
      <Trash2 :size="15" />
      <span>删除</span>
    </button>
  </div>
</template>

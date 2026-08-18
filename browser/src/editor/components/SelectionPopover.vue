<script setup lang="ts">
import { Copy, Minus, Plus, RotateCw, Trash2 } from "@lucide/vue";
import { computed } from "vue";

import { projectPreviewRect, type PreviewRotation } from "../services/rotation";
import type { SelectionModel } from "../types";

const props = defineProps<{
  selection: SelectionModel;
  zoom: number;
  dotsPerMm: number;
  paperWidth: number;
  paperHeight: number;
  rotation: PreviewRotation;
}>();

const emit = defineEmits<{
  scale: [factor: number];
  rotate: [delta: number];
  duplicate: [];
  remove: [];
}>();

const placement = computed(() => {
  const scale = props.zoom * props.dotsPerMm;
  const printWidth = props.rotation % 2 === 0 ? props.paperWidth : props.paperHeight;
  const printHeight = props.rotation % 2 === 0 ? props.paperHeight : props.paperWidth;
  const projected = projectPreviewRect(
    {
      left: props.selection.x * scale,
      top: props.selection.y * scale,
      width: props.selection.width * scale,
      height: props.selection.height * scale,
    },
    printWidth,
    printHeight,
    props.rotation,
  );
  const desiredLeft = Math.max(0, projected.left + projected.width / 2);
  // Keep the toolbar inside the canvas column. Without this clamp, a QR code
  // near the right edge makes the toolbar overlap the inspector panel.
  const toolbarHalfWidth = 152;
  const minLeft = toolbarHalfWidth;
  const maxLeft = Math.max(minLeft, props.paperWidth - toolbarHalfWidth);
  const left = Math.min(maxLeft, Math.max(minLeft, desiredLeft));
  const safeObjectTop = Math.max(0, projected.top);
  const objectBottom = safeObjectTop + Math.max(24, projected.height);
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

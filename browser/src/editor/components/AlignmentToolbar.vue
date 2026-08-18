<script setup lang="ts">
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  Copy,
  RotateCcw,
  RotateCw,
  Trash2,
} from "@lucide/vue";

import type { AlignAction } from "../types";

defineProps<{ selectionCount: number }>();
const emit = defineEmits<{
  align: [action: AlignAction];
  duplicate: [];
  remove: [];
  rotate: [delta: number];
}>();

const actions = [
  { action: "left" as const, title: "左对齐", icon: AlignStartVertical },
  { action: "center-horizontal" as const, title: "水平居中", icon: AlignCenterVertical },
  { action: "right" as const, title: "右对齐", icon: AlignEndVertical },
  { action: "top" as const, title: "顶部对齐", icon: AlignStartHorizontal },
  { action: "center-vertical" as const, title: "垂直居中", icon: AlignCenterHorizontal },
  { action: "bottom" as const, title: "底部对齐", icon: AlignEndHorizontal },
  { action: "distribute-horizontal" as const, title: "水平分布", icon: AlignHorizontalSpaceBetween },
  { action: "distribute-vertical" as const, title: "垂直分布", icon: AlignVerticalSpaceBetween },
];
</script>

<template>
  <div class="alignment-toolbar">
    <span class="selection-count">{{ selectionCount ? `已选 ${selectionCount}` : "未选择对象" }}</span>
    <div class="alignment-actions" role="group" aria-label="对象对齐">
      <button
        v-for="item in actions"
        :key="item.action"
        class="icon-button"
        type="button"
        :title="item.title"
        :disabled="selectionCount === 0 || (item.action.startsWith('distribute') && selectionCount < 3)"
        @click="emit('align', item.action)"
      >
        <component :is="item.icon" :size="17" />
      </button>
    </div>
    <div class="quick-actions" role="group" aria-label="选中对象操作">
      <button
        class="quick-action"
        type="button"
        title="逆时针旋转 15°"
        :disabled="selectionCount === 0"
        @click="emit('rotate', -15)"
      >
        <RotateCcw :size="16" />
        <span>旋转</span>
      </button>
      <button
        class="quick-action"
        type="button"
        title="复制选中对象"
        :disabled="selectionCount === 0"
        @click="emit('duplicate')"
      >
        <Copy :size="16" />
        <span>复制</span>
      </button>
      <button
        class="quick-action quick-action--danger"
        type="button"
        title="删除选中对象"
        :disabled="selectionCount === 0"
        @click="emit('remove')"
      >
        <Trash2 :size="16" />
        <span>删除</span>
      </button>
      <button
        class="icon-button"
        type="button"
        title="顺时针旋转 15°"
        :disabled="selectionCount === 0"
        @click="emit('rotate', 15)"
      >
        <RotateCw :size="16" />
      </button>
    </div>
  </div>
</template>

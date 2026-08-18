<script setup lang="ts">
import { BringToFront, ChevronDown, ChevronUp, Copy, SendToBack, Trash2 } from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import type { ContextMenuState } from "../types";

const props = defineProps<{ state: ContextMenuState }>();
const emit = defineEmits<{
  layer: [action: "front" | "forward" | "backward" | "back"];
  duplicate: [];
  remove: [];
  close: [];
}>();

const root = ref<HTMLElement>();
const style = computed(() => ({
  left: `${Math.min(props.state.x, Math.max(8, window.innerWidth - 196))}px`,
  top: `${Math.min(props.state.y, Math.max(8, window.innerHeight - 250))}px`,
}));

function outside(event: PointerEvent): void {
  if (props.state.visible && !root.value?.contains(event.target as Node)) emit("close");
}

onMounted(() => document.addEventListener("pointerdown", outside));
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside));
</script>

<template>
  <div v-if="state.visible" ref="root" class="context-menu" :style="style" role="menu">
    <button type="button" role="menuitem" @click="emit('layer', 'front')">
      <BringToFront :size="16" />置于顶层
    </button>
    <button type="button" role="menuitem" @click="emit('layer', 'forward')">
      <ChevronUp :size="16" />上移一层
    </button>
    <button type="button" role="menuitem" @click="emit('layer', 'backward')">
      <ChevronDown :size="16" />下移一层
    </button>
    <button type="button" role="menuitem" @click="emit('layer', 'back')">
      <SendToBack :size="16" />置于底层
    </button>
    <span class="menu-divider" />
    <button type="button" role="menuitem" @click="emit('duplicate')">
      <Copy :size="16" />复制
    </button>
    <button class="danger" type="button" role="menuitem" @click="emit('remove')">
      <Trash2 :size="16" />删除
    </button>
  </div>
</template>

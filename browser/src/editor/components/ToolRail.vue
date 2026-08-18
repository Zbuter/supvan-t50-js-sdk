<script setup lang="ts">
import { Barcode, ImagePlus, Minus, MousePointer2, QrCode, Square, Type } from "@lucide/vue";
import { ref } from "vue";

import type { EditorObjectKind } from "../types";

const emit = defineEmits<{
  add: [kind: Exclude<EditorObjectKind, "image" | "guide">];
  image: [file: File];
}>();

const fileInput = ref<HTMLInputElement>();

function chooseImage(): void {
  fileInput.value?.click();
}

function onFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit("image", file);
  input.value = "";
}

const tools = [
  { kind: "text" as const, label: "文字", icon: Type },
  { kind: "barcode" as const, label: "条码", icon: Barcode },
  { kind: "qrcode" as const, label: "二维码", icon: QrCode },
  { kind: "rectangle" as const, label: "矩形", icon: Square },
  { kind: "line" as const, label: "直线", icon: Minus },
];
</script>

<template>
  <aside class="tool-rail" aria-label="对象工具">
    <button class="tool-button is-active" type="button" title="选择">
      <MousePointer2 :size="20" />
      <span>选择</span>
    </button>
    <button
      v-for="tool in tools"
      :key="tool.kind"
      class="tool-button"
      type="button"
      :title="`添加${tool.label}`"
      @click="emit('add', tool.kind)"
    >
      <component :is="tool.icon" :size="20" />
      <span>{{ tool.label }}</span>
    </button>
    <button class="tool-button" type="button" title="添加图片" @click="chooseImage">
      <ImagePlus :size="20" />
      <span>图片</span>
    </button>
    <input ref="fileInput" hidden type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" @change="onFile" />
  </aside>
</template>

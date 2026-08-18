<script setup lang="ts">
import {
  Bluetooth,
  Download,
  Printer,
  Redo2,
  RotateCw,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "@lucide/vue";

import { LABEL_SIZES } from "../constants";
import type { LabelSize } from "../types";

const props = defineProps<{
  label: LabelSize;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  connected: boolean;
  deviceName: string;
  busy: boolean;
}>();

const landscapeSizes = LABEL_SIZES.filter(({ width, height }) => width > height);
const portraitSizes = LABEL_SIZES.filter(({ width, height }) => width < height);

const emit = defineEmits<{
  undo: [];
  redo: [];
  sizeChange: [size: LabelSize];
  rotate: [];
  zoomChange: [value: number];
  connect: [];
  print: [];
  download: [];
}>();

function selectSize(event: Event): void {
  const id = (event.target as HTMLSelectElement).value;
  const size = LABEL_SIZES.find((item) => item.id === id);
  if (size) emit("sizeChange", size);
}
</script>

<template>
  <header class="topbar">
    <div class="brand" aria-label="硕方 Label Studio">
      <span class="brand-mark">SF</span>
      <span class="brand-copy">
        <strong>硕方 Label Studio</strong>
        <small>T50 标签编辑器</small>
      </span>
    </div>

    <div class="topbar-tools topbar-tools--history" role="group" aria-label="历史记录">
      <button class="icon-button" type="button" title="撤销" :disabled="!canUndo" @click="emit('undo')">
        <Undo2 :size="18" />
      </button>
      <button class="icon-button" type="button" title="重做" :disabled="!canRedo" @click="emit('redo')">
        <Redo2 :size="18" />
      </button>
    </div>

    <div class="topbar-tools size-control">
      <select :value="label.id" aria-label="标签纸尺寸" @change="selectSize">
        <option v-if="!LABEL_SIZES.some((item) => item.id === label.id)" value="custom">
          {{ label.width }} x {{ label.height }} mm
        </option>
        <optgroup label="横版">
          <option v-for="size in landscapeSizes" :key="size.id" :value="size.id">{{ size.name }}</option>
        </optgroup>
        <optgroup label="竖版">
          <option v-for="size in portraitSizes" :key="size.id" :value="size.id">{{ size.name }}</option>
        </optgroup>
      </select>
      <button
        class="icon-button"
        type="button"
        title="旋转编辑视图（打印方向不变）"
        aria-label="旋转编辑视图"
        @click="emit('rotate')"
      >
        <RotateCw :size="18" />
      </button>
    </div>

    <div class="topbar-tools zoom-control" role="group" aria-label="缩放">
      <button class="icon-button" type="button" title="缩小" @click="emit('zoomChange', zoom - 0.1)">
        <ZoomOut :size="17" />
      </button>
      <input
        type="range"
        min="0.35"
        max="2"
        step="0.05"
        :value="zoom"
        aria-label="画布缩放"
        @input="emit('zoomChange', Number(($event.target as HTMLInputElement).value))"
      />
      <span class="zoom-value">{{ Math.round(zoom * 100) }}%</span>
      <button class="icon-button" type="button" title="放大" @click="emit('zoomChange', zoom + 0.1)">
        <ZoomIn :size="17" />
      </button>
    </div>

    <div class="topbar-actions">
      <button class="icon-button" type="button" title="下载 PNG" @click="emit('download')">
        <Download :size="18" />
      </button>
      <button
        class="command-button command-button--secondary"
        :class="{ 'is-connected': connected }"
        type="button"
        :title="deviceName || '连接打印机'"
        @click="emit('connect')"
      >
        <Bluetooth :size="17" />
        <span>{{ connected ? deviceName : "连接" }}</span>
      </button>
      <button class="command-button command-button--primary" type="button" :disabled="busy" @click="emit('print')">
        <Printer :size="17" />
        <span>{{ busy ? "处理中" : "打印" }}</span>
      </button>
    </div>
  </header>
</template>

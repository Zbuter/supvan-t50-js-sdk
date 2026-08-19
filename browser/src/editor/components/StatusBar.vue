<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";

import type { PrinterStatus } from "shuofang-t50-sdk/browser";
import DeviceStatusPanel from "./DeviceStatusPanel.vue";

const props = defineProps<{
  width: number;
  height: number;
  zoom: number;
  selectionCount: number;
  connected: boolean;
  deviceName: string;
  message: string;
  pageIndex: number;
  pageCount: number;
  status?: PrinterStatus;
  transportKind: "ble" | "usb" | "";
  refreshing: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const tooltipOpen = ref(false);
let tooltipTimer: ReturnType<typeof setTimeout> | undefined;

function clearTooltipTimer(): void {
  if (tooltipTimer) clearTimeout(tooltipTimer);
  tooltipTimer = undefined;
}

function openTooltip(): void {
  clearTooltipTimer();
  tooltipOpen.value = true;
}

function onAnchorEnter(): void {
  if (props.connected) openTooltip();
}

function onAnchorLeave(): void {
  if (props.connected) closeTooltip();
}

function closeTooltip(): void {
  clearTooltipTimer();
  tooltipTimer = setTimeout(() => {
    tooltipOpen.value = false;
  }, 140);
}

function onEscape(): void {
  tooltipOpen.value = false;
  clearTooltipTimer();
}

onBeforeUnmount(clearTooltipTimer);
</script>

<template>
  <footer class="status-bar" @keydown.esc="onEscape">
    <span>{{ props.width }} x {{ props.height }} mm</span>
    <span>{{ Math.round(props.zoom * 100) }}%</span>
    <span>第 {{ props.pageIndex + 1 }} / {{ props.pageCount }} 页</span>
    <span>{{ props.selectionCount ? `选择 ${props.selectionCount}` : props.message }}</span>
    <div
      class="status-device-anchor"
      @mouseenter="onAnchorEnter"
      @mouseleave="onAnchorLeave"
    >
      <button
        v-if="props.connected"
        class="connection-state status-device-trigger"
        :class="{ connected: props.connected }"
        type="button"
        title="查看设备状态"
        aria-label="查看设备状态"
        :aria-expanded="tooltipOpen"
        @click="openTooltip"
        @focus="openTooltip"
      >
        <i />{{ props.deviceName }}
      </button>
      <span v-else class="connection-state status-device-trigger">
        <i />未连接
      </span>
      <div
        v-if="props.connected && tooltipOpen"
        class="status-tooltip"
        role="dialog"
        aria-label="设备状态"
        @mouseenter="openTooltip"
        @mouseleave="closeTooltip"
      >
        <DeviceStatusPanel
          :status="props.status"
          :transport-kind="props.transportKind"
          :show-refresh="true"
          :refreshing="props.refreshing"
          @refresh="emit('refresh')"
        />
      </div>
    </div>
  </footer>
</template>

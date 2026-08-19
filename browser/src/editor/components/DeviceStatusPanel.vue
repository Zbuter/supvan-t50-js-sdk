<script setup lang="ts">
import { Activity, RefreshCw } from "@lucide/vue";

import type { PrinterStatus } from "shuofang-t50-sdk/browser";

const props = withDefaults(defineProps<{
  status?: PrinterStatus;
  transportKind: "ble" | "usb" | "";
  showRefresh?: boolean;
  refreshing?: boolean;
}>(), {
  showRefresh: false,
  refreshing: false,
});

const emit = defineEmits<{
  refresh: [];
}>();

function formatNumber(value: number | undefined, unit: string): string {
  return value === undefined || !Number.isFinite(value) ? "未提供" : `${value.toFixed(2)} ${unit}`;
}

function signal(value: boolean | undefined): string {
  return value === undefined ? "未提供" : value ? "是" : "否";
}

function formatPages(status: PrinterStatus): string {
  return status.totalPages > 0 ? `${status.printedPages} / ${status.totalPages}` : String(status.printedPages);
}

function jobState(status: PrinterStatus): string {
  if (status.printing) return "打印中";
  if (status.busy) return "忙碌";
  return "空闲";
}

function mediaState(status: PrinterStatus): string {
  if (status.mediaNotInstalled || status.labelNotInstalled) return "未装好";
  if (status.mediaNotDetected) return "未检测到";
  if (status.mediaUnrecognized) return "未识别";
  if (status.mediaEmpty) return "已用完";
  if (status.mediaLow) return "余量不足";
  if (status.labelReadWriteError) return "读写错误";
  return "正常";
}

function batteryState(status: PrinterStatus): string {
  if (status.charging) return "充电中";
  if (status.batteryLow) return "低电量";
  return "正常";
}

function rawFlags(status: PrinterStatus): string {
  return Array.from(status.rawFlags, (value) => value.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}
</script>

<template>
  <section v-if="props.status || props.showRefresh" class="device-status-panel" aria-label="设备状态详情">
    <header class="device-status-panel__heading">
      <span><Activity :size="15" />设备状态</span>
      <div class="device-status-panel__heading-actions">
        <strong v-if="props.status" :class="{ 'is-error': !props.status.ready }">{{ props.status.description }}</strong>
        <strong v-else class="is-error">尚未读取</strong>
        <button
          v-if="props.showRefresh"
          class="icon-button device-status-refresh"
          type="button"
          title="刷新设备状态"
          aria-label="刷新设备状态"
          :disabled="props.refreshing"
          @click.stop="emit('refresh')"
        >
          <RefreshCw :size="15" :class="{ spin: props.refreshing }" />
        </button>
      </div>
    </header>
    <div v-if="props.status" class="device-status-grid">
      <div class="device-status-item">
        <span>状态码</span>
        <strong>{{ props.status.state }}</strong>
      </div>
      <div class="device-status-item">
        <span>是否就绪</span>
        <strong :class="{ 'is-error': !props.status.ready }">{{ signal(props.status.ready) }}</strong>
      </div>
      <div class="device-status-item">
        <span>打印头温度</span>
        <strong>{{ formatNumber(props.status.temperatureC, "°C") }}</strong>
      </div>
      <div class="device-status-item">
        <span>电池电压</span>
        <strong>{{ formatNumber(props.status.voltageV, "V") }}</strong>
      </div>
      <div class="device-status-item">
        <span>耗材状态</span>
        <strong :class="{ 'is-error': mediaState(props.status) !== '正常' }">{{ mediaState(props.status) }}</strong>
      </div>
      <div class="device-status-item">
        <span>上盖</span>
        <strong :class="{ 'is-error': props.status.coverOpen }">{{ props.status.coverOpen ? "已打开" : "已关闭" }}</strong>
      </div>
      <div class="device-status-item">
        <span>打印任务</span>
        <strong>{{ jobState(props.status) }}</strong>
      </div>
      <div class="device-status-item">
        <span>打印页数</span>
        <strong>{{ formatPages(props.status) }}</strong>
      </div>
      <div class="device-status-item">
        <span>设备忙</span>
        <strong>{{ signal(props.status.busy) }}</strong>
      </div>
      <div class="device-status-item">
        <span>打印缓冲区已满</span>
        <strong>{{ signal(props.status.bufferFull) }}</strong>
      </div>
      <div class="device-status-item">
        <span>电池</span>
        <strong :class="{ 'is-error': props.status.batteryLow }">{{ batteryState(props.status) }}</strong>
      </div>
      <div class="device-status-item">
        <span>USB 已插入</span>
        <strong>{{ props.transportKind === "usb" ? signal(props.status.usbInserted) : "不适用" }}</strong>
      </div>
      <div class="device-status-item">
        <span>第二设备占用</span>
        <strong :class="{ 'is-error': props.status.secondDeviceBusy }">{{ signal(props.status.secondDeviceBusy) }}</strong>
      </div>
      <div class="device-status-item">
        <span>耗材读写错误</span>
        <strong :class="{ 'is-error': props.status.labelReadWriteError }">{{ signal(props.status.labelReadWriteError) }}</strong>
      </div>
      <div class="device-status-item">
        <span>耗材未检测到</span>
        <strong :class="{ 'is-error': props.status.mediaNotDetected }">{{ signal(props.status.mediaNotDetected) }}</strong>
      </div>
      <div class="device-status-item">
        <span>耗材模式未识别</span>
        <strong :class="{ 'is-error': props.status.mediaUnrecognized }">{{ signal(props.status.mediaUnrecognized) }}</strong>
      </div>
      <div class="device-status-item">
        <span>耗材未安装</span>
        <strong :class="{ 'is-error': props.status.mediaNotInstalled || props.status.labelNotInstalled }">{{ signal(props.status.mediaNotInstalled || props.status.labelNotInstalled) }}</strong>
      </div>
      <div class="device-status-item">
        <span>耗材余量低</span>
        <strong :class="{ 'is-error': props.status.mediaLow }">{{ signal(props.status.mediaLow) }}</strong>
      </div>
      <div class="device-status-item">
        <span>耗材已用完</span>
        <strong :class="{ 'is-error': props.status.mediaEmpty }">{{ signal(props.status.mediaEmpty) }}</strong>
      </div>
      <div class="device-status-item device-status-item--raw">
        <span>原始标志</span>
        <strong>{{ rawFlags(props.status) }}</strong>
      </div>
    </div>
    <p v-else class="device-status-empty">状态暂不可用</p>
  </section>
</template>

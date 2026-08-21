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
  return status.metrics.totalPages > 0
    ? `${status.metrics.printedPages} / ${status.metrics.totalPages}`
    : String(status.metrics.printedPages);
}

function jobState(status: PrinterStatus): string {
  if (status.flags.printing) return "打印中";
  if (status.flags.busy) return "忙碌";
  return "空闲";
}

function mediaState(status: PrinterStatus): string {
  if (status.flags.mediaNotInstalled || status.flags.labelNotInstalled) return "未装好";
  if (status.flags.mediaNotDetected) return "未检测到";
  if (status.flags.mediaUnrecognized) return "未识别";
  if (status.flags.mediaEmpty) return "已用完";
  if (status.flags.mediaLow) return "余量不足";
  if (status.flags.labelReadWriteError) return "读写错误";
  return "正常";
}

function batteryState(status: PrinterStatus): string {
  if (status.flags.charging) return "充电中";
  if (status.flags.batteryLow) return "低电量";
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
        <strong>{{ formatNumber(props.status.metrics.temperatureC, "°C") }}</strong>
      </div>
      <div class="device-status-item">
        <span>电池电压</span>
        <strong>{{ formatNumber(props.status.metrics.voltageV, "V") }}</strong>
      </div>
      <div class="device-status-item">
        <span>耗材状态</span>
        <strong :class="{ 'is-error': mediaState(props.status) !== '正常' }">{{ mediaState(props.status) }}</strong>
      </div>
      <div class="device-status-item">
        <span>上盖</span>
        <strong :class="{ 'is-error': props.status.flags.coverOpen }">{{ props.status.flags.coverOpen ? "已打开" : "已关闭" }}</strong>
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
        <strong>{{ signal(props.status.flags.busy) }}</strong>
      </div>
      <div class="device-status-item">
        <span>打印缓冲区已满</span>
        <strong>{{ signal(props.status.flags.bufferFull) }}</strong>
      </div>
      <div class="device-status-item">
        <span>电池</span>
        <strong :class="{ 'is-error': props.status.flags.batteryLow }">{{ batteryState(props.status) }}</strong>
      </div>
      <div class="device-status-item">
        <span>USB 已插入</span>
        <strong>{{ props.transportKind === "usb" ? signal(props.status.flags.usbInserted) : "不适用" }}</strong>
      </div>
      <div class="device-status-item">
        <span>第二设备占用</span>
        <strong :class="{ 'is-error': props.status.flags.secondDeviceBusy }">{{ signal(props.status.flags.secondDeviceBusy) }}</strong>
      </div>
      <div class="device-status-item">
        <span>耗材读写错误</span>
        <strong :class="{ 'is-error': props.status.flags.labelReadWriteError }">{{ signal(props.status.flags.labelReadWriteError) }}</strong>
      </div>
      <div class="device-status-item">
        <span>耗材未检测到</span>
        <strong :class="{ 'is-error': props.status.flags.mediaNotDetected }">{{ signal(props.status.flags.mediaNotDetected) }}</strong>
      </div>
      <div class="device-status-item">
        <span>耗材模式未识别</span>
        <strong :class="{ 'is-error': props.status.flags.mediaUnrecognized }">{{ signal(props.status.flags.mediaUnrecognized) }}</strong>
      </div>
      <div class="device-status-item">
        <span>耗材未安装</span>
        <strong :class="{ 'is-error': props.status.flags.mediaNotInstalled || props.status.flags.labelNotInstalled }">{{ signal(props.status.flags.mediaNotInstalled || props.status.flags.labelNotInstalled) }}</strong>
      </div>
      <div class="device-status-item">
        <span>耗材余量低</span>
        <strong :class="{ 'is-error': props.status.flags.mediaLow }">{{ signal(props.status.flags.mediaLow) }}</strong>
      </div>
      <div class="device-status-item">
        <span>耗材已用完</span>
        <strong :class="{ 'is-error': props.status.flags.mediaEmpty }">{{ signal(props.status.flags.mediaEmpty) }}</strong>
      </div>
      <div class="device-status-item device-status-item--raw">
        <span>原始标志</span>
        <strong>{{ rawFlags(props.status) }}</strong>
      </div>
    </div>
    <p v-else class="device-status-empty">状态暂不可用</p>
  </section>
</template>

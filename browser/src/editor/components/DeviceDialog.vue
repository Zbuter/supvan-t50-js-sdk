<script setup lang="ts">
import { Bluetooth, Check, LoaderCircle, Unplug, Usb, X } from "@lucide/vue";

import type { RuntimeCapabilities } from "shuofang-t50-sdk/browser";
import type { DeviceMethod } from "../types";

defineProps<{
  open: boolean;
  capabilities: RuntimeCapabilities;
  busy: boolean;
  connected: boolean;
  deviceName: string;
  error: string;
}>();

const emit = defineEmits<{
  close: [];
  select: [method: DeviceMethod];
  disconnect: [];
}>();
</script>

<template>
  <div v-if="open" class="modal-backdrop" @pointerdown.self="emit('close')">
    <section class="device-dialog" role="dialog" aria-modal="true" aria-labelledby="device-title">
      <header>
        <div>
          <h2 id="device-title">打印机连接</h2>
          <p v-if="connected"><Check :size="15" />{{ deviceName }}</p>
        </div>
        <div class="dialog-actions">
          <button class="icon-button" type="button" title="关闭" :disabled="busy" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>
      </header>

      <div class="device-methods">
        <button type="button" :disabled="busy || !capabilities.webBluetooth" @click="emit('select', 'bluetooth')">
          <Bluetooth :size="22" />
          <span><strong>蓝牙 BLE</strong><small>浏览器</small></span>
          <em>{{ capabilities.webBluetooth ? "可用" : "不支持" }}</em>
        </button>
        <button type="button" :disabled="busy || !capabilities.webHid" @click="emit('select', 'webhid')">
          <Usb :size="22" />
          <span><strong>USB HID</strong><small>USB 连接</small></span>
          <em>{{ capabilities.webHid ? "可用" : "不支持" }}</em>
        </button>
      </div>

      <p v-if="error" class="dialog-error">{{ error }}</p>
      <footer>
        <span v-if="busy" class="busy-label"><LoaderCircle :size="16" class="spin" />正在连接</span>
        <button v-if="connected" class="command-button command-button--danger" type="button" :disabled="busy" @click="emit('disconnect')">
          <Unplug :size="16" />断开
        </button>
        <button class="command-button command-button--secondary" type="button" @click="emit('close')">关闭</button>
      </footer>
    </section>
  </div>
</template>

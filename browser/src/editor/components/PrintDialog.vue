<script setup lang="ts">
import { Bluetooth, Check, Files, LoaderCircle, Printer, X } from "@lucide/vue";
import { reactive, watch } from "vue";

import type { PrintSettingsModel } from "../types";

const props = defineProps<{
  open: boolean;
  settings: PrintSettingsModel;
  pageCount: number;
  connected: boolean;
  deviceName: string;
  busy: boolean;
}>();

const emit = defineEmits<{
  close: [];
  connect: [];
  confirm: [settings: PrintSettingsModel];
}>();

const draft = reactive<PrintSettingsModel>({ ...props.settings });

watch(
  () => props.open,
  (open) => {
    if (open) Object.assign(draft, props.settings);
  },
);

function numberValue(event: Event): number {
  return Number((event.target as HTMLInputElement | HTMLSelectElement).value);
}

function submit(): void {
  emit("confirm", {
    density: Math.min(9, Math.max(0, Math.round(draft.density))),
    gap: Math.min(8, Math.max(0, draft.gap)),
    speed: Math.min(60, Math.max(20, Math.round(draft.speed / 5) * 5)),
    copies: Math.min(99, Math.max(1, Math.round(draft.copies))),
  });
}
</script>

<template>
  <div v-if="open" class="modal-backdrop" @pointerdown.self="emit('close')">
    <form class="print-dialog" role="dialog" aria-modal="true" aria-labelledby="print-title" @submit.prevent="submit">
      <header>
        <div>
          <h2 id="print-title">打印设置</h2>
          <p v-if="connected"><Check :size="15" />{{ deviceName }}</p>
        </div>
        <button class="icon-button" type="button" title="关闭" :disabled="busy" @click="emit('close')">
          <X :size="18" />
        </button>
      </header>

      <div class="print-dialog__body">
        <div class="print-summary">
          <Files :size="18" />
          <span>{{ pageCount }} 页</span>
          <strong>{{ pageCount * draft.copies }} 张标签</strong>
        </div>

        <label class="print-field print-field--range">
          <span>打印浓度 <strong>{{ draft.density }}</strong></span>
          <input v-model.number="draft.density" type="range" min="0" max="9" step="1" />
        </label>

        <div class="print-field-grid">
          <label class="print-field">
            <span>标签间隙 mm</span>
            <input v-model.number="draft.gap" type="number" min="0" max="8" step="0.1" required />
          </label>
          <label class="print-field">
            <span>打印速度 mm/s</span>
            <select :value="draft.speed" @change="draft.speed = numberValue($event)">
              <option v-for="value in [20, 25, 30, 35, 40, 45, 50, 55, 60]" :key="value" :value="value">
                {{ value }}
              </option>
            </select>
          </label>
          <label class="print-field print-field--copies">
            <span>副本数</span>
            <input v-model.number="draft.copies" type="number" min="1" max="99" step="1" required />
          </label>
        </div>
      </div>

      <footer>
        <span v-if="busy" class="busy-label"><LoaderCircle :size="16" class="spin" />正在发送</span>
        <button
          v-if="!connected"
          class="command-button command-button--secondary"
          type="button"
          :disabled="busy"
          @click="emit('connect')"
        >
          <Bluetooth :size="16" />连接打印机
        </button>
        <button class="command-button command-button--primary" type="submit" :disabled="busy || !connected">
          <Printer :size="16" />打印 {{ pageCount * draft.copies }} 张
        </button>
      </footer>
    </form>
  </div>
</template>

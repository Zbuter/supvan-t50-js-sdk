<script setup lang="ts">
import { AlertTriangle, CheckCircle2, X } from "@lucide/vue";
import { computed, onBeforeUnmount, reactive, ref, shallowRef } from "vue";

import {
  SupvanPrinter,
  WebBluetoothTransport,
  WebHidTransport,
  detectCapabilities,
  type PrinterTransport,
} from "shuofang-t50-sdk/browser";
import AlignmentToolbar from "./editor/components/AlignmentToolbar.vue";
import ContextMenu from "./editor/components/ContextMenu.vue";
import DeviceDialog from "./editor/components/DeviceDialog.vue";
import InspectorPanel from "./editor/components/InspectorPanel.vue";
import LabelCanvas from "./editor/components/LabelCanvas.vue";
import PageStrip from "./editor/components/PageStrip.vue";
import PrintDialog from "./editor/components/PrintDialog.vue";
import StatusBar from "./editor/components/StatusBar.vue";
import ToolRail from "./editor/components/ToolRail.vue";
import TopBar from "./editor/components/TopBar.vue";
import { useLabelEditor } from "./editor/composables/useLabelEditor";
import type { DeviceMethod, LabelSize, PrintSettingsModel, SelectionModel } from "./editor/types";

const editor = useLabelEditor();
const capabilities = detectCapabilities();
const printer = shallowRef<SupvanPrinter>();
const deviceDialogOpen = ref(false);
const printDialogOpen = ref(false);
const resumePrintAfterDevice = ref(false);
const connectionBusy = ref(false);
const printBusy = ref(false);
const deviceName = ref("");
const deviceError = ref("");
const statusMessage = ref("就绪");
const printSettings = reactive<PrintSettingsModel>({ density: 4, gap: 3, speed: 40, copies: 1 });
const toast = reactive({ visible: false, message: "", error: false });
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const connected = computed(() => Boolean(printer.value?.connected));
const busy = computed(() => connectionBusy.value || printBusy.value);

function showToast(message: string, error = false): void {
  toast.visible = true;
  toast.message = message;
  toast.error = error;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.visible = false;
  }, 3600);
}

function setLabelSize(size: LabelSize): void {
  editor.setLabelSize(size);
}

function setCustomLabel(width: number, height: number): void {
  editor.setLabelSize({ id: "custom", name: `${width} x ${height} mm`, width, height });
}

function openDeviceDialog(resumePrint = false): void {
  resumePrintAfterDevice.value = resumePrint;
  if (resumePrint) printDialogOpen.value = false;
  deviceDialogOpen.value = true;
}

function closeDeviceDialog(): void {
  deviceDialogOpen.value = false;
  if (resumePrintAfterDevice.value) {
    resumePrintAfterDevice.value = false;
    printDialogOpen.value = true;
  }
}

async function requestTransport(method: DeviceMethod): Promise<PrinterTransport> {
  if (method === "bluetooth") return WebBluetoothTransport.request("T0");
  return WebHidTransport.request();
}

async function connectDevice(method: DeviceMethod): Promise<void> {
  connectionBusy.value = true;
  deviceError.value = "";
  statusMessage.value = "正在连接";
  try {
    if (printer.value?.connected) await printer.value.disconnect();
    const transport = await requestTransport(method);
    const next = new SupvanPrinter(transport);
    await next.connect();
    const status = await next.getStatus();
    printer.value = next;
    deviceName.value = transport.name;
    statusMessage.value = status.description;
    closeDeviceDialog();
    showToast(`${transport.name} 已连接`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deviceError.value = message;
    statusMessage.value = "连接失败";
    showToast(message, true);
  } finally {
    connectionBusy.value = false;
  }
}

async function disconnectDevice(): Promise<void> {
  connectionBusy.value = true;
  try {
    await printer.value?.disconnect();
    printer.value = undefined;
    deviceName.value = "";
    statusMessage.value = "就绪";
    closeDeviceDialog();
    showToast("打印机已断开");
  } finally {
    connectionBusy.value = false;
  }
}

async function printLabel(settings: PrintSettingsModel): Promise<void> {
  if (!printer.value?.connected) {
    openDeviceDialog(true);
    showToast("请先连接打印机", true);
    return;
  }
  printBusy.value = true;
  statusMessage.value = "正在打印";
  Object.assign(printSettings, settings);
  try {
    const pages = await editor.rasterPages();
    await printer.value.print({
      pages,
      settings: {
        materialWidth: editor.label.width,
        materialHeight: editor.label.height,
        density: settings.density,
        gap: settings.gap,
        speed: settings.speed,
        copies: settings.copies,
      },
    });
    statusMessage.value = "打印完成";
    printDialogOpen.value = false;
    showToast(`${pages.length} 页 × ${settings.copies} 份已打印`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusMessage.value = "打印失败";
    showToast(message, true);
  } finally {
    printBusy.value = false;
  }
}

function closeContextMenu(): void {
  editor.contextMenu.visible = false;
}

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer);
  void printer.value?.disconnect();
});
</script>

<template>
  <div class="app-shell">
    <TopBar
      :label="editor.label"
      :preview-rotation="editor.previewRotation.value"
      :zoom="editor.zoom.value"
      :can-undo="editor.canUndo.value"
      :can-redo="editor.canRedo.value"
      :connected="connected"
      :device-name="deviceName"
      :busy="busy"
      @undo="editor.undo"
      @redo="editor.redo"
      @size-change="setLabelSize"
      @rotate="editor.rotateLabel"
      @zoom-change="editor.setZoom"
      @connect="openDeviceDialog()"
      @print="printDialogOpen = true"
      @download="editor.download"
    />

    <div class="workspace-layout">
      <ToolRail @add="editor.addObject" @image="editor.addImageFile" />

      <main class="editor-main">
        <AlignmentToolbar
          :selection-count="editor.selection.value.count"
          @align="editor.align"
          @duplicate="editor.duplicateSelection"
          @remove="editor.removeSelection"
          @rotate="editor.rotateSelection"
          @scale="editor.scaleSelection"
        />
        <LabelCanvas
          :editor="editor"
          :display-width="editor.displayWidth.value"
          :display-height="editor.displayHeight.value"
        />
        <PageStrip
          :pages="editor.pages.value"
          :active-index="editor.activePageIndex.value"
          :busy="editor.pageBusy.value"
          @select="editor.selectPage"
          @add="editor.addPage"
          @duplicate="editor.duplicatePage"
          @remove="editor.removePage"
        />
        <StatusBar
          :width="editor.label.width"
          :height="editor.label.height"
          :zoom="editor.zoom.value"
          :selection-count="editor.selection.value.count"
          :connected="connected"
          :device-name="deviceName"
          :message="statusMessage"
          :page-index="editor.activePageIndex.value"
          :page-count="editor.pages.value.length"
        />
      </main>

      <InspectorPanel
        :label="editor.label"
        :selection="editor.selection.value"
        @selection-change="
          (key: keyof SelectionModel, value: string | number) => editor.updateSelectedProperty(key, value)
        "
        @label-change="setCustomLabel"
      />
    </div>

    <ContextMenu
      :state="editor.contextMenu"
      @layer="editor.changeLayer"
      @duplicate="editor.duplicateSelection"
      @remove="editor.removeSelection"
      @close="closeContextMenu"
    />

    <DeviceDialog
      :open="deviceDialogOpen"
      :capabilities="capabilities"
      :busy="connectionBusy"
      :connected="connected"
      :device-name="deviceName"
      :error="deviceError"
      @close="closeDeviceDialog"
      @select="connectDevice"
      @disconnect="disconnectDevice"
    />

    <PrintDialog
      :open="printDialogOpen"
      :settings="printSettings"
      :page-count="editor.pages.value.length"
      :connected="connected"
      :device-name="deviceName"
      :busy="printBusy"
      @close="printDialogOpen = false"
      @connect="openDeviceDialog(true)"
      @confirm="printLabel"
    />

    <Transition name="toast">
      <div v-if="toast.visible" class="toast-message" :class="{ error: toast.error }" role="status">
        <AlertTriangle v-if="toast.error" :size="18" />
        <CheckCircle2 v-else :size="18" />
        <span>{{ toast.message }}</span>
        <button type="button" title="关闭" @click="toast.visible = false"><X :size="15" /></button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { Bold, TextAlignCenter, TextAlignEnd, TextAlignStart } from "@lucide/vue";
import { onBeforeUnmount, ref, watch } from "vue";

import { FONT_FAMILIES, LABEL_SIZE_LIMITS } from "../constants";
import type { LabelSize, SelectionModel } from "../types";

type LabelDimension = "width" | "height";

const LABEL_COMMIT_DELAY_MS = 300;

const props = defineProps<{
  label: LabelSize;
  selection: SelectionModel;
}>();

const emit = defineEmits<{
  selectionChange: [key: keyof SelectionModel, value: string | number];
  labelChange: [width: number, height: number];
}>();

function value(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
}

function numberValue(event: Event): number {
  return Number(value(event));
}

const widthDraft = ref(String(props.label.width));
const heightDraft = ref(String(props.label.height));
const activeLabelField = ref<LabelDimension>();
let labelCommitTimer: ReturnType<typeof setTimeout> | undefined;

function isValidLabelDimension(dimension: LabelDimension, rawValue: string): boolean {
  const numeric = Number(rawValue);
  const limits = LABEL_SIZE_LIMITS[dimension];
  return rawValue.trim() !== "" && Number.isFinite(numeric) && numeric >= limits.min && numeric <= limits.max;
}

function commitLabelDraft(revertInvalid = false): void {
  if (labelCommitTimer) clearTimeout(labelCommitTimer);
  labelCommitTimer = undefined;

  const widthValid = isValidLabelDimension("width", widthDraft.value);
  const heightValid = isValidLabelDimension("height", heightDraft.value);
  if (widthValid && heightValid) {
    emit("labelChange", Number(widthDraft.value), Number(heightDraft.value));
    return;
  }

  if (revertInvalid) {
    if (!widthValid) widthDraft.value = String(props.label.width);
    if (!heightValid) heightDraft.value = String(props.label.height);
  }
}

function scheduleLabelCommit(): void {
  if (labelCommitTimer) clearTimeout(labelCommitTimer);
  labelCommitTimer = setTimeout(() => commitLabelDraft(), LABEL_COMMIT_DELAY_MS);
}

function updateLabelDraft(dimension: LabelDimension, event: Event): void {
  if (dimension === "width") widthDraft.value = value(event);
  else heightDraft.value = value(event);
  scheduleLabelCommit();
}

function beginLabelEdit(dimension: LabelDimension): void {
  activeLabelField.value = dimension;
}

function finishLabelEdit(dimension: LabelDimension): void {
  if (activeLabelField.value === dimension) activeLabelField.value = undefined;
  commitLabelDraft(true);
}

function finishLabelEditOnEnter(event: KeyboardEvent): void {
  (event.currentTarget as HTMLInputElement).blur();
}

watch(
  () => [props.label.width, props.label.height],
  ([width, height]) => {
    if (activeLabelField.value !== "width") widthDraft.value = String(width);
    if (activeLabelField.value !== "height") heightDraft.value = String(height);
  },
);

onBeforeUnmount(() => {
  if (labelCommitTimer) clearTimeout(labelCommitTimer);
});
</script>

<template>
  <aside class="inspector-panel">
    <div class="panel-heading">
      <h2>属性</h2>
      <span>{{ selection.count ? `${selection.count} 个对象` : "标签纸" }}</span>
    </div>

    <section class="property-section">
      <h3>标签</h3>
      <div class="field-grid field-grid--two">
        <label>
          <span>宽度 mm</span>
          <input
            type="number"
            :min="LABEL_SIZE_LIMITS.width.min"
            :max="LABEL_SIZE_LIMITS.width.max"
            step="0.1"
            inputmode="decimal"
            :value="widthDraft"
            :aria-invalid="!isValidLabelDimension('width', widthDraft)"
            @focus="beginLabelEdit('width')"
            @input="updateLabelDraft('width', $event)"
            @blur="finishLabelEdit('width')"
            @keydown.enter.prevent="finishLabelEditOnEnter"
          />
        </label>
        <label>
          <span>高度 mm</span>
          <input
            type="number"
            :min="LABEL_SIZE_LIMITS.height.min"
            :max="LABEL_SIZE_LIMITS.height.max"
            step="0.1"
            inputmode="decimal"
            :value="heightDraft"
            :aria-invalid="!isValidLabelDimension('height', heightDraft)"
            @focus="beginLabelEdit('height')"
            @input="updateLabelDraft('height', $event)"
            @blur="finishLabelEdit('height')"
            @keydown.enter.prevent="finishLabelEditOnEnter"
          />
        </label>
      </div>
    </section>

    <section v-if="selection.count" class="property-section">
      <h3>位置与尺寸</h3>
      <div class="field-grid field-grid--two">
        <label>
          <span>X mm</span>
          <input type="number" step="0.1" :value="selection.x" @change="emit('selectionChange', 'x', numberValue($event))" />
        </label>
        <label>
          <span>Y mm</span>
          <input type="number" step="0.1" :value="selection.y" @change="emit('selectionChange', 'y', numberValue($event))" />
        </label>
        <label>
          <span>{{ selection.kind === "line" ? "长度 mm" : "宽 mm" }}</span>
          <input
            type="number"
            min="0.5"
            step="0.1"
            :value="selection.width"
            @change="emit('selectionChange', 'width', numberValue($event))"
          />
        </label>
        <label v-if="selection.kind !== 'line'">
          <span>高 mm</span>
          <input
            type="number"
            min="0.5"
            step="0.1"
            :value="selection.height"
            @change="emit('selectionChange', 'height', numberValue($event))"
          />
        </label>
      </div>
      <label class="field-row">
        <span>旋转</span>
        <input
          type="number"
          min="-360"
          max="360"
          step="1"
          :value="selection.angle"
          @change="emit('selectionChange', 'angle', numberValue($event))"
        />
        <em>°</em>
      </label>
    </section>

    <section
      v-if="selection.count === 1 && ['text', 'barcode', 'qrcode'].includes(selection.kind || '')"
      class="property-section"
    >
      <h3>内容</h3>
      <textarea
        rows="3"
        :value="selection.content"
        @change="emit('selectionChange', 'content', value($event))"
      />
    </section>

    <section v-if="selection.count === 1 && selection.kind === 'text'" class="property-section">
      <h3>文字</h3>
      <label class="field-stack">
        <span>字体</span>
        <select :value="selection.fontFamily" @change="emit('selectionChange', 'fontFamily', value($event))">
          <option v-for="font in FONT_FAMILIES" :key="font" :value="font">{{ font }}</option>
        </select>
      </label>
      <div class="field-grid">
        <label>
          <span>字号 px</span>
          <input
            type="number"
            min="6"
            max="160"
            :value="selection.fontSize"
            @change="emit('selectionChange', 'fontSize', numberValue($event))"
          />
        </label>
      </div>
      <div class="segmented-control" role="group" aria-label="文字格式">
        <button
          type="button"
          title="粗体"
          :class="{ 'is-active': selection.fontWeight === 'bold' || Number(selection.fontWeight) >= 600 }"
          @click="emit('selectionChange', 'fontWeight', selection.fontWeight === 'bold' ? 'normal' : 'bold')"
        >
          <Bold :size="17" />
        </button>
        <button
          type="button"
          title="左对齐"
          :class="{ 'is-active': selection.textAlign === 'left' }"
          @click="emit('selectionChange', 'textAlign', 'left')"
        >
          <TextAlignStart :size="17" />
        </button>
        <button
          type="button"
          title="居中对齐"
          :class="{ 'is-active': selection.textAlign === 'center' }"
          @click="emit('selectionChange', 'textAlign', 'center')"
        >
          <TextAlignCenter :size="17" />
        </button>
        <button
          type="button"
          title="右对齐"
          :class="{ 'is-active': selection.textAlign === 'right' }"
          @click="emit('selectionChange', 'textAlign', 'right')"
        >
          <TextAlignEnd :size="17" />
        </button>
      </div>
    </section>

    <section v-if="selection.count === 1 && ['rectangle', 'line'].includes(selection.kind || '')" class="property-section">
      <h3>描边</h3>
      <div class="field-grid field-grid--two">
        <label>
          <span>线宽 px</span>
          <input
            type="number"
            min="0.5"
            max="32"
            step="0.5"
            :value="selection.strokeWidth"
            @change="emit('selectionChange', 'strokeWidth', numberValue($event))"
          />
        </label>
        <label>
          <span>线型</span>
          <select :value="selection.strokeStyle" @change="emit('selectionChange', 'strokeStyle', value($event))">
            <option value="solid">实线</option>
            <option value="dashed">虚线</option>
            <option value="dotted">点线</option>
          </select>
        </label>
      </div>
    </section>

  </aside>
</template>

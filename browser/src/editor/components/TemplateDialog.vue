<script setup lang="ts">
import { Files, LoaderCircle, X } from "@lucide/vue";

import type { LabelTemplate } from "shuofang-t50-sdk";

defineProps<{
  open: boolean;
  templates: readonly LabelTemplate[];
  busy: boolean;
}>();

const emit = defineEmits<{
  close: [];
  select: [template: LabelTemplate];
}>();
</script>

<template>
  <div v-if="open" class="modal-backdrop" @pointerdown.self="emit('close')">
    <section class="template-dialog" role="dialog" aria-modal="true" aria-labelledby="template-title">
      <header>
        <div>
          <h2 id="template-title">选择标签模板</h2>
          <p>模板会复制成新的标签，原模板不会被修改。</p>
        </div>
        <button class="icon-button" type="button" title="关闭" :disabled="busy" @click="emit('close')">
          <X :size="18" />
        </button>
      </header>

      <div class="template-grid">
        <article v-for="template in templates" :key="template.id" class="template-card">
          <div class="template-card__preview"><Files :size="28" /></div>
          <div class="template-card__content">
            <strong>{{ template.name }}</strong>
            <small>{{ template.category || "基础" }} · {{ template.document.width }} × {{ template.document.height }} mm</small>
            <p v-if="template.description">{{ template.description }}</p>
          </div>
          <button class="command-button command-button--secondary" type="button" :disabled="busy" @click="emit('select', template)">
            使用模板
          </button>
        </article>
      </div>

      <footer>
        <span v-if="busy" class="busy-label"><LoaderCircle :size="16" class="spin" />正在载入</span>
        <button class="command-button command-button--secondary" type="button" :disabled="busy" @click="emit('close')">取消</button>
      </footer>
    </section>
  </div>
</template>

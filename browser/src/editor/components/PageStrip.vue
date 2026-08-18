<script setup lang="ts">
import { Copy, Plus, Trash2 } from "@lucide/vue";

import type { EditorPageSummary } from "../types";

defineProps<{
  pages: EditorPageSummary[];
  activeIndex: number;
  busy: boolean;
}>();

const emit = defineEmits<{
  select: [index: number];
  add: [];
  duplicate: [];
  remove: [];
}>();
</script>

<template>
  <nav class="page-strip" aria-label="标签页面">
    <div class="page-tabs" role="tablist">
      <button
        v-for="(page, index) in pages"
        :key="page.id"
        type="button"
        role="tab"
        :aria-selected="index === activeIndex"
        :class="{ 'is-active': index === activeIndex }"
        :disabled="busy"
        @click="emit('select', index)"
      >
        {{ page.name }}
      </button>
    </div>
    <div class="page-actions" role="group" aria-label="页面操作">
      <button class="icon-button" type="button" title="新增页面" :disabled="busy" @click="emit('add')">
        <Plus :size="16" />
      </button>
      <button class="icon-button" type="button" title="复制当前页" :disabled="busy" @click="emit('duplicate')">
        <Copy :size="15" />
      </button>
      <button
        class="icon-button"
        type="button"
        title="删除当前页"
        :disabled="busy || pages.length <= 1"
        @click="emit('remove')"
      >
        <Trash2 :size="15" />
      </button>
    </div>
  </nav>
</template>

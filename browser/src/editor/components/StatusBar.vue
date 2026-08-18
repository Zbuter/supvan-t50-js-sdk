<script setup lang="ts">
defineProps<{
  width: number;
  height: number;
  zoom: number;
  selectionCount: number;
  connected: boolean;
  deviceName: string;
  message: string;
  pageIndex: number;
  pageCount: number;
}>();
</script>

<template>
  <footer class="status-bar">
    <span>{{ width }} x {{ height }} mm</span>
    <span>{{ Math.round(zoom * 100) }}%</span>
    <span>第 {{ pageIndex + 1 }} / {{ pageCount }} 页</span>
    <span>{{ selectionCount ? `选择 ${selectionCount}` : message }}</span>
    <span class="connection-state" :class="{ connected }">
      <i />{{ connected ? deviceName : "未连接" }}
    </span>
  </footer>
</template>

# 浏览器标签编辑器

Vue 3 + Fabric.js 的多页标签编辑器，直接依赖独立的 `shuofang-t50-sdk` workspace。

## 运行

在仓库根目录执行：

```bash
npm install
npm run dev
```

也可在 SDK 已构建后单独运行：

```bash
npm run dev --workspace @buterz/t50-browser
```

## 编辑与打印

- 常用标签：`30 × 20`、`40 × 30`、`50 × 30`、`50 × 40`、`40 × 60`、`50 × 70`、`50 × 80` mm
- 右侧宽高输入支持 `5–50` mm 宽、`5–120` mm 高的自定义纸张
- 页面栏支持新增、复制、切换和删除，每页保存独立 Fabric.js 状态
- 多选拖动、参考线吸附、六种对齐与两种均匀分布
- 右键菜单支持图层调整、复制和删除
- 方向键微调，`Shift + 方向键` 移动 1 mm，`Delete` 删除
- 打印弹框设置浓度、间隙、速度与副本数，并显示最终标签总数

打印时，编辑器会把每页状态加载到离屏 Fabric.js Canvas，依次导出 RGBA 栅格，再作为一个多页任务交给 SDK。默认缩放为 100%，只影响编辑显示，不改变导出的打印点数。

## 代码结构

```text
src/editor/components/   页面、画布、属性、工具栏和打印弹框
src/editor/composables/  多页文档状态与 Fabric.js 编排
src/editor/services/     对齐、吸附、历史、对象工厂和导出
src/styles/              响应式编辑器样式
tests/                   编辑器常量与纸张回归测试
```

## 验证

```bash
npm run typecheck --workspace @buterz/t50-browser
npm run test --workspace @buterz/t50-browser
npm run build --workspace @buterz/t50-browser
```

浏览器自动化可验证编辑与弹框流程；设备选择弹框和真实打印需要在支持相应设备 API 的浏览器中由用户手势触发。

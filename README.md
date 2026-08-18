# 硕方 T50 JavaScript 工程

项目当前包含两个独立 workspace：可发布的打印 SDK 和 Vue 浏览器编辑器。SDK 协议层不依赖 Vue 或 Fabric.js；浏览器只负责设备接入与标签栅格生成。

## 快速开始

需要 Node.js 20.19 或更高版本。

```bash
npm install
npm run dev
```

开发服务器会先构建 SDK，再启动浏览器编辑器。终端会显示实际访问地址，默认从 `http://127.0.0.1:5173/` 开始选择空闲端口。

## 三个目录

```text
sdk/          shuofang-t50-sdk，可独立构建和发布到 npm
browser/      Vue 3 + Fabric.js 多页标签编辑器
```

- [SDK 使用与发布](sdk/README.md)
- [浏览器编辑器](browser/README.md)
- [协议实现说明](sdk/docs/PROTOCOL.md)

微信小程序示例暂未纳入本次提交，待移动端布局重构完成后再单独加入。

## 已实现

- BLE、USB HID 和 WebUSB 协议、状态查询、标签盒读取、停止与打印完成轮询
- 浏览器 Web Bluetooth、WebHID、WebUSB transport；SDK 同时保留微信小程序 `wx` BLE transport
- LZMA-Alone 固定头 `5d 00 20 00 00`，字典大小固定为 `8192`
- 多页任务、文档副本数、单页 `repeat` 与两种页面展开顺序
- 多页标签编辑、页面复制/删除、常用与自定义纸张、旋转和 100% 默认缩放
- 框选、多选拖动、吸附、对齐/分布、右键图层、撤销/重做与键盘微调
- 打印弹框中的浓度、间隙、速度和副本设置

## 验证

```bash
npm run typecheck
npm run test
npm run build
npm run pack:sdk
```

## 自动发布

推送到 `master` 后，GitHub Actions 会构建 browser 并部署到 GitHub Pages；SDK 版本未发布时会自动发布到 npm。仓库需要配置 Actions secret：`NPM_TOKEN`。

自动化覆盖协议帧、Python 参考 LZMA 字节、多页副本顺序和浏览器构建。BLE、WebHID、WebUSB 和微信真机打印仍应分别使用目标打印机与目标固件完成一次硬件验收。

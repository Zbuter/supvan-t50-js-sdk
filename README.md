# 硕方 T50 标签打印

这个项目用于编辑、渲染和打印硕方 T50 标签。页面中的文字、条码、二维码、图片和图形会被转换成 T50 能识别的黑白点阵，再通过 BLE 或 USB HID 发送给打印机。

项目提供三种使用方式：直接打开浏览器编辑器制作标签，在 JavaScript/TypeScript 应用中接入 SDK，或在微信小程序中使用 `wx` BLE 打印。

## 运行浏览器编辑器

需要 Node.js `>=20.19`。在项目根目录执行：

```bash
npm install
npm run dev
```

开发服务器会先准备打印 SDK，再启动编辑器。访问地址会显示在终端，默认从 `http://127.0.0.1:5173/` 开始寻找可用端口。

浏览器设备选择需要在 HTTPS 或 localhost 的用户操作中触发。编辑器支持多页标签、常用和自定义尺寸、文字/条码/二维码/图片/图形对象、撤销重做，以及浓度、间隙、速度和副本设置。

## 接入 SDK

SDK 可以接收灰度或 RGBA 图像作为输入，但 T50 最终只打印黑白点阵：灰度会在发送前按热敏阈值转换为黑白，不是连续灰度打印。SDK 也可以把 DrawObject 页面渲染成打印点阵。浏览器使用 Web Bluetooth 或 WebHID，微信小程序使用 `wx` BLE。

- [SDK 使用说明](sdk/README.md)
- [浏览器编辑器说明](browser/README.md)
- [协议说明](sdk/docs/PROTOCOL.md)

## 验证

```bash
npm run typecheck
npm run test
npm run build
npm run pack:sdk
```

这些命令检查类型、测试、生产构建和 SDK 打包内容。真实设备连接、蓝牙权限、打印机固件响应和出纸效果需要使用目标打印机单独验证。

## 发布

推送 `master` 后，GitHub Actions 会根据改动构建 GitHub Pages 页面或发布 SDK。自动发布 SDK 需要配置 `NPM_TOKEN`，同一版本已经存在于 npm 时会跳过发布。

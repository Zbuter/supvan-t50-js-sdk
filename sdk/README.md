# shuofang-t50-sdk

这是一个面向硕方 T50 标签打印机的 TypeScript SDK。它把灰度/RGBA 点阵或 DrawObject 页面转换成 T50 协议数据，并通过 BLE、USB HID 或微信 `wx` BLE 完成打印。

## 安装

```bash
npm install shuofang-t50-sdk
```

浏览器和微信小程序分别使用对应入口：

| 导入 | 用途 |
| --- | --- |
| `shuofang-t50-sdk/browser` | Web Bluetooth、WebHID 和浏览器 Canvas 预览 |
| `shuofang-t50-sdk/wechat` | 微信小程序 `wx` BLE，不依赖 DOM |
| `shuofang-t50-sdk` | 通用打印 API、栅格和 DrawObject 渲染器 |

## 用浏览器打印

设备选择要在 HTTPS 或 localhost 的用户操作中调用。下面的例子打印两页 40 x 30 mm 的白色标签：

```ts
import { PaperType, SupvanPrinter, WebBluetoothTransport } from "shuofang-t50-sdk/browser";

const pageData = new Uint8ClampedArray(320 * 240 * 4).fill(255);
const printer = new SupvanPrinter(await WebBluetoothTransport.request("T0"));

await printer.connect();
await printer.print({
  pages: [
    { width: 320, height: 240, data: pageData },
    { width: 320, height: 240, data: pageData },
  ],
  settings: {
    materialWidth: 40,
    materialHeight: 30,
    paperType: PaperType.Gap,
    density: 4,
    gap: 3,
    speed: 40,
    copies: 2,
  },
});
await printer.disconnect();
```

`width` 和 `height` 是打印点数，不是毫米。`data` 可以是灰度数据（`width * height`）或 RGBA 数据（`width * height * 4`）。`copies` 控制文档副本数，页面可以用 `repeat` 重复；`oneByOne: false` 时会按页面聚合副本。

USB 打印使用 WebHID：

```ts
import { SupvanPrinter, WebHidTransport } from "shuofang-t50-sdk/browser";

const printer = new SupvanPrinter(await WebHidTransport.request());
await printer.connect();
```

## 把页面渲染成点阵

浏览器 Canvas 预览按 T50 的实际点数渲染文字、二维码、Code 128、EAN-13、图片、矩形和直线。坐标、尺寸和字号使用毫米：

```ts
import {
  DrawFontStyle,
  DrawObjectFormat,
  previewDrawJob,
  rasterFromPreviewCanvas,
} from "shuofang-t50-sdk/browser";

const canvases = previewDrawJob({
  pages: [{
    width: 40,
    height: 30,
    objects: [
      {
        x: 3,
        y: 3,
        width: 34,
        height: 8,
        content: "咖啡豆",
        format: DrawObjectFormat.Text,
        fontSize: 4,
        fontStyle: DrawFontStyle.Bold,
        autoReturn: true,
      },
      {
        x: 14,
        y: 13,
        width: 12,
        height: 12,
        content: "https://example.com",
        format: DrawObjectFormat.QrCode,
      },
    ],
  }],
});

const pages = canvases.map((canvas) => rasterFromPreviewCanvas(canvas));
```

渲染器同时接受 camelCase 和 snake_case 字段，例如 `fontSize`/`font_size`、`autoReturn`/`auto_return`。小程序等其他 Canvas 运行时可以直接调用 `renderDrawPage(context, page)`。

## 在微信小程序中打印

```js
const { SupvanPrinter, WechatBleTransport } = require("shuofang-t50-sdk/wechat");

const printer = new SupvanPrinter(await WechatBleTransport.request("T0", {
  timeoutMs: 5000,
  chunkSize: 20,
  chunkDelayMs: 10,
}));
await printer.connect();
```

## T50 的限制

BLE 图像使用 LZMA-Alone，参数固定为 properties `0x5D`、字典 `8192` 字节、BT4、nice length `128`，并启用 end marker。默认型号配置为 `8` 点/mm（约 `203 DPI`），最大打印宽度为 `384` 点；超宽页面会抛出 `ValidationError`，不会自动缩放。

LZMA 的字节级回归测试以 [supvan-t50-python-sdk](https://github.com/Zbuter/supvan-t50-python-sdk) 的实现为外部参考；该 Python 项目不在本仓库内。协议细节见 [docs/PROTOCOL.md](docs/PROTOCOL.md)。

## 构建和发布

在 SDK 目录执行：

```bash
npm run build
npm run pack:check
npm publish --access public
```

发布前先更新版本号，并确认 `npm pack --dry-run` 的内容符合预期。

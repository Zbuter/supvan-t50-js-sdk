# shuofang-t50-sdk

硕方 T50 的跨运行时 TypeScript SDK。包内包含协议、栅格、LZMA、打印状态机和 transport。

## 安装

```bash
npm install shuofang-t50-sdk
```

包同时提供 ESM、CommonJS 和 TypeScript 声明。

| 入口 | 用途 |
| --- | --- |
| `shuofang-t50-sdk` | 通用协议、类型和全部 transport |
| `shuofang-t50-sdk/browser` | 通用能力加 Web Bluetooth、WebHID、WebUSB |
| `shuofang-t50-sdk/wechat` | 通用能力加微信小程序 BLE |

## 浏览器打印

设备选择必须由点击等用户手势触发，并运行在 HTTPS 或 localhost 安全上下文。

```ts
import {
  PaperType,
  SupvanPrinter,
  WebBluetoothTransport,
} from "shuofang-t50-sdk/browser";

const transport = await WebBluetoothTransport.request("T0");
const printer = new SupvanPrinter(transport);
await printer.connect();

await printer.print({
  pages: [
    { width: 320, height: 240, data: firstPageRgba },
    { width: 320, height: 240, data: secondPageRgba },
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

`pages` 接受 RGBA 数据（`width * height * 4`）或灰度数据（`width * height`）。默认 `oneByOne: true` 时，上例顺序为“第 1 页、第 2 页、第 1 页、第 2 页”；设为 `false` 时按页面聚合副本。

USB transport 的统一用法：

```ts
import {
  SupvanPrinter,
  WebHidTransport,
  WebUsbTransport,
} from "shuofang-t50-sdk/browser";

const transport = await WebHidTransport.request();
// WebHID 不可用时可在应用层改用 await WebUsbTransport.request()
const printer = new SupvanPrinter(transport);
await printer.connect();
```

## 微信小程序

原生小程序可让开发者工具根据包内 `miniprogram` 字段选择微信入口：

```js
const {
  SupvanPrinter,
  WechatBleTransport,
} = require("shuofang-t50-sdk");

const transport = await WechatBleTransport.request("T0", {
  timeoutMs: 5000,
  chunkSize: 20,
  chunkDelayMs: 10,
});
const printer = new SupvanPrinter(transport);
await printer.connect();
```

使用 Vite、Rollup 等构建器时也可显式导入 `shuofang-t50-sdk/wechat`。微信入口只包含通用协议与 `wx` BLE transport，不在模块加载时读取 DOM。

完整原生示例见仓库的 `miniprogram/` 目录。

## LZMA 兼容约束

BLE 图像使用 LZMA-Alone，不是 `.xz`。以下参数与 Python 版本保持一致：

| 参数 | 值 |
| --- | --- |
| properties | `0x5D`（`lc=3`、`lp=0`、`pb=2`） |
| dictionary | `8192`（`0x2000`） |
| match finder | BT4 |
| nice length | 128 |
| end marker | 启用 |

```ts
import {
  assertSupvanLzmaHeader,
  inspectLzmaHeader,
  lzmaCompress,
} from "shuofang-t50-sdk";

const compressed = lzmaCompress(new Uint8Array(4096));
assertSupvanLzmaHeader(compressed);
console.log(inspectLzmaHeader(compressed));
// { properties: 93, dictionarySize: 8192, uncompressedSize: 4096 }
```

`tests/lzma.test.ts` 会比较 Python 参考输出的完整字节，而不只检查头部。更多协议细节见 [docs/PROTOCOL.md](docs/PROTOCOL.md)。

## 型号点数与栅格尺寸

`SUPVAN_T50_PROFILE` 使用 Python 版本相同的 `dpi: 8` 点/mm（约 203 DPI）和 `maxWidthDots: 384`。调用方应先按 `dotsForMm(materialWidth, profile)` 生成真实点数；BLE/USB 栅格在源图超过型号最大点宽时会抛出 `ValidationError`，不会静默缩放。

## 构建与发布

在仓库根目录执行：

```bash
npm run build --workspace shuofang-t50-sdk
npm run pack:check --workspace shuofang-t50-sdk
```

确认 dry-run 文件列表和版本后发布：

```bash
cd sdk
npm publish --access public
```

发布前应更新 `sdk/package.json` 的版本号，并重新运行包内的类型检查、18 项协议测试和 npm 打包检查。

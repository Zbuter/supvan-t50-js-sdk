# shuofang-t50-sdk

用于在 JavaScript/TypeScript 应用中连接硕方 T50 标签打印机、准备打印数据、渲染标签页面并执行 BLE 或 USB HID 打印。

SDK 接收两类输入：

- <code>RasterPage</code>：已经按打印点生成的灰度或 RGBA 输入图像；发送前会转换成黑白点阵。
- <code>DrawPage</code> / <code>DrawJob</code>：使用毫米坐标描述文字、二维码、条码、图片、矩形和直线，由 SDK 渲染成打印点阵。

## 安装

~~~bash
npm install shuofang-t50-sdk
~~~

按运行环境选择入口：

| 入口 | 适用场景 |
| --- | --- |
| <code>shuofang-t50-sdk</code> | 通用打印、绘制、状态、栅格和自定义 transport API；不包含运行时设备选择 |
| <code>shuofang-t50-sdk/browser</code> | 浏览器 Web Bluetooth、WebHID、Canvas 预览，以及通用打印 API |
| <code>shuofang-t50-sdk/protocol</code> | BLE/USB 协议帧、状态解析、型号配置和协议常量 |
| <code>shuofang-t50-sdk/internal</code> | LZMA、栅格和字节工具；用于实现自定义集成，不建议业务代码直接依赖 |

浏览器的设备选择必须在 HTTPS 或 <code>localhost</code> 中，并且通常需要由用户点击事件直接触发。

## 最短打印示例

下面的示例打印一张 40 x 30 mm 的空白标签。T50 默认是 8 点/mm，所以图像尺寸为 320 x 240 点。

~~~ts
import {
  PaperType,
  SupvanPrinter,
  WebBluetoothTransport,
} from "shuofang-t50-sdk/browser";

const data = new Uint8Array(320 * 240);
data.fill(255); // 灰度值：0 是黑色，255 是白色

const transport = await WebBluetoothTransport.request("T0");
const printer = new SupvanPrinter(transport);

await printer.connect();
try {
  await printer.print({
    pages: [{ width: 320, height: 240, data }],
    settings: {
      materialWidth: 40,
      materialHeight: 30,
      paperType: PaperType.Gap,
      gap: 3,
      density: 4,
      speed: 40,
      copies: 1,
    },
  });
} finally {
  await printer.disconnect();
}
~~~

<code>WebBluetoothTransport.request("T0")</code> 中的 <code>T0</code> 是设备名称前缀，不是固定设备地址。需要 USB HID 时，将 transport 换成：

~~~ts
import { SupvanPrinter, WebHidTransport } from "shuofang-t50-sdk/browser";

const printer = new SupvanPrinter(await WebHidTransport.request());
await printer.connect();
~~~

## 打印数据

### <code>RasterPage</code>

~~~ts
interface RasterPage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
  repeat?: number;
}
~~~

| 字段 | 单位/格式 | 说明 |
| --- | --- | --- |
| <code>width</code> | 点 | 图像宽度，必须是正整数；不能超过当前页面的可用打印宽度 |
| <code>height</code> | 点 | 图像高度，必须是正整数 |
| <code>data</code> | 灰度或 RGBA | 灰度长度必须是 <code>width * height</code>；RGBA 长度必须是 <code>width * height * 4</code> |
| <code>repeat</code> | 次数 | 当前页面连续打印次数，默认 <code>1</code>，必须是正整数 |

灰度数据使用 <code>0</code> 到 <code>255</code> 表示黑到白。RGBA 数据会先按亮度和透明度转换为灰度，再按热敏阈值转换为黑白。T50 不支持连续灰度打印，灰度值只用于阈值判断；<code>density</code> 调整热敏头打印浓度，也不会产生灰度级别。SDK 不会因为图像太宽而自动缩放；超出 <code>maxWidthDots</code> 会抛出 <code>ValidationError</code>。未指定 <code>maxWidthDots</code> 时，页面可用宽度是 <code>Math.round(materialWidth * dotsPerMm)</code> 点。

### <code>PrintJob</code>

~~~ts
interface PrintJob {
  pages: RasterPage[];
  settings?: PrintSettings;
}
~~~

<code>pages</code> 不能为空。每个页面先应用自己的 <code>repeat</code>，再根据 <code>settings.copies</code> 展开：

- <code>oneByOne: true</code>（默认）：<code>第 1 份的全部页面 -> 第 2 份的全部页面</code>。
- <code>oneByOne: false</code>：<code>第 1 页的全部份数 -> 第 2 页的全部份数</code>。

例如两页、<code>copies: 2</code> 时，默认顺序是 <code>A, B, A, B</code>；关闭 <code>oneByOne</code> 后是 <code>A, A, B, B</code>。

打印和绘制任务共用以下页面任务模型；<code>expandPageJob(job, { taskName?, validatePage? })</code> 负责展开顺序，<code>expandPrintPages()</code> 和 <code>renderDrawJob()</code> 分别补充栅格校验和页面渲染：

~~~ts
interface PageJob<TPage> {
  pages: TPage[];
  settings?: {
    copies?: number;
    oneByOne?: boolean;
  };
}
~~~

## 打印参数

### <code>PrintSettings</code>

所有尺寸字段 <code>materialWidth</code>、<code>materialHeight</code>、<code>gap</code> 使用毫米。图像 <code>RasterPage.width</code> 和 <code>height</code> 使用打印点，两者不是同一个单位。

| 字段 | 默认值 | 有效范围 | 作用 |
| --- | ---: | --- | --- |
| <code>materialWidth</code> | <code>48</code> | <code>1</code> 到 <code>50</code> mm | 耗材宽度。影响协议耗材参数和居中区域；省略时优先使用已读取耗材信息 |
| <code>materialHeight</code> | <code>30</code> | <code>1</code> 到 <code>120</code> mm | 单张标签高度。BLE 会用它建立打印工作区高度；省略时优先使用已读取耗材信息 |
| <code>copies</code> | <code>1</code> | <code>1</code> 到 <code>99</code> | 整个任务的份数；通常应传整数 |
| <code>direction</code> | <code>0</code> | <code>0</code> 到 <code>3</code> | BLE 和 USB 共用的图像方向编码：<code>0</code> = 0°、<code>1</code> = 180°、<code>2</code> = 270°、<code>3</code> = 90°（顺时针） |
| <code>density</code> | <code>4</code> | <code>0</code> 到 <code>9</code> | 热敏打印浓度，数值越大通常越深 |
| <code>horizontalOffset</code> | <code>0</code> | <code>-9</code> 到 <code>9</code> | 图像水平偏移，单位是打印点；正数向右 |
| <code>verticalOffset</code> | <code>0</code> | <code>-9</code> 到 <code>9</code> | 图像垂直偏移，单位是打印点；正数向下 |
| <code>paperType</code> | <code>PaperType.Gap</code> | <code>1</code>、<code>2</code>、<code>5</code> | 纸张检测方式，见下表 |
| <code>gap</code> | <code>3</code> | <code>0</code> 到 <code>8</code> mm | 相邻标签之间的间隙；省略时优先使用已读取耗材信息 |
| <code>oneByOne</code> | <code>true</code> | 布尔值 | 控制多页任务的份数展开顺序 |
| <code>tailLength</code> | <code>0</code> | 协议字节值 | BLE 参数块中的尾部长度字段；当前 SDK 不单独校验它，通常保持 <code>0</code> |
| <code>speed</code> | <code>40</code> | <code>20</code> 到 <code>60</code> | USB 传输时下发给打印机的速度参数；当前 BLE 打印路径不使用它控制传输速度 |
| <code>maxWidthDots</code> | <code>Math.round(materialWidth * dotsPerMm)</code> | <code>1</code> 到当前页面宽度 | 可选的图像工作区宽度，单位是点；不能超过当前页面宽度，也不会自动缩放 |
| <code>dotsPerMm</code> | <code>8</code> | <code>0.1</code> 到 <code>32</code> | 协议使用的点密度，单位是点/mm；T50 为 <code>8</code> 点/mm |

### <code>PaperType</code>

~~~ts
enum PaperType {
  Gap = 1,
  BlackMark = 2,
  BlackMarkCard = 5,
}
~~~

| 值 | 含义 |
| ---: | --- |
| <code>PaperType.Gap</code> | 使用标签间隙定位 |
| <code>PaperType.BlackMark</code> | 使用黑标定位 |
| <code>PaperType.BlackMarkCard</code> | 使用黑标卡片类耗材定位 |

对于 USB，设备耗材配置块会把小于 <code>2</code> 的 <code>gap</code> 按 <code>2</code> 写入；如果使用 USB，建议直接传打印机耗材上的实际值。

### 参数解析和耗材自动读取

<code>resolvePrintSettings(settings?, labelBox?, profile?)</code> 返回包含所有字段的 <code>ResolvedPrintSettings</code>：

~~~ts
const resolved = resolvePrintSettings(
  { density: 5, copies: 2 },
  labelBox,
  SUPVAN_T50_PROFILE,
);
~~~

字段的解析优先级如下：

1. <code>settings</code> 中明确传入的值。
2. <code>materialWidth</code>、<code>materialHeight</code>、<code>gap</code> 使用 <code>labelBox</code> 中的值。
3. T50 默认值或传入 <code>PrinterProfile</code> 的 <code>dotsPerMm</code>。
4. 未指定 <code>maxWidthDots</code> 时，根据解析后的 <code>materialWidth</code> 和 <code>dotsPerMm</code> 计算页面宽度；显式宽度只能小于或等于该值。

<code>SupvanPrinter.print()</code> 默认在这三个耗材字段任意一个缺失时调用 <code>readLabelBox()</code>，再解析设置。可以在构造选项中设置 <code>autoReadLabelBox: false</code> 禁用这次额外通信；禁用后缺失字段使用默认值或 profile 值。

<code>expandPrintPages(job)</code> 会校验页面尺寸、<code>repeat</code> 和像素长度，并返回按照 <code>copies</code>、<code>repeat</code>、<code>oneByOne</code> 展开后的页面数组。它适合在真正连接打印机前检查任务展开结果。

## 打印机对象

### <code>SupvanPrinter</code>

<code>SupvanPrinter</code> 根据 <code>transport.kind</code> 自动选择 BLE 或 USB 后端。

~~~ts
interface SupvanPrinterOptions {
  autoReadLabelBox?: boolean;
  ble?: BlePrinterOptions;
  usb?: UsbPrinterOptions;
  profile?: PrinterProfile;
}
~~~

| 成员 | 返回值 | 说明 |
| --- | --- | --- |
| <code>connected</code> | <code>boolean</code> | 当前连接状态 |
| <code>connect()</code> | <code>Promise&lt;void&gt;</code> | 建立连接并初始化 transport |
| <code>disconnect()</code> | <code>Promise&lt;void&gt;</code> | 关闭连接并清理接收缓冲区 |
| <code>getStatus()</code> | <code>Promise&lt;PrinterStatus&gt;</code> | 读取当前状态 |
| <code>readLabelBox()</code> | <code>Promise&lt;LabelBoxInfo&gt;</code> | 读取耗材盒信息 |
| <code>print(job)</code> | <code>Promise&lt;void&gt;</code> | 校验、转换并打印整个任务 |
| <code>stop()</code> | <code>Promise&lt;boolean&gt;</code> | 请求停止打印并返回设备是否确认停止；BLE 收到停止确认后返回 <code>true</code> |

构造函数会检查 transport 类型：BLE transport 只能配 BLE 后端，USB transport 只能配 USB 后端。没有连接就调用 <code>getStatus()</code>、<code>readLabelBox()</code> 或 <code>print()</code> 会抛出 <code>CommunicationError</code>。

### 直接使用 <code>BlePrinter</code> / <code>UsbPrinter</code>

通常使用 <code>SupvanPrinter</code> 即可。需要访问后端独有的超时配置时，可以直接构造：

~~~ts
interface BlePrinterOptions {
  timeouts?: {
    commandTimeoutMs?: number;
    printTimeoutMs?: number;
  };
  autoReadLabelBox?: boolean;
  profile?: PrinterProfile;
}

interface UsbPrinterOptions {
  timeouts?: {
    readTimeoutMs?: number;
    printTimeoutMs?: number;
  };
  autoReadLabelBox?: boolean;
  pollIntervalMs?: number;  // 默认 50 ms
  profile?: PrinterProfile;
}
~~~

两者都提供 <code>connected</code>、<code>connect()</code>、<code>disconnect()</code>、<code>getStatus()</code>、<code>readLabelBox()</code>、<code>print(job)</code> 和返回 <code>Promise&lt;boolean&gt;</code> 的 <code>stop()</code>。命令和打印超时通过 <code>timeouts</code> 配置；<code>BlePrinter.getStatus(timeoutMs?)</code> 和 <code>BlePrinter.readLabelBox(timeoutMs?)</code> 可单独覆盖本次命令超时。

## 传输层

### Web Bluetooth

~~~ts
interface WebBluetoothOptions {
  chunkSize?: number;    // 默认 20
  chunkDelayMs?: number; // 默认 10 ms
}
~~~

~~~ts
const transport = await WebBluetoothTransport.request("T0", {
  chunkSize: 20,
  chunkDelayMs: 10,
});
~~~

<code>chunkSize</code> 是每次写入 BLE characteristic 的字节数，<code>chunkDelayMs</code> 是连续写入之间的等待时间。设备名称以 <code>namePrefix</code> 开头才会出现在选择框中。类实例还提供：

| 成员 | 说明 |
| --- | --- |
| <code>name</code> | 设备名称 |
| <code>kind</code> | 固定为 <code>"ble"</code> |
| <code>connected</code> | GATT 连接状态 |
| <code>connect()</code> / <code>disconnect()</code> | 建立或断开 GATT 连接 |
| <code>write(data)</code> | 按 BLE 分片写入一段逻辑数据 |
| <code>read(size = 512, timeoutMs = 2000)</code> | 等待通知并读取最多 <code>size</code> 字节 |

### WebHID

~~~ts
const transport = await WebHidTransport.request();
~~~

<code>WebHidTransport.request()</code> 只筛选 SDK 中列出的硕方 T50 USB VID/PID，不接受额外筛选参数。实例的 <code>write()</code> 会按 64 字节 HID report 拆分；T50 输入报告还带一个协议前导字节，transport 会去掉它并消费每份报告的剩余填充。<code>read(size = 512, timeoutMs = 2000)</code> 从 input report 缓冲区读取逻辑数据。

## DrawObject 页面渲染

### 页面和任务

<code>DrawPage</code> 的坐标和尺寸全部使用毫米；渲染时按 <code>profile.dotsPerMm</code> 转换为点。对象数组的顺序就是绘制顺序，后绘制的对象会覆盖前面的对象。

~~~ts
interface DrawPage {
  width: number;        // mm
  height: number;       // mm
  objects: DrawObject[];
  repeat?: number;      // 默认 1
}

interface DrawJob {
  pages: DrawPage[];
  settings?: {
    copies?: number;    // 默认 1，1-99 的整数
    oneByOne?: boolean; // 默认 true
  };
}
~~~

### <code>DrawObject</code>

核心对象是按 <code>format</code> 区分的判别联合。所有对象都必须提供 <code>x</code>、<code>y</code>、<code>width</code>、<code>height</code>，单位是毫米；<code>x</code>、<code>y</code> 不能为负，宽高必须大于 <code>0</code>。

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| <code>x</code>, <code>y</code> | 无 | 对象左上角坐标，单位 mm |
| <code>width</code>, <code>height</code> | 无 | 对象绘制区域，单位 mm |
| <code>format</code> | 无 | 必须是 <code>DrawObjectFormat</code> 中的类型值 |
| <code>content</code> | 依类型而定 | 文字、二维码或条码内容；二维码和条码必须提供 |
| <code>fontFamily</code> | <code>"sans-serif"</code> | <code>TEXT</code> 对象的 Canvas 字体名 |
| <code>fontWeight</code> | 普通 | 只有值为 <code>"bold"</code> 时使用粗体 |
| <code>fontSize</code> | <code>3</code> | <code>TEXT</code> 字号，按 mm 转换为打印点 |
| <code>fontStyle</code> | <code>DrawFontStyle.Normal</code> | <code>TEXT</code> 位标志组合，见下表 |
| <code>align</code> | <code>"left"</code> | <code>TEXT</code> 对齐方式：<code>left</code>、<code>center</code> 或 <code>right</code> |
| <code>antiColor</code> | <code>false</code> | 反色；文字变为白字黑底，二维码/条码变为白色图案黑底 |
| <code>autoReturn</code> | <code>false</code> | 按对象宽度自动换行；显式 <code>\n</code> 始终换行 |
| <code>lineHeight</code> | <code>1.25</code> | 文本行高倍率，最小按 <code>0.5</code> 处理 |
| <code>rotation</code> | <code>0</code> | 绕对象中心旋转，单位为度；负数会归一化 |
| <code>fill</code> | 无 | 矩形填充；<code>transparent</code> 表示不填充，热敏输出只保留黑/白 |
| <code>stroke</code> | <code>"#000000"</code> | 矩形或直线颜色；非白色值会按黑色处理 |
| <code>strokeWidth</code> | <code>0.35</code> | 矩形边框或直线宽度，单位 mm |
| <code>image</code> | 无 | <code>IMAGE</code> 对象必须提供图片源；浏览器中通常传 <code>CanvasImageSource</code> |

### 对象类型

~~~ts
enum DrawObjectFormat {
  Text = "TEXT",
  Ean13 = "EAN_13",
  Code128 = "CODE_128",
  QrCode = "QR_CODE",
  Image = "IMAGE",
  Rectangle = "RECTANGLE",
  Line = "LINE",
}
~~~

| 类型 | 内容和行为 |
| --- | --- |
| <code>Text</code> | 使用 <code>content</code> 绘制文字；默认字体 <code>sans-serif</code>、字号 <code>3</code>、不自动换行 |
| <code>QrCode</code> | 使用 <code>content</code> 绘制二维码，内容不能为空；二维码带四个模块的空白区 |
| <code>Code128</code> | 使用 <code>content</code> 绘制 Code 128；内容只能包含 ASCII <code>0x20</code> 到 <code>0x7f</code> |
| <code>Ean13</code> | 使用 <code>content</code> 绘制 EAN-13；内容必须是 12 位数字，或带正确校验位的 13 位数字 |
| <code>Image</code> | 把图片缩放到对象区域；字符串 URL 等资源需通过 <code>imageResolver</code> 转成 <code>CanvasImageSource</code> |
| <code>Rectangle</code> | 使用 <code>fill</code> 填充并使用 <code>stroke</code>/<code>strokeWidth</code> 描边 |
| <code>Line</code> | 在对象区域垂直居中绘制一条水平线，使用 <code>stroke</code>/<code>strokeWidth</code> |

~~~ts
enum DrawFontStyle {
  Normal = 0,
  Bold = 1,
  Underline = 4,
  Strikeout = 8,
}
~~~

例如同时加粗和下划线可以使用 <code>DrawFontStyle.Bold | DrawFontStyle.Underline</code>。

### 渲染函数

~~~ts
interface DrawRenderOptions {
  imageResolver?: (object: DrawObject) => CanvasImageSource | undefined;
}

interface DrawRenderTarget {
  context: DrawCanvasContext;
  width: number;
  height: number;
}
~~~

| API | 参数和返回值 |
| --- | --- |
| <code>drawPageSize(page, profile?)</code> | 将页面毫米尺寸按 <code>profile.dotsPerMm</code> 转换为点，返回 <code>{ width, height }</code>；页面宽度由页面尺寸决定，不会自动缩放 |
| <code>drawObject(context, object, profile?, options?)</code> | 在给定 Canvas 2D context 中绘制一个对象 |
| <code>normalizeDrawObject(input)</code> | 将输入对象归一化为规范 <code>DrawObject</code>；对象类型不匹配时抛出 <code>ValidationError</code> |
| <code>renderDrawPage(context, page, profile?, options?)</code> | 清空并填充白色背景，然后按顺序绘制页面对象；返回页面点尺寸 |
| <code>renderDrawJob(job, targetFactory, profile?, options?)</code> | 按 <code>copies</code>/<code>repeat</code>/<code>oneByOne</code> 展开页面；<code>targetFactory(size, page, index)</code> 为每张物理页创建目标，返回目标数组 |
| <code>normalizeAngle(value)</code> | 将角度归一化到 <code>0</code> 到 <code>&lt;360</code>；非有限数返回 <code>0</code> |

<code>DrawCanvasContext</code> 是浏览器 Canvas 2D context 的最小接口。只要运行时提供 <code>save</code>、<code>restore</code>、变换、路径、文字和图片绘制方法，就可以把 <code>renderDrawPage</code> 接到其他 Canvas 实现。

## 浏览器预览

以下 API 从 <code>shuofang-t50-sdk/browser</code> 导出，结果是实际打印点尺寸的 <code>HTMLCanvasElement</code>：

~~~ts
interface BrowserPreviewOptions extends DrawRenderOptions {
  profile?: PrinterProfile;
  canvas?: HTMLCanvasElement;
  canvasFactory?: (width: number, height: number) => HTMLCanvasElement;
  monochrome?: boolean; // 默认 true
}

interface BrowserObjectPreviewOptions extends BrowserPreviewOptions {
  pageWidth?: number;
  pageHeight?: number;
}
~~~

| API | 说明 |
| --- | --- |
| <code>previewDrawPage(page, options?)</code> | 将一个 <code>DrawPage</code> 渲染到 Canvas；可复用 <code>options.canvas</code> 或通过 <code>canvasFactory</code> 创建 |
| <code>previewDrawObject(object, options?)</code> | 将一个对象渲染到页面；省略 <code>pageWidth</code>/<code>pageHeight</code> 时使用对象边界 |
| <code>previewDrawJob(job, options?)</code> | 渲染任务展开后的所有物理页；每页由 <code>canvasFactory</code> 创建 |
| <code>rasterFromPreviewCanvas(canvas, monochrome = true)</code> | 读取 Canvas 像素并转换为 <code>RasterPage</code>；<code>monochrome</code> 为真时输出黑白 RGBA |

示例：

~~~ts
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
        align: "center",
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
~~~

预览结果可以直接放入 <code>PrintJob</code>：

~~~ts
await printer.print({ pages });
~~~

## 栅格和热敏处理

这些函数从通用入口导出，适合在调用打印机前准备图像：

| API | 参数和行为 |
| --- | --- |
| <code>toGrayscale(page)</code> | 将灰度或 RGBA <code>RasterPage</code> 转为 <code>{ width, height, data: Uint8Array }</code>；RGBA 使用亮度和 alpha 合成到白底 |
| <code>createGrayRaster(width, height, fill = 255)</code> | 创建灰度图；<code>fill</code> 是初始灰度值 |
| <code>resizeRaster(source, width, height)</code> | 使用双线性插值缩放灰度图 |
| <code>rotateRaster(source, clockwiseQuarterTurns)</code> | 按顺时针 90 度倍数旋转；负数和大于 <code>4</code> 的值会按模 4 处理 |
| <code>pasteRaster(target, source, left, top)</code> | 将源图复制到目标图；超出目标边界的部分会裁剪 |
| <code>mirrorRaster(source)</code> | 水平镜像并返回新灰度图 |
| <code>rasterFromImageData(image)</code> | 将 <code>{ width, height, data }</code> 包装为 <code>RasterPage</code>，不复制像素 |
| <code>toThermalPixels(data, threshold = 190)</code> | 将 RGBA 转为不透明黑白 RGBA；透明度小于 <code>16</code> 或亮度大于等于阈值的像素变为白色 |

<code>GrayRaster</code> 的 <code>data</code> 是每像素一个字节，<code>0</code> 为黑，<code>255</code> 为白。<code>RgbaImageData</code> 的 <code>data</code> 可以是 <code>Uint8Array</code> 或 <code>Uint8ClampedArray</code>。

## 型号配置

~~~ts
interface PrinterProfile {
  id: string;
  name: string;
  dotsPerMm: number;
  physicalDpi: number;
}
~~~

SDK 自带的 <code>SUPVAN_T50_PROFILE</code>：

| 字段 | 值 | 含义 |
| --- | --- | --- |
| <code>id</code> | <code>"t50"</code> | 型号标识 |
| <code>name</code> | <code>"T50 · 203 DPI"</code> | 显示名称 |
| <code>dotsPerMm</code> | <code>8</code> | 协议点密度，8 点/mm |
| <code>physicalDpi</code> | <code>203</code> | 人类可读的物理 DPI |

<code>dotsForMm(value, profile?)</code> 将正的毫米尺寸转换为点并四舍五入，最小返回 <code>1</code>。自定义 profile 可传给 <code>SupvanPrinterOptions.profile</code>、<code>drawPageSize</code>、<code>renderDrawPage</code>、<code>renderDrawJob</code> 和预览选项。

<code>normalizePrinterProfile(profile?)</code> 校验 profile 并返回包含 <code>dotsPerMm</code> 的规范 profile。

## 打印状态和耗材信息

### <code>PrinterState</code>

| 枚举 | 值 | 含义 |
| --- | ---: | --- |
| <code>Ready</code> | <code>0</code> | 准备就绪 |
| <code>HeadOverheat</code> | <code>1</code> | 打印头温度过高 |
| <code>CoverOpen</code> | <code>2</code> | 上盖未关好 |
| <code>MediaNotInstalled</code> | <code>3</code> | 耗材未装好 |
| <code>MediaLow</code> | <code>4</code> | 耗材余量不足 |
| <code>MediaNotDetected</code> | <code>5</code> | 未检测到耗材 |
| <code>MediaUnrecognized</code> | <code>6</code> | 未识别到耗材 |
| <code>MediaEmpty</code> | <code>7</code> | 耗材已用完 |
| <code>BatteryLow</code> | <code>8</code> | 电池电压低 |
| <code>CommunicationError</code> | <code>9</code> | 通信异常 |

### <code>PrinterStatus</code>

状态的稳定结构是状态码、标志集合、指标集合和原始响应：

~~~ts
interface PrinterStatus {
  state: PrinterState;
  flags: PrinterStatusFlags;
  metrics: PrinterMetrics;
  raw: Uint8Array;
  rawFlags: Uint8Array;
}

interface PrinterStatusFlags {
  bufferFull: boolean;
  headOverheat: boolean;
  labelReadWriteError: boolean;
  mediaNotDetected: boolean;
  mediaLow: boolean;
  mediaEmpty: boolean;
  mediaUnrecognized: boolean;
  mediaNotInstalled: boolean;
  batteryLow: boolean;
  busy: boolean;
  coverOpen: boolean;
  usbInserted: boolean;
  printing: boolean;
  secondDeviceBusy: boolean;
  labelNotInstalled: boolean;
  charging: boolean;
}

interface PrinterMetrics {
  printedPages: number;
  totalPages: number;
  temperatureC?: number;
  voltageV?: number;
}
~~~

| 字段 | 说明 |
| --- | --- |
| <code>state</code> | <code>PrinterState</code> 枚举值 |
| <code>flags</code> | 设备布尔标志；耗材、上盖、忙碌、打印、电池和 USB 状态都在这里 |
| <code>metrics</code> | 页计数、打印头温度和电压；设备不提供的指标为 <code>undefined</code> |
| <code>raw</code> | 原始状态响应 |
| <code>rawFlags</code> | 原始状态标志字节 |

### <code>LabelBoxInfo</code>

| 字段 | 说明 |
| --- | --- |
| <code>uuidHex</code> | 耗材 UUID 的大写十六进制字符串 |
| <code>codeHex</code> | 耗材编码的大写十六进制字符串 |
| <code>serialNumber</code> | 耗材序列号 |
| <code>typeCode</code> | 耗材类型编码 |
| <code>rawHeight</code> | 响应中的原始高度值 |
| <code>height</code> | SDK 使用的高度值 |
| <code>width</code> | 耗材宽度，单位 mm |
| <code>rawGap</code> | 响应中的原始间隙值 |
| <code>gap</code> | SDK 使用的间隙值，单位 mm |
| <code>remaining</code> | 剩余数量 |
| <code>template5mm</code> / <code>template40mm</code> | 耗材响应中的模板字段 |
| <code>timestampDigits</code> | 响应中的时间数字串 |
| <code>raw</code> | 原始耗材响应 |

## 运行时能力

~~~ts
interface RuntimeCapabilities {
  secureContext: boolean;
  webBluetooth: boolean;
  webHid: boolean;
}

const capabilities = detectCapabilities();
~~~

<code>webBluetooth</code> 和 <code>webHid</code> 只有在安全上下文且浏览器提供对应 API 时为真。能力检测不会请求权限，也不会连接设备。

## LabelDocument、模板和 SVG

`LabelDocument` 是标签的跨模块主文档，坐标和尺寸使用毫米；`DrawPage` 仍作为低复杂度绘制和打印 API 保留。模板只需保存一份 `LabelDocument`，载入时调用 `cloneTemplateDocument()`，因此编辑不会修改预制内容。

跨端复制使用 `SUPVAN1:<base64url-json>` 文本协议：浏览器调用 `encodeLabelTransfer()` 写入剪贴板，小程序通过 `wx.getClipboardData()` 读取后调用 `decodeLabelTransfer()`，即可恢复可编辑的 `LabelDocument`。协议包包含 `magic: "SUPVAN_LABEL"`、`version: 1` 和 `document`，不依赖图片剪贴板。

```ts
import {
  cloneTemplateDocument,
  createLabelDocument,
  createLabelTemplate,
  labelDocumentToSvgString,
  packMonochromeBitmap,
} from "shuofang-t50-sdk";

const template = createLabelTemplate(
  "storage",
  "收纳模板",
  createLabelDocument(40, 30, []),
);
const editable = cloneTemplateDocument(template);
const svg = labelDocumentToSvgString(editable);
```

黑白图片不需要保存原始大图。可以使用 `packMonochromeBitmap(widthDots, heightDots, pixels)` 保存为 `LabelBitmapResource`，再让 `image.resourceId` 指向 `resources.bitmaps`。每个点只占 1 bit，导出 SVG 时会按黑点行段生成 `<rect>`，大图尺寸不会改变标签的毫米映射。

## 高级协议 API

下面的函数从 <code>shuofang-t50-sdk/protocol</code> 导出。普通应用应使用 <code>SupvanPrinter</code>；只有需要自定义 transport、抓取协议帧或实现其他运行时适配时才需要直接调用。

### BLE 协议

| API | 参数和返回值 |
| --- | --- |
| <code>buildR1(command, value = 0)</code> | 构造单值 BLE 控制帧；<code>command</code> 是 8 位命令，<code>value</code> 是 16 位值 |
| <code>buildR2(command, transferSize, packetCount)</code> | 构造批量传输控制帧；传输大小和分包数都是 16 位值 |
| <code>buildDataQuery(command, data)</code> | 构造带数据的 BLE 请求帧 |
| <code>parseBleResponse(frame, expectedCommand?)</code> | 校验帧头、声明长度、校验和和可选命令号；返回原始帧 |
| <code>parseBleStatus(frame)</code> | 校验 <code>0x11</code> 状态响应并返回 <code>PrinterStatus</code> |
| <code>parseLabelBoxData(data)</code> | 从耗材响应数据解析 <code>LabelBoxInfo</code> |
| <code>parseBleLabelBox(frame)</code> | 校验 <code>0x30</code> BLE 响应并解析耗材信息 |
| <code>makeParameterBlock(settings)</code> | 根据完整设置生成 BLE 耗材参数块 |
| <code>prepareBleRaster(page, settings)</code> | 将输入转换为中间灰度图，按公共 <code>direction</code> 方向旋转、居中和偏移；后续会按阈值打包为黑白 BLE 点阵 |
| <code>bleImageFrames(page, settings, jobLastPage = false)</code> | 生成固定 <code>4096</code> 字节的 BLE 图像帧；最后一页标志由 <code>jobLastPage</code> 控制 |
| <code>compressedBleBatches(frames, maxFrames = 4)</code> | 将图像帧按批次使用 T50 LZMA 压缩；返回 <code>frameCount</code>、<code>data</code> 和估算 <code>speed</code> |
| <code>buildPrintBulkPacket(packetIndex, packetCount, data)</code> | 生成 506 字节内层分包；<code>data</code> 最多 500 字节 |
| <code>buildBulkOuter512(inner)</code> | 将 506 字节内层分包包装成 512 字节外层分包 |
| <code>bulkPackets(data)</code> | 按 500 字节拆分压缩数据并生成 512 字节外层分包；分包总数不能超过 255 |

### USB 协议

| API | 参数和返回值 |
| --- | --- |
| <code>buildVendorRequest(command, value1 = 0, value2?)</code> | 构造 USB vendor request；<code>command</code> 为 8 位，数值参数为 16 位 |
| <code>buildMediaConfig(settings)</code> | 根据耗材设置生成 USB 媒介配置块 |
| <code>parseUsbStatus(data, totalPages = 0)</code> | 解析至少 8 字节的 USB 状态，并填充总页数 |
| <code>prepareUsbRaster(page, settings)</code> | 将输入转换为中间灰度图，按 <code>direction</code> 旋转、居中、偏移并水平镜像；后续会按阈值打包为黑白 USB 点阵 |
| <code>usbImageFrames(page, settings, lastJobPage = false, threshold = 190)</code> | 按行打包 USB 图像帧；<code>threshold</code> 控制灰度转黑点的阈值 |
| <code>selectUsbTransferBlock(frames, maxFrames = 8, maxSize = 4096)</code> | 从帧列表前部选择一个压缩后不超过 <code>maxSize</code> 的传输块 |
| <code>hidReports(payload)</code> | 按 64 字节切分 HID payload，并追加驱动需要的尾部空 report |

### LZMA 和底层工具

LZMA 函数和栅格/字节工具从 <code>shuofang-t50-sdk/internal</code> 导出。它们属于实现工具，不是普通业务打印入口。

<code>SUPVAN_LZMA_OPTIONS</code> 是只读配置：

| 参数 | 值 | 作用 |
| --- | --- | --- |
| <code>a</code> | <code>2</code> | 压缩模式 |
| <code>d</code> | <code>13</code> | 字典参数 |
| <code>fb</code> | <code>128</code> | nice length |
| <code>mf</code> | <code>"bt4"</code> | 匹配查找器 |
| <code>lc</code> | <code>3</code> | literal context bits |
| <code>lp</code> | <code>0</code> | literal position bits |
| <code>pb</code> | <code>2</code> | position bits |
| <code>eos</code> | <code>true</code> | 写入 end marker |

| API | 说明 |
| --- | --- |
| <code>lzmaCompress(source)</code> | 压缩一段数据，并校验输出为 T50 兼容的 LZMA-Alone 格式 |
| <code>lzmaCompressFrames(frames)</code> | 先拼接多帧，再调用 <code>lzmaCompress</code> |
| <code>inspectLzmaHeader(data)</code> | 读取 properties、字典大小和未压缩大小 |
| <code>assertSupvanLzmaHeader(data)</code> | 要求 properties 为 <code>0x5D</code>、字典为 <code>8192</code> 字节，否则抛出 <code>ValidationError</code> |

## 通用 transport 接口

如果要接入 SDK 没有内置的运行时，实现下面的接口即可交给 <code>SupvanPrinter</code>：

~~~ts
type TransportKind = "ble" | "usb";

interface PrinterTransport {
  readonly kind: TransportKind;
  readonly name: string;
  readonly connected: boolean;
  readonly capabilities?: {
    bulkAck: "required" | "optional" | "none";
    pageSubmission: "separate" | "batched";
    completion: "device-confirmed" | "submit-confirmed";
  };
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  read(size?: number, timeoutMs?: number): Promise<Uint8Array>;
}
~~~

优先设置结构化的 <code>capabilities</code>：

- <code>bulkAck</code>：批量 BLE 分包确认方式；<code>required</code> 表示必须等待，<code>optional</code> 表示设备可能发送，<code>none</code> 表示不等待。
- <code>pageSubmission</code>：多页任务是逐物理页提交还是批量提交。
- <code>completion</code>：以设备状态确认实际完成，还是提交成功即可结束。

<code>writeChunked(write, data, chunkSize, delayMs = 0)</code> 可把任意数据按指定大小分片写入。<code>AsyncByteQueue</code> 提供 <code>push(data)</code>、<code>clear()</code> 和 <code>read(size = 512, timeoutMs = 2000)</code>，用于把异步通知缓冲成 transport 的读取接口。

## 常量

| 常量 | 值/含义 |
| --- | --- |
| <code>FRAME_SIZE</code> | <code>4096</code>，逻辑图像帧大小 |
| <code>FRAME_HEADER_SIZE</code> | <code>14</code> |
| <code>USB_FRAME_DATA_SIZE</code> | <code>4074</code> |
| <code>HID_REPORT_SIZE</code> | <code>64</code> |
| <code>SUPVAN_VENDOR_ID</code> | <code>0x1820</code> |
| <code>T50_PRODUCT_IDS</code> | <code>0x2072</code>、<code>0x2073</code>、<code>0x2074</code>、<code>0x2076</code>、<code>0x2077</code>、<code>0x207d</code>、<code>0x207f</code>、<code>0x2170</code> |
| <code>LZMA_ALONE_HEADER</code> | <code>[0x5d, 0x00, 0x20, 0x00, 0x00]</code> |
| <code>LZMA_DICTIONARY_SIZE</code> | <code>8192</code> |

BLE UUID：

| 名称 | UUID |
| --- | --- |
| <code>BLE_UUIDS.service</code> | <code>0000e0ff-3c17-d293-8e48-14fe2e4da212</code> |
| <code>BLE_UUIDS.write</code> | <code>0000ffe9-0000-1000-8000-00805f9b34fb</code> |
| <code>BLE_UUIDS.notify</code> | <code>0000ffe1-0000-1000-8000-00805f9b34fb</code> |
| <code>BLE_UUIDS.bulkNotify</code> | <code>0000ffea-0000-1000-8000-00805f9b34fb</code> |

USB 命令常量：

| 名称 | 值 |
| --- | ---: |
| <code>USB_COMMANDS.bufferFull</code> | <code>0x10</code> |
| <code>USB_COMMANDS.inquiryStatus</code> | <code>0x11</code> |
| <code>USB_COMMANDS.checkDevice</code> | <code>0x12</code> |
| <code>USB_COMMANDS.startPrint</code> | <code>0x13</code> |
| <code>USB_COMMANDS.stopPrint</code> | <code>0x14</code> |
| <code>USB_COMMANDS.returnMaterial</code> | <code>0x30</code> |
| <code>USB_COMMANDS.transferData</code> | <code>0x5c</code> |
| <code>USB_COMMANDS.setMedia</code> | <code>0x5d</code> |

## 错误类型

| 类型 | 常见原因 |
| --- | --- |
| <code>SupvanError</code> | 所有 SDK 错误的基类 |
| <code>ValidationError</code> | 参数范围、页面尺寸、像素长度、帧格式不符合要求 |
| <code>CapabilityError</code> | 当前环境没有 Web Bluetooth 或 WebHID 能力，或没有选择设备 |
| <code>CommunicationError</code> | 未连接、读写失败、响应长度/校验和错误、打印超时 |
| <code>TimeoutError</code> | <code>CommunicationError</code> 的子类，等待设备数据超时 |
| <code>DeviceError</code> | 打印机报告上盖、耗材、电池、温度或其他设备状态错误 |

建议在一次打印任务外层统一处理这些错误，并在 <code>DeviceError</code> 时先读取 <code>getStatus()</code>；不要把 <code>ValidationError</code> 当成设备故障重试。

## 已知行为

- T50 默认 profile 使用 <code>8</code> 点/mm、物理约 <code>203 DPI</code>；页面宽度根据 <code>materialWidth * dotsPerMm</code> 计算。
- 页面和图像不会自动缩放。需要缩放时先使用 <code>resizeRaster</code>，或在生成 <code>DrawPage</code> 时调整毫米尺寸。
- <code>PrintSettings.dotsPerMm</code> 表示协议点密度，即点/mm；它不是浏览器屏幕分辨率，也不是 <code>physicalDpi</code>。
- BLE 和 USB 共用 <code>PrintSettings.direction</code>；底层栅格布局、镜像和帧格式仍分别遵循各自协议。
- <code>DrawObject</code> 的文字、二维码、条码、矩形和直线最终都会变成黑白热敏输出；彩色 <code>fill</code>/<code>stroke</code> 不会保留彩色。
- 浏览器 transport 依赖安全上下文，并且设备选择必须由用户操作触发。

## 开发验证

在 SDK 目录执行：

~~~bash
npm run typecheck
npm test
npm run build
npm run pack:check
~~~

<code>npm run build</code> 会先执行类型检查和测试，再生成发布文件。发布前确认版本号和 <code>npm pack --dry-run</code> 内容，然后执行：

~~~bash
npm publish --access public
~~~

协议帧和图像处理的补充说明见 [docs/PROTOCOL.md](docs/PROTOCOL.md)。

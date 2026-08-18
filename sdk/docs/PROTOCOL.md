# 硕方协议实现说明

本文记录 JavaScript 实现必须保持的 Python SDK 行为，便于以后更换压缩库、transport 或重构栅格代码时做回归检查。

## 分层

```text
RasterPage
  -> BLE raster / USB raster
  -> 4096-byte logical frames
  -> LZMA-Alone (BLE image transfer) or raw transfer block (USB)
  -> protocol commands
  -> runtime transport
```

BLE 和 USB 共用打印任务类型、状态模型和 4096 字节逻辑帧概念，但位图方向、帧头和传输方式不同。不要把两个 raster 函数合并为同一套镜像/旋转逻辑。

## LZMA-Alone

BLE 图像帧使用 LZMA-Alone，而不是 `.xz` 容器。编码参数：

| 参数 | 值 |
| --- | --- |
| 算法 | LZMA1 |
| properties | `0x5D` (`lc=3`, `lp=0`, `pb=2`) |
| dictionary | `8192` (`0x2000`) |
| mode | normal |
| match finder | BT4 |
| nice length | 128 |
| end marker | 启用 |

13 字节头布局：

| 偏移 | 长度 | 内容 |
| --- | --- | --- |
| 0 | 1 | properties `5D` |
| 1 | 4 | 字典大小，小端：`00 20 00 00` |
| 5 | 8 | 未压缩长度，小端 |

4096 字节参考帧（首字节为 `01`，其余为 `00`）的完整输出：

```text
5d0020000000100000000000000000804148018c2ebc50a133874bd40214b5f191e6226b47af576051ffea068000
```

`lzmaCompress()` 会在每次压缩后校验头和原始长度；参数不匹配会直接抛出 `ValidationError`。

## BLE

### GATT

| 用途 | UUID |
| --- | --- |
| Service | `0000e0ff-3c17-d293-8e48-14fe2e4da212` |
| 控制写 | `0000ffe9-0000-1000-8000-00805f9b34fb` |
| 数据写/通知 | `0000ffe1-0000-1000-8000-00805f9b34fb` |
| 批量通知（可选） | `0000ffea-0000-1000-8000-00805f9b34fb` |

浏览器和小程序 transport 在 BLE 层按 MTU 友好的小块写入；协议层仍接收完整逻辑 payload。

### 栅格

1. 按型号配置建立宽 `maxDotValue` 点、高 `materialHeight * dpi` 点的白色工作区。
2. 按设置旋转并居中，应用水平/垂直偏移；源图超过型号点宽时直接拒绝，不自动缩放。
3. 转为最终传输方向（相对源图逆时针 90 度）。
4. 每列打包 48 字节，黑点为 1。
5. 每个逻辑帧固定 4096 字节，外层标记为 `7E 5A`。

单页最多拆成若干逻辑帧，每个 LZMA 批次最多包含 4 帧。压缩数据再封装为 `AA BB` 包，内层数据最多 500 字节，外层固定 512 字节。

### 打印序列

```text
查询状态(0x11)
  -> 开始打印(0x13)
  -> 声明批量包(0x5C)
  -> 写入 512 字节 AA BB 包
  -> 提交批次(0x10)
  -> 按缓冲状态继续
  -> 轮询实际打印完成
```

缺少标签尺寸或间隙时，先读取标签盒 `0x30`。Web Bluetooth 与微信小程序 transport 将多页拆成独立物理任务，以适配浏览器 BLE 写入节奏。

## USB HID / WebUSB

### 栅格

1. 按型号的 `maxDotValue`（T50 默认 384 点）建立目标宽度并居中；源图超过该宽度时直接拒绝，不自动缩放。
2. 水平镜像。
3. 按行、低位优先打包黑点。
4. 每个逻辑帧固定 4096 字节。

USB 图像数据不走 BLE 的 LZMA/`AA BB` 包。传输块由一组完整帧组成，HID transport 再拆成 64 字节报告。

Python 驱动行为会在数据长度刚好为 64 的整数倍时继续发送一个全零报告。`hidReports()` 保留了这个尾包行为，不能改成普通的 `ceil(length / 64)`。

### 厂商命令

| 命令 | 值 | 用途 |
| --- | --- | --- |
| `bufferFull` | `0x10` | 提交块/读取缓冲状态 |
| `inquiryStatus` | `0x11` | 查询状态 |
| `checkDevice` | `0x12` | 检测设备 |
| `startPrint` | `0x13` | 开始打印 |
| `stopPrint` | `0x14` | 停止 |
| `returnMaterial` | `0x30` | 读取标签盒 |
| `transferData` | `0x5C` | 声明数据块长度 |
| `setMedia` | `0x5D` | 设置 80 字节介质块 |

### 打印序列

```text
设置介质(0x5D) + 80-byte media block
  -> 检测设备(0x12)
  -> 等待 busy 清除
  -> 开始打印(0x13)
  -> 声明数据长度(0x5C)
  -> 写入帧块
  -> 提交/查询缓冲(0x10)
  -> 轮询状态直到页计数完成
```

WebHID 是浏览器 USB 首选路径。WebUSB 使用 HID bulk endpoint；没有 OUT endpoint 时回退到 class request `SET_REPORT`。如果操作系统内核驱动占用了 HID interface，WebUSB 无法 claim，此时应使用 WebHID。

## 状态与错误

打印机返回值统一解析为 `PrinterStatus`。调用方通常只需要处理：

- `CapabilityError`：运行时没有需要的浏览器/小程序能力
- `CommunicationError`：连接、短读、帧或超时问题
- `DeviceError`：开盖、无纸、介质不识别、打印任务异常终止等设备状态
- `ValidationError`：尺寸、像素长度、LZMA 头或参数不合法

设备状态轮询不会把“数据提交完成”直接当作“实际出纸完成”。BLE 与 USB backend 都等待打印状态或页计数完成，超时后返回可诊断错误。

## 回归测试要点

修改协议时至少运行：

```bash
npm run typecheck
npm test
npm run build:sdk
```

其中 `tests/lzma.test.ts` 是压缩兼容性的硬门槛；仅检查 `dict_size` 或前 5 字节不足以证明编码流和 Python 一致。

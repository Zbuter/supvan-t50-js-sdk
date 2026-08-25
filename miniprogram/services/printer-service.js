const { BlePrinter, PaperType } = require("../vendor/t50-core");
const { startDeviceDiscovery, WechatBleTransport } = require("./wechat-ble-transport");

function statusText(status) {
  if (!status) return "未读取状态";
  const flags = status.flags || status;
  if (flags.coverOpen) return "打印机上盖已打开";
  if (flags.mediaEmpty || flags.mediaNotInstalled || flags.labelNotInstalled) return "请安装标签纸";
  if (flags.mediaUnrecognized || flags.mediaNotDetected) return "标签纸无法识别";
  if (flags.headOverheat) return "打印头温度过高";
  if (flags.batteryLow) return "打印机电量低";
  if (flags.printing || flags.busy) return "正在打印";
  return "设备就绪";
}

class PrinterService {
  constructor() {
    this.transport = null;
    this.printer = null;
    this.device = null;
    this.discovery = null;
    this.printing = false;
    this.lastStatus = null;
  }

  get connected() {
    return Boolean(this.printer && this.printer.connected);
  }

  snapshot() {
    return {
      connected: this.connected,
      deviceName: this.device ? this.device.name : "未连接",
      printing: this.printing,
      statusText: this.connected ? statusText(this.lastStatus) : "点击连接打印机",
    };
  }

  async startScan(onDevices) {
    await this.stopScan();
    this.discovery = await startDeviceDiscovery(onDevices);
  }

  async stopScan() {
    if (!this.discovery) return;
    const discovery = this.discovery;
    this.discovery = null;
    await discovery.stop();
  }

  async connect(device) {
    await this.stopScan();
    if (this.transport) await this.disconnect();
    const transport = new WechatBleTransport(device);
    const printer = new BlePrinter(transport, {
      autoReadLabelBox: false,
      timeouts: { commandTimeoutMs: 5000, printTimeoutMs: 120000 },
    });
    await printer.connect();
    this.transport = transport;
    this.printer = printer;
    this.device = { deviceId: device.deviceId, name: device.name || "硕方 T50" };
    this.lastStatus = await printer.getStatus();
    return this.snapshot();
  }

  async disconnect() {
    const printer = this.printer;
    this.printer = null;
    this.transport = null;
    this.device = null;
    this.lastStatus = null;
    if (printer) await printer.disconnect();
  }

  async refreshStatus() {
    if (!this.printer) throw new Error("请先连接打印机");
    this.lastStatus = await this.printer.getStatus();
    return { ...this.lastStatus, displayText: statusText(this.lastStatus) };
  }

  async print(raster, document, options = {}) {
    if (!this.printer || !this.connected) throw new Error("请先连接打印机");
    if (this.printing) throw new Error("已有打印任务正在进行");
    this.printing = true;
    try {
      const metadata = document.print || {};
      await this.printer.print({
        pages: [raster],
        settings: {
          materialWidth: document.width,
          materialHeight: document.height,
          copies: Number(options.copies || metadata.copies || 1),
          density: Number(options.density === undefined ? (metadata.density || 4) : options.density),
          speed: Number(options.speed || metadata.speed || 40),
          gap: Number(options.gap === undefined ? (metadata.gap === undefined ? 3 : metadata.gap) : options.gap),
          direction: Number(options.direction === undefined ? (metadata.direction || 0) : options.direction),
          dotsPerMm: 8,
          maxWidthDots: Math.round(document.width * 8),
          paperType: PaperType.Gap,
          oneByOne: true,
        },
      });
      this.lastStatus = await this.printer.getStatus().catch(() => null);
    } finally {
      this.printing = false;
    }
  }

  async stop() {
    if (this.printer) await this.printer.stop();
    this.printing = false;
  }
}

const service = new PrinterService();

module.exports = { PrinterService, getPrinterService: () => service, statusText };

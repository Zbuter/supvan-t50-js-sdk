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

function statusDetails(status) {
  if (!status) return [];
  const flags = status.flags || {};
  const metrics = status.metrics || {};
  const media = flags.mediaEmpty ? "已用完"
    : flags.mediaLow ? "余量不足"
      : flags.mediaNotInstalled || flags.labelNotInstalled ? "未安装"
        : flags.mediaUnrecognized || flags.mediaNotDetected ? "未识别"
          : "正常";
  return [
    { label: "设备就绪", value: status.ready ? "是" : "否", problem: !status.ready },
    { label: "上盖", value: flags.coverOpen ? "已打开" : "已关闭", problem: Boolean(flags.coverOpen) },
    { label: "耗材", value: media, problem: media !== "正常" },
    { label: "电池", value: flags.charging ? "充电中" : flags.batteryLow ? "电量低" : "正常", problem: Boolean(flags.batteryLow) },
    { label: "温度", value: Number.isFinite(metrics.temperatureC) ? `${metrics.temperatureC.toFixed(1)} °C` : "未提供", problem: Boolean(flags.headOverheat) },
    { label: "打印页数", value: metrics.totalPages ? `${metrics.printedPages || 0} / ${metrics.totalPages}` : String(metrics.printedPages || 0), problem: false },
  ];
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
      ready: Boolean(this.connected && this.lastStatus && this.lastStatus.ready),
      deviceName: this.device ? this.device.name : "未连接",
      printing: this.printing,
      statusText: this.connected ? statusText(this.lastStatus) : "点击连接打印机",
      details: this.connected ? statusDetails(this.lastStatus) : [],
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
        pages: Array.isArray(raster) ? raster : [raster],
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

module.exports = { PrinterService, getPrinterService: () => service, statusDetails, statusText };

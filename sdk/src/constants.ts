export const FRAME_SIZE = 4096;
export const PRINT_WIDTH_DOTS = 384;
export const DOTS_PER_MM = 8;
export const BYTES_PER_LINE = PRINT_WIDTH_DOTS / 8;
export const FRAME_HEADER_SIZE = 14;
export const BLE_MAX_LINES_PER_FRAME = Math.floor(
  (FRAME_SIZE - FRAME_HEADER_SIZE) / BYTES_PER_LINE,
);
export const USB_FRAME_DATA_SIZE = 4074;
export const HID_REPORT_SIZE = 64;

export const SUPVAN_VENDOR_ID = 0x1820;
export const T50_PRODUCT_IDS = [
  0x2072, 0x2073, 0x2074, 0x2076, 0x2077, 0x207d, 0x207f, 0x2170,
] as const;

export const BLE_UUIDS = {
  service: "0000e0ff-3c17-d293-8e48-14fe2e4da212",
  write: "0000ffe9-0000-1000-8000-00805f9b34fb",
  notify: "0000ffe1-0000-1000-8000-00805f9b34fb",
  bulkNotify: "0000ffea-0000-1000-8000-00805f9b34fb",
} as const;

export const USB_COMMANDS = {
  bufferFull: 0x10,
  inquiryStatus: 0x11,
  checkDevice: 0x12,
  startPrint: 0x13,
  stopPrint: 0x14,
  returnMaterial: 0x30,
  transferData: 0x5c,
  setMedia: 0x5d,
} as const;

export const LZMA_ALONE_HEADER = new Uint8Array([
  0x5d, 0x00, 0x20, 0x00, 0x00,
]);
export const LZMA_DICTIONARY_SIZE = 8192;

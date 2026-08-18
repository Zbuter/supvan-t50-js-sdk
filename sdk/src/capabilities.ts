export interface RuntimeCapabilities {
  secureContext: boolean;
  webBluetooth: boolean;
  webHid: boolean;
  webUsb: boolean;
  wechatBle: boolean;
  preferredUsb: "webhid" | "webusb" | null;
}

export function detectCapabilities(): RuntimeCapabilities {
  const browserNavigator = typeof navigator === "undefined" ? undefined : navigator;
  const extended = browserNavigator as
    | (Navigator & { bluetooth?: unknown; hid?: unknown; usb?: unknown })
    | undefined;
  const secureContext = typeof isSecureContext === "boolean" ? isSecureContext : false;
  const webHid = secureContext && Boolean(extended?.hid);
  const webUsb = secureContext && Boolean(extended?.usb);
  return {
    secureContext,
    webBluetooth: secureContext && Boolean(extended?.bluetooth),
    webHid,
    webUsb,
    wechatBle: Boolean((globalThis as typeof globalThis & { wx?: unknown }).wx),
    preferredUsb: webHid ? "webhid" : webUsb ? "webusb" : null,
  };
}

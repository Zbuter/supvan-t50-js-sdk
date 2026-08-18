export interface RuntimeCapabilities {
  secureContext: boolean;
  webBluetooth: boolean;
  webHid: boolean;
  wechatBle: boolean;
}

export function detectCapabilities(): RuntimeCapabilities {
  const browserNavigator = typeof navigator === "undefined" ? undefined : navigator;
  const extended = browserNavigator as
    | (Navigator & { bluetooth?: unknown; hid?: unknown })
    | undefined;
  const secureContext = typeof isSecureContext === "boolean" ? isSecureContext : false;
  const webHid = secureContext && Boolean(extended?.hid);
  return {
    secureContext,
    webBluetooth: secureContext && Boolean(extended?.bluetooth),
    webHid,
    wechatBle: Boolean((globalThis as typeof globalThis & { wx?: unknown }).wx),
  };
}

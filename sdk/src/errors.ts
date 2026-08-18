export class SupvanError extends Error {
  override readonly name: string = "SupvanError";
}

export class ValidationError extends SupvanError {
  override readonly name: string = "ValidationError";
}

export class CapabilityError extends SupvanError {
  override readonly name: string = "CapabilityError";
}

export class CommunicationError extends SupvanError {
  override readonly name: string = "CommunicationError";
}

export class DeviceError extends SupvanError {
  override readonly name: string = "DeviceError";
}

export class TimeoutError extends CommunicationError {
  override readonly name: string = "TimeoutError";
}

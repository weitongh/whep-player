type LogRecord = {
  timestamp: string;
  observedTimestamp: string;
  severityText: Severity;
  severityNumber: number;
  body: AnyValue;
  attributes: KeyValue[];
};

type KeyValue = { key: string; value: AnyValue };

type AnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number }
  | { arrayValue: { values: AnyValue[] } };

type Attributes = Record<string, AttributeValue | undefined>;
type AttributeValue = string | number | boolean | string[];

type UserAgentData = {
  brands?: { brand: string; version: string }[];
  mobile?: boolean;
  platform?: string;
};

type Severity = "DEBUG" | "INFO" | "WARN" | "ERROR";

// https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
const SEVERITY_NUMBER: Record<Severity, number> = {
  DEBUG: 5,
  INFO: 9,
  WARN: 13,
  ERROR: 17,
};

const SCOPE_NAME = "whep-player";
const SERVICE_NAME = "whep-player";

const MAX_BATCH_SIZE = 32;
const MAX_QUEUE_SIZE = 256;
const FLUSH_INTERVAL = 5000;

const SESSION_ID_KEY = "otel.session.id";
const DEVICE_ID_KEY = "otel.device.id";

function getEndpointUrl(): string | undefined {
  const base = import.meta.env.VITE_OTLP_LOGS_ENDPOINT?.trim();

  if (!base) return undefined;

  return base.endsWith("/v1/logs")
    ? base
    : `${base.replace(/\/+$/, "")}/v1/logs`;
}

function getPersistentId(storage: () => Storage, key: string): string {
  try {
    const store = storage();
    const existing = store.getItem(key);

    if (existing) return existing;

    const id = createId();

    store.setItem(key, id);

    return id;
  } catch {
    return createId();
  }
}

function getUserAgentData(): UserAgentData | undefined {
  return (navigator as Navigator & { userAgentData?: UserAgentData })
    .userAgentData;
}

function getUnixNano(): string {
  return `${Date.now()}000000`;
}

function createId(): string {
  return crypto.randomUUID();
}

// Error is not JSON-serialisable, so it is flattened into the semantic
// convention `exception.*` attributes.
function createExceptionAttributes(error: unknown): Attributes {
  if (error instanceof Error) {
    return {
      "exception.type": error.name,
      "exception.message": error.message,
      "exception.stacktrace": error.stack,
    };
  }

  return { "exception.message": String(error) };
}

function encodeAttributes(attributes: Attributes): KeyValue[] {
  const result: KeyValue[] = [];

  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) continue;

    result.push({ key, value: encodeAnyValue(value) });
  }

  return result;
}

function encodeAnyValue(value: AttributeValue): AnyValue {
  if (typeof value === "string") return { stringValue: value };

  if (typeof value === "boolean") return { boolValue: value };

  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeAnyValue) } };
  }

  // OTLP/JSON encodes 64-bit integers as strings; doubles stay numeric.
  return Number.isInteger(value)
    ? { intValue: String(value) }
    : { doubleValue: value };
}

class Logger {
  readonly deviceId = getPersistentId(() => localStorage, DEVICE_ID_KEY);
  readonly sessionId = getPersistentId(() => sessionStorage, SESSION_ID_KEY);

  private readonly url?: string;
  private readonly resource: KeyValue[];
  private queue: LogRecord[];
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.url = getEndpointUrl();
    console.log(this.url);
    this.queue = [];

    const ua = getUserAgentData();

    this.resource = encodeAttributes({
      "service.name": SERVICE_NAME,
      // Distinct per page load: one "running instance" of the app.
      "service.instance.id": createId(),
      "session.id": this.sessionId,
      "device.id": this.deviceId,
      "browser.brands": ua?.brands?.map((b) => `${b.brand} ${b.version}`),
      "browser.platform": ua?.platform,
      "browser.mobile": ua?.mobile,
      "browser.language": navigator.language,
      "user_agent.original": navigator.userAgent,
      "deployment.environment.name": import.meta.env.MODE,
    });

    this.installUnloadFlush();
  }

  debug(message: string, attributes: Attributes = {}): void {
    this.log("DEBUG", message, attributes);
  }

  info(message: string, attributes: Attributes = {}): void {
    this.log("INFO", message, attributes);
  }

  warn(message: string, attributes: Attributes = {}): void {
    this.log("WARN", message, attributes);
  }

  // The second argument accepts either an Error or plain attributes; an Error
  // is expanded into `exception.*` attributes.
  error(message: string, errorOrAttributes?: unknown): void {
    const attributes =
      errorOrAttributes === undefined
        ? {}
        : errorOrAttributes instanceof Error
          ? createExceptionAttributes(errorOrAttributes)
          : (errorOrAttributes as Attributes);

    this.log("ERROR", message, attributes);
  }

  // Routes uncaught errors and rejected promises through the same pipeline.
  installGlobalHandlers(): void {
    window.addEventListener("error", (event) => {
      this.error(event.message, event.error ?? { "exception.message": event.message });
    });

    window.addEventListener("unhandledrejection", (event) => {
      this.log(
        "ERROR",
        "Unhandled promise rejection",
        createExceptionAttributes(event.reason)
      );
    });
  }

  private log(
    severity: Severity,
    message: string,
    attributes: Attributes
  ): void {
    this.logToConsole(severity, message, attributes);

    if (!this.url) return;

    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.queue.shift();
    }

    const timestamp = getUnixNano();

    this.queue.push({
      timestamp: timestamp,
      observedTimestamp: timestamp,
      severityText: severity,
      severityNumber: SEVERITY_NUMBER[severity],
      body: { stringValue: message },
      attributes: encodeAttributes(attributes),
    });

    if (this.queue.length >= MAX_BATCH_SIZE) {
      void this.flush();

      return;
    }

    this.scheduleFlush();
  }

  private logToConsole(
    severity: Severity,
    message: string,
    attributes: Attributes
  ): void {
    const args =
      Object.keys(attributes).length > 0 ? [message, attributes] : [message];

    switch (severity) {
      case "ERROR":
        console.error(...args);

        break;

      case "WARN":
        console.warn(...args);

        break;

      case "DEBUG":
        console.debug(...args);

        break;

      default:
        console.info(...args);
    }
  }

  private createPayload(records: LogRecord[]) {
    return {
      resourceLogs: [
        {
          resource: { attributes: this.resource },
          scopeLogs: [
            {
              scope: { name: SCOPE_NAME },
              logRecords: records,
            },
          ],
        },
      ],
    };
  }

  private async flush(): Promise<void> {
    if (!this.url || this.queue.length === 0) return;

    this.clearTimer();

    const batch = this.queue;

    this.queue = [];

    try {
      await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.createPayload(batch)),
        keepalive: true,
      });
    } catch {
      // Intentionally drop the batch if the request fails.
    }
  }

  private scheduleFlush(): void {
    if (this.timer !== undefined) return;

    this.timer = setTimeout(() => {
      this.timer = undefined;

      void this.flush();
    }, FLUSH_INTERVAL);
  }

  private clearTimer(): void {
    if (this.timer === undefined) return;

    clearTimeout(this.timer);

    this.timer = undefined;
  }

  // `visibilitychange` is the last reliable hook on mobile, where `unload` and
  // `beforeunload` are frequently skipped. sendBeacon survives the teardown
  // that would cancel an in-flight fetch.
  private installUnloadFlush(): void {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "hidden") return;

      this.sendBeacon();
    });
  }

  private sendBeacon(): void {
    if (!this.url || this.queue.length === 0) return;

    this.clearTimer();

    const batch = this.queue;

    this.queue = [];

    const blob = new Blob([JSON.stringify(this.createPayload(batch))], {
      type: "application/json",
    });

    if (!navigator.sendBeacon(this.url, blob)) {
      this.queue = batch.concat(this.queue);
    }
  }
}

export const logger = new Logger();

const globalTelemetry = globalThis as unknown as {
  statusTelemetry?: { shutdown(): Promise<void> };
};

export async function startTelemetry(serviceName: string) {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT || globalTelemetry.statusTelemetry) return;
  const [
    { NodeSDK },
    { OTLPTraceExporter },
    { HttpInstrumentation },
    { UndiciInstrumentation },
    { resourceFromAttributes },
    { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION },
  ] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/exporter-trace-otlp-http"),
    import("@opentelemetry/instrumentation-http"),
    import("@opentelemetry/instrumentation-undici"),
    import("@opentelemetry/resources"),
    import("@opentelemetry/semantic-conventions"),
  ]);
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, "");
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? "unknown",
      "deployment.environment.name": process.env.NODE_ENV ?? "development",
    }),
    traceExporter: new OTLPTraceExporter({
      url: endpoint.endsWith("/v1/traces") ? endpoint : `${endpoint}/v1/traces`,
      headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
        ? Object.fromEntries(
            process.env.OTEL_EXPORTER_OTLP_HEADERS.split(",").flatMap((pair) => {
              const [key, ...value] = pair.split("=");
              return key && value.length ? [[key.trim(), value.join("=").trim()]] : [];
            })
          )
        : undefined,
    }),
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) =>
          request.url === "/api/health/live" ||
          request.url === "/api/health/ready" ||
          request.url === "/metrics",
      }),
      new UndiciInstrumentation(),
    ],
  });
  sdk.start();
  globalTelemetry.statusTelemetry = sdk;
}

export async function stopTelemetry() {
  await globalTelemetry.statusTelemetry?.shutdown();
  globalTelemetry.statusTelemetry = undefined;
}

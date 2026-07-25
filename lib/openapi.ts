export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "SignalHub Self-Hosted API",
    version: "1.0.0",
    description: "Public status, management automation, heartbeat, and enterprise provisioning APIs.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "SignalHub" },
    { name: "Management" },
    { name: "Automation" },
    { name: "SCIM" },
  ],
  components: {
    securitySchemes: {
      apiKey: { type: "http", scheme: "bearer", bearerFormat: "SignalHub API key" },
      scimToken: { type: "http", scheme: "bearer", bearerFormat: "SCIM token" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              fields: { type: "object", additionalProperties: true },
            },
          },
        },
      },
    },
  },
  paths: {
    "/api/v1/status/{slug}": {
      get: {
        tags: ["SignalHub"],
        summary: "Read a public status page",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Current status" }, "404": { description: "Page not found" } },
      },
    },
    "/api/v1/manage/incidents": {
      get: {
        tags: ["Management"],
        summary: "List incidents",
        security: [{ apiKey: [] }],
        responses: { "200": { description: "Incident list" }, "401": { description: "Invalid API key" } },
      },
      post: {
        tags: ["Management"],
        summary: "Create an incident",
        security: [{ apiKey: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "201": { description: "Incident created" }, "400": { description: "Invalid incident" } },
      },
    },
    "/api/v1/manage/incidents/{id}/updates": {
      post: {
        tags: ["Management"],
        summary: "Add an incident update",
        security: [{ apiKey: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "201": { description: "Update created" } },
      },
    },
    "/api/v1/manage/components/{id}": {
      patch: {
        tags: ["Management"],
        summary: "Change component status",
        security: [{ apiKey: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["status"], properties: { status: { type: "string" } } } } } },
        responses: { "200": { description: "Component updated" } },
      },
    },
    "/api/v1/manage/metrics/{id}/points": {
      post: {
        tags: ["Management"],
        summary: "Publish a metric point",
        security: [{ apiKey: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["value"], properties: { value: { type: "number" }, timestamp: { type: "string", format: "date-time" } } } } } },
        responses: { "201": { description: "Point created" } },
      },
    },
    "/api/v1/heartbeat/{token}": {
      post: {
        tags: ["Automation"],
        summary: "Record a heartbeat",
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        responses: { "202": { description: "Heartbeat accepted" } },
      },
    },
    "/api/scim/v2/{connection}/Users": {
      get: {
        tags: ["SCIM"],
        summary: "List provisioned users",
        security: [{ scimToken: [] }],
        parameters: [{ name: "connection", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "SCIM ListResponse" } },
      },
      post: {
        tags: ["SCIM"],
        summary: "Provision a user",
        security: [{ scimToken: [] }],
        parameters: [{ name: "connection", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "SCIM User" } },
      },
    },
    "/api/scim/v2/{connection}/Groups": {
      get: {
        tags: ["SCIM"],
        summary: "List provisioned groups",
        security: [{ scimToken: [] }],
        parameters: [{ name: "connection", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "SCIM ListResponse" } },
      },
      post: {
        tags: ["SCIM"],
        summary: "Provision a group",
        security: [{ scimToken: [] }],
        parameters: [{ name: "connection", in: "path", required: true, schema: { type: "string" } }],
        responses: { "201": { description: "SCIM Group" } },
      },
    },
  },
} as const;

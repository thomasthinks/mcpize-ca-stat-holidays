import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import chalk from "chalk";
import {
  isHoliday,
  holidaysInYear,
  addBusinessDays,
  nextBusinessDay,
  IsHolidayResult,
  HolidaysInYearResult,
  AddBusinessDaysResult,
  NextBusinessDayResult,
} from "./tools.js";
import { checkQuota } from "./quota.js";

// ============================================================================
// Dev Logging Utilities
// ============================================================================

const isDev = process.env.NODE_ENV !== "production";

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function formatLatency(ms: number): string {
  if (ms < 100) return chalk.green(`${ms}ms`);
  if (ms < 500) return chalk.yellow(`${ms}ms`);
  return chalk.red(`${ms}ms`);
}

function truncate(str: string, maxLen = 60): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

function logRequest(method: string, params?: unknown): void {
  if (!isDev) return;

  const paramsStr = params ? chalk.gray(` ${truncate(JSON.stringify(params))}`) : "";
  console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.cyan("→")} ${method}${paramsStr}`);
}

function logResponse(method: string, result: unknown, latencyMs: number): void {
  if (!isDev) return;

  const latency = formatLatency(latencyMs);

  // For tool calls, show the result
  if (method === "tools/call" && result) {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result);
    console.log(
      `${chalk.gray(`[${timestamp()}]`)} ${chalk.green("←")} ${truncate(resultStr)} ${chalk.gray(`(${latency})`)}`
    );
  } else {
    console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.green("✓")} ${method} ${chalk.gray(`(${latency})`)}`);
  }
}

function logError(method: string, error: unknown, latencyMs: number): void {
  const latency = formatLatency(latencyMs);

  let errorMsg: string;
  if (error instanceof Error) {
    errorMsg = error.message;
  } else if (typeof error === "object" && error !== null) {
    // JSON-RPC error object has { code, message, data? }
    const rpcError = error as { message?: string; code?: number };
    errorMsg = rpcError.message || `Error ${rpcError.code || "unknown"}`;
  } else {
    errorMsg = String(error);
  }

  console.log(
    `${chalk.gray(`[${timestamp()}]`)} ${chalk.red("✖")} ${method} ${chalk.red(truncate(errorMsg))} ${chalk.gray(`(${latency})`)}`
  );
}

// ============================================================================
// MCP Server Setup
// ============================================================================

// Build a FRESH MCP server per request.
//
// In stateless streamable-HTTP mode the MCP SDK allows a Server to be connected
// to exactly ONE transport. Reusing a single module-scope instance throws
// "Already connected to a transport" on the second connection — and Cloud Run
// opens several (startup probe + real requests). So always create a new server
// (and a new transport) inside the request handler below.
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "ca-stat-holidays",
    version: "1.0.0",
  });

  // Shared Zod schemas
  const DateString = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
    .describe("Date in YYYY-MM-DD format.");
  const Jurisdiction = z
    .string()
    .describe(
      'Jurisdiction: "federal" or a 2-letter Canadian province/territory code (AB, BC, MB, NB, NL, NS, NT, NU, ON, PE, QC, SK, YT). Case-insensitive.'
    );
  const Year = z
    .union([z.literal(2026), z.literal(2027)])
    .describe("Calendar year. Currently supported: 2026, 2027.");

  /** Runs a tool with quota enforcement and never-throw error handling. */
  function guarded<T extends Record<string, unknown>>(
    toolName: string,
    fn: () => T
  ): { content: Array<{ type: "text"; text: string }>; structuredContent?: T; isError?: true } {
    const quotaError = checkQuota();
    if (quotaError) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: quotaError }) }],
        isError: true,
      };
    }
    try {
      const output = fn();
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${toolName}] Error:`, message);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  }

  server.registerTool(
    "is_holiday",
    {
      title: "Check if a date is a statutory holiday",
      description:
        "Check whether a date is a statutory holiday in a Canadian jurisdiction (federal or province/territory). Handles weekend observance (shifted days off).",
      inputSchema: { date: DateString, jurisdiction: Jurisdiction },
      outputSchema: {
        date: z.string(),
        jurisdiction: z.string(),
        is_holiday: z.boolean(),
        name: z.string().nullable(),
        nominal_date: z.string().nullable(),
        observed_date: z.string().nullable(),
        note: z.string().nullable(),
        kind: z.string().nullable(),
      },
    },
    async ({ date, jurisdiction }): Promise<ReturnType<typeof guarded<IsHolidayResult>>> =>
      guarded("is_holiday", () => isHoliday(date, jurisdiction))
  );

  server.registerTool(
    "holidays_in_year",
    {
      title: "List statutory holidays in a year",
      description:
        "List all holidays (statutory plus commonly-observed optional entries, each flagged by kind) for a Canadian jurisdiction in 2026 or 2027.",
      inputSchema: { year: Year, jurisdiction: Jurisdiction },
      outputSchema: {
        year: z.number(),
        jurisdiction: z.string(),
        holidays: z.array(
          z.object({
            date: z.string(),
            name: z.string(),
            kind: z.string(),
            day_off: z.boolean(),
            observed: z.boolean(),
            observed_date: z.string().nullable(),
            note: z.string().nullable(),
          })
        ),
        count: z.number(),
      },
    },
    async ({ year, jurisdiction }): Promise<ReturnType<typeof guarded<HolidaysInYearResult>>> =>
      guarded("holidays_in_year", () => holidaysInYear(year, jurisdiction))
  );

  server.registerTool(
    "add_business_days",
    {
      title: "Add or subtract business days",
      description:
        "Add (or subtract, with negative n) business days to a date, skipping weekends and statutory holidays in the given Canadian jurisdiction.",
      inputSchema: {
        date: DateString,
        n: z
          .number()
          .int()
          .min(-3650)
          .max(3650)
          .describe("Number of business days to add (negative subtracts)."),
        jurisdiction: Jurisdiction,
      },
      outputSchema: {
        start_date: z.string(),
        n: z.number(),
        result_date: z.string(),
        weekends_skipped: z.number(),
        holidays_skipped: z.number(),
        jurisdiction: z.string(),
      },
    },
    async ({ date, n, jurisdiction }): Promise<ReturnType<typeof guarded<AddBusinessDaysResult>>> =>
      guarded("add_business_days", () => addBusinessDays(date, n, jurisdiction))
  );

  server.registerTool(
    "next_business_day",
    {
      title: "Next business day",
      description:
        "Find the next business day after a date in a Canadian jurisdiction, skipping weekends and statutory holidays.",
      inputSchema: { date: DateString, jurisdiction: Jurisdiction },
      outputSchema: {
        date: z.string(),
        next_business_day: z.string(),
        was_holiday: z.boolean(),
        holiday_name: z.string().nullable(),
        jurisdiction: z.string(),
      },
    },
    async ({ date, jurisdiction }): Promise<ReturnType<typeof guarded<NextBusinessDayResult>>> =>
      guarded("next_business_day", () => nextBusinessDay(date, jurisdiction))
  );

  return server;
}

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();
app.use(express.json());

// Health check endpoint (required for Cloud Run)
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "healthy" });
});

// MCP endpoint with dev logging
app.post("/mcp", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const body = req.body;

  // Extract method and params from JSON-RPC request
  const method = body?.method || "unknown";
  const params = body?.params;

  // Log incoming request
  if (method === "tools/call") {
    const toolName = params?.name || "unknown";
    const toolArgs = params?.arguments;
    logRequest(`tools/call ${chalk.bold(toolName)}`, toolArgs);
  } else if (method !== "notifications/initialized") {
    logRequest(method, params);
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  // Capture response body for logging
  let responseBody = "";
  const originalWrite = res.write.bind(res) as typeof res.write;
  const originalEnd = res.end.bind(res) as typeof res.end;

  res.write = function (chunk: unknown, encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void), callback?: (error: Error | null | undefined) => void) {
    if (chunk) {
      responseBody += typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString();
    }
    return originalWrite(chunk as string, encodingOrCallback as BufferEncoding, callback);
  };

  res.end = function (chunk?: unknown, encodingOrCallback?: BufferEncoding | (() => void), callback?: () => void) {
    if (chunk) {
      responseBody += typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString();
    }

    // Log response
    if (method !== "notifications/initialized") {
      const latency = Date.now() - startTime;

      try {
        const rpcResponse = JSON.parse(responseBody) as { result?: unknown; error?: unknown };

        if (rpcResponse?.error) {
          logError(method, rpcResponse.error, latency);
        } else if (method === "tools/call") {
          const content = (rpcResponse?.result as { content?: Array<{ text?: string }> })?.content;
          const resultText = content?.[0]?.text;
          logResponse(method, resultText, latency);
        } else {
          logResponse(method, null, latency);
        }
      } catch {
        logResponse(method, null, latency);
      }
    }

    return originalEnd(chunk as string, encodingOrCallback as BufferEncoding, callback);
  };

  res.on("close", () => {
    transport.close();
  });

  // Fresh server instance per request (see createMcpServer above) — required for
  // stateless streamable-HTTP so a second connection never reuses a transport.
  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// JSON error handler (Express defaults to HTML errors)
app.use((_err: unknown, _req: Request, res: Response, _next: Function) => {
  res.status(500).json({ error: "Internal server error" });
});

// ============================================================================
// Start Server
// ============================================================================

const port = parseInt(process.env.PORT || "8080");
const httpServer = app.listen(port, () => {
  console.log();
  console.log(chalk.bold("MCP Server running on"), chalk.cyan(`http://localhost:${port}`));
  console.log(`  ${chalk.gray("Health:")} http://localhost:${port}/health`);
  console.log(`  ${chalk.gray("MCP:")}    http://localhost:${port}/mcp`);

  if (isDev) {
    console.log();
    console.log(chalk.gray("─".repeat(50)));
    console.log();
  }
});

// Graceful shutdown for Cloud Run (SIGTERM before kill)
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  httpServer.close(() => {
    process.exit(0);
  });
});

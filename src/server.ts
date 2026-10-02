import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { DEFAULT_GEMINI_MODEL, llmConfigured } from "./agent/llm";
import { attachClientTiming, createCall, getLiveCall, listStoredCalls, readStoredCall, takeTurn } from "./agent/session";
import { search, warmIndex } from "./kb/search";
import { log } from "./log";
import { registerRealtime } from "./realtime/socket";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const ACCESS_TOKEN = process.env.DEMO_ACCESS_TOKEN;

const markets = z.enum(["in_health", "ph_life", "id_finance"]);
const turnSchema = z.object({
  text: z.string().max(1000).optional(),
  event: z.enum(["silence", "asr_error"]).optional(),
  barged_in: z.boolean().optional(),
  asr_confidence: z.number().min(0).max(1).optional(),
  client_timing: z.object({ asr_ms: z.number().nonnegative().optional() }).optional(),
});

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const validated = schema.safeParse(body);
  if (!validated.success) {
    throw new ApiError(400, "invalid_request", validated.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; "));
  }
  return validated.data;
}

// Fixed-window limiter per IP. Enough to stop a demo URL being hammered; a
// shared deployment would put this in the proxy or Redis.
const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE || 120);
const windows = new Map<string, { started: number; count: number }>();
function rateLimit(request: FastifyRequest): void {
  const now = Date.now();
  const window = windows.get(request.ip);
  if (!window || now - window.started > 60_000) {
    windows.set(request.ip, { started: now, count: 1 });
    return;
  }
  window.count++;
  if (window.count > RATE_LIMIT_PER_MINUTE) throw new ApiError(429, "rate_limited", `More than ${RATE_LIMIT_PER_MINUTE} requests in a minute from this address`);
}

export async function buildServer() {
  const app = Fastify({ logger: false, bodyLimit: 20 * 1024 * 1024 });
  await app.register(fastifyWebsocket);
  await app.register(fastifyStatic, { root: path.resolve("public"), index: ["index.html"] });
  app.addContentTypeParser(["audio/webm", "audio/ogg", "audio/wav", "application/octet-stream"], { parseAs: "buffer" }, (_request, body, done) => done(null, body));

  app.addHook("onRequest", async (request) => {
    if (!request.url.startsWith("/api/")) return;
    rateLimit(request);
    if (ACCESS_TOKEN && request.headers.authorization !== `Bearer ${ACCESS_TOKEN}`) {
      throw new ApiError(401, "unauthorized", "Missing or wrong bearer token (DEMO_ACCESS_TOKEN is set on this server)");
    }
  });

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply: FastifyReply) => {
    if (error instanceof ApiError) return reply.status(error.status).send({ error: { code: error.code, message: error.message } });
    // Internal details stay in the log; the client gets a stable code.
    log("http.error", { method: request.method, url: request.url.split("?")[0], error: error.message });
    return reply.status(error.statusCode ?? 500).send({ error: { code: "internal_error", message: "Something went wrong on the server; see server logs" } });
  });

  app.get("/api/health", async () => ({
    status: "ok",
    llm: llmConfigured() ? `gemini (${process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL})` : "off: extractive answers only",
    asr_tts: "browser Web Speech API (client side)",
    deepgram_streaming: Boolean(process.env.DEEPGRAM_API_KEY),
  }));

  app.post("/api/knowledge/search", async (request) => {
    const body = parse(z.object({ query: z.string().min(1).max(500), market: markets, top_k: z.number().int().min(1).max(10).optional() }), request.body);
    const found = search(body.query, { market: body.market, topK: body.top_k ?? 3 });
    return {
      ...found,
      hits: found.hits.map((hit) => ({ rank: hit.rank, record_id: hit.record.record_id, citation: hit.citation, cosine: hit.cosine, bm25: hit.bm25, category: hit.record.category, audience: hit.record.audience, content: hit.record.content })),
    };
  });

  app.post("/api/calls", async (request) => {
    const body = parse(z.object({ market: markets }), request.body);
    const { state, reply } = await createCall(body.market);
    return { call_id: state.call_id, reply };
  });

  app.post<{ Params: { id: string } }>("/api/calls/:id/turns", async (request) => {
    const input = parse(turnSchema, request.body);
    if (!input.text && !input.event) throw new ApiError(400, "invalid_request", "A turn needs text or an event");
    if (!getLiveCall(request.params.id)) throw new ApiError(404, "call_not_found", `No live call ${request.params.id}; it may have ended`);
    const { reply, lead, state } = await takeTurn(request.params.id, input);
    return { reply, lead, turn: state.turns.length - 2, latency: state.latencies.at(-1) };
  });

  app.post<{ Params: { id: string } }>("/api/calls/:id/timing", async (request) => {
    const body = parse(z.object({ turn: z.number().int().nonnegative(), tts_start_ms: z.number().nonnegative() }), request.body);
    attachClientTiming(request.params.id, body.turn, body);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/calls/:id/audio", async (request) => {
    if (!/^call_[\w-]+$/.test(request.params.id)) throw new ApiError(400, "invalid_request", "Bad call id");
    if (!Buffer.isBuffer(request.body)) throw new ApiError(400, "invalid_request", "Expected a raw audio body");
    const directory = path.resolve("runtime/recordings");
    await mkdir(directory, { recursive: true });
    const extension = request.headers["content-type"]?.includes("ogg") ? "ogg" : request.headers["content-type"]?.includes("wav") ? "wav" : "webm";
    const file = path.join(directory, `${request.params.id}.customer.${extension}`);
    await writeFile(file, request.body);
    return { saved: path.relative(process.cwd(), file), bytes: request.body.length };
  });

  app.get("/api/calls", async () => ({ calls: await listStoredCalls() }));

  app.get<{ Params: { id: string } }>("/api/calls/:id", async (request) => {
    const call = await readStoredCall(request.params.id);
    if (!call) throw new ApiError(404, "call_not_found", `No stored call ${request.params.id}`);
    return call;
  });

  registerRealtime(app);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const indexMs = warmIndex();
  const app = await buildServer();
  await app.listen({ port: PORT, host: HOST });
  log("server.listening", { url: `http://${HOST}:${PORT}`, llm: llmConfigured() ? "gemini" : "off", index_build_ms: indexMs });
}

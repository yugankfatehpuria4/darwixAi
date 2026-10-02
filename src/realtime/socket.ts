import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { log } from "../log";
import { AUDIO_DIR, listRecordings, RealtimeCall, type RealtimeMessage } from "./session";

const clientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("auth"), token: z.string() }),
  z.object({ type: z.literal("replay"), recording: z.string().regex(/^[\w-]+$/), speed: z.number().min(0.5).max(4).optional() }),
  z.object({ type: z.literal("live_start"), market: z.enum(["in_health", "ph_life", "id_finance"]) }),
  z.object({
    type: z.literal("live_segment"),
    speaker: z.enum(["agent", "customer"]),
    text: z.string().min(1).max(1000),
    confidence: z.number().min(0).max(1),
    asr_ms: z.number().nonnegative().optional(),
  }),
  z.object({ type: z.literal("ack"), nudge_id: z.string(), received_at: z.number() }),
  z.object({ type: z.literal("stop") }),
]);

export function registerRealtime(app: FastifyInstance): void {
  app.register(fastifyStatic, { root: AUDIO_DIR, prefix: "/audio/", decorateReply: false });

  app.get("/api/realtime/recordings", async () => ({ recordings: await listRecordings() }));

  app.get("/api/realtime", { websocket: true }, (socket) => {
    const token = process.env.DEMO_ACCESS_TOKEN;
    let authorised = !token;
    let call: RealtimeCall | null = null;
    let abort: AbortController | null = null;
    const send = (message: RealtimeMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };

    socket.on("message", (raw: Buffer) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return send({ type: "error", message: "Messages must be JSON" });
      }
      const validated = clientMessage.safeParse(parsed);
      if (!validated.success) return send({ type: "error", message: validated.error.issues.map((issue) => issue.message).join("; ") });
      const message = validated.data;

      if (message.type === "auth") {
        authorised = message.token === token;
        return;
      }
      if (!authorised) return send({ type: "error", message: "Send {type:'auth', token} first; DEMO_ACCESS_TOKEN is set on this server" });

      if (message.type === "replay") {
        abort?.abort();
        abort = new AbortController();
        const controller = abort;
        void listRecordings().then(async (recordings) => {
          const recording = recordings.find((candidate) => candidate.name === message.recording);
          if (!recording) return send({ type: "error", message: `No recording ${message.recording}; run npm run render:audio` });
          call = new RealtimeCall(recording.market, send);
          await call.replay(recording.name, { speed: message.speed, signal: controller.signal }).catch((error) => {
            if ((error as Error).name !== "AbortError") send({ type: "error", message: (error as Error).message });
          });
        });
      } else if (message.type === "live_start") {
        abort?.abort();
        call = new RealtimeCall(message.market, send);
        send({ type: "started", call: "live", market: message.market, asr: "browser Web Speech API", asr_measured: true, duration_ms: null });
      } else if (message.type === "live_segment") {
        if (!call) return send({ type: "error", message: "Send live_start before live_segment" });
        call.ingest({ speaker: message.speaker, text: message.text, confidence: message.confidence, start_ms: 0, end_ms: 0, interrupted_previous: false, asr_ms: message.asr_ms });
      } else if (message.type === "ack") {
        // The page acknowledges each nudge when it is painted; this closes
        // the end-to-end latency measurement (audio received -> displayed).
        log("realtime.nudge_displayed", { nudge_id: message.nudge_id, received_at: message.received_at });
      } else if (message.type === "stop") {
        abort?.abort();
      }
    });
    socket.on("close", () => abort?.abort());
  });
}

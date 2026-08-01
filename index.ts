 import express, { Request, Response, Router } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import {
  connectAndSeedDB,
  isMongoConnected,
  getDb,
} from "./db.js";

// Load Environment Variables (look in cwd and in server/.env)
dotenv.config();
dotenv.config({ path: path.join(process.cwd(), "server/.env") });

const isProd = process.env.NODE_ENV === "production";

const config = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI || "",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  aiGatewayKey: process.env.AI_GATEWAY_KEY || "",
  corsOrigin: (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};

const app = express();
const PORT = config.port;

// --- MIDDLEWARES ---
app.use(
  cors(
    config.corsOrigin.length
      ? {
          origin: (origin, cb) => {
            // Allow same-origin / no-origin (curl, server-to-server)
            if (!origin) return cb(null, true);
            if (config.corsOrigin.includes(origin)) return cb(null, true);
            return cb(new Error(`CORS: origin ${origin} not allowed`));
          },
          credentials: true,
        }
      : { origin: true, credentials: true }
  )
);
app.use(express.json({ limit: "1mb" }));

const requestLogger = (req: Request, res: Response, next: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
};
app.use(requestLogger);

// --- COMPATIBILITY HANDSHAKE ---
app.post("/jwt", (req: Request, res: Response) => {
  res.json({ token: "mock-jwt-token-from-jstu-network-club" });
});

// --- API ROUTES ---
const apiRouter = Router();

// 1. Members
apiRouter.get("/members", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const members = await db.collection("members").find().toArray();
    res.json(members);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/members", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const newMember = req.body;
    console.log("newmember: ", newMember);
    await db.collection("members").insertOne(newMember);
    res.status(201).json(newMember);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/members/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const targetId = req.params.id;
    // id অথবা memberId যেকোনো একটির সাথে ম্যাচ করলে ডিলিট হবে
    await db.collection("members").deleteOne({ 
      $or: [{ id: targetId }, { memberId: targetId }] 
    });
    res.json({ success: true, message: "Member deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.put("/members/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const targetId = req.params.id;
    
    await db.collection("members").updateOne(
      { $or: [{ id: targetId }, { memberId: targetId }] },
      { $set: req.body }
    );
    const updated = await db.collection("members").findOne(
      { $or: [{ id: targetId }, { memberId: targetId }] }
    );
    if (updated) {
      return res.json(updated);
    }
    res.status(404).json({ error: "Member not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 🔥 PATCH support for partial member updates (e.g. payment submission)
apiRouter.patch("/members/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const targetId = req.params.id;

    await db.collection("members").updateOne(
      { $or: [{ id: targetId }, { memberId: targetId }] },
      { $set: req.body }
    );
    const updated = await db.collection("members").findOne(
      { $or: [{ id: targetId }, { memberId: targetId }] }
    );
    if (updated) {
      return res.json(updated);
    }
    res.status(404).json({ error: "Member not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Notices
apiRouter.get("/notices", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const notices = await db.collection("notices").find().sort({ _id: -1 }).toArray();
    res.json(notices);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/notices", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const newNotice = req.body;
    await db.collection("notices").insertOne(newNotice);
    res.status(201).json(newNotice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/notices/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    await db.collection("notices").deleteOne({ id: req.params.id });
    res.json({ success: true, message: "Notice deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Events
apiRouter.get("/events", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const events = await db.collection("events").find().toArray();
    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/events", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const newEvent = req.body;
    await db.collection("events").insertOne(newEvent);
    res.status(201).json(newEvent);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/events/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    await db.collection("events").deleteOne({ id: req.params.id });
    res.json({ success: true, message: "Event deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.put("/events/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    await db.collection("events").updateOne(
      { id: req.params.id },
      { $set: req.body }
    );
    const updated = await db.collection("events").findOne({ id: req.params.id });
    if (updated) {
      return res.json(updated);
    }
    res.status(404).json({ error: "Event not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Courses
apiRouter.get("/courses", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const courses = await db.collection("courses").find().toArray();
    res.json(courses);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/courses", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const newCourse = req.body;
    await db.collection("courses").insertOne(newCourse);
    res.status(201).json(newCourse);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/courses/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    await db.collection("courses").deleteOne({ id: req.params.id });
    res.json({ success: true, message: "Course deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.put("/courses/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    await db.collection("courses").updateOne(
      { id: req.params.id },
      { $set: req.body }
    );
    const updated = await db.collection("courses").findOne({ id: req.params.id });
    if (updated) {
      return res.json(updated);
    }
    res.status(404).json({ error: "Course not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Devices
apiRouter.get("/devices", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const devices = await db.collection("devices").find().toArray();
    res.json(devices);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/devices", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const newDevice = req.body;
    await db.collection("devices").insertOne(newDevice);
    res.status(201).json(newDevice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/devices/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    await db.collection("devices").deleteOne({ id: req.params.id });
    res.json({ success: true, message: "Device deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.put("/devices/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    await db.collection("devices").updateOne(
      { id: req.params.id },
      { $set: req.body }
    );
    const updated = await db.collection("devices").findOne({ id: req.params.id });
    if (updated) {
      return res.json(updated);
    }
    res.status(404).json({ error: "Device not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Sponsors
apiRouter.get("/sponsors", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const sponsors = await db.collection("sponsors").find().toArray();
    res.json(sponsors);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/sponsors", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const newSponsor = req.body;
    await db.collection("sponsors").insertOne(newSponsor);
    res.status(201).json(newSponsor);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/sponsors/:name", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    await db.collection("sponsors").deleteOne({ name: req.params.name });
    res.json({ success: true, message: "Sponsor deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Topology metrics (Resources Hub → Live network topology card)
// GET supports ?topology=mesh to filter to a single record. The client
// polls this every few seconds so the latency/throughput/uptime/packet
// health numbers are driven entirely from MongoDB.
apiRouter.get("/topology-metrics", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { topology } = req.query;
    const filter: Record<string, any> = {};
    if (typeof topology === "string" && topology.trim()) {
      filter.topology = topology.trim();
    }
    const metrics = await db
      .collection("topology_metrics")
      .find(filter)
      .toArray();
    res.json(metrics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/topology-metrics", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const incoming = req.body || {};
    const payload = {
      ...incoming,
      lastUpdated: incoming.lastUpdated || new Date().toISOString(),
    };
    const result = await db.collection("topology_metrics").insertOne(payload);
    res.status(201).json({ ...payload, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.put("/topology-metrics/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const targetId = req.params.id;
    // If the client doesn't send a lastUpdated, stamp it now so the
    // Resources Hub UI can show "Updated 3s ago". Allow override for
    // backfilling historical seed values.
    const update = {
      ...req.body,
      lastUpdated: req.body?.lastUpdated || new Date().toISOString(),
    };
    await db
      .collection("topology_metrics")
      .updateOne({ id: targetId }, { $set: update });
    const updated = await db
      .collection("topology_metrics")
      .findOne({ id: targetId });
    if (updated) {
      return res.json(updated);
    }
    res.status(404).json({ error: "Topology metric not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Network Diagnosis AI Route
//    If AI_GATEWAY_KEY is set in the environment, the caller must send the
//    same value in `x-ai-key`. This is a cheap gate that prevents the public
//    internet from burning through your AI quota. Disable by leaving the env
//    variable empty.
apiRouter.post("/diagnose-network", async (req: Request, res: Response) => {
  if (config.aiGatewayKey) {
    const provided = req.header("x-ai-key");
    if (provided !== config.aiGatewayKey) {
      return res.status(401).json({ error: "Unauthorized AI gateway call." });
    }
  }
  try {
    const { prompt, systemInstruction, model } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    if (model === "deepseek") {
      const deepseekKey = config.deepseekApiKey;
      if (!deepseekKey) {
        return res.status(400).json({ error: "DEEPSEEK_API_KEY is not configured." });
      }

      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${deepseekKey}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemInstruction || "You are a helpful assistant." },
            { role: "user", content: prompt }
          ],
          stream: false
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`DeepSeek API error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";
      return res.json({ text });
    }

    return res.status(400).json({ error: `Unsupported model: ${model}` });
  } catch (error: any) {
    console.error("AI Generation Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate AI response" });
  }
});

// 8. Health Check
apiRouter.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "online",
    database: isMongoConnected ? "MongoDB" : "Disconnected",
    time: new Date().toISOString(), 
  });
});

app.use("/api", apiRouter);

// --- SERVER INITIATION & VITE SETUP ---
export async function startServer() {
  await connectAndSeedDB();

  if (!isProd) {
    try {
      // @ts-ignore — vite is optional in dev (not installed in production)
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
        root: path.join(process.cwd(), "client"),
      });
      app.use(vite.middlewares);
      console.log("🚀 Vite middleware integrated successfully!");
    } catch (error) {
      console.log(
        "⚠️ Vite package not found or cannot be loaded. Running server in API-only mode."
      );
    }
  } else {
    // Serve the built SPA. Resolve the dist folder relative to the compiled
    // server file so it works both from source (`tsx index.ts`) and from
    // the compiled bundle (`node dist/index.js`).
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const candidates = [
      path.join(__dirname, "client", "dist"),
      path.join(__dirname, "..", "client", "dist"),
      path.join(process.cwd(), "client", "dist"),
    ];
    const distPath = candidates.find((p) => {
      try {
        return require("fs").existsSync(path.join(p, "index.html"));
      } catch {
        return false;
      }
    });

    if (distPath) {
      app.use(express.static(distPath));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
      console.log(`📦 Serving SPA from ${distPath}`);
    } else {
      console.warn(
        "⚠️ client/dist not found. Build the client (cd client && npm run build) or run in development mode."
      );
    }
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`📡 Full-Stack Server running on http://localhost:${PORT}`);
  });

  // Graceful shutdown so containers and orchestrators don't drop in-flight
  // requests or leave Mongo sockets open.
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received — shutting down...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

const isMain = process.argv[1] && (
  process.argv[1].endsWith("index.ts") || 
  process.argv[1].endsWith("index.js") || 
  process.argv[1].includes("nodemon") ||
  process.argv[1].endsWith("server/index.ts")
);

if (isMain) {
  startServer();
} else {
  connectAndSeedDB();
}

export default app;
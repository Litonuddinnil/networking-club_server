 import express, { Request, Response, Router } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { MongoClient, Db, ObjectId } from "mongodb";

// Load Environment Variables (look in cwd and in server/.env)
dotenv.config();
dotenv.config({ path: path.join(process.cwd(), "server/.env") });

const isProd = process.env.NODE_ENV === "production";

// Helper function to build flexible queries matching id, _id (string or ObjectId), memberId, or custom fields
function buildIdQuery(targetId: string, extraFields: string[] = []) {
  const orConditions: any[] = [{ id: targetId }, { _id: targetId }];
  for (const field of extraFields) {
    orConditions.push({ [field]: targetId });
  }
  if (ObjectId.isValid(targetId)) {
    try {
      orConditions.push({ _id: new ObjectId(targetId) });
    } catch (e) {}
  }
  return { $or: orConditions };
}

// ============================================================
// DATABASE CONNECTION (Pure Native Driver - No Seed Data)
// ============================================================
let isMongoConnected = false;
let client: MongoClient | null = null;
let dbInstance: Db | null = null;

async function connectDB() {
  const MONGO_URI = process.env.MONGODB_URI || "";

  if (!MONGO_URI) {
    console.warn("⚠️ MONGODB_URI is not set. Server running without DB.");
    isMongoConnected = false;
    return;
  }

  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();

    dbInstance = client.db("NetworkingClub");

    isMongoConnected = true;
    console.log("🚀 Connected to MongoDB (NetworkingClub) successfully via Native Driver!");
  } catch (error) {
    console.error("❌ MongoDB Connection failed:", error);
    isMongoConnected = false;
  }
}

function getDb(): Db {
  if (!dbInstance) {
    throw new Error("Database not initialized. Please connect first.");
  }
  return dbInstance;
}

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
    const result = await db.collection("members").insertOne(newMember);
    res.status(201).json({ ...newMember, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/members/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id, ["memberId", "email"]);
    await db.collection("members").deleteOne(query);
    res.json({ success: true, message: "Member deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.put("/members/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id, ["memberId", "email"]);
    await db.collection("members").updateOne(query, { $set: req.body });
    const updated = await db.collection("members").findOne(query);
    if (updated) return res.json(updated);
    res.status(404).json({ error: "Member not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.patch("/members/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id, ["memberId", "email"]);
    await db.collection("members").updateOne(query, { $set: req.body });
    const updated = await db.collection("members").findOne(query);
    if (updated) return res.json(updated);
    res.status(404).json({ error: "Member not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Posts
apiRouter.get("/posts", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const posts = await db.collection("posts").find().sort({ _id: -1 }).toArray();
    res.json(posts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/posts", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const newPost = req.body;
    const result = await db.collection("posts").insertOne(newPost);
    res.status(201).json({ ...newPost, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/posts/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    await db.collection("posts").deleteOne(query);
    res.json({ success: true, message: "Post deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.put("/posts/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    await db.collection("posts").updateOne(query, { $set: req.body });
    const updated = await db.collection("posts").findOne(query);
    if (updated) return res.json(updated);
    res.status(404).json({ error: "Post not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Announcements
apiRouter.get("/announcements", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const announcements = await db.collection("announcements").find().sort({ _id: -1 }).toArray();
    res.json(announcements);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/announcements", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const newAnn = req.body;
    const result = await db.collection("announcements").insertOne(newAnn);
    res.status(201).json({ ...newAnn, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/announcements/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    await db.collection("announcements").deleteOne(query);
    res.json({ success: true, message: "Announcement deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.put("/announcements/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    await db.collection("announcements").updateOne(query, { $set: req.body });
    const updated = await db.collection("announcements").findOne(query);
    if (updated) return res.json(updated);
    res.status(404).json({ error: "Announcement not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Gallery
apiRouter.get("/gallery", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const gallery = await db.collection("gallery").find().sort({ _id: -1 }).toArray();
    res.json(gallery);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/gallery", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const newItem = req.body;
    const result = await db.collection("gallery").insertOne(newItem);
    res.status(201).json({ ...newItem, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/gallery/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    await db.collection("gallery").deleteOne(query);
    res.json({ success: true, message: "Gallery item deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Notices (Backward Compatibility)
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
    const result = await db.collection("notices").insertOne(newNotice);
    res.status(201).json({ ...newNotice, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/notices/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    await db.collection("notices").deleteOne(query);
    res.json({ success: true, message: "Notice deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Events
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
    const result = await db.collection("events").insertOne(newEvent);
    res.status(201).json({ ...newEvent, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/events/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    await db.collection("events").deleteOne(query);
    res.json({ success: true, message: "Event deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.put("/events/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    await db.collection("events").updateOne(query, { $set: req.body });
    const updated = await db.collection("events").findOne(query);
    if (updated) return res.json(updated);
    res.status(404).json({ error: "Event not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Courses
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
    const result = await db.collection("courses").insertOne(newCourse);
    res.status(201).json({ ...newCourse, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/courses/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    await db.collection("courses").deleteOne(query);
    res.json({ success: true, message: "Course deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.put("/courses/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    await db.collection("courses").updateOne(query, { $set: req.body });
    const updated = await db.collection("courses").findOne(query);
    if (updated) return res.json(updated);
    res.status(404).json({ error: "Course not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Devices
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
    const result = await db.collection("devices").insertOne(newDevice);
    res.status(201).json({ ...newDevice, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/devices/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    await db.collection("devices").deleteOne(query);
    res.json({ success: true, message: "Device deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.put("/devices/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    await db.collection("devices").updateOne(query, { $set: req.body });
    const updated = await db.collection("devices").findOne(query);
    if (updated) return res.json(updated);
    res.status(404).json({ error: "Device not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Sponsors
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
    const result = await db.collection("sponsors").insertOne(newSponsor);
    res.status(201).json({ ...newSponsor, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/sponsors/:name", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.name, ["name"]);
    await db.collection("sponsors").deleteOne(query);
    res.json({ success: true, message: "Sponsor deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Analytics
apiRouter.get("/analytics", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const totalMembers = await db.collection("members").countDocuments();
    const activeMembers = await db.collection("members").countDocuments({ status: { $in: ["Active", "active", "approved"] } });
    const pendingApprovals = await db.collection("members").countDocuments({ status: { $in: ["Pending", "pending"] } });
    const totalPosts = await db.collection("posts").countDocuments();
    const totalEvents = await db.collection("events").countDocuments();
    const totalAnnouncements = await db.collection("announcements").countDocuments();

    res.json({
      totalMembers,
      activeMembers,
      pendingApprovals,
      totalPosts,
      totalEvents,
      totalAnnouncements,
      engagementRate: "84.2%",
      attendanceAvg: "92%",
      retentionPct: "96.8%",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 11. Topology metrics
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
    const update = {
      ...req.body,
      lastUpdated: req.body?.lastUpdated || new Date().toISOString(),
    };
    const query = buildIdQuery(targetId);
    await db.collection("topology_metrics").updateOne(query, { $set: update });
    const updated = await db.collection("topology_metrics").findOne(query);
    if (updated) return res.json(updated);
    res.status(404).json({ error: "Topology metric not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 12. Network Diagnosis AI Route
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
          Authorization: `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemInstruction || "You are a helpful assistant." },
            { role: "user", content: prompt },
          ],
          stream: false,
        }),
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

// 13. Health Check
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
  await connectDB();

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
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const candidates = [
      path.join(__dirname, "client", "dist"),
      path.join(__dirname, "..", "client", "dist"),
      path.join(process.cwd(), "client", "dist"),
    ];
    const distPath = candidates.find((p) => {
      try {
        return fs.existsSync(path.join(p, "index.html"));
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

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received — shutting down...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("index.ts") ||
    process.argv[1].endsWith("index.js") ||
    process.argv[1].includes("nodemon") ||
    process.argv[1].endsWith("server/index.ts"));

if (isMain) {
  startServer();
} else {
  connectDB();
}

export default app;
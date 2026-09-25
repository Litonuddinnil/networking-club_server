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
  // Default to 5000 to match the Vite proxy in the client; honoured PORT env wins.
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
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
    const newMember = req.body || {};

    // Guard against duplicate registration: same email or same Firebase
    // uid should never create two member documents.
    const orConditions: any[] = [];
    if (newMember.email) {
      orConditions.push({
        email: String(newMember.email).toLowerCase(),
      });
    }
    if (newMember.uid) {
      orConditions.push({ uid: newMember.uid });
    }
    if (newMember.memberId) {
      orConditions.push({ memberId: newMember.memberId });
    }

    if (orConditions.length) {
      const existing = await db
        .collection("members")
        .findOne({ $or: orConditions });
      if (existing) {
        return res.status(409).json({
          error: "A member with this email, uid, or memberId already exists.",
          existingId: existing._id,
        });
      }
    }

    // Normalize email to lowercase so future lookups stay consistent.
    if (newMember.email) {
      newMember.email = String(newMember.email).toLowerCase();
    }

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
const normalizePostPayload = (incoming: any) => {
  if (!incoming || typeof incoming !== "object") return null;
  const out: Record<string, any> = { ...incoming };
  // Mirror image -> coverImage so the frontend reads one stable name
  if (out.image && !out.coverImage) out.coverImage = out.image;
  if (out.imageUrl && !out.coverImage) out.coverImage = out.imageUrl;
  if (out.coverImage) out.coverImage = String(out.coverImage).trim();
  if (typeof out.title === "string") out.title = out.title.trim();
  if (typeof out.category === "string") out.category = out.category.trim() || "General";
  if (typeof out.content === "string") out.content = out.content;
  if (!out.excerpt && typeof out.content === "string") {
    out.excerpt = out.content.replace(/\s+/g, " ").slice(0, 180);
  }
  return out;
};

apiRouter.get("/posts", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const posts = await db.collection("posts").find().sort({ _id: -1 }).toArray();
    res.json(posts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get("/posts/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    const post = await db.collection("posts").findOne(query);
    if (!post) return res.status(404).json({ error: "Post not found." });
    res.json(post);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/posts", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const payload = normalizePostPayload(req.body) || {};
    console.log(payload);
    if (!payload.title) {
      return res.status(400).json({ error: "Post title is required." });
    }
    if (!payload.content) {
      return res.status(400).json({ error: "Post content is required." });
    }
    payload.createdAt = payload.createdAt || new Date().toISOString();
    payload.updatedAt = new Date().toISOString();
    if (!payload.date) payload.date = new Date().toISOString().slice(0, 10);
    if (!payload.status) payload.status = "published";
    const result = await db.collection("posts").insertOne(payload);
    res.status(201).json({ ...payload, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/posts/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    const result = await db.collection("posts").deleteOne(query);
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Post not found." });
    }
    res.json({ success: true, message: "Post deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const updatePostHandler = async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    const payload = normalizePostPayload(req.body) || {};
    if (payload.title !== undefined && !String(payload.title).trim()) {
      return res.status(400).json({ error: "Post title cannot be empty." });
    }
    if (payload.content !== undefined && !String(payload.content).trim()) {
      return res.status(400).json({ error: "Post content cannot be empty." });
    }
    delete payload._id;
    payload.updatedAt = new Date().toISOString();
    const result = await db
      .collection("posts")
      .updateOne(query, { $set: payload });
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Post not found." });
    }
    const updated = await db.collection("posts").findOne(query);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
apiRouter.put("/posts/:id", updatePostHandler);
apiRouter.patch("/posts/:id", updatePostHandler);

// 3. Announcements
const normalizeAnnouncementPayload = (incoming: any) => {
  if (!incoming || typeof incoming !== "object") return null;
  const out: Record<string, any> = { ...incoming };
  if (out.image && !out.coverImage) out.coverImage = out.image;
  if (out.imageUrl && !out.coverImage) out.coverImage = out.imageUrl;
  if (out.coverImage) out.coverImage = String(out.coverImage).trim();
  if (typeof out.title === "string") out.title = out.title.trim();
  if (typeof out.category === "string") out.category = out.category.trim() || "Notice";
  if (typeof out.content === "string") out.content = out.content;
  return out;
};

apiRouter.get("/announcements", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const announcements = await db.collection("announcements").find().sort({ _id: -1 }).toArray();
    res.json(announcements);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get("/announcements/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    const ann = await db.collection("announcements").findOne(query);
    if (!ann) return res.status(404).json({ error: "Announcement not found." });
    res.json(ann);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/announcements", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const payload = normalizeAnnouncementPayload(req.body) || {};
    if (!payload.title) {
      return res.status(400).json({ error: "Announcement title is required." });
    }
    if (!payload.content) {
      return res.status(400).json({ error: "Announcement content is required." });
    }
    payload.createdAt = payload.createdAt || new Date().toISOString();
    payload.updatedAt = new Date().toISOString();
    if (!payload.date) payload.date = new Date().toISOString().slice(0, 10);
    if (!payload.status) payload.status = "published";
    const result = await db.collection("announcements").insertOne(payload);
    res.status(201).json({ ...payload, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/announcements/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    const result = await db.collection("announcements").deleteOne(query);
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Announcement not found." });
    }
    res.json({ success: true, message: "Announcement deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const updateAnnouncementHandler = async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    const payload = normalizeAnnouncementPayload(req.body) || {};
    if (payload.title !== undefined && !String(payload.title).trim()) {
      return res.status(400).json({ error: "Announcement title cannot be empty." });
    }
    if (payload.content !== undefined && !String(payload.content).trim()) {
      return res.status(400).json({ error: "Announcement content cannot be empty." });
    }
    delete payload._id;
    payload.updatedAt = new Date().toISOString();
    const result = await db
      .collection("announcements")
      .updateOne(query, { $set: payload });
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Announcement not found." });
    }
    const updated = await db.collection("announcements").findOne(query);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
apiRouter.put("/announcements/:id", updateAnnouncementHandler);
apiRouter.patch("/announcements/:id", updateAnnouncementHandler);

// 4. Gallery
const normalizeGalleryPayload = (incoming: any) => {
  if (!incoming || typeof incoming !== "object") return null;
  const out: Record<string, any> = { ...incoming };
  // The form sends imageUrl; mirror legacy fields so cards can read either.
  if (out.image && !out.imageUrl) out.imageUrl = out.image;
  if (out.coverImage && !out.imageUrl) out.imageUrl = out.coverImage;
  if (typeof out.imageUrl === "string") out.imageUrl = out.imageUrl.trim();
  if (typeof out.title === "string") out.title = out.title.trim();
  if (typeof out.category === "string") out.category = out.category.trim() || "Workshop";
  return out;
};

apiRouter.get("/gallery", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const gallery = await db.collection("gallery").find().sort({ _id: -1 }).toArray();
    res.json(gallery);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get("/gallery/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    const item = await db.collection("gallery").findOne(query);
    if (!item) return res.status(404).json({ error: "Gallery item not found." });
    res.json(item);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/gallery", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const payload = normalizeGalleryPayload(req.body) || {};
    if (!payload.title) {
      return res.status(400).json({ error: "Gallery title is required." });
    }
    if (!payload.imageUrl) {
      return res.status(400).json({ error: "Gallery image URL is required." });
    }
    payload.createdAt = payload.createdAt || new Date().toISOString();
    payload.updatedAt = new Date().toISOString();
    if (!payload.date) payload.date = new Date().toISOString().slice(0, 10);
    const result = await db.collection("gallery").insertOne(payload);
    res.status(201).json({ ...payload, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/gallery/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    const result = await db.collection("gallery").deleteOne(query);
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Gallery item not found." });
    }
    res.json({ success: true, message: "Gallery item deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const updateGalleryHandler = async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    const payload = normalizeGalleryPayload(req.body) || {};
    if (payload.title !== undefined && !String(payload.title).trim()) {
      return res.status(400).json({ error: "Gallery title cannot be empty." });
    }
    if (payload.imageUrl !== undefined && !String(payload.imageUrl).trim()) {
      return res.status(400).json({ error: "Gallery image URL cannot be empty." });
    }
    delete payload._id;
    payload.updatedAt = new Date().toISOString();
    const result = await db
      .collection("gallery")
      .updateOne(query, { $set: payload });
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Gallery item not found." });
    }
    const updated = await db.collection("gallery").findOne(query);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
apiRouter.put("/gallery/:id", updateGalleryHandler);
apiRouter.patch("/gallery/:id", updateGalleryHandler);

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
/** "2026-09-25T14:30" | "2026-09-25" | ISO → "2026-09-25" */
const calendarDayOf = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

/** "2026-09-25T14:30" | "2026-09-25 14:30" → "14:30" */
const clockTimeOf = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = value.match(/[T ](\d{2}:\d{2})/);
  return match ? match[1] : null;
};

const normalizeEventPayload = (incoming: any) => {
  if (!incoming || typeof incoming !== "object") return null;
  const out: Record<string, any> = { ...incoming };

  if (out.image && !out.imageUrl) out.imageUrl = out.image;
  if (out.coverImage && !out.imageUrl) out.imageUrl = out.coverImage;

  for (const key of [
    "imageUrl",
    "title",
    "type",
    "location",
    "date",
    "time",
    "eventDate",
    "eventDateTime",
  ]) {
    if (typeof out[key] === "string") out[key] = out[key].trim();
  }
  if (out.type === "") out.type = "Workshop";

  // Clients have expressed the schedule three different ways: `date` + `time`,
  // a single `eventDate`, or `eventDateTime`. This used to derive `eventDate`
  // from `date`, but never the reverse — so a client that sent only
  // `eventDate` (which the admin form does) left `date` undefined and tripped
  // the "Event date is required" check below on every create.
  //
  // Fill in whatever is missing from whatever was supplied, and never
  // overwrite a field the client set. Dates are handled as plain strings
  // rather than through `new Date(...)` so a server running in a different
  // timezone can't shift the calendar day by one.
  const scheduleSource = out.eventDate || out.eventDateTime || out.date || "";

  if (!out.date) {
    const day = calendarDayOf(scheduleSource);
    if (day) out.date = day;
  }
  if (!out.time) {
    const clock = clockTimeOf(out.eventDate || out.eventDateTime || "");
    if (clock) out.time = clock;
  }
  if (!out.eventDate && out.date) {
    out.eventDate = out.time ? `${out.date}T${out.time}` : out.date;
  }

  // Never persist empty placeholders — they read as "set but blank" downstream.
  for (const key of ["date", "time", "eventDate"]) {
    if (out[key] === "") delete out[key];
  }

  return out;
};

apiRouter.get("/events", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const events = await db.collection("events").find().toArray();
    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get("/events/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    const event = await db.collection("events").findOne(query);
    if (!event) return res.status(404).json({ error: "Event not found." });
    res.json(event);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/events", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const payload = normalizeEventPayload(req.body) || {};
    if (!payload.title) {
      return res.status(400).json({ error: "Event title is required." });
    }
    if (!payload.date && !payload.eventDate) {
      return res.status(400).json({ error: "Event date is required." });
    }
    payload.createdAt = payload.createdAt || new Date().toISOString();
    payload.updatedAt = new Date().toISOString();
    if (!payload.status) payload.status = "upcoming";
    const result = await db.collection("events").insertOne(payload);
    res.status(201).json({ ...payload, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/events/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    const result = await db.collection("events").deleteOne(query);
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Event not found." });
    }
    res.json({ success: true, message: "Event deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const updateEventHandler = async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    const payload = normalizeEventPayload(req.body) || {};
    if (payload.title !== undefined && !String(payload.title).trim()) {
      return res.status(400).json({ error: "Event title cannot be empty." });
    }
    delete payload._id;
    payload.updatedAt = new Date().toISOString();
    const result = await db
      .collection("events")
      .updateOne(query, { $set: payload });
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Event not found." });
    }
    const updated = await db.collection("events").findOne(query);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
apiRouter.put("/events/:id", updateEventHandler);
apiRouter.patch("/events/:id", updateEventHandler);

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

// 10. Payments — admin sees all, member dashboard filters by memberId/email
apiRouter.get("/payments", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const payments = await db
      .collection("payments")
      .find()
      .sort({ _id: -1 })
      .toArray();
    res.json(payments);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/payments", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const incoming = req.body || {};
    // Normalize email to lowercase for consistent lookups.
    if (incoming.memberEmail) {
      incoming.memberEmail = String(incoming.memberEmail).toLowerCase();
    }
    const payload = {
      ...incoming,
      status: incoming.status || "pending",
      amount: Number(incoming.amount) || 0,
      createdAt: incoming.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = await db.collection("payments").insertOne(payload);
    res.status(201).json({ ...payload, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.patch("/payments/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    const update = {
      ...req.body,
      updatedAt: new Date().toISOString(),
    };
    await db.collection("payments").updateOne(query, { $set: update });
    const updated = await db.collection("payments").findOne(query);
    if (updated) return res.json(updated);
    res.status(404).json({ error: "Payment not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/payments/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    await db.collection("payments").deleteOne(query);
    res.json({ success: true, message: "Payment deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 11. Attendance — admin sees all, member dashboard filters by memberId/email
apiRouter.get("/attendance", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const attendance = await db
      .collection("attendance")
      .find()
      .sort({ _id: -1 })
      .toArray();
    res.json(attendance);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/attendance", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const incoming = req.body || {};
    if (incoming.memberEmail) {
      incoming.memberEmail = String(incoming.memberEmail).toLowerCase();
    }
    const payload = {
      ...incoming,
      status: incoming.status || "Present",
      createdAt: incoming.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = await db.collection("attendance").insertOne(payload);
    res.status(201).json({ ...payload, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.patch("/attendance/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    const update = {
      ...req.body,
      updatedAt: new Date().toISOString(),
    };
    await db.collection("attendance").updateOne(query, { $set: update });
    const updated = await db.collection("attendance").findOne(query);
    if (updated) return res.json(updated);
    res.status(404).json({ error: "Attendance record not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/attendance/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    await db.collection("attendance").deleteOne(query);
    res.json({ success: true, message: "Attendance record deleted." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 12. Event Registrations — admin sees all, member dashboard filters by memberId/email
apiRouter.get("/event-registrations", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const list = await db
      .collection("event-registrations")
      .find()
      .sort({ _id: -1 })
      .toArray();
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Registration lifecycle:
 *   pending  → submitted by a member, waiting for an admin to check the
 *              details and the payment proof
 *   approved → admin confirmed it; the member's seat is booked
 *   rejected → admin turned it down (reviewNote explains why)
 *   cancelled / attended → post-approval bookkeeping
 */
const REGISTRATION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "registered",
  "cancelled",
  "attended",
  "waitlist",
];

apiRouter.get("/event-registrations/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    const found = await db.collection("event-registrations").findOne(query);
    if (!found) return res.status(404).json({ error: "Registration not found." });
    res.json(found);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.post("/event-registrations", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const incoming = req.body || {};
    if (incoming.memberEmail) {
      incoming.memberEmail = String(incoming.memberEmail).toLowerCase();
    }

    for (const key of [
      "fullName",
      "phone",
      "studentId",
      "department",
      "session",
      "paymentMethod",
      "transactionId",
      "notes",
      "eventTitle",
    ]) {
      if (typeof incoming[key] === "string") incoming[key] = incoming[key].trim();
    }

    if (!incoming.eventId) {
      return res.status(400).json({ error: "Event is required." });
    }
    if (!incoming.fullName) {
      return res.status(400).json({ error: "Full name is required." });
    }
    if (!incoming.memberEmail) {
      return res.status(400).json({ error: "Email is required." });
    }
    if (!incoming.phone) {
      return res.status(400).json({ error: "Phone number is required." });
    }
    if (!incoming.studentId) {
      return res.status(400).json({ error: "Student ID is required." });
    }

    // A member may re-apply after being rejected or cancelling, but not while
    // a submission is still pending or already approved.
    const identity: any[] = [];
    if (incoming.memberId) identity.push({ memberId: incoming.memberId });
    if (incoming.memberEmail) identity.push({ memberEmail: incoming.memberEmail });
    if (identity.length) {
      const existing = await db.collection("event-registrations").findOne({
        eventId: incoming.eventId,
        $or: identity,
        status: { $in: ["pending", "approved", "registered"] },
      });
      if (existing) {
        return res.status(409).json({
          error:
            existing.status === "pending"
              ? "You already have a registration awaiting approval for this event."
              : "You are already registered for this event.",
          existingId: existing._id,
        });
      }
    }

    const payload = {
      ...incoming,
      // New submissions always start unapproved — an admin has to review the
      // details and the payment before the seat counts.
      status: REGISTRATION_STATUSES.includes(incoming.status)
        ? incoming.status
        : "pending",
      registeredAt: incoming.registeredAt || new Date().toISOString(),
      submittedAt: new Date().toISOString(),
    };
    const result = await db
      .collection("event-registrations")
      .insertOne(payload);
    res.status(201).json({ ...payload, _id: result.insertedId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.patch("/event-registrations/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    const update = { ...req.body };
    if (update.status && !REGISTRATION_STATUSES.includes(update.status)) {
      return res.status(400).json({ error: `Unknown status "${update.status}".` });
    }
    // Stamp the review so the admin table can show when a decision was made.
    if (update.status === "approved" || update.status === "rejected") {
      update.reviewedAt = new Date().toISOString();
    }
    update.updatedAt = new Date().toISOString();
    await db.collection("event-registrations").updateOne(query, { $set: update });
    const updated = await db.collection("event-registrations").findOne(query);
    if (updated) return res.json(updated);
    res.status(404).json({ error: "Registration not found." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.delete("/event-registrations/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const query = buildIdQuery(req.params.id);
    await db.collection("event-registrations").deleteOne(query);
    res.json({ success: true, message: "Registration cancelled." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 13. Analytics
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

  // If the port is already in use, exit cleanly so nodemon doesn't
  // crash-loop trying to rebind it. The wrapper script frees the port
  // before launching nodemon.
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `❌ Port ${PORT} is already in use. Run \\free-port-5000.ps1 to clear it, then retry.`
      );
      process.exit(1);
    }
    throw err;
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
 import express, { Request, Response, Router } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { MongoClient, Db } from "mongodb";

// Load Environment Variables (look in cwd and in server/.env)
dotenv.config();
dotenv.config({ path: path.join(process.cwd(), "server/.env") });

const isProd = process.env.NODE_ENV === "production";

// ============================================================
// DATABASE (inlined from former db.ts — single-file server)
// ============================================================
let isMongoConnected = false;
let client: MongoClient | null = null;
let dbInstance: Db | null = null;

async function connectAndSeedDB() {
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
    await seedDatabase();
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

const seedData = {
  members: [
    { id: "JNC-2026-0125", memberId: "JNC-2026-0125", name: "Md. Ariful Islam", displayName: "Md. Ariful Islam", email: "mdlitonuddin440@gmail.com", role: "Lead Network Engineer", xp: 1450, attendance: 85, totalPaid: 1800, paidMonths: ["Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026"], department: "CSE", batch: "2022-23", status: "Active", joinedDate: "15 Jan 2026", avatar: "ariful" },
    { id: "JNC-2026-0045", memberId: "JNC-2026-0045", name: "Sazzad Hossain", displayName: "Sazzad Hossain", email: "sazzad@jstu.edu", role: "CCNA Facilitator", xp: 1850, attendance: 92, totalPaid: 1800, paidMonths: ["Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026"], department: "CSE", batch: "2021-22", status: "Active", joinedDate: "10 Jan 2026", avatar: "sazzad" },
    { id: "JNC-2026-0112", memberId: "JNC-2026-0112", name: "Nusrat Jahan", displayName: "Nusrat Jahan", email: "nusrat@jstu.edu", role: "Graphics Lead", xp: 920, attendance: 78, totalPaid: 1500, paidMonths: ["Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026"], department: "CSE", batch: "2022-23", status: "Active", joinedDate: "20 Jan 2026", avatar: "nusrat" },
    { id: "JNC-2026-0089", memberId: "JNC-2026-0089", name: "Fahim Ahmed", displayName: "Fahim Ahmed", email: "fahim@jstu.edu", role: "Core Member", xp: 500, attendance: 65, totalPaid: 600, paidMonths: ["Jan 2026","Feb 2026"], department: "EEE", batch: "2022-23", status: "Inactive", joinedDate: "05 Feb 2026", avatar: "fahim" },
    { id: "JNC-2026-0142", memberId: "JNC-2026-0142", name: "Raihan Kabir", displayName: "Raihan Kabir", email: "raihan@jstu.edu", role: "Wireless Specialist", xp: 1100, attendance: 88, totalPaid: 1800, paidMonths: ["Jan 2026","Feb 2026","Mar 2026","Apr 2026","May 2026","Jun 2026"], department: "CSE", batch: "2022-23", status: "Active", joinedDate: "18 Jan 2026", avatar: "raihan" },
    { id: "ADMIN-001", memberId: "ADMIN-001", name: "Club Admin", displayName: "Club Admin", email: "admin@jstu.edu", role: "admin", xp: 9999, attendance: 100, totalPaid: 0, paidMonths: [], department: "CSE", batch: "Faculty", status: "Active", joinedDate: "01 Jan 2026", avatar: "admin" }
  ],
  notices: [
    { id: "NTC-001", title: "Annual Picnic 2026 Registration is Open!", date: "May 18, 2026", category: "General" },
    { id: "NTC-002", title: "Next Webinar on Network Security Basics", date: "May 16, 2026", category: "Webinar" },
    { id: "NTC-003", title: "Monthly Club Meeting on 20 May 2026", date: "May 14, 2026", category: "General" },
    { id: "NTC-004", title: "Physical ID Card Distribution on 25 May 2026", date: "May 12, 2026", category: "Academic" },
    { id: "NTC-005", title: "CCNA Bootcamp Batch 3 Registration Open", date: "May 10, 2026", category: "Training" }
  ],
  events: [
    { id: "EVT-001", title: "Introduction to Cisco Networking", type: "Webinar", date: "24 May 2026", time: "07:00 PM", location: "Online (Google Meet)", image: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=400&q=80", isRegistered: true },
    { id: "EVT-002", title: "MikroTik Router Configuration", type: "Workshop", date: "30 May 2026", time: "10:00 AM", location: "CSE Lab, JSTU", image: "https://images.unsplash.com/photo-1597733336794-12d05021d510?auto=format&fit=crop&w=400&q=80", isRegistered: false },
    { id: "EVT-003", title: "Future of Networking & IPv6", type: "Seminar", date: "05 Jun 2026", time: "03:00 PM", location: "Seminar Hall, JSTU", image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=400&q=80", isRegistered: false }
  ],
  courses: [
    { id: "CRS-01", title: "CCNA Basics", name: "CCNA Basics", description: "Foundational Cisco networking course covering routing, switching, and subnetting.", progress: 75, provider: "Cisco", instructor: "Engr. Sazzad Hossain" },
    { id: "CRS-02", title: "MikroTik Essentials", name: "MikroTik Essentials", description: "Hands-on MikroTik router configuration, firewalling, and bandwidth management.", progress: 60, provider: "MikroTik", instructor: "Engr. Md. Ariful Islam" },
    { id: "CRS-03", title: "Linux Networking", name: "Linux Networking", description: "Configure network services on Linux: DNS, DHCP, NAT, and iptables firewalling.", progress: 40, provider: "Linux", instructor: "Dr. Al Amin" }
  ],
  devices: [
    { id: "dev-01", name: "Cisco Router ISR 4331", type: "Router", status: "Operational", location: "Main Lab Rack", ports: "3 GE ports, 2 NIM slots", throughput: "100-300 Mbps" },
    { id: "dev-02", name: "MikroTik RB4011", type: "Router/Switch", status: "Operational", location: "Lab Rack 2", ports: "10 Gigabit ports, 1 SFP+", throughput: "Up to 9.7 Gbps" },
    { id: "dev-03", name: "Cisco Switch 2960-X", type: "Switch", status: "Operational", location: "Core Rack", ports: "24 GE ports, 4 SFP", throughput: "216 Gbps" },
    { id: "dev-04", name: "Fortinet 60F Firewall", type: "Firewall", status: "Operational", location: "Edge Rack", ports: "10 GE ports", throughput: "10 Gbps" },
    { id: "dev-05", name: "Ubiquiti UniFi 6 LR", type: "Access Point", status: "Operational", location: "Lab Ceiling", ports: "1 GE uplink", throughput: "1.2 Gbps WiFi 6" }
  ],
  sponsors: [
    { id: "SPN-01", name: "MikroTik", tier: "Platinum Partner", contribution: "Hardware & Training" },
    { id: "SPN-02", name: "Cisco Networking Academy", tier: "Gold Partner", contribution: "Curriculum & Certification" },
    { id: "SPN-03", name: "Fortinet", tier: "Gold Partner", contribution: "Security Labs" },
    { id: "SPN-04", name: "Ubiquiti", tier: "Silver Partner", contribution: "Wireless Equipment" },
    { id: "SPN-05", name: "TP-Link", tier: "Community Partner", contribution: "Networking Gear" }
  ],
  topology_metrics: [
    { id: "TM-MESH",   topology: "mesh",   label: "Mesh",   latencyMs: 14, throughputGbps: 2.4, uptimePct: 99.98, packetHealth: 97.4, status: "live",      nodes: 12, source: "lab-snmp-exporter", lastUpdated: "2026-05-20T08:30:00.000Z" },
    { id: "TM-HYBRID", topology: "hybrid", label: "Hybrid", latencyMs: 18, throughputGbps: 2.1, uptimePct: 99.95, packetHealth: 96.1, status: "live",      nodes: 14, source: "lab-snmp-exporter", lastUpdated: "2026-05-20T08:30:00.000Z" },
    { id: "TM-TREE",   topology: "tree",   label: "Tree",   latencyMs: 22, throughputGbps: 1.7, uptimePct: 99.92, packetHealth: 94.8, status: "synthetic", nodes: 10, source: "prom-sim",         lastUpdated: "2026-05-20T08:30:00.000Z" },
    { id: "TM-BUS",    topology: "bus",    label: "Bus",    latencyMs: 26, throughputGbps: 1.2, uptimePct: 99.88, packetHealth: 92.3, status: "synthetic", nodes:  8, source: "prom-sim",         lastUpdated: "2026-05-20T08:30:00.000Z" },
    { id: "TM-STAR",   topology: "star",   label: "Star",   latencyMs: 16, throughputGbps: 2.6, uptimePct: 99.97, packetHealth: 98.1, status: "live",      nodes: 11, source: "lab-snmp-exporter", lastUpdated: "2026-05-20T08:30:00.000Z" },
    { id: "TM-RING",   topology: "ring",   label: "Ring",   latencyMs: 20, throughputGbps: 1.9, uptimePct: 99.93, packetHealth: 95.5, status: "synthetic", nodes:  9, source: "prom-sim",         lastUpdated: "2026-05-20T08:30:00.000Z" }
  ]
} as const;

async function seedDatabase() {
  if (!dbInstance) return;
  try {
    const collections = [
      "members",
      "notices",
      "events",
      "courses",
      "devices",
      "sponsors",
      "topology_metrics",
    ] as const;

    for (const col of collections) {
      const count = await dbInstance.collection(col).countDocuments();
      if (count === 0) {
        console.log(`🌱 Seeding ${col}...`);
        await dbInstance.collection(col).insertMany(seedData[col] as unknown as any[]);
      }
    }
    console.log("✅ Database seeded successfully.");
  } catch (err) {
    console.error("❌ Seeding failed:", err);
  }
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
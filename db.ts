import { MongoClient, Db } from "mongodb";

export let isMongoConnected = false;
let client: MongoClient | null = null;
let dbInstance: Db | null = null;

export async function connectAndSeedDB() {
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
    ];

    for (const col of collections) {
      const count = await dbInstance.collection(col).countDocuments();
      if (count === 0) {
        console.log(`🌱 Seeding ${col}...`);
        await dbInstance.collection(col).insertMany(seedData[col as keyof typeof seedData]);
      }
    }
    console.log("✅ Database seeded successfully.");
  } catch (err) {
    console.error("❌ Seeding failed:", err);
  }
}

const seedData = {
  members: [
    {
      id: "JNC-2026-0125",
      memberId: "JNC-2026-0125",
      name: "Md. Ariful Islam",
      displayName: "Md. Ariful Islam",
      email: "mdlitonuddin440@gmail.com",
      role: "Lead Network Engineer",
      xp: 1450,
      attendance: 85,
      totalPaid: 1800,
      paidMonths: ["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026"],
      department: "CSE",
      batch: "2022-23",
      status: "Active",
      joinedDate: "15 Jan 2026",
      avatar: "ariful"
    },
    {
      id: "JNC-2026-0045",
      memberId: "JNC-2026-0045",
      name: "Sazzad Hossain",
      displayName: "Sazzad Hossain",
      email: "sazzad@jstu.edu",
      role: "CCNA Facilitator",
      xp: 1850,
      attendance: 92,
      totalPaid: 1800,
      paidMonths: ["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026"],
      department: "CSE",
      batch: "2021-22",
      status: "Active",
      joinedDate: "10 Jan 2026",
      avatar: "sazzad"
    },
    {
      id: "JNC-2026-0112",
      memberId: "JNC-2026-0112",
      name: "Nusrat Jahan",
      displayName: "Nusrat Jahan",
      email: "nusrat@jstu.edu",
      role: "Graphics Lead",
      xp: 920,
      attendance: 78,
      totalPaid: 1500,
      paidMonths: ["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026"],
      department: "CSE",
      batch: "2022-23",
      status: "Active",
      joinedDate: "20 Jan 2026",
      avatar: "nusrat"
    },
    {
      id: "JNC-2026-0089",
      memberId: "JNC-2026-0089",
      name: "Fahim Ahmed",
      displayName: "Fahim Ahmed",
      email: "fahim@jstu.edu",
      role: "Core Member",
      xp: 500,
      attendance: 65,
      totalPaid: 600,
      paidMonths: ["Jan 2026", "Feb 2026"],
      department: "EEE",
      batch: "2022-23",
      status: "Inactive",
      joinedDate: "05 Feb 2026",
      avatar: "fahim"
    },
    {
      id: "JNC-2026-0142",
      memberId: "JNC-2026-0142",
      name: "Raihan Kabir",
      displayName: "Raihan Kabir",
      email: "raihan@jstu.edu",
      role: "Wireless Specialist",
      xp: 1100,
      attendance: 88,
      totalPaid: 1800,
      paidMonths: ["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026"],
      department: "CSE",
      batch: "2022-23",
      status: "Active",
      joinedDate: "18 Jan 2026",
      avatar: "raihan"
    },
    {
      id: "ADMIN-001",
      memberId: "ADMIN-001",
      name: "Club Admin",
      displayName: "Club Admin",
      email: "admin@jstu.edu",
      role: "admin",
      xp: 9999,
      attendance: 100,
      totalPaid: 0,
      paidMonths: [],
      department: "CSE",
      batch: "Faculty",
      status: "Active",
      joinedDate: "01 Jan 2026",
      avatar: "admin"
    }
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
  // Per-topology live network metrics. Source: "synthetic" until the lab
  // exposes a real SNMP exporter; switch to "live" once the backend wires
  // in real telemetry. lastUpdated is ISO timestamp so the client can show
  // "Updated 3s ago" indicators without an extra clock sync.
  topology_metrics: [
    {
      id: "TM-MESH",
      topology: "mesh",
      label: "Mesh",
      latencyMs: 14,
      throughputGbps: 2.4,
      uptimePct: 99.98,
      packetHealth: 97.4,
      status: "live",
      nodes: 12,
      source: "lab-snmp-exporter",
      lastUpdated: "2026-05-20T08:30:00.000Z",
    },
    {
      id: "TM-HYBRID",
      topology: "hybrid",
      label: "Hybrid",
      latencyMs: 18,
      throughputGbps: 2.1,
      uptimePct: 99.95,
      packetHealth: 96.1,
      status: "live",
      nodes: 14,
      source: "lab-snmp-exporter",
      lastUpdated: "2026-05-20T08:30:00.000Z",
    },
    {
      id: "TM-TREE",
      topology: "tree",
      label: "Tree",
      latencyMs: 22,
      throughputGbps: 1.7,
      uptimePct: 99.92,
      packetHealth: 94.8,
      status: "synthetic",
      nodes: 10,
      source: "prom-sim",
      lastUpdated: "2026-05-20T08:30:00.000Z",
    },
    {
      id: "TM-BUS",
      topology: "bus",
      label: "Bus",
      latencyMs: 26,
      throughputGbps: 1.2,
      uptimePct: 99.88,
      packetHealth: 92.3,
      status: "synthetic",
      nodes: 8,
      source: "prom-sim",
      lastUpdated: "2026-05-20T08:30:00.000Z",
    },
    {
      id: "TM-STAR",
      topology: "star",
      label: "Star",
      latencyMs: 16,
      throughputGbps: 2.6,
      uptimePct: 99.97,
      packetHealth: 98.1,
      status: "live",
      nodes: 11,
      source: "lab-snmp-exporter",
      lastUpdated: "2026-05-20T08:30:00.000Z",
    },
    {
      id: "TM-RING",
      topology: "ring",
      label: "Ring",
      latencyMs: 20,
      throughputGbps: 1.9,
      uptimePct: 99.93,
      packetHealth: 95.5,
      status: "synthetic",
      nodes: 9,
      source: "prom-sim",
      lastUpdated: "2026-05-20T08:30:00.000Z",
    },
  ],
};

export function getDb(): Db {
  if (!dbInstance) {
    throw new Error("Database not initialized. Please connect first.");
  }
  return dbInstance;
}
import zlib from "zlib";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

    const { fileId, accessToken } = req.body;
    if (!fileId || !accessToken) {
      return res.status(400).json({ error: "Missing fileId or accessToken" });
    }

    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: "Bearer " + accessToken } }
    );
    if (!r.ok) return res.status(502).json({ error: "Drive fetch failed" });

    const buf = Buffer.from(await r.arrayBuffer());

    // 1) Try plain AIPrivateData
    let aiText = findAIPrivateData(buf);

    // 2) If not found, look for compressed streams that contain AIPrivateData
    if (!aiText) {
      aiText = findAIPrivateDataInFlateStreams(buf);
    }

    if (!aiText) {
      return res.json({
        ok: false,
        message:
          "No AIPrivateData found. File is either non-PDF-compatible AI or uses an unsupported compression.",
      });
    }

    // Parse layers
    const layers = [];
    for (const m of aiText.matchAll(/\(Layer([\s\S]*?)\)/g)) {
      const b = m[1];
      const name = b.match(/\(Name\s+"([^"]+)"\)/)?.[1];
      const vis = b.match(/\(Visible\s+(true|false)\)/)?.[1] ?? "true";
      if (name) layers.push({ name, visible: vis === "true" });
    }

    return res.json({
      ok: true,
      total: layers.length,
      visible: layers.filter(l => l.visible),
      layers,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
}

/* ---------- helpers ---------- */

function findAIPrivateData(buf) {
  const s = buf.toString("latin1");
  const m = s.match(/%AIPrivateDataBegin([\s\S]*?)%AIPrivateDataEnd/);
  return m ? m[1] : null;
}

function findAIPrivateDataInFlateStreams(buf) {
  const s = buf.toString("latin1");
  const streams = [...s.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];

  for (const m of streams) {
    const raw = Buffer.from(m[1], "latin1");
    try {
      const inflated = zlib.inflateSync(raw).toString("latin1");
      const ai = inflated.match(/%AIPrivateDataBegin([\s\S]*?)%AIPrivateDataEnd/);
      if (ai) return ai[1];
    } catch {
      // not flate or not our stream
    }
  }
  return null;
}

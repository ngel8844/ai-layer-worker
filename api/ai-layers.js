export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST only" });
    }

    const { fileId, accessToken } = req.body;
    if (!fileId || !accessToken) {
      return res.status(400).json({ error: "Missing fileId or accessToken" });
    }

    // Download from Google Drive
    const pdfRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { Authorization: "Bearer " + accessToken },
      }
    );

    if (!pdfRes.ok) {
      return res.status(500).json({
        error: "Drive download failed",
        status: pdfRes.status,
      });
    }

    // Read into buffer
    const buf = Buffer.from(await pdfRes.arrayBuffer());

    // Convert to text for AIPrivateData scan
    const text = buf.toString("utf8");

    // Extract Illustrator block
    const aiMatch = text.match(/%AIPrivateDataBegin([\s\S]*?)%AIPrivateDataEnd/);
    if (!aiMatch) {
      return res.json({
        ok: false,
        message: "No Illustrator data found — not an AI-based file",
      });
    }

    const ai = aiMatch[1];

    // Find all layer blocks
    const layerBlocks = [...ai.matchAll(/\(Layer([\s\S]*?)\)/g)];

    const layers = [];

    for (const m of layerBlocks) {
      const block = m[1];

      const nameMatch = block.match(/\(Name\s+"([^"]+)"\)/);
      const visMatch = block.match(/\(Visible\s+(true|false)\)/);

      if (!nameMatch) continue;

      layers.push({
        name: nameMatch[1],
        visible: visMatch ? visMatch[1] === "true" : true,
      });
    }

    return res.json({
      ok: true,
      total: layers.length,
      visible: layers.filter(l => l.visible),
      layers,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: e.message,
      stack: e.stack,
    });
  }
}

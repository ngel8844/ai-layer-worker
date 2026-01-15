export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST only" });
    }

    const { fileId, accessToken } = req.body;
    if (!fileId || !accessToken) {
      return res.status(400).json({ error: "Missing fileId or accessToken" });
    }

    // Download from Drive
    const pdfRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: "Bearer " + accessToken } }
    );

    if (!pdfRes.ok) {
      return res.status(500).json({ error: "Drive download failed" });
    }

    const buf = Buffer.from(await pdfRes.arrayBuffer());

    // Convert ONLY first 5MB to text (catalog always lives here)
    const head = buf.subarray(0, 5 * 1024 * 1024).toString("latin1");

    const ocPropsMatch = head.match(/\/OCProperties\s*<<([\s\S]*?)>>/);
    if (!ocPropsMatch) {
      return res.json({ ok: true, layers: [], message: "No layers found" });
    }

    const ocBlock = ocPropsMatch[1];

    // Get OCG refs
    const ocgRefs = [...ocBlock.matchAll(/(\d+)\s+0\s+R/g)].map(m => m[1]);

    // Find ON list
    const onMatch = ocBlock.match(/\/ON\s*\[([^\]]*)\]/);
    const onRefs = onMatch
      ? [...onMatch[1].matchAll(/(\d+)\s+0\s+R/g)].map(m => m[1])
      : [];

    const visible = new Set(onRefs);

    const layers = [];

    for (const id of ocgRefs) {
      const objRegex = new RegExp(
        `${id}\\s+0\\s+obj[\\s\\S]*?<<([\\s\\S]*?)>>`,
        "m"
      );

      const objMatch = head.match(objRegex);
      if (!objMatch) continue;

      const dict = objMatch[1];
      const nameMatch = dict.match(/\/Name\s*\((.*?)\)/);

      if (!nameMatch) continue;

      layers.push({
        id,
        name: nameMatch[1],
        visible: visible.has(id),
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
    res.status(500).json({ error: e.message, stack: e.stack });
  }
}

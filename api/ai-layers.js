export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST only" });
    }

    const { fileId, accessToken } = req.body;

    if (!fileId || !accessToken) {
      return res.status(400).json({ error: "Missing fileId or accessToken" });
    }

    console.log("Downloading PDF", fileId);

    const driveUrl =
      "https://www.googleapis.com/drive/v3/files/" +
      fileId +
      "?alt=media";

    const pdfRes = await fetch(driveUrl, {
      headers: {
        Authorization: "Bearer " + accessToken,
      },
    });

    if (!pdfRes.ok) {
      return res.status(500).json({
        error: "Drive download failed",
        status: pdfRes.status,
      });
    }

    const buf = Buffer.from(await pdfRes.arrayBuffer());

    console.log("PDF bytes:", buf.length);

    return res.json({
      ok: true,
      bytes: buf.length,
      message: "PDF received. Ready to extract layers.",
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: e.message,
      stack: e.stack,
    });
  }
}

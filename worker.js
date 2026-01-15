import { PDFDocument, PDFName } from "pdf-lib";

export default {
  async fetch(request) {
    try {
      if (request.method !== "POST") {
        return new Response("POST JSON { fileId, accessToken }", { status: 405 });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("Invalid JSON body", { status: 400 });
      }

      const { fileId, accessToken } = body || {};
      if (!fileId || !accessToken) {
        return new Response("Missing fileId or accessToken", { status: 400 });
      }

      // Fetch the Illustrator AI file from Google Drive (private)
      const driveUrl =
        "https://www.googleapis.com/drive/v3/files/" +
        encodeURIComponent(fileId) +
        "?alt=media";

      const driveRes = await fetch(driveUrl, {
        headers: {
          Authorization: "Bearer " + accessToken,
        },
      });

      if (!driveRes.ok) {
        return new Response(
          "Drive fetch failed: " + (await driveRes.text()),
          { status: 502 }
        );
      }

      // IMPORTANT: pdf-lib needs a full ArrayBuffer
      const bytes = await driveRes.arrayBuffer();

      // Load PDF (AI files are PDF-based)
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });

      // Illustrator layers = PDF Optional Content Groups (OCGs)
      const ocProps = pdf.catalog.get(PDFName.of("OCProperties"));
      if (!ocProps) {
        return Response.json({ visibleLayers: [] });
      }

      const ocgs = ocProps.get(PDFName.of("OCGs"));
      const d = ocProps.get(PDFName.of("D"));

      // OFF list = hidden layers
      const off = new Set();
      if (d && d.has(PDFName.of("OFF"))) {
        for (const ref of d.get(PDFName.of("OFF"))) {
          off.add(ref.objectNumber);
        }
      }

      const visible = [];

      for (const ocg of ocgs) {
        const id = ocg.objectNumber;
        if (off.has(id)) continue;

        const name = ocg.get(PDFName.of("Name"))?.decodeText();
        if (name) visible.push(name);
      }

      return Response.json({ visibleLayers: visible });
    } catch (err) {
      return new Response("Worker error: " + (err?.stack || err), {
        status: 500,
      });
    }
  },
};

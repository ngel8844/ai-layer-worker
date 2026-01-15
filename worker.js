import { PDFDocument, PDFName } from "pdf-lib";

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response("POST { fileId, accessToken }", { status: 405 });
    }

    const { fileId, accessToken } = await request.json();
    if (!fileId || !accessToken) {
      return new Response("Missing fileId or accessToken", { status: 400 });
    }

    // Stream AI file directly from Drive
    const driveRes = await fetch(
      "https://www.googleapis.com/drive/v3/files/" +
        encodeURIComponent(fileId) +
        "?alt=media",
      {
        headers: { Authorization: "Bearer " + accessToken },
      }
    );

    if (!driveRes.ok) {
      return new Response("Drive fetch failed", { status: 502 });
    }

    const bytes = await driveRes.arrayBuffer();

    // Load PDF (Illustrator AI)
    const pdf = await PDFDocument.load(bytes);

    const ocProps = pdf.catalog.get(PDFName.of("OCProperties"));
    if (!ocProps) return Response.json({ visibleLayers: [] });

    const ocgs = ocProps.get(PDFName.of("OCGs"));
    const d = ocProps.get(PDFName.of("D"));

    const off = new Set();
    if (d?.has(PDFName.of("OFF"))) {
      for (const ref of d.get(PDFName.of("OFF"))) {
        off.add(ref.objectNumber);
      }
    }

    const visible = [];
    for (const ocg of ocgs) {
      const name = ocg.get(PDFName.of("Name"))?.decodeText();
      const id = ocg.objectNumber;
      if (!off.has(id)) visible.push(name);
    }

    return Response.json({ visibleLayers: visible });
  },
};

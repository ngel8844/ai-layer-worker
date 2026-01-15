import { PDFDocument, PDFName } from "pdf-lib";

export async function onRequestPost(context) {
  try {
    const { request } = context;
    const { fileId, accessToken } = await request.json();

    if (!fileId || !accessToken) {
      return new Response("Missing fileId or accessToken", { status: 400 });
    }

    // Stream file from Drive
    const driveRes = await fetch(
      "https://www.googleapis.com/drive/v3/files/" +
        encodeURIComponent(fileId) +
        "?alt=media",
      {
        headers: {
          Authorization: "Bearer " + accessToken,
        },
      }
    );

    if (!driveRes.ok) {
      return new Response("Drive fetch failed", { status: 502 });
    }

    // pdf-lib needs full ArrayBuffer, but Node has much higher memory
    const bytes = await driveRes.arrayBuffer();

    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });

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
      const id = ocg.objectNumber;
      if (off.has(id)) continue;

      const name = ocg.get(PDFName.of("Name"))?.decodeText();
      if (name) visible.push(name);
    }

    return Response.json({ visibleLayers: visible });
  } catch (err) {
    return new Response("Error: " + (err?.stack || err), { status: 500 });
  }
}

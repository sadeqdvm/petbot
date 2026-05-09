import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { fetchWhatsAppMediaBuffer } from "@/lib/whatsapp";

export async function GET(_request, { params }) {
  await requireSession();
  const media = await fetchWhatsAppMediaBuffer(params.mediaId);
  return new NextResponse(media.buffer, {
    headers: {
      "Content-Type": media.contentType,
      "Cache-Control": "private, max-age=300"
    }
  });
}

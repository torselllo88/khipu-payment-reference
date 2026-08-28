import { NextRequest, NextResponse } from "next/server";
import { getOrder, toPublicOrder } from "@/lib/store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) return NextResponse.json({ error: `Unknown order ${id}` }, { status: 404 });
  return NextResponse.json({ order: toPublicOrder(order) });
}

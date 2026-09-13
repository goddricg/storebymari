import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSiteId } from "@/lib/site";
import { listPurchaseOptionsByTypeId } from "@/lib/purchase-options/repository";

const querySchema = z.object({
  typeId: z.string().trim().min(1),
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  if (getSiteId() !== "main") {
    return NextResponse.json({ options: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const parsed = querySchema.safeParse({
    typeId: new URL(request.url).searchParams.get("typeId") || "",
  });
  if (!parsed.success) {
    return NextResponse.json({ message: "typeId is required" }, { status: 422 });
  }

  try {
    const options = await listPurchaseOptionsByTypeId(parsed.data.typeId);
    return NextResponse.json(
      {
        options: options.map((option) => ({
          id: option.id,
          productId: option.productId,
          productTypeId: option.productTypeId,
          name: option.name,
          quantity: option.quantity,
          price: option.price,
          priceVip: option.priceVip,
          priceWalkin: option.priceWalkin,
          displayOrder: option.displayOrder,
          availableStock: option.availableStock ?? 0,
          canBuy: option.canBuy ?? false,
        })),
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load purchase options";
    return NextResponse.json({ message }, { status: 500 });
  }
}

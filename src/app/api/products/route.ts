import { NextRequest, NextResponse } from "next/server";

import {
  fetchPublishedProducts,
  fetchPublishedProductsPaginated,
  fetchPublishedProductsPaginatedLive,
  getAllCategories,
  getAllCategoriesCached,
} from "@/lib/products/repository";
import { toPublicStorefrontProduct } from "@/lib/products/public-product";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const storefrontHeaders = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "12", 10);
  const usePagination = searchParams.get("pagination") === "true";
  const category = searchParams.get("category") || undefined;
  const search = searchParams.get("search") || undefined;
  const live = searchParams.get("live") === "1";

  if (usePagination) {
    const offset = (page - 1) * limit;
    const categoryFilter =
      category && category !== "ทั้งหมด" ? category : undefined;
    const searchFilter =
      search && search.trim().length > 0 ? search : undefined;

    const [result, categories] = await Promise.all([
      live
        ? fetchPublishedProductsPaginatedLive(limit, offset, categoryFilter, searchFilter)
        : fetchPublishedProductsPaginated(limit, offset, categoryFilter, searchFilter),
      live ? getAllCategories(false) : getAllCategoriesCached(false),
    ]);

    return NextResponse.json(
      {
        products: result.products.map(toPublicStorefrontProduct),
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit),
        categories: categories.map((c) => ({
          category: c.category,
          imageUrl: c.imageUrl,
          count: c.count,
        })),
      },
      { headers: storefrontHeaders }
    );
  }

  // Fallback to fetch all published products (for backward compatibility)
  const products = await fetchPublishedProducts();
  return NextResponse.json(
    { products: products.map(toPublicStorefrontProduct) },
    { headers: storefrontHeaders }
  );
}


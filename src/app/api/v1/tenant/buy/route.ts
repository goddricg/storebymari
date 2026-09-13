import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth/api-key";
import pool from "@/lib/mysql";
import { randomUUID } from "crypto";
import { findProductByTypeId, updateProduct } from "@/lib/products/repository";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
  };
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await validateApiKey();
    if (!tenant) {
      return NextResponse.json(
        { success: false, message: "Unauthorized: Invalid or missing API Key" },
        { status: 401, headers: corsHeaders() }
      );
    }
    if (tenant.is_site_suspended) {
      return NextResponse.json(
        { success: false, message: "Site is suspended" },
        { status: 403, headers: corsHeaders() }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.productId) {
      return NextResponse.json(
        { success: false, message: "Missing productId" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const quantity = parseInt(body.quantity || "1", 10);
    if (isNaN(quantity) || quantity <= 0 || quantity > 100) {
      return NextResponse.json(
        { success: false, message: "Invalid quantity (must be 1-100)" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const product = await findProductByTypeId(body.productId);
    if (!product) {
      return NextResponse.json(
        { success: false, message: "Product not found" },
        { status: 404, headers: corsHeaders() }
      );
    }

    const costPrice = Number(product.costPrice || 0);
    if (costPrice <= 0) {
      return NextResponse.json(
        { success: false, message: "Product does not have a valid cost_price" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const totalCost = costPrice * quantity;

    // Check Tenant Balance
    const [userRows] = await pool.query(
      "SELECT id, points FROM users WHERE id = ? LIMIT 1",
      [tenant.user_id]
    );
    const users = userRows as any[];
    if (users.length === 0) {
      return NextResponse.json(
        { success: false, message: "Tenant user not found" },
        { status: 404, headers: corsHeaders() }
      );
    }

    const tenantUserId = users[0].id;
    const currentBalance = parseFloat(users[0].points || 0);

    if (currentBalance < totalCost) {
      return NextResponse.json(
        { success: false, message: "Insufficient balance" },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Check Stock and extract accounts
    const accountsExtracted = [];
    let finalTextdb = "";

    const hasAccountData = product.accountData && Array.isArray(product.accountData) && product.accountData.length > 0;
    const hasAccountEmailPassword = product.accountEmail || product.accountPassword;

    if (hasAccountData && product.accountData) {
      if (product.accountData.length < quantity) {
        return NextResponse.json(
          { success: false, message: `Insufficient stock (Requested ${quantity}, Available ${product.accountData.length})` },
          { status: 400, headers: corsHeaders() }
        );
      }
      
      const accountDataToUse = [...product.accountData];
      for (let i = 0; i < quantity; i++) {
        const usedAccount = accountDataToUse[i] as { email?: string; password?: string; details?: string };
        const details = usedAccount.details || 
          (usedAccount.email || usedAccount.password 
            ? `${usedAccount.email ? `Email: ${usedAccount.email}` : ''}\n${usedAccount.password ? `Pass: ${usedAccount.password}` : ''}`.trim()
            : "");
        accountsExtracted.push(details);
      }

      finalTextdb = accountsExtracted.join("\n\n---\n\n");
      const remainingAccounts = accountDataToUse.slice(quantity);
      
      await updateProduct(
        product.typeId,
        {
          accountData: remainingAccounts.map(acc => ({
            email: acc.email,
            password: acc.password,
            details: acc.details || "",
          })),
        },
        true // This handles stock subtraction internally if we pass the full account list
      );

    } else if (hasAccountEmailPassword) {
      if (product.stock == null || product.stock < quantity) {
        return NextResponse.json(
          { success: false, message: `Insufficient stock (Requested ${quantity}, Available ${product.stock || 0})` },
          { status: 400, headers: corsHeaders() }
        );
      }

      const accountDetails = [
        product.accountEmail ? `Email: ${product.accountEmail}` : '',
        product.accountPassword ? `Pass: ${product.accountPassword}` : '',
        product.details || ''
      ].filter(Boolean).join('\n');

      for (let i = 0; i < quantity; i++) {
        accountsExtracted.push(accountDetails);
      }
      finalTextdb = accountsExtracted.join("\n\n---\n\n");

      await updateProduct(
        product.typeId,
        {
          stock: Math.max(0, product.stock - quantity),
        },
        true
      );
    } else {
      return NextResponse.json(
        { success: false, message: "Product has no local account data. External providers are not supported via this endpoint yet." },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Deduct Balance
    const remainingBalance = currentBalance - totalCost;
    await pool.execute(
      "UPDATE users SET points = ? WHERE id = ?",
      [remainingBalance, tenantUserId]
    );

    // Record Transaction
    await pool.execute(
      `INSERT INTO transactions (id, user_id, type, amount, status, details, site_id, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        tenantUserId,
        'order', // Or whatever type represents a tenant wholesale purchase
        totalCost,
        'success',
        `Tenant wholesale purchase for ${quantity}x ${product.name} (Cost: ${totalCost} ฿)`,
        tenant.site_name || 'main',
        new Date(),
        new Date(),
      ]
    );

    return NextResponse.json({
      success: true,
      order: {
        productId: product.typeId,
        textdb: finalTextdb,
        costPrice: costPrice
      },
      remainingBalance
    }, { headers: corsHeaders() });

  } catch (error) {
    console.error("Tenant Buy API error:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}

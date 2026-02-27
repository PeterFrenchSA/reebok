import { AssetStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";

const documentUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => value.startsWith("/") || /^https?:\/\//.test(value), "Document URL must be absolute or root-relative.");

const createAssetSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(160),
  category: z.string().min(2).max(120),
  serialNumber: z.string().max(120).optional(),
  location: z.string().max(160).optional(),
  status: z.nativeEnum(AssetStatus).default(AssetStatus.ACTIVE),
  purchaseDate: z.coerce.date().optional(),
  warrantyExpiry: z.coerce.date().optional(),
  warrantyFileUrl: documentUrlSchema.optional(),
  notes: z.string().max(2000).optional()
});

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "maintenance:view")) {
    return NextResponse.json({ error: "Asset view permission required" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status") as AssetStatus | null;

  const assets = await prisma.asset.findMany({
    where: {
      status: status && Object.values(AssetStatus).includes(status) ? status : undefined
    },
    include: {
      maintenanceTasks: {
        orderBy: { createdAt: "desc" },
        take: 5
      }
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 500
  });

  return NextResponse.json({ assets });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "assets:edit")) {
    return NextResponse.json({ error: "Asset edit permission required" }, { status: 403 });
  }

  const payload = await req.json();
  const parsed = createAssetSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const asset = await prisma.asset.create({
    data: {
      name: parsed.data.name,
      category: parsed.data.category,
      serialNumber: parsed.data.serialNumber,
      location: parsed.data.location,
      status: parsed.data.status,
      purchaseDate: parsed.data.purchaseDate,
      warrantyExpiry: parsed.data.warrantyExpiry,
      warrantyFileUrl: parsed.data.warrantyFileUrl,
      notes: parsed.data.notes
    }
  });

  return NextResponse.json({ asset }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !hasPermission(user.role, "assets:edit")) {
    return NextResponse.json({ error: "Asset edit permission required" }, { status: 403 });
  }

  const payload = await req.json();
  const parsed = createAssetSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!parsed.data.id) {
    return NextResponse.json({ error: "Asset id is required." }, { status: 400 });
  }

  const asset = await prisma.asset.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      category: parsed.data.category,
      serialNumber: parsed.data.serialNumber,
      location: parsed.data.location,
      status: parsed.data.status,
      purchaseDate: parsed.data.purchaseDate,
      warrantyExpiry: parsed.data.warrantyExpiry,
      warrantyFileUrl: parsed.data.warrantyFileUrl,
      notes: parsed.data.notes
    }
  });

  return NextResponse.json({ asset });
}

import type { UserRole } from "@prisma/client";

export type AppPermission =
  | "booking:create:external"
  | "booking:create:family"
  | "booking:approve"
  | "booking:manage"
  | "finance:view"
  | "finance:edit"
  | "finance:import-export"
  | "maintenance:view"
  | "maintenance:edit"
  | "assets:edit"
  | "feedback:public"
  | "feedback:internal";

const permissionMap: Record<UserRole, Set<AppPermission>> = {
  SUPER_ADMIN: new Set<AppPermission>([
    "booking:create:external",
    "booking:create:family",
    "booking:approve",
    "booking:manage",
    "finance:view",
    "finance:edit",
    "finance:import-export",
    "maintenance:view",
    "maintenance:edit",
    "assets:edit",
    "feedback:public",
    "feedback:internal"
  ]),
  SHAREHOLDER: new Set<AppPermission>([
    "booking:create:external",
    "booking:create:family",
    "booking:approve",
    "booking:manage",
    "finance:view",
    "finance:edit",
    "finance:import-export",
    "maintenance:view",
    "maintenance:edit",
    "assets:edit",
    "feedback:public",
    "feedback:internal"
  ]),
  FAMILY_MEMBER: new Set<AppPermission>(["booking:create:family", "feedback:public"]),
  GUEST: new Set<AppPermission>(["booking:create:external", "feedback:public"])
};

export function hasPermission(role: UserRole, permission: AppPermission): boolean {
  return permissionMap[role].has(permission);
}

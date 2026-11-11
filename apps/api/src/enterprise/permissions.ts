import type { User } from "../store.js";
export const permissions = [
  "tasks.assign",
  "users.view",
  "users.create",
  "users.edit",
  "users.deactivate",
  "teams.manage",
  "clients.view.all",
  "clients.view.assigned",
  "clients.allocate",
  "bot.extract.execute",
  "bot.upload.execute",
  "bot.delete.request",
  "bot.delete.execute",
  "approvals.review",
  "approvals.approve",
  "reports.view.self",
  "reports.view.team",
  "reports.view.all",
  "settings.manage",
  "audit.view",
] as const;
export type Permission = (typeof permissions)[number];
export const roles = [
  "super_admin",
  "admin",
  "manager",
  "executive",
  "intern",
] as const;
export type Role = (typeof roles)[number];
const employee: Permission[] = [
  "clients.view.assigned",
  "bot.extract.execute",
  "bot.upload.execute",
  "bot.delete.request",
  "reports.view.self",
];
export const grants: Record<Role, Permission[]> = {
  super_admin: [...permissions],
  admin: [...permissions],
  manager: [
    "tasks.assign",
    ...employee,
    "users.view",
    "approvals.review",
    "approvals.approve",
    "reports.view.team",
    "bot.delete.execute",
  ],
  executive: employee,
  intern: ["clients.view.assigned", "bot.extract.execute", "reports.view.self"],
};
export function effectivePermissions(user: User): Permission[] {
  if(user.accountKind==='client')return [];
  return [
    ...new Set([
      ...(user.rolePermissions??grants[user.role ?? "executive"] ?? []),
      ...(user.permissions ?? []),
    ]),
  ] as Permission[];
}
export const can = (user: User, permission: Permission) =>
  user.active !== false && effectivePermissions(user).includes(permission);
export function requirePermission(user: User, permission: Permission) {
  if (!can(user, permission))
    throw Object.assign(
      new Error("You do not have permission for this action."),
      { status: 403 },
    );
}
export const publicUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role ?? "executive",
  accountKind: u.accountKind ?? "staff",
  emailVerified: u.emailVerified === true,
  active: u.active !== false,
  permissions: effectivePermissions(u),
  teamId: u.teamId ?? "",
  department: u.department ?? "",
  reportingManagerId: u.reportingManagerId ?? "",
  username: u.username ?? "",
  mobile: u.mobile ?? "",
  designation: u.designation ?? "",
});

import { Router } from "express";
import { z } from "zod";
import type { User } from "../store.js";
import { EnterpriseService, failure } from "./service.js";
import { can, requirePermission, publicUser } from "./permissions.js";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Enter a valid date",
  );
const fields = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4000).default(""),
  dueDate: date.nullable().default(null),
  priority: z.enum(["normal", "high", "urgent"]).default("normal"),
});
export class TaskService {
  constructor(public service: EnterpriseService) {}
  async assignees(actor: User) {
    requirePermission(actor, "tasks.assign");
    const scope = await this.service.teamScope(actor);
    return (await this.service.store.allUsers()).filter(
      (u) =>
        u.active !== false &&
        u.accountKind !== "client" &&
        u.id !== actor.id &&
        (can(actor, "clients.view.all") || scope.has(u.id)),
    );
  }
  async list(actor: User) {
    const scope = can(actor, "tasks.assign")
      ? await this.service.teamScope(actor)
      : new Set<string>();
    return (await this.service.repo.list("worktasks")).filter(
      (t) =>
        !t.archived &&
        (t.kind === "TODO"
          ? t.assigneeId === actor.id
          : t.assigneeId === actor.id ||
            (can(actor, "tasks.assign") &&
              (can(actor, "clients.view.all") ||
                scope.has(String(t.assigneeId))))),
    );
  }
  async create(actor: User, raw: unknown) {
    const input = fields
      .extend({
        kind: z.enum(["ASSIGNED", "TODO"]),
        assigneeId: z.string().optional(),
      })
      .parse(raw);
    const assigneeId = input.kind === "TODO" ? actor.id : input.assigneeId;
    if (input.kind === "ASSIGNED") {
      if (!(await this.assignees(actor)).some((u) => u.id === assigneeId))
        failure("Select an active employee in your reporting team.", 403);
      if (!input.dueDate) failure("Assigned tasks require a deadline.", 400);
    }
    const task = await this.service.repo.create("worktasks", {
      ...input,
      assigneeId,
      createdBy: actor.id,
      status: "NOT_STARTED",
      archived: false,
      completedAt: null,
    });
    await this.service.audit(actor, "task.created", task.id, {
      kind: task.kind,
      assigneeId,
    });
    if (input.kind === "ASSIGNED")
      await this.service.notify(
        String(assigneeId),
        actor,
        `Task assigned: ${input.title}`,
        "/tasks",
        "task.assigned",
      );
    return task;
  }
  async update(actor: User, id: string, raw: unknown) {
    const input = z
      .object({
        title: fields.shape.title.optional(),
        description: z.string().trim().max(4000).optional(),
        dueDate: date.nullable().optional(),
        priority: z.enum(["normal", "high", "urgent"]).optional(),
        version: z.number().int().nonnegative(),
        status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).optional(),
        archived: z.boolean().optional(),
      })
      .strict()
      .parse(raw);
    const task = (await this.list(actor)).find((t) => t.id === id);
    if (!task) failure("Task not found.", 404);
    const editing =
      task.kind === "TODO" ||
      (can(actor, "tasks.assign") && task.createdBy === actor.id) ||
      can(actor, "clients.view.all");
    if (
      !editing &&
      Object.keys(input).some((k) => !["version", "status"].includes(k))
    )
      failure("Only the assigning manager may change task details.", 403);
    if (!editing && task.assigneeId !== actor.id)
      failure("Only the assignee may update this task.", 403);
    if (task.kind === "ASSIGNED" && input.dueDate === null)
      failure("A deadline is required.", 400);
    const { version, ...patch } = input;
    const result = await this.service.repo.update("worktasks", id, version, {
      ...patch,
      ...(input.status
        ? {
            completedAt:
              input.status === "COMPLETED" ? new Date().toISOString() : null,
          }
        : {}),
    });
    await this.service.audit(actor, "task.updated", id, {
      status: result.status,
      archived: result.archived,
    });
    return result;
  }
}
export function tasksRouter(service: EnterpriseService) {
  const router = Router(),
    tasks = new TaskService(service);
  router.get("/", async (_req, res) => {
    const user = res.locals.user as User;
    res.json({
      tasks: await tasks.list(user),
      assignees: can(user, "tasks.assign")
        ? (await tasks.assignees(user)).map(publicUser)
        : [],
    });
  });
  router.post("/", async (req, res) =>
    res
      .status(201)
      .json({ task: await tasks.create(res.locals.user, req.body) }),
  );
  router.patch("/:id", async (req, res) =>
    res.json({
      task: await tasks.update(
        res.locals.user,
        String(req.params.id),
        req.body,
      ),
    }),
  );
  return router;
}

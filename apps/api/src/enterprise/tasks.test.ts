import { beforeEach, describe, it, expect } from "vitest";
import { Store, type User } from "../store.js";
import { Repository } from "./repository.js";
import { EnterpriseService } from "./service.js";
import { TaskService } from "./tasks.js";
describe("manager assignments and personal to-dos", () => {
  let store: Store,
    tasks: TaskService,
    manager: User,
    employee: User,
    other: User,
    admin: User;
  beforeEach(async () => {
    store = new Store(true);
    tasks = new TaskService(new EnterpriseService(new Repository(true), store));
    admin = await store.createUser({
      name: "Admin",
      email: "admin@tasks.test",
      passwordHash: "x",
      role: "admin",
      active: true,
    });
    manager = await store.createUser({
      name: "Manager",
      email: "manager@tasks.test",
      passwordHash: "x",
      role: "manager",
      active: true,
    });
    employee = await store.createUser({
      name: "Employee",
      email: "employee@tasks.test",
      passwordHash: "x",
      role: "executive",
      active: true,
      reportingManagerId: manager.id,
    });
    other = await store.createUser({
      name: "Other",
      email: "other@tasks.test",
      passwordHash: "x",
      role: "executive",
      active: true,
    });
  });
  const input = {
    title: "Review client extraction",
    description: "Check the downloaded workbook",
    dueDate: "2026-12-10",
    priority: "high",
    kind: "ASSIGNED",
  };
  it("validates manager scope, active assignees and required deadlines", async () => {
    await expect(
      tasks.create(employee, { ...input, assigneeId: other.id }),
    ).rejects.toThrow("permission");
    await expect(
      tasks.create(manager, { ...input, assigneeId: other.id }),
    ).rejects.toThrow("reporting team");
    await expect(
      tasks.create(manager, {
        ...input,
        assigneeId: employee.id,
        dueDate: null,
      }),
    ).rejects.toThrow("deadline");
    await expect(
      tasks.create(manager, {
        ...input,
        assigneeId: employee.id,
        dueDate: "2026-02-30",
      }),
    ).rejects.toThrow();
    await store.updateUser(employee.id, { active: false });
    await expect(
      tasks.create(manager, { ...input, assigneeId: employee.id }),
    ).rejects.toThrow("active employee");
  });
  it("assigns real tasks, scopes employees and restricts their edits to status", async () => {
    const task = await tasks.create(manager, {
      ...input,
      assigneeId: employee.id,
    });
    expect(await tasks.list(employee)).toHaveLength(1);
    expect(await tasks.list(other)).toHaveLength(0);
    await expect(
      tasks.update(employee, task.id, {
        version: task.version,
        title: "Changed",
      }),
    ).rejects.toThrow("assigning manager");
    const done = await tasks.update(employee, task.id, {
      version: task.version,
      status: "COMPLETED",
    });
    expect(done.completedAt).toBeTruthy();
    expect(done.description).toBe(input.description);
    expect(done.priority).toBe("high");
    expect(done.dueDate).toBe(input.dueDate);
    await expect(
      tasks.update(employee, task.id, {
        version: task.version,
        status: "IN_PROGRESS",
      }),
    ).rejects.toThrow();
    const reopened = await tasks.update(employee, task.id, {
      version: done.version,
      status: "IN_PROGRESS",
    });
    expect(reopened.completedAt).toBeNull();
  });
  it("keeps personal to-dos private even from managers/admins and supports editing and archive", async () => {
    const todo = await tasks.create(employee, {
      kind: "TODO",
      title: "My follow up",
      description: "Private note",
      priority: "normal",
    });
    expect(todo.assigneeId).toBe(employee.id);
    expect(await tasks.list(manager)).toHaveLength(0);
    expect(await tasks.list(admin)).toHaveLength(0);
    await expect(
      tasks.update(admin, todo.id, { version: 0, title: "Read private note" }),
    ).rejects.toThrow("not found");
    const edited = await tasks.update(employee, todo.id, {
      version: 0,
      title: "Updated note",
      dueDate: "2026-12-12",
    });
    await tasks.update(employee, todo.id, {
      version: edited.version,
      archived: true,
    });
    expect(await tasks.list(employee)).toHaveLength(0);
  });
});

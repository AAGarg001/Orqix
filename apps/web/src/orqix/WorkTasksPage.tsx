import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  CheckCheck,
  Clock3,
  ClipboardList,
  ListTodo,
  Pencil,
  Archive,
} from "lucide-react";
import { toast } from "sonner";
import { api, post } from "../api";
import {
  Button,
  ConfirmationDialog,
  DataTable,
  PageHeader,
  StatusBadge,
  ErrorAlert,
} from "./ui";
import type { Doc, User } from "./types";

export function WorkTasksPage({ user }: { user: User }) {
  const cache = useQueryClient(),
    canAssign = user.permissions.includes("tasks.assign");
  const q = useQuery({
    queryKey: ["/platform/tasks"],
    queryFn: () => api<{ tasks: Doc[]; assignees: User[] }>("/platform/tasks"),
    refetchInterval: 15000,
  });
  const [tab, setTab] = useState<"ASSIGNED" | "TODO">("ASSIGNED"),
    [filter, setFilter] = useState("OPEN"),
    [dialog, setDialog] = useState<"ASSIGNED" | "TODO" | null>(null),
    [editing, setEditing] = useState<Doc | null>(null),
    [archive, setArchive] = useState<Doc | null>(null);
  const save = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      editing
        ? api(`/platform/tasks/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify({ ...input, version: editing.version }),
          })
        : post("/platform/tasks", input),
    onSuccess: () => {
      toast.success(editing ? "Task updated" : "Task created");
      setDialog(null);
      setEditing(null);
      void cache.invalidateQueries({ queryKey: ["/platform/tasks"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({
      task,
      patch,
    }: {
      task: Doc;
      patch: Record<string, unknown>;
    }) =>
      api(`/platform/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...patch, version: task.version }),
      }),
    onSuccess: () => {
      setArchive(null);
      void cache.invalidateQueries({ queryKey: ["/platform/tasks"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const tasks = (q.data?.tasks ?? []).filter((t) => t.kind === tab),
    today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const rows = tasks.filter((t) =>
    filter === "ALL" || filter === "OVERDUE"
      ? filter === "ALL" ||
        (t.dueDate && t.dueDate < today && t.status !== "COMPLETED")
      : filter === "OPEN"
        ? t.status !== "COMPLETED"
        : t.status === filter,
  );
  function open(kind: "ASSIGNED" | "TODO", task: Doc | null = null) {
    setEditing(task);
    setDialog(kind);
    save.reset();
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const input: Record<string, unknown> = {
      title: data.title,
      description: data.description,
      dueDate: data.dueDate || null,
      priority: data.priority,
    };
    if (!editing) {
      input.kind = dialog;
      if (dialog === "ASSIGNED") input.assigneeId = data.assigneeId;
    }
    save.mutate(input);
  }
  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle="Manager-assigned work and your private personal to-do list."
        actions={
          <div className="oq-actions">
            {canAssign ? (
              <Button onClick={() => open("ASSIGNED")}>
                <Plus size={16} />
                Assign Task
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => open("TODO")}>
              <ListTodo size={16} />
              Create To-do
            </Button>
          </div>
        }
      />
      <div className="oq-task-tabs" role="group" aria-label="Task lists">
        <Button
          variant={tab === "ASSIGNED" ? "primary" : "secondary"}
          aria-pressed={tab === "ASSIGNED"}
          onClick={() => setTab("ASSIGNED")}
        >
          <ClipboardList size={16} />
          Assigned Tasks
        </Button>
        <Button
          variant={tab === "TODO" ? "primary" : "secondary"}
          aria-pressed={tab === "TODO"}
          onClick={() => setTab("TODO")}
        >
          <ListTodo size={16} />
          My To-do
        </Button>
      </div>
      <div className="oq-task-metrics">
        {[
          {
            name: "Open",
            n: tasks.filter((t) => t.status !== "COMPLETED").length,
            Icon: ClipboardList,
          },
          {
            name: "Completed",
            n: tasks.filter((t) => t.status === "COMPLETED").length,
            Icon: CheckCheck,
          },
          {
            name: "Overdue",
            n: tasks.filter(
              (t) => t.dueDate && t.dueDate < today && t.status !== "COMPLETED",
            ).length,
            Icon: Clock3,
          },
        ].map(({ name, n, Icon }) => (
          <section className="oq-card" key={name}>
            <Icon size={22} />
            <div>
              <span>{name}</span>
              <strong>{n}</strong>
            </div>
          </section>
        ))}
      </div>
      <section className="oq-card">
        <div className="oq-card-heading">
          <h2>
            {tab === "TODO"
              ? "My private to-do list"
              : canAssign
                ? "Team assignments"
                : "Assigned to me"}
          </h2>
          <label>
            Filter
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="OPEN">Open tasks</option>
              <option value="ALL">All tasks</option>
              <option value="NOT_STARTED">Not started</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="OVERDUE">Overdue</option>
            </select>
          </label>
        </div>
        {tab === "TODO" ? (
          <p>
            Visible only to you. Add a deadline, set priority, track progress
            and reopen completed items.
          </p>
        ) : null}
        <DataTable
          rows={rows}
          loading={q.isPending}
          error={q.error}
          columns={[
            {
              key: "title",
              label: "Task",
              render: (t) => (
                <div className="oq-task-title">
                  <strong>{t.title}</strong>
                  <p>{t.description || "No description"}</p>
                </div>
              ),
            },
            ...(tab === "ASSIGNED"
              ? [
                  {
                    key: "assigneeId",
                    label: "Assigned to",
                    render: (t: Doc) =>
                      t.assigneeId === user.id
                        ? "Me"
                        : (q.data?.assignees.find((u) => u.id === t.assigneeId)
                            ?.name ?? "Team member"),
                  },
                ]
              : []),
            {
              key: "dueDate",
              label: "Deadline",
              render: (t) => (
                <span
                  className={
                    t.dueDate && t.dueDate < today && t.status !== "COMPLETED"
                      ? "oq-field-error"
                      : ""
                  }
                >
                  {t.dueDate
                    ? new Date(`${t.dueDate}T12:00:00`).toLocaleDateString(
                        "en-IN",
                      )
                    : "No deadline"}
                </span>
              ),
            },
            {
              key: "priority",
              label: "Priority",
              render: (t) => <StatusBadge value={t.priority} />,
            },
            {
              key: "status",
              label: "Status",
              render: (t) => (
                <select
                  aria-label={`Status for ${t.title}`}
                  value={t.status}
                  disabled={update.isPending}
                  onChange={(e) =>
                    update.mutate({
                      task: t,
                      patch: { status: e.target.value },
                    })
                  }
                >
                  <option value="NOT_STARTED">Not started</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              ),
            },
            {
              key: "actions",
              label: "Actions",
              render: (t) =>
                tab === "TODO" ||
                t.createdBy === user.id ||
                user.permissions.includes("clients.view.all") ? (
                  <div className="oq-actions">
                    <Button
                      variant="ghost"
                      onClick={() => open(tab, t)}
                      aria-label={`Edit ${t.title}`}
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setArchive(t)}
                      aria-label={`Archive ${t.title}`}
                    >
                      <Archive size={16} />
                    </Button>
                  </div>
                ) : (
                  <span>Assigned by your manager</span>
                ),
            },
          ]}
        />
      </section>
      <ConfirmationDialog
        open={!!dialog}
        onClose={() => {
          setDialog(null);
          setEditing(null);
        }}
        title={
          editing
            ? "Edit task"
            : dialog === "TODO"
              ? "Create personal to-do"
              : "Assign task"
        }
        description={
          dialog === "TODO"
            ? "Your personal to-do is private."
            : "Assign work with a clear deadline to an authorized team member."
        }
      >
        <form onSubmit={submit} key={editing?.id ?? dialog}>
          <label>
            Title
            <input
              name="title"
              required
              minLength={2}
              maxLength={160}
              defaultValue={editing?.title ?? ""}
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              rows={4}
              maxLength={4000}
              defaultValue={editing?.description ?? ""}
            />
          </label>
          {dialog === "ASSIGNED" && !editing ? (
            <label>
              Assign to
              <select
                aria-label="Assign to"
                name="assigneeId"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Select employee
                </option>
                {q.data?.assignees.map((u) => (
                  <option value={u.id} key={u.id}>
                    {u.name} · {u.email}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="oq-form-grid">
            <label>
              Deadline
              <input
                name="dueDate"
                type="date"
                required={dialog === "ASSIGNED"}
                defaultValue={editing?.dueDate ?? ""}
              />
            </label>
            <label>
              Priority
              <select
                name="priority"
                defaultValue={editing?.priority ?? "normal"}
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
          </div>
          <ErrorAlert error={save.error} />
          <div className="oq-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : dialog === "TODO"
                    ? "Create To-do"
                    : "Assign Task"}
            </Button>
          </div>
        </form>
      </ConfirmationDialog>
      <ConfirmationDialog
        open={!!archive}
        onClose={() => setArchive(null)}
        title="Archive task"
        description="Remove this task from active lists? Its history will be retained."
      >
        <Button
          variant="danger"
          disabled={update.isPending}
          onClick={() =>
            archive &&
            update.mutate({ task: archive, patch: { archived: true } })
          }
        >
          Archive task
        </Button>
      </ConfirmationDialog>
    </>
  );
}

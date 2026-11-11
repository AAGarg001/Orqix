# Client progress, tasks and personal to-dos

The internal dashboard uses four milestones: Client Assigned, Data Extraction, Upload, Completed. Select a client name, CPCB ID or the workflow selector to inspect that exact assignment and financial year. The selected row is refreshed from backend data. Client lists link to `/dashboard?assignment=<assignmentId>`; the old View/approval modal is removed.

Data Extraction completes only when the combined extraction artifact is ready and the job is successful. A partial extraction remains actionable. Upload can start after successful extraction. Final completion requires confirmed submission followed by independently authorized portal verification, with no blocking errors. Selecting a client or changing a task status never completes its compliance workflow. Upload verification remains available inline for an authorized manager when the selected assignment awaits verification. Deletion approvals remain enforced.

Existing historical approval records and stored legacy stages are preserved. The dashboard maps legacy Validation to Data Extraction and legacy Reconciliation to Upload for display. A proposed broad production migration was rejected by automatic approval review; no such migration ran. New transitions use the four-stage flow. Legacy approval review APIs remain for historical records, but the removed workflow modal is no longer shown.

## Tasks

`/tasks` has Assigned Tasks and My To-do lists. Task data is separate from extraction output retention. Task status does not alter CPCB records or client compliance stages.

- Assign Task is controlled by `tasks.assign`, granted to Manager, Admin and Super Admin by default. Managers can select active staff in their reporting hierarchy; Admin/Super Admin can select active staff organization-wide. Explicit custom role policies still apply.
- Assigned tasks require title, description field, assignee and a valid deadline date; description can be left blank. Priority is Normal, High or Urgent. An employee can update their assigned task status, but cannot change the manager's title/deadline/details. The creator or authorized administrator can edit/archive it.
- Personal to-dos belong to the authenticated user and are private even from managers/admins. They support title, notes, optional deadline, priority, edit, complete, reopen and archive.
- Operational states are Not started, In progress and Completed. Completion timestamps are cleared on reopening. Archived items disappear from active lists; audit records remain.
- Filters include open/all/not started/in progress/completed/overdue; tables support search and pagination. Overdue uses the India calendar date. Version checks prevent stale updates overwriting newer work.
- Dashboard task metrics, task distribution and upcoming deadlines use these real task records. Client workflow metrics remain separate.

Mongo collection: `worktasks`, indexed by assignee/archive/deadline and creator/kind. Creates and updates generate audit entries; assignment sends an in-app notification.

API:

- `GET /api/platform/tasks` returns only authorized tasks and permitted assignment choices.
- `POST /api/platform/tasks` accepts `kind` (`ASSIGNED`/`TODO`), title, description, dueDate, priority and assigneeId for manager assignments.
- `PATCH /api/platform/tasks/:id` requires `version`, with authorized detail/status/archive changes. TODO ownership always comes from the authenticated session.

The profile card shows account name, email, role and department with the existing secure Change Password flow. The duplicate navbar logout icon is removed; Profile menu → Sign out remains available.

Validation: 42 API/unit tests, including task privacy, manager scope, inactive/unknown assignees, deadline validation, stale writes, status updates/reopening and archive. Five browser tests include the manager-to-employee task flow, personal to-do completion, selected-client progress, profile/sign-out and responsive route checks. All automated portal interactions use test adapters.

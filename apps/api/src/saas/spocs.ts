import type { ClientService, Context } from "./service.js";
export async function clientSpocs(service: ClientService, c: Context) {
  const manual = (
    await service.repo.list("spocassignments", { tenantId: c.tenant.id })
  ).filter((s) => s.active !== false);
  const contacts: Array<{
    id: string;
    name: string;
    designation: string;
    email: string;
    businessContact: string;
    availability: string;
    contactRole: string;
    source: string;
  }> = [];
  const names = new Set<string>();
  const add = (contact: (typeof contacts)[number]) => {
    const key = contact.name.trim().toLowerCase();
    if (!key || names.has(key)) return;
    names.add(key);
    contacts.push(contact);
  };
  for (const s of manual) {
    add({
      id: s.id,
      name: String(s.name),
      designation: String(s.designation ?? "Client SPOC"),
      email: s.contactDisclosureApproved === true ? String(s.email ?? "") : "",
      businessContact:
        s.contactDisclosureApproved === true
          ? String(s.businessContact ?? "")
          : "",
      availability: String(s.availability ?? "NOT_PROVIDED"),
      contactRole: contacts.length ? "assigned" : "primary",
      source: "MANUAL_ASSIGNMENT",
    });
    if (s.managerName)
      add({
        id: `manager:${s.id}`,
        name: String(s.managerName),
        designation: "Reporting Manager",
        email: "",
        businessContact: "",
        availability: "NOT_PROVIDED",
        contactRole: "manager",
        source: "MANUAL_ASSIGNMENT",
      });
    if (s.backupName)
      add({
        id: `backup:${s.id}`,
        name: String(s.backupName),
        designation: "Backup SPOC",
        email: "",
        businessContact: "",
        availability: "NOT_PROVIDED",
        contactRole: "backup",
        source: "MANUAL_ASSIGNMENT",
      });
  }
  const assignments = await service.internalAssignments(c);
  for (const userId of new Set(assignments.map((a) => String(a.userId)))) {
    const u = await service.store.user(userId);
    if (!u || u.active === false || u.accountKind === "client") continue;
    if (!manual.length)
      add({
        id: `employee:${u.id}`,
        name: u.name,
        designation: String(u.designation ?? u.role ?? "Assigned executive"),
        email: u.email,
        businessContact: "",
        availability: "NOT_PROVIDED",
        contactRole: contacts.some((s) => s.contactRole === "primary")
          ? "assigned"
          : "primary",
        source: "CLIENT_ASSIGNMENT",
      });
    if (u.reportingManagerId) {
      const m = await service.store.user(u.reportingManagerId);
      if (m && m.active !== false && m.accountKind !== "client")
        add({
          id: `manager:${m.id}`,
          name: m.name,
          designation: "Reporting Manager",
          email: m.email,
          businessContact: "",
          availability: "NOT_PROVIDED",
          contactRole: "manager",
          source: "REPORTING_RELATIONSHIP",
        });
    }
  }
  return {
    spocs: contacts,
    source: manual.length
      ? "Explicit contacts and reporting relationships"
      : "Authorized client assignments and reporting relationships",
  };
}

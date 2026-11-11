import { describe, it, expect } from "vitest";
import { Store } from "../store.js";
import { Repository } from "../enterprise/repository.js";
import { EnterpriseService } from "../enterprise/service.js";
import { ClientService, type Context } from "./service.js";
import { clientSpocs } from "./spocs.js";
describe("client SPOC relationships", () => {
  it("shows only active assigned staff and their real manager, without private user fields", async () => {
    const store = new Store(true),
      repo = new Repository(true),
      service = new ClientService(new EnterpriseService(repo, store));
    const tenant = await repo.create("organizations", {
        name: "Scoped Company",
      }),
      other = await repo.create("organizations", { name: "Other" }),
      client = await repo.create("clients", { name: "Client" });
    const manager = await store.createUser({
        name: "Actual Manager",
        email: "manager@work.test",
        role: "manager",
        active: true,
        passwordHash: "PRIVATE-HASH",
        mobile: "PRIVATE-MOBILE",
      }),
      employee = await store.createUser({
        name: "Assigned Executive",
        email: "executive@work.test",
        role: "executive",
        active: true,
        passwordHash: "PRIVATE-HASH",
        reportingManagerId: manager.id,
      });
    await repo.create("tenantclients", {
      tenantId: tenant.id,
      clientId: client.id,
    });
    for (let i = 0; i < 2; i++)
      await repo.create("clientassignments", {
        clientId: client.id,
        userId: employee.id,
      });
    const data = await clientSpocs(service, { tenant } as Context);
    expect(data.spocs.map((s) => s.name)).toEqual([
      "Assigned Executive",
      "Actual Manager",
    ]);
    expect(data.spocs[1].contactRole).toBe("manager");
    expect(JSON.stringify(data)).not.toContain("PRIVATE");
    expect(
      (await clientSpocs(service, { tenant: other } as Context)).spocs,
    ).toHaveLength(0);
    await store.updateUser(employee.id, { active: false });
    expect(
      (await clientSpocs(service, { tenant } as Context)).spocs,
    ).toHaveLength(0);
  });
  it("honors explicit SPOC and manager names without disclosing unapproved contacts", async () => {
    const store = new Store(true),
      repo = new Repository(true),
      service = new ClientService(new EnterpriseService(repo, store)),
      tenant = await repo.create("organizations", { name: "Scoped" });
    await repo.create("spocassignments", {
      tenantId: tenant.id,
      name: "Named SPOC",
      managerName: "Named Manager",
      backupName: "Backup",
      email: "private@example.test",
      businessContact: "PRIVATE-PHONE",
      contactDisclosureApproved: false,
    });
    const result = await clientSpocs(service, { tenant } as Context);
    expect(result.spocs.map((s) => s.name)).toEqual([
      "Named SPOC",
      "Named Manager",
      "Backup",
    ]);
    expect(result.spocs[0].email).toBe("");
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
});

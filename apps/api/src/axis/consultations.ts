import type { Router } from "express";
import { z } from "zod";
import type { ClientService } from "../saas/service.js";
import type { AxisService } from "./service.js";
import { failure } from "../enterprise/service.js";
export function registerConsultations(router: Router, clients: ClientService, axis: AxisService) {
  const scoped = async (user: any) => {
    const targets = await axis.options(user);
    const tenants = new Set(targets.map(t => t.tenantId).filter(Boolean));
    for (const spoc of await clients.repo.list("spocassignments")) {
      if (spoc.active !== false && (spoc.userId === user.id || String(spoc.email ?? "").toLowerCase() === String(user.email).toLowerCase())) tenants.add(String(spoc.tenantId));
    }
    return (await clients.repo.list("supporttickets")).filter(t => tenants.has(String(t.tenantId)));
  };
  const owned = async (user: any, id: string) => {
    const ticket = (await scoped(user)).find(t => t.id === id);
    if (!ticket) failure("Consultation not found.",404);
    return ticket;
  };
  router.get("/consultations", async (_req,res) => {
    const targets = await axis.options(res.locals.user);
    const actions = await Promise.all((await scoped(res.locals.user)).map(async t => {
      const org = await clients.repo.get("organizations",String(t.tenantId));
      const creator = await clients.store.user(String(t.createdBy));
      return {...t,title:t.subject,company:org?.name ?? targets.find(x=>x.tenantId===t.tenantId)?.company,requestedBy:creator?.name ?? "Client",unit:t.topic ?? "Consultation"};
    }));
    actions.sort((a,b)=>Date.parse(String(b.createdAt))-Date.parse(String(a.createdAt)));
    res.json({actions});
  });
  router.get("/consultations/:id",async(req,res)=>{
    const ticket=await owned(res.locals.user,String(req.params.id));
    res.json({action:ticket,comments:(await clients.repo.list("supportmessages",{tenantId:ticket.tenantId,ticketId:ticket.id})).map(m=>({...m,author:m.actorName})),documents:[]});
  });
  router.patch("/consultations/:id",async(req,res)=>{
    const t=await owned(res.locals.user,String(req.params.id));
    const input=z.object({version:z.number().int(),status:z.enum(["IN_PROGRESS","AWAITING_CLIENT","RESOLVED"]),remarks:z.string().trim().max(5000).default("")}).parse(req.body);
    const action=await clients.repo.transaction(async repo=>{
      const updated=await repo.update("supporttickets",t.id,input.version,{status:input.status,lastRespondedAt:new Date().toISOString(),respondedBy:res.locals.user.id});
      if(input.remarks) await repo.create("supportmessages",{tenantId:t.tenantId,ticketId:t.id,message:input.remarks,actorId:res.locals.user.id,actorName:res.locals.user.name});
      return updated;
    });
    await axis.enterprise.audit(res.locals.user,"consultation.responded",t.id,{status:input.status});
    await axis.notice(String(t.tenantId),"ADVISORY",input.remarks?"Consultation reply received":"Consultation status updated",`${t.subject}: ${input.status.replaceAll("_"," ")}`,"/client/my-spoc",`consultation:${t.id}:${action.version}`);
    res.json({action});
  });
}

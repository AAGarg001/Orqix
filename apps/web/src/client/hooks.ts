import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api';
export const clientQuery=<T=any,>(path:string,enabled=true,preserveView=false)=>useQuery({queryKey:[path],queryFn:({signal})=>api<T>(path,{signal}),enabled,staleTime:10000,refetchInterval:30000,placeholderData:preserveView?keepPreviousData:undefined});
export const money=(paise:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(paise??0)/100);
export const stamp=(value:unknown)=>value?new Date(String(value)).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}):'Not provided';
export const canManage=(role:string)=>['client_owner','client_admin'].includes(role);
export const canOperate=(role:string)=>['client_owner','client_admin','client_operator'].includes(role);

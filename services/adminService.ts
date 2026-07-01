import { apiCall } from './api';
export interface AdminMember { sub:string; email:string|null; balance:number; uploads:number; creditsSpent:number; storageBytes:number; chatMessages:number; orders:number; revenueCents:number; lastActivity:number|null }
export interface AdminOverview { members:number; uploads:number; credits:number; revenueCents:number; storageBytes:number }
export interface AdminUpload { id:string; timestamp:number; fileName:string; sourceLanguage:string|null; targetLanguage:string; cost:number; sourceSize:number|null }
export interface AdminAdjustment { id:number; delta:number; reason:string; actorEmail:string; createdAt:number }
export interface AdminMemberDetail { member:AdminMember; uploads:AdminUpload[]; orders:unknown[]; adjustments:AdminAdjustment[] }
export const getAdminOverview=()=>apiCall<AdminOverview>('/admin/overview');
export const getAdminMembers=(q='')=>apiCall<{members:AdminMember[]}>(`/admin/members?q=${encodeURIComponent(q)}`);
export const getAdminMember=(sub:string)=>apiCall<AdminMemberDetail>(`/admin/members/${encodeURIComponent(sub)}`);
export const adjustAdminCredits=(sub:string,delta:number,reason:string)=>apiCall<{balance:number}>(`/admin/members/${encodeURIComponent(sub)}/credits`,'POST',{delta,reason});
export const deleteAdminUpload=(sub:string,id:string)=>apiCall<void>(`/admin/members/${encodeURIComponent(sub)}/uploads/${encodeURIComponent(id)}`,'DELETE');

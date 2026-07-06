import { apiCall } from './api';
export interface AdminMember { sub:string; email:string|null; balance:number; uploads:number; creditsSpent:number; storageBytes:number; chatMessages:number; orders:number; revenueCents:number; lastActivity:number|null }
export interface AdminOverview { members:number; uploads:number; credits:number; revenueCents:number; storageBytes:number }
export interface AdminUpload { id:string; timestamp:number; fileName:string; sourceLanguage:string|null; targetLanguage:string; cost:number; sourceSize:number|null }
export interface AdminAdjustment { id:number; delta:number; reason:string; actorEmail:string; createdAt:number }
export interface AdminMemberDetail { member:AdminMember; uploads:AdminUpload[]; orders:unknown[]; adjustments:AdminAdjustment[] }
export type BetaApplicationStatus='new'|'approved'|'rejected';
export interface AdminBetaApplication { id:string; name:string; email:string; instagramHandle:string; audienceSize:string; contentFocus:string; promotionPlan:string; testingInterest:string; promotionConfirmed:boolean; status:BetaApplicationStatus; createdAt:string; reviewedAt:string|null; reviewedBy:string|null }
export const getAdminOverview=()=>apiCall<AdminOverview>('/admin/overview');
export const getAdminMembers=(q='')=>apiCall<{members:AdminMember[]}>(`/admin/members?q=${encodeURIComponent(q)}`);
export const getAdminMember=(sub:string)=>apiCall<AdminMemberDetail>(`/admin/members/${encodeURIComponent(sub)}`);
export const adjustAdminCredits=(sub:string,delta:number,reason:string)=>apiCall<{balance:number}>(`/admin/members/${encodeURIComponent(sub)}/credits`,'POST',{delta,reason});
export const deleteAdminUpload=(sub:string,id:string)=>apiCall<void>(`/admin/members/${encodeURIComponent(sub)}/uploads/${encodeURIComponent(id)}`,'DELETE');
export const getAdminBetaApplications=(status?:BetaApplicationStatus)=>apiCall<{applications:AdminBetaApplication[]}>(`/admin/beta-applications${status?`?status=${status}`:''}`);
export const reviewAdminBetaApplication=(id:string,status:'approved'|'rejected')=>apiCall<{application:AdminBetaApplication}>(`/admin/beta-applications/${encodeURIComponent(id)}`,'PATCH',{status});

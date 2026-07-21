import { apiCall } from './api';
export interface AdminMember { sub:string; email:string|null; balance:number; uploads:number; creditsSpent:number; storageBytes:number; chatMessages:number; orders:number; revenueCents:number; lastActivity:number|null }
export interface AdminOverview { members:number; uploads:number; credits:number; revenueCents:number; storageBytes:number }
export interface AdminUpload { id:string; timestamp:number; fileName:string; sourceLanguage:string|null; targetLanguage:string; cost:number; sourceSize:number|null }
export interface AdminAdjustment { id:number; delta:number; reason:string; actorEmail:string; createdAt:number }
export interface AdminLedgerEntry { id:number; delta:number; balanceAfter:number; kind:string; reference:string|null; createdAt:number }
export interface AdminMemberDetail { member:AdminMember; uploads:AdminUpload[]; orders:unknown[]; adjustments:AdminAdjustment[]; ledger:AdminLedgerEntry[] }
export interface AdminActivityEvent { event:string; timestamp:string; path:string|null; detail:string|null }
export interface AdminMemberActivity {
  configured:boolean;
  days?:number;
  events?:AdminActivityEvent[];
  pages?:{ path:string; count:number; lastAt:string }[];
  actions?:{ event:string; count:number; lastAt:string }[];
}
export type BetaApplicationStatus='new'|'approved'|'rejected';
export type AdminMemberSort='balance'|'creditsSpent'|'lastActivity';
export interface AdminBetaApplication {
  id:string;
  name:string;
  email:string;
  instagramHandle:string;
  audienceSize:string;
  contentFocus:string;
  patternRightsConfirmed:boolean;
  patternToTranslate:string;
  targetLanguageMarket:string;
  salesChannels:string;
  promotionPlan:string;
  testingInterest:string;
  promotionConfirmed:boolean;
  utmSource:string;
  utmMedium:string;
  utmCampaign:string;
  utmContent:string;
  utmTerm:string;
  landingPage:string;
  referrer:string;
  status:BetaApplicationStatus;
  createdAt:string;
  reviewedAt:string|null;
  reviewedBy:string|null;
  memberSub?:string|null;
  balance?:number|null;
  creditsSpent?:number|null;
}
export const getAdminMe=()=>apiCall<{admin:boolean;email:string}>('/admin/me');
export const getAdminOverview=()=>apiCall<AdminOverview>('/admin/overview');
export const getAdminMembers=(opts:{q?:string;sort?:AdminMemberSort;dir?:'asc'|'desc';beta?:boolean}={})=>{
  const params=new URLSearchParams();
  if(opts.q)params.set('q',opts.q);
  if(opts.sort)params.set('sort',opts.sort);
  if(opts.dir)params.set('dir',opts.dir);
  if(opts.beta)params.set('beta','1');
  const qs=params.toString();
  return apiCall<{members:AdminMember[]}>(`/admin/members${qs?`?${qs}`:''}`);
};
export const getAdminMember=(sub:string)=>apiCall<AdminMemberDetail>(`/admin/members/${encodeURIComponent(sub)}`);
export const getAdminMemberActivity=(sub:string,days=7)=>apiCall<AdminMemberActivity>(`/admin/members/${encodeURIComponent(sub)}/activity?days=${days}`);
export const getAdminMemberByEmail=(email:string)=>apiCall<{member:AdminMember}>(`/admin/members/by-email?email=${encodeURIComponent(email)}`);
export const adjustAdminCredits=(sub:string,delta:number,reason:string)=>apiCall<{balance:number}>(`/admin/members/${encodeURIComponent(sub)}/credits`,'POST',{delta,reason});
export const deleteAdminUpload=(sub:string,id:string)=>apiCall<void>(`/admin/members/${encodeURIComponent(sub)}/uploads/${encodeURIComponent(id)}`,'DELETE');
export const getAdminBetaApplications=(status?:BetaApplicationStatus)=>apiCall<{applications:AdminBetaApplication[]}>(`/admin/beta-applications${status?`?status=${status}`:''}`);
export const reviewAdminBetaApplication=(id:string,status:'approved'|'rejected')=>apiCall<{application:AdminBetaApplication;emailSent:boolean;invite?:{creditsGranted:boolean;balance:number;alreadyActive:boolean;developmentInviteUrl?:string}}>(`/admin/beta-applications/${encodeURIComponent(id)}`,'PATCH',{status});
export const inviteAdminUser=(email:string,name?:string)=>apiCall<{sub:string;email:string;creditsGranted:boolean;balance:number;emailSent:boolean;alreadyActive:boolean;developmentInviteUrl?:string}>('/admin/invites','POST',{email,name});

export type SkillLevel = "beginner" | "any" | "intermediate";
export type ApplicationStatus = "pending" | "approved" | "rejected" | "withdrawn";

export interface User {
  id: string;
  name: string;
  age: number;
  ageGroup: "16+";
  avatarUrl?: string;
  avatarSource?: "platform" | "custom";
  platformAvatarUrl?: string;
  bio?: string;
  district?: string;
  sports?: string[];
  level?: SkillLevel;
  notificationsEnabled?: boolean;
  nickname?: string;
  gender?: "unspecified" | "female" | "male";
  telegramContact?: string;
  telegramOwnerId?: string;
  shareContact?: boolean;
  suspended?: boolean;
  moderationWarning?: string;
  rating?: number;
  reviewsCount?: number;
}

export interface Activity {
  id: string;
  title: string;
  sport: string;
  date: string;
  durationMinutes?: number;
  endedAt?: string;
  category?: "sport" | "games" | "boardgames";
  audienceGender?: "any" | "female" | "male";
  format?: "offline" | "online";
  connectionLink?: string;
  gamePlatform?: string;
  moderationHidden?: boolean;
  district: string;
  publicPlace: string;
  exactAddress: string;
  level: SkillLevel;
  capacity: number;
  approvedCount: number;
  price: number;
  equipment: string;
  description: string;
  ageGroup: string;
  minAge?: number;
  maxAge?: number;
  organizerId: string;
  status: "open" | "full" | "cancelled" | "completed" | "not_held";
  createdAt: string;
}

export interface Application {
  id: string;
  activityId: string;
  userId: string;
  status: ApplicationStatus;
  createdAt: string;
}

export interface Database {
  blocks?: {from:string;to:string;createdAt:string}[];
  meetingFeedback?: {activityId:string;userId:string;met:boolean;createdAt:string}[];
  favorites?: {userId:string;activityId:string;createdAt:string}[];
  reminderDeliveries?: {key:string;activityId:string;userId:string;window:"day"|"hour";state:"sending"|"sent"|"failed"|"skipped";claimedAt:string;attempts:number}[];
  telegramLinks?: {hash:string;userId:string;expiresAt:string}[];
  supportTickets?: SupportTicket[];
  supportDrafts?: Record<string, "problem" | "idea">;
  users: User[];
  activities: Activity[];
  applications: Application[];
  friendships?: Friendship[];
  reviews?: Review[];
  reviewReports?: ReviewReport[];
  contentReports?: ContentReport[];
  moderationLog?: ModerationAction[];
}

export interface Friendship { id: string; from: string; to: string; status: "pending" | "accepted"; createdAt: string }
export interface Review { id: string; activityId: string; authorId: string; targetId: string; score: number; text: string; createdAt: string; attended: true; hidden?: boolean }
export interface ReviewReport { id: string; reviewId: string; reporterId: string; reason: string; createdAt: string }

export interface ContentReport { id:string; kind:"activity"|"user"|"review"; targetId:string; reporterId:string; reason:string; createdAt:string; status:"open"|"resolved"; resolution?:string }
export interface ModerationAction { id:string; reportId:string; moderatorId:string; action:string; createdAt:string }

export interface SupportTicket { id:string; userId:string; kind:"problem"|"idea"; text:string; createdAt:string; status:"new"|"working"|"resolved"; sourceMessageId:number; attachment?:{fileId:string;kind:"photo"|"document"}; replies:{id:string;text:string;moderatorId:string;createdAt:string;delivery:"pending"|"sent"|"failed"}[]; changes?:{moderatorId:string;status:string;createdAt:string}[] }

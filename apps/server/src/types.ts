export type SkillLevel = "beginner" | "any" | "intermediate";
export type ApplicationStatus = "pending" | "approved" | "rejected";

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
  telegramContact?: string;
  shareContact?: boolean;
  rating?: number;
  reviewsCount?: number;
}

export interface Activity {
  id: string;
  title: string;
  sport: string;
  date: string;
  durationMinutes?: number;
  category?: "sport" | "games";
  format?: "offline" | "online";
  connectionLink?: string;
  gamePlatform?: string;
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
  status: "open" | "full" | "cancelled";
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
  users: User[];
  activities: Activity[];
  applications: Application[];
  friendships?: Friendship[];
  reviews?: Review[];
  reviewReports?: ReviewReport[];
}

export interface Friendship { id: string; from: string; to: string; status: "pending" | "accepted"; createdAt: string }
export interface Review { id: string; activityId: string; authorId: string; targetId: string; score: number; text: string; createdAt: string; attended: true }
export interface ReviewReport { id: string; reviewId: string; reporterId: string; reason: string; createdAt: string }

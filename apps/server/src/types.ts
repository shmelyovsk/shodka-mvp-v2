export type SkillLevel = "beginner" | "any" | "intermediate";
export type ApplicationStatus = "pending" | "approved" | "rejected";

export interface User {
  id: string;
  name: string;
  ageGroup: "16+";
  avatarUrl?: string;
  rating?: number;
  reviewsCount?: number;
}

export interface Activity {
  id: string;
  title: string;
  sport: string;
  date: string;
  durationMinutes: number;
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
}

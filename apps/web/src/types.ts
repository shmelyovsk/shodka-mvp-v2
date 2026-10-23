export interface Activity {
  id: string;
  title: string;
  sport: string;
  date: string;
  durationMinutes?: number;
  endedAt?: string;
  category?: "sport" | "games";
  format?: "offline" | "online";
  connectionLink?: string;
  gamePlatform?: string;
  moderationHidden?:boolean;
  district: string;
  publicPlace: string;
  exactAddress?: string;
  level: "beginner" | "any" | "intermediate";
  capacity: number;
  approvedCount: number;
  price: number;
  equipment: string;
  description: string;
  ageGroup: string;
  minAge?: number;
  maxAge?: number;
  organizerId: string;
  organizer?: {
    id: string;
    name: string;
    age: number;
    ageGroup: string;
    avatarUrl?: string;
    bio?: string;
    rating?: number;
    reviewsCount?: number;
  };
  participants?: Array<{
    id: string;
    name: string;
    age: number;
    avatarUrl?: string;
  }>;
  status: "open" | "full" | "cancelled" | "completed" | "not_held";
  relation?: "organizer" | "participant";
  applicationStatus?: "pending" | "approved" | "rejected" | "withdrawn";
}

export interface OrganizerApplication {
  id: string;
  activityId: string;
  userId: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  createdAt: string;
  activity?: Activity;
  user?: {
    id: string;
    name: string;
    age: number;
    ageGroup: string;
    avatarUrl?: string;
    rating?: number;
    reviewsCount?: number;
  };
}

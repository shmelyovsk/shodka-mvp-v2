export interface PublicUser {
  id: string; name: string; nickname?: string; age: number; avatarUrl?: string;
  bio?: string; district?: string; sports?: string[]; level?: string; rating?: number; reviewsCount?: number;
}
export interface Friend { id: string; status: "pending" | "accepted"; incoming: boolean; user: PublicUser }
export interface PublicReview { id: string; score: number; text: string; createdAt: string; authorId: string; author?: PublicUser }
export interface ProfileDetails {
  user: PublicUser; contact: { telegram: string } | null;
  friendship: { id: string; status: "pending" | "accepted"; incoming: boolean } | null;
  activities: import("./types").Activity[]; reviews: PublicReview[];
  eligibleActivities: Array<{ id: string; title: string; date: string }>;
}

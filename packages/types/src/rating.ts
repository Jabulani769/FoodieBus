export type RatingEntityType = 'TRIP' | 'DISH' | 'OPERATOR' | 'VENDOR';

export interface Rating {
  id: string;
  entityType: RatingEntityType;
  entityId: string;
  score: number;
  comment?: string;
  createdAt: string;
  user: { id: string; fullName: string };
}

export interface CreateRatingInput {
  entityType: RatingEntityType;
  entityId: string;
  score: number;
  comment?: string;
}

export interface Character {
  id: string;
  projectId: string;
  name: string;
  role: string | null;
  background: string | null;
  goals: string | null;
  conflicts: string | null;
  quirks: string | null;
  voice: string | null;
  notes: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CharacterListResponse {
  characters: Character[];
}

export interface CharacterResponse {
  character: Character;
}

export interface CharacterCreatePayload {
  name: string;
  role?: string;
  background?: string;
  goals?: string;
  conflicts?: string;
  quirks?: string;
  voice?: string;
  notes?: string;
}

export type CharacterUpdatePayload = Partial<CharacterCreatePayload>;

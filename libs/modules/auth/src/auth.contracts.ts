export class AuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryAfter?: number,
  ) {
    super(code);
  }
}
export interface Options {
  accessTokenSecret: string;
  schema?: string;
  codeGenerator?: () => string;
}
export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: string;
  status: string;
  email_verified_at: Date | null;
}
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  verified: boolean;
}
export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: PublicUser;
  verificationRequired?: boolean;
}

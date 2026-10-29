export interface EmailAdapter {
  readonly mode: string;
  send(key: string, payload: Record<string, unknown>): Promise<void>;
}
export class PermanentJobError extends Error {}
export type JobRow = {
  business_key: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

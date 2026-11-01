import { RetentionRepository } from "../persistence/retention.repository";
import { DataSource } from "typeorm";

export class RetentionService {
  constructor(
    private readonly source: DataSource,
    private readonly schema = "public",
    private readonly clock = () => new Date(),
  ) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
      throw new Error("Invalid schema");
  }
  async cleanup(batchSize = 500): Promise<Record<string, number>> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000)
      throw new Error("Invalid retention batch size");
    const now = this.clock();
    const repository = new RetentionRepository(this.schema);
    return this.source.transaction((m) =>
      repository.cleanup(m, now, batchSize),
    );
  }
}

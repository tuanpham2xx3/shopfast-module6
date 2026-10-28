import { FoundationWorker } from "../../apps/worker/src/foundation-worker";
import { RetentionService } from "../../libs/modules/jobs/src/retention.service";

it("does not block business scheduling on retention and prevents overlap", async () => {
  let release!: () => void;
  const pending = new Promise<Record<string, number>>((resolve) => {
    release = () => resolve({});
  });
  const cleanup = jest
    .spyOn(RetentionService.prototype, "cleanup")
    .mockReturnValue(pending);
  const worker = new FoundationWorker();
  const catchUp = jest.fn().mockResolvedValue(undefined);
  Object.assign(worker, { source: {}, jobs: { catchUp } });
  const tick = Reflect.get(worker, "tick").bind(worker) as () => Promise<void>;
  try {
    const completed = await Promise.race([
      tick().then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    expect(completed).toBe(true);
    expect(catchUp).toHaveBeenCalledTimes(1);
    await tick();
    expect(cleanup).toHaveBeenCalledTimes(1);
  } finally {
    release();
    await pending;
    cleanup.mockRestore();
  }
});

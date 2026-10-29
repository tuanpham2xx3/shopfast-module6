import { EntityManager } from "typeorm";
type QueryExecutor = Pick<EntityManager, "query">;
/** SQL only; the caller owns transaction, lock ordering and commit. */
export class JobsRepository {
  constructor(private readonly schema: string) {}
  private t(name: string) {
    return '\"' + this.schema + '\".' + name;
  }
  enqueueJobExecutionsInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("job_executions")}(business_key,type,status,payload,max_attempts,available_at) VALUES($1,$2,'PENDING',$3,$4,$5) ON CONFLICT DO NOTHING`,
      values,
    );
  }
  routeInventoriesSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT i.product_id,i.version FROM ${this.t("inventories")} i JOIN ${this.t("order_items")} oi ON oi.product_id=i.product_id WHERE oi.order_id=$1`,
      values,
    );
  }
  catchUpOrdersSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT id,created_at FROM ${this.t("orders")} WHERE status='PENDING_PAYMENT' AND created_at<=$1`,
      values,
    );
  }
  catchUpOrdersSelect2(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT id FROM ${this.t("orders")} WHERE status='PENDING_PAYMENT' AND expires_at<=$1`,
      values,
    );
  }
  catchUpOrdersSelect3(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT (min(created_at) AT TIME ZONE 'Asia/Bangkok')::date::text start FROM ${this.t("orders")}`,
      values,
    );
  }
  catchUpLockSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT d::date::text AS "day" FROM generate_series($1::date,($2::timestamptz AT TIME ZONE 'Asia/Bangkok' - interval '10 minutes')::date-1,interval '1 day') d`,
      values,
    );
  }
  drainJobExecutionsUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("job_executions")} SET lease_token=$1,lease_until=$2,attempts=attempts+1,updated_at=$3 WHERE business_key=(SELECT business_key FROM ${this.t("job_executions")} WHERE status='PENDING' AND available_at<=$3 AND (lease_until IS NULL OR lease_until<$3) AND ($4::text IS NULL OR business_key=$4) ORDER BY available_at,business_key LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`,
      values,
    );
  }
  drainJobExecutionsUpdate2(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("job_executions")} SET lease_until=$3 WHERE business_key=$1 AND lease_token=$2`,
      values,
    );
  }
  drainJobExecutionsUpdate3(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("job_executions")} SET status='SUCCEEDED',lease_until=NULL,lease_token=NULL,result_ref=$4,updated_at=$3 WHERE business_key=$1 AND lease_token=$2`,
      values,
    );
  }
  drainJobExecutionsUpdate4(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("job_executions")} SET status=$3,last_error='JOB_PROCESSING_FAILED',lease_until=NULL,lease_token=NULL,available_at=$4,updated_at=$5 WHERE business_key=$1 AND lease_token=$2 RETURNING business_key`,
      values,
    );
  }
  drainFailedJobsInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("failed_jobs")}(id,business_key,reason,attempt) VALUES($1,$2,'JOB_PROCESSING_FAILED',$3) ON CONFLICT(business_key,attempt) DO NOTHING`,
      values,
    );
  }
  orderOrdersSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT o.*,u.email FROM ${this.t("orders")} o JOIN ${this.t("users")} u ON u.id=o.customer_id WHERE o.id=$1`,
      values,
    );
  }
  executeOrderItemsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT name_snapshot AS name,quantity,line_total AS "lineTotal" FROM ${this.t("order_items")} WHERE order_id=$1 ORDER BY id`,
      values,
    );
  }
  executeOrderItemsSelect2(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT * FROM ${this.t("order_items")} WHERE order_id=$1 ORDER BY id`,
      values,
    );
  }
  executeInvoicesInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("invoices")}(order_id,content,checksum) SELECT id,$2,$3 FROM ${this.t("orders")} WHERE id=$1 AND payment_status='PAID' AND status IN ('CONFIRMED','PROCESSING','SHIPPING','DELIVERED') ON CONFLICT DO NOTHING`,
      values,
    );
  }
  executePartnerInventoryInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("partner_inventory")}(product_id,version,available) SELECT product_id,version,on_hand-reserved FROM ${this.t("inventories")} WHERE product_id=$1 ON CONFLICT(product_id) DO UPDATE SET version=EXCLUDED.version,available=EXCLUDED.available,updated_at=now() WHERE ${this.t("partner_inventory")}.version<EXCLUDED.version`,
      values,
    );
  }
  executeOrdersSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT COALESCE(sum(o.total),0)::text total,count(*)::int count FROM ${this.t("orders")} o WHERE o.status='DELIVERED' AND EXISTS(SELECT 1 FROM ${this.t("order_status_history")} h WHERE h.order_id=o.id AND h.to_status='DELIVERED' AND (h.created_at AT TIME ZONE 'Asia/Bangkok')::date=$1::date)`,
      values,
    );
  }
  executeRevenueReportsInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("revenue_reports")}(business_date,total,order_count,csv) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      values,
    );
  }
  executeUsersSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT id,email FROM ${this.t("users")} WHERE role='ADMIN' AND status='ACTIVE' AND email_verified_at IS NOT NULL`,
      values,
    );
  }
  invoiceInvoicesSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT checksum FROM ${this.t("invoices")} WHERE order_id=$1`,
      values,
    );
  }
  invoiceJobExecutionsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT status FROM ${this.t("job_executions")} WHERE business_key=$1`,
      values,
    );
  }
  downloadInvoicesSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT i.content FROM ${this.t("invoices")} i JOIN ${this.t("orders")} o ON o.id=i.order_id WHERE i.order_id=$1 AND o.customer_id=$2 AND o.payment_status='PAID' AND o.status NOT IN ('CANCELLED','EXPIRED')`,
      values,
    );
  }
  failedPageFailedJobsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT count(*)::int count FROM ${this.t("failed_jobs")}`,
      values,
    );
  }
  revenueReportRevenueReportsSelect(
    executor: QueryExecutor,
    values: unknown[],
  ) {
    return executor.query(
      `SELECT csv FROM ${this.t("revenue_reports")} WHERE business_date=$1`,
      values,
    );
  }
  executionCountsJobExecutionsSelect(
    executor: QueryExecutor,
    values: unknown[],
  ) {
    return executor.query(
      `SELECT status,count(*)::int count FROM ${this.t("job_executions")} GROUP BY status`,
      values,
    );
  }
  failedFailedJobsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT id,business_key,reason,attempt,created_at FROM ${this.t("failed_jobs")} ORDER BY created_at DESC,id LIMIT 50 OFFSET $1`,
      values,
    );
  }
  retryFailedJobsSelect(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `SELECT * FROM ${this.t("failed_jobs")} WHERE id=$1`,
      values,
    );
  }
  retryJobRetryAuditInsert(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `INSERT INTO ${this.t("job_retry_audit")}(id,failed_job_id,actor_id) VALUES($1,$2,$3)`,
      values,
    );
  }
  retryJobExecutionsUpdate(executor: QueryExecutor, values: unknown[]) {
    return executor.query(
      `UPDATE ${this.t("job_executions")} SET status='PENDING',max_attempts=attempts+max_attempts,available_at=$2,lease_until=NULL WHERE business_key=$1 AND status='FAILED'`,
      values,
    );
  }
}

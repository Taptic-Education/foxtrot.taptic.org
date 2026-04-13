-- CreateEnum
CREATE TYPE "TransferFrequency" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateTable
CREATE TABLE "scheduled_transfers" (
    "id" TEXT NOT NULL,
    "from_cost_center_id" TEXT NOT NULL,
    "to_cost_center_id" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "description" TEXT NOT NULL,
    "frequency" "TransferFrequency" NOT NULL,
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_transfers_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "scheduled_transfers" ADD CONSTRAINT "scheduled_transfers_from_cost_center_id_fkey" FOREIGN KEY ("from_cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_transfers" ADD CONSTRAINT "scheduled_transfers_to_cost_center_id_fkey" FOREIGN KEY ("to_cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_transfers" ADD CONSTRAINT "scheduled_transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

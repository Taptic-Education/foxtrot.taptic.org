-- Add branch code to fund requests
ALTER TABLE "fund_requests" ADD COLUMN IF NOT EXISTS "beneficiary_branch_code" TEXT;

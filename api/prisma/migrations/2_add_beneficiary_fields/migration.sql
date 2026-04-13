-- Add beneficiary/payment details to fund requests
ALTER TABLE "fund_requests" ADD COLUMN "beneficiary_name" TEXT;
ALTER TABLE "fund_requests" ADD COLUMN "beneficiary_bank" TEXT;
ALTER TABLE "fund_requests" ADD COLUMN "beneficiary_account" TEXT;
ALTER TABLE "fund_requests" ADD COLUMN "beneficiary_ref" TEXT;

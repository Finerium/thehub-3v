ALTER TABLE "integrity_finding" ALTER COLUMN "discipline" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "integrity_finding" ALTER COLUMN "document_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "integrity_finding" ADD COLUMN "rule" text;--> statement-breakpoint
ALTER TABLE "integrity_finding" ADD COLUMN "observation_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "integrity_finding" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "integrity_finding" ADD COLUMN "basis" text;--> statement-breakpoint
ALTER TABLE "integrity_finding" ADD COLUMN "item" jsonb;
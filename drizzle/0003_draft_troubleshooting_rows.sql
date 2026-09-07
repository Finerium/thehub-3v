CREATE TABLE "draft"."draft_troubleshooting_row" (
	"draft_id" text NOT NULL,
	"n" integer NOT NULL,
	"problem" text NOT NULL,
	"cause" text NOT NULL,
	"action" text NOT NULL,
	"quoted_wo_number" text,
	"truncated" boolean NOT NULL,
	CONSTRAINT "draft_troubleshooting_row_draft_id_n_pk" PRIMARY KEY("draft_id","n")
);
--> statement-breakpoint
ALTER TABLE "draft"."draft_troubleshooting_row" ADD CONSTRAINT "draft_troubleshooting_row_draft_id_draft_document_id_fk" FOREIGN KEY ("draft_id") REFERENCES "draft"."draft_document"("id") ON DELETE cascade ON UPDATE no action;
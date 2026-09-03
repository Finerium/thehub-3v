-- pgvector for chunk.embedding vector(384) (ADR-009); added by hand ahead of the drizzle-kit output, which cannot express extensions.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE SCHEMA "draft";
--> statement-breakpoint
CREATE TYPE "public"."answer_outcome" AS ENUM('answer', 'partial', 'abstention', 'refusal');--> statement-breakpoint
CREATE TYPE "public"."answer_template" AS ENUM('readiness', 'trip', 'job', 'reading');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('issued_for_operation', 'issued_for_construction', 'issued_for_approval', 'issued_for_review', 'approved', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('answer.issued', 'answer.abstained', 'safety.request_refused', 'safety.request_served', 'draft.created', 'draft.redlined', 'draft.accepted', 'draft.rejected', 'draft.reproposed', 'sme_note.added', 'draft.published', 'publication.rejected', 'corpus.version_activated', 'evaluation.run_ingested', 'render.integrity_blocked', 'auth.reviewer_link_rejected', 'auth.role_violation', 'audit.safety_events_read');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_role" AS ENUM('Engineer', 'Reviewing Supervisor', 'Manager', 'Admin', 'system', 'ci', 'job');--> statement-breakpoint
CREATE TYPE "public"."bom_match_status" AS ENUM('matched', 'unmatched');--> statement-breakpoint
CREATE TYPE "public"."breakdown_kind" AS ENUM('unplanned', 'planned_flagged', 'none');--> statement-breakpoint
CREATE TYPE "public"."claim_kind" AS ENUM('parameter', 'row', 'note', 'step', 'footer', 'title', 'bom', 'narrative');--> statement-breakpoint
CREATE TYPE "public"."comparator" AS ENUM('>', '<', '>=', '<=', '=');--> statement-breakpoint
CREATE TYPE "public"."coverage_layer" AS ENUM('generous', 'strict');--> statement-breakpoint
CREATE TYPE "public"."coverage_population" AS ENUM('unplanned_failure', 'failure', 'unplanned_breakdowns', 'planned_flagged', 'all');--> statement-breakpoint
CREATE TYPE "public"."criticality" AS ENUM('HIGH CRITICAL', 'LOW CRITICAL', 'NON CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."discipline" AS ENUM('Mechanical', 'Instrument', 'Electrical', 'Process');--> statement-breakpoint
CREATE TYPE "public"."document_class" AS ENUM('datasheet', 'ga_drawing', 'interlock', 'plot_plan', 'opl', 'pid', 'workbook', 'organiser_note');--> statement-breakpoint
CREATE TYPE "draft"."draft_actor_role" AS ENUM('Engineer', 'Reviewing Supervisor', 'Manager', 'Admin', 'system');--> statement-breakpoint
CREATE TYPE "draft"."draft_state" AS ENUM('proposed', 'drafted', 'redlined', 'in_review', 'accepted', 'published', 'blocked', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."edge_kind" AS ENUM('cross_reference', 'assoc_docs', 'note', 'label');--> statement-breakpoint
CREATE TYPE "public"."evaluation_tier" AS ENUM('A', 'B', 'full');--> statement-breakpoint
CREATE TYPE "public"."evaluation_verdict" AS ENUM('pass', 'fail', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."family_basis" AS ENUM('analyst_classification', 'agent_classification');--> statement-breakpoint
CREATE TYPE "public"."gateway_outcome" AS ENUM('ok', 'parse_failed', 'timeout', 'provider_error', 'budget_exhausted');--> statement-breakpoint
CREATE TYPE "public"."instrument_role" AS ENUM('initiator', 'final_element', 'permissive', 'control', 'alarm', 'relief', 'monitor', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."integrity_state" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."labels_status" AS ENUM('machine_drafted_pending_human', 'human_adjudicated');--> statement-breakpoint
CREATE TYPE "public"."language_detected" AS ENUM('en', 'id');--> statement-breakpoint
CREATE TYPE "public"."linking_field" AS ENUM('root_cause', 'problem_description');--> statement-breakpoint
CREATE TYPE "public"."logic_kind" AS ENUM('trip_logic', 'control_loop_only');--> statement-breakpoint
CREATE TYPE "public"."matched_field" AS ENUM('problem_description', 'root_cause', 'corrective_action');--> statement-breakpoint
CREATE TYPE "public"."opl_classification" AS ENUM('Basic Knowledge', 'Improvement', 'Trouble Case');--> statement-breakpoint
CREATE TYPE "public"."permissive_gate" AS ENUM('AND');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('Low', 'Medium', 'High', 'Emergency');--> statement-breakpoint
CREATE TYPE "draft"."redline_result" AS ENUM('pass', 'block');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('reviewed', 'pending');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('Engineer', 'Reviewing Supervisor', 'Manager', 'Admin');--> statement-breakpoint
CREATE TYPE "public"."row_kind" AS ENUM('trip', 'control', 'alarm', 'mech');--> statement-breakpoint
CREATE TYPE "public"."test_class" AS ENUM('sis_proof_test', 'sil_logic_test', 'calibration_proof_test', 'statutory_relief_test');--> statement-breakpoint
CREATE TYPE "public"."unit_kind" AS ENUM('opl_step', 'ce_row', 'datasheet_group', 'wo_field', 'opl_section', 'note');--> statement-breakpoint
CREATE TYPE "public"."work_type" AS ENUM('Preventive', 'Corrective', 'Predictive', 'Inspection', 'Calibration', 'Overhaul');--> statement-breakpoint
CREATE TABLE "answer_trace" (
	"id" text PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"language_detected" "language_detected" NOT NULL,
	"template" "answer_template",
	"scope" jsonb NOT NULL,
	"rulepack" jsonb NOT NULL,
	"retrieved_chunk_ids" text[] NOT NULL,
	"prompts" jsonb NOT NULL,
	"verifier_verdicts" jsonb NOT NULL,
	"gate_results" jsonb NOT NULL,
	"repair_rounds" integer NOT NULL,
	"confidence" jsonb NOT NULL,
	"outcome" "answer_outcome" NOT NULL,
	"packet" jsonb NOT NULL,
	"model_ids" jsonb NOT NULL,
	"corpus_version_id" text NOT NULL,
	"user_alias" text NOT NULL,
	"server_ts" timestamp with time zone NOT NULL,
	CONSTRAINT "answer_trace_repair_rounds" CHECK ("answer_trace"."repair_rounds" IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" text PRIMARY KEY NOT NULL,
	"alias" text NOT NULL,
	"role" "role" NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_demo" boolean NOT NULL,
	"last_login" timestamp with time zone,
	CONSTRAINT "app_user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "area" (
	"code" text PRIMARY KEY NOT NULL,
	"workbook_name" text NOT NULL,
	"datasheet_name" text NOT NULL,
	"opl_header_name" text NOT NULL,
	"plot_plan_title_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text NOT NULL,
	"actor_alias" text NOT NULL,
	"actor_role" "audit_actor_role" NOT NULL,
	"action" "audit_action" NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"trace_id" text,
	"route" text NOT NULL,
	"corpus_version_id" text NOT NULL,
	"server_ts" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_id_action_server_ts_pk" PRIMARY KEY("id","action","server_ts")
);
--> statement-breakpoint
CREATE TABLE "bom_item" (
	"id" text PRIMARY KEY NOT NULL,
	"equipment_tag" text NOT NULL,
	"ga_drawing_doc_no" text NOT NULL,
	"item_no" integer NOT NULL,
	"description" text NOT NULL,
	"material" text,
	"quantity" text,
	"span_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bom_match" (
	"wo_number" text NOT NULL,
	"part_string" text NOT NULL,
	"bom_item_id" text,
	"alternative_bom_item_id" text,
	"disambiguator_text" text,
	"status" "bom_match_status" NOT NULL,
	CONSTRAINT "bom_match_wo_number_part_string_pk" PRIMARY KEY("wo_number","part_string")
);
--> statement-breakpoint
CREATE TABLE "causal_link" (
	"id" text PRIMARY KEY NOT NULL,
	"from_wo" text NOT NULL,
	"to_wo" text NOT NULL,
	"equipment_tag" text NOT NULL,
	"mechanism_noun" text NOT NULL,
	"interval_days" integer NOT NULL,
	"linking_sentence" text NOT NULL,
	"linking_field" "linking_field" NOT NULL,
	"span_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunk" (
	"id" text PRIMARY KEY NOT NULL,
	"document_revision_id" text NOT NULL,
	"page" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"unit_kind" "unit_kind" NOT NULL,
	"text" text NOT NULL,
	"quote_hash" char(64) NOT NULL,
	"embedding" vector(384) NOT NULL,
	"text_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', "text")) STORED,
	CONSTRAINT "chunk_revision_page_ordinal" UNIQUE("document_revision_id","page","ordinal")
);
--> statement-breakpoint
CREATE TABLE "claim" (
	"id" text PRIMARY KEY NOT NULL,
	"span_id" text NOT NULL,
	"entity_binding" text NOT NULL,
	"claim_kind" "claim_kind" NOT NULL,
	"value_text" text NOT NULL,
	"extracted_by" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corpus_version" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"manifest_sha256" text NOT NULL,
	"corpus_sha256" text NOT NULL,
	"extractor" text NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding_dim" integer NOT NULL,
	"model_pins" jsonb NOT NULL,
	"created_by_alias" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"activated_by_alias" text,
	"activated_at" timestamp with time zone,
	"parent_version_id" text
);
--> statement-breakpoint
CREATE TABLE "coverage_assessment" (
	"wo_number" text NOT NULL,
	"layer" "coverage_layer" NOT NULL,
	"covered" boolean NOT NULL,
	"best_ratio" double precision NOT NULL,
	"threshold" double precision NOT NULL,
	"matched_field" "matched_field",
	"matched_lesson" text,
	"corpus_version_id" text NOT NULL,
	CONSTRAINT "coverage_assessment_wo_number_layer_corpus_version_id_pk" PRIMARY KEY("wo_number","layer","corpus_version_id")
);
--> statement-breakpoint
CREATE TABLE "coverage_method" (
	"corpus_version_id" text PRIMARY KEY NOT NULL,
	"recipe_sha256" text NOT NULL,
	"stop_list_sha256" text NOT NULL,
	"threshold" double precision NOT NULL,
	"window_multiplier" integer NOT NULL,
	"min_content_words" integer NOT NULL,
	"comparison" text NOT NULL,
	"extractor" text NOT NULL,
	"strict_sections" jsonb NOT NULL,
	"strict_cut_marker" text NOT NULL,
	"labels_status" "labels_status" NOT NULL,
	"unscoreable_ids" jsonb NOT NULL,
	CONSTRAINT "coverage_method_threshold" CHECK ("coverage_method"."threshold" = 0.62),
	CONSTRAINT "coverage_method_window_multiplier" CHECK ("coverage_method"."window_multiplier" = 2),
	CONSTRAINT "coverage_method_min_content_words" CHECK ("coverage_method"."min_content_words" = 3)
);
--> statement-breakpoint
CREATE TABLE "coverage_summary" (
	"corpus_version_id" text NOT NULL,
	"population" "coverage_population" NOT NULL,
	"layer" "coverage_layer" NOT NULL,
	"threshold" double precision NOT NULL,
	"uncovered_count" integer NOT NULL,
	"population_count" integer NOT NULL,
	"uncovered_breakdowns" integer NOT NULL,
	"uncovered_downtime_hours" numeric(6, 1) NOT NULL,
	"uncovered_cost_idr" bigint NOT NULL,
	"bands" jsonb,
	"sensitivity" jsonb NOT NULL,
	CONSTRAINT "coverage_summary_corpus_version_id_population_layer_pk" PRIMARY KEY("corpus_version_id","population","layer")
);
--> statement-breakpoint
CREATE TABLE "datasheet_param" (
	"id" text PRIMARY KEY NOT NULL,
	"equipment_tag" text NOT NULL,
	"group" text NOT NULL,
	"field" text NOT NULL,
	"unit" text,
	"value_text" text NOT NULL,
	"value_num" double precision,
	"span_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debt_cluster" (
	"id" text PRIMARY KEY NOT NULL,
	"equipment_tag" text NOT NULL,
	"corpus_version_id" text NOT NULL,
	"uncovered_wo_numbers" text[] NOT NULL,
	"factors" jsonb NOT NULL,
	"coefficients" jsonb NOT NULL,
	"incomplete_uncovered" integer NOT NULL,
	"score" double precision NOT NULL,
	"rank" integer NOT NULL,
	CONSTRAINT "debt_cluster_version_equipment" UNIQUE("corpus_version_id","equipment_tag")
);
--> statement-breakpoint
CREATE TABLE "document_edge" (
	"from_document_id" text NOT NULL,
	"to_document_id" text NOT NULL,
	"edge_kind" "edge_kind" NOT NULL,
	"source_span_id" text NOT NULL,
	CONSTRAINT "document_edge_pk" PRIMARY KEY("from_document_id","to_document_id","edge_kind","source_span_id")
);
--> statement-breakpoint
CREATE TABLE "document_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"revision" text NOT NULL,
	"approval_status" "approval_status" NOT NULL,
	"approval_status_text" text NOT NULL,
	"revision_date" text,
	"prepared_by_alias" text,
	"reviewed_by_alias" text,
	"approved_by_alias" text,
	"date_of_sharing" text,
	"is_current" boolean NOT NULL,
	"corpus_version_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" text PRIMARY KEY NOT NULL,
	"doc_no" text,
	"class" "document_class" NOT NULL,
	"subject_tag" text,
	"sha256" text NOT NULL,
	"source_path" text NOT NULL,
	"page_count" integer NOT NULL,
	"file_marker" text,
	CONSTRAINT "document_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
CREATE TABLE "draft"."draft_document" (
	"id" text PRIMARY KEY NOT NULL,
	"cluster_id" text NOT NULL,
	"equipment_tag" text NOT NULL,
	"state" "draft"."draft_state" NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"corpus_version_id" text NOT NULL,
	"opl_id_reserved" text NOT NULL,
	"title" text NOT NULL,
	"classification" text NOT NULL,
	"aspect" text NOT NULL,
	"created_by_alias" text NOT NULL,
	"model_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"previous_draft_id" text,
	"session_scope" text,
	CONSTRAINT "draft_document_opl_id_reserved_unique" UNIQUE("opl_id_reserved")
);
--> statement-breakpoint
CREATE TABLE "draft"."draft_field" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"section" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"provenance" jsonb NOT NULL,
	"numeric_provenance" jsonb NOT NULL,
	"quarantined" boolean NOT NULL,
	"is_slot" boolean NOT NULL,
	CONSTRAINT "draft_field_section" CHECK ("draft"."draft_field"."section" BETWEEN 1 AND 6),
	CONSTRAINT "draft_field_slot_or_provenance" CHECK (("draft"."draft_field"."is_slot" AND "draft"."draft_field"."text" = 'REQUIRES ENGINEER INPUT') OR (NOT "draft"."draft_field"."is_slot" AND "draft"."draft_field"."provenance" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "draft"."draft_transition" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"from_state" "draft"."draft_state" NOT NULL,
	"to_state" "draft"."draft_state" NOT NULL,
	"actor_alias" text NOT NULL,
	"actor_role" "draft"."draft_actor_role" NOT NULL,
	"reason" text,
	"edit_diff" text,
	"server_ts" timestamp with time zone NOT NULL,
	CONSTRAINT "draft_transition_legal_pair" CHECK (("draft"."draft_transition"."from_state", "draft"."draft_transition"."to_state") IN (
        ('proposed', 'drafted'), ('drafted', 'redlined'), ('redlined', 'in_review'), ('redlined', 'drafted'),
        ('redlined', 'blocked'), ('in_review', 'in_review'), ('in_review', 'accepted'), ('in_review', 'rejected'),
        ('accepted', 'published'), ('accepted', 'rejected'), ('blocked', 'proposed'), ('rejected', 'proposed')
      ) OR (
        "draft"."draft_transition"."to_state" = 'blocked' AND "draft"."draft_transition"."reason" = 'deadline_exceeded'
        AND "draft"."draft_transition"."from_state" IN ('proposed', 'drafted', 'redlined', 'in_review', 'accepted')
      ))
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"tag" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"functional_location" text NOT NULL,
	"area_code" text NOT NULL,
	"service" text NOT NULL,
	"criticality_datasheet" "criticality" NOT NULL,
	"criticality_workbook" text NOT NULL,
	"interlock_ref" text NOT NULL,
	"datasheet_doc_no" text NOT NULL,
	"ga_drawing_doc_no" text NOT NULL,
	"pid_document_id" text NOT NULL,
	"plot_plan_doc_no" text NOT NULL,
	"ce_doc_no" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_result" (
	"run_id" text NOT NULL,
	"case_id" text NOT NULL,
	"category" text NOT NULL,
	"hard_gate" boolean NOT NULL,
	"verdict" "evaluation_verdict" NOT NULL,
	"expected" text NOT NULL,
	"failure_reason" text,
	CONSTRAINT "evaluation_result_run_id_case_id_pk" PRIMARY KEY("run_id","case_id")
);
--> statement-breakpoint
CREATE TABLE "evaluation_run" (
	"id" text PRIMARY KEY NOT NULL,
	"corpus_version_id" text NOT NULL,
	"harness_commit" text NOT NULL,
	"model_pins" jsonb NOT NULL,
	"prompt_versions" jsonb NOT NULL,
	"rulepack_version" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"tier" "evaluation_tier" NOT NULL,
	"ingested_by" text DEFAULT 'ci' NOT NULL,
	CONSTRAINT "evaluation_run_ingested_by" CHECK ("evaluation_run"."ingested_by" = 'ci')
);
--> statement-breakpoint
CREATE TABLE "failure_event" (
	"wo_number" text PRIMARY KEY NOT NULL,
	"equipment_tag" text NOT NULL,
	"report_date" text NOT NULL,
	"downtime_hours" numeric(6, 1),
	"maintenance_cost_idr" bigint,
	"breakdown_kind" "breakdown_kind" NOT NULL,
	CONSTRAINT "failure_event_breakdown_kind" CHECK ("failure_event"."breakdown_kind" <> 'none')
);
--> statement-breakpoint
CREATE TABLE "failure_family" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"basis" "family_basis" NOT NULL,
	"review_status" "review_status" NOT NULL,
	"members" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateway_call" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"request_sha256" text NOT NULL,
	"response_sha256" text NOT NULL,
	"model_id" text NOT NULL,
	"prompt_version" text,
	"gateway_config_sha256" text NOT NULL,
	"corpus_version_id" text NOT NULL,
	"latency_ms" double precision NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"outcome" "gateway_outcome" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instrument_tag" (
	"tag" text PRIMARY KEY NOT NULL,
	"equipment_tag" text NOT NULL,
	"role" "instrument_role" NOT NULL,
	"sources" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrity_finding" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"severity" text NOT NULL,
	"discipline" text NOT NULL,
	"document_id" text NOT NULL,
	"span_id" text,
	"state" "integrity_state" NOT NULL,
	"safety_function" boolean NOT NULL,
	"routing_recommendation" text,
	"corpus_version_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interlock" (
	"seq_id" text,
	"equipment_tag" text NOT NULL,
	"logic_kind" "logic_kind" NOT NULL,
	"sil_sheet" integer,
	"ce_doc_no" text NOT NULL,
	"ce_revision" text NOT NULL,
	"notes" jsonb NOT NULL,
	"permissive_gate" "permissive_gate",
	CONSTRAINT "interlock_equipment_tag_ce_doc_no_pk" PRIMARY KEY("equipment_tag","ce_doc_no"),
	CONSTRAINT "interlock_seq_id" UNIQUE("seq_id")
);
--> statement-breakpoint
CREATE TABLE "interlock_row" (
	"id" text PRIMARY KEY NOT NULL,
	"seq_id" text,
	"equipment_tag" text NOT NULL,
	"row_id" text NOT NULL,
	"row_kind" "row_kind" NOT NULL,
	"initiator" text NOT NULL,
	"instrument_tag" text NOT NULL,
	"setpoint_value" double precision,
	"setpoint_unit" text,
	"comparator" "comparator",
	"setpoint_text" text NOT NULL,
	"voting" text,
	"vote_cell_text" text NOT NULL,
	"effects" jsonb NOT NULL,
	"effects_basis" text NOT NULL,
	"source_page" integer NOT NULL,
	"span_id" text NOT NULL,
	CONSTRAINT "interlock_row_voting_trip_only" CHECK ("interlock_row"."row_kind" = 'trip' OR "interlock_row"."voting" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "opl" (
	"document_revision_id" text NOT NULL,
	"opl_id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"discipline" text NOT NULL,
	"equipment_tag" text NOT NULL,
	"area_unit" text NOT NULL,
	"related_interlock_text" text NOT NULL,
	"pid_ref" text NOT NULL,
	"classification" "opl_classification" NOT NULL,
	"aspect" text NOT NULL,
	"sections" jsonb NOT NULL,
	"permit_lines" jsonb NOT NULL,
	"footer" jsonb NOT NULL,
	"machine_drafted" boolean NOT NULL,
	"approver_alias" text,
	CONSTRAINT "opl_document_revision_id_unique" UNIQUE("document_revision_id")
);
--> statement-breakpoint
CREATE TABLE "opl_step" (
	"opl_id" text NOT NULL,
	"n" integer NOT NULL,
	"action_text" text NOT NULL,
	"acceptance_criterion" text,
	"source_hash" char(64) NOT NULL,
	"span_id" text NOT NULL,
	CONSTRAINT "opl_step_opl_id_n_pk" PRIMARY KEY("opl_id","n")
);
--> statement-breakpoint
CREATE TABLE "page_derivative" (
	"document_id" text NOT NULL,
	"page" integer NOT NULL,
	"width" integer NOT NULL,
	"format" text NOT NULL,
	"source_sha256" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	CONSTRAINT "page_derivative_document_id_page_width_pk" PRIMARY KEY("document_id","page","width")
);
--> statement-breakpoint
CREATE TABLE "pid_sidecar" (
	"set" integer PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"title_box" text NOT NULL,
	"reference_box" text NOT NULL,
	"notes" text[] NOT NULL,
	"equipment_shown" text[] NOT NULL,
	"hotspots" jsonb NOT NULL,
	"defects" jsonb NOT NULL,
	"provenance" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_test" (
	"wo_number" text PRIMARY KEY NOT NULL,
	"equipment_tag" text NOT NULL,
	"seq_id" text,
	"device_tag" text,
	"test_class" "test_class" NOT NULL,
	"completion_date" text NOT NULL,
	"result_text" text NOT NULL,
	"as_found" text,
	"as_left" text
);
--> statement-breakpoint
CREATE TABLE "rate_limit_counter" (
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limit_counter_scope_key_window_start_pk" PRIMARY KEY("scope","key","window_start")
);
--> statement-breakpoint
CREATE TABLE "draft"."redline_verdict" (
	"draft_id" text NOT NULL,
	"round" integer NOT NULL,
	"verdict" "draft"."redline_result" NOT NULL,
	"reasons" jsonb NOT NULL,
	"model_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "redline_verdict_draft_id_round_pk" PRIMARY KEY("draft_id","round"),
	CONSTRAINT "redline_verdict_round" CHECK ("draft"."redline_verdict"."round" IN (1, 2))
);
--> statement-breakpoint
CREATE TABLE "reviewer_link" (
	"id" text PRIMARY KEY NOT NULL,
	"role" "role" NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean NOT NULL,
	"signature_key_version" integer NOT NULL,
	CONSTRAINT "reviewer_link_role" CHECK ("reviewer_link"."role" <> 'Admin')
);
--> statement-breakpoint
CREATE TABLE "seeded_chip" (
	"id" text PRIMARY KEY NOT NULL,
	"equipment_tag" text NOT NULL,
	"question" text NOT NULL,
	"golden_case_id" text,
	"trace_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"reviewer_link_id" text
);
--> statement-breakpoint
CREATE TABLE "session_sandbox" (
	"session_id" text PRIMARY KEY NOT NULL,
	"corpus_version_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft"."sme_note" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"field_id" text NOT NULL,
	"author_alias" text NOT NULL,
	"author_role" "role" NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"text" text NOT NULL,
	"source_reference" text,
	"provenance" text DEFAULT 'human, dated, unreviewed' NOT NULL,
	"citeable" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sme_note_provenance" CHECK ("draft"."sme_note"."provenance" = 'human, dated, unreviewed')
);
--> statement-breakpoint
CREATE TABLE "span" (
	"id" text PRIMARY KEY NOT NULL,
	"document_revision_id" text NOT NULL,
	"page" integer NOT NULL,
	"anchor_text" text NOT NULL,
	"quote_hash" char(64) NOT NULL,
	"start_ordinal" integer NOT NULL,
	"end_ordinal" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "start_permissive" (
	"seq_id" text NOT NULL,
	"n" integer NOT NULL,
	"text" text NOT NULL,
	"signal_tag" text,
	"standing_bypass_state" text,
	"span_id" text NOT NULL,
	CONSTRAINT "start_permissive_seq_id_n_pk" PRIMARY KEY("seq_id","n")
);
--> statement-breakpoint
CREATE TABLE "troubleshooting_row" (
	"opl_id" text NOT NULL,
	"n" integer NOT NULL,
	"problem" text NOT NULL,
	"cause" text NOT NULL,
	"action" text NOT NULL,
	"quoted_wo_number" text,
	"truncated" boolean NOT NULL,
	CONSTRAINT "troubleshooting_row_opl_id_n_pk" PRIMARY KEY("opl_id","n")
);
--> statement-breakpoint
CREATE TABLE "work_order" (
	"wo_number" text PRIMARY KEY NOT NULL,
	"notification_no" text NOT NULL,
	"report_date" text NOT NULL,
	"start_date" text NOT NULL,
	"completion_date" text NOT NULL,
	"status" text NOT NULL,
	"equipment_tag" text NOT NULL,
	"work_type" "work_type" NOT NULL,
	"discipline" "discipline" NOT NULL,
	"priority" "priority" NOT NULL,
	"criticality" text NOT NULL,
	"problem_description" text NOT NULL,
	"root_cause" text NOT NULL,
	"corrective_action" text NOT NULL,
	"spare_parts_used" text NOT NULL,
	"breakdown" boolean NOT NULL,
	"downtime_hours" numeric(6, 1),
	"labor_hours" numeric(6, 1),
	"labor_cost_idr" bigint,
	"material_cost_idr" bigint,
	"total_cost_idr" bigint,
	"reported_by_alias" text NOT NULL,
	"executed_by_alias" text NOT NULL,
	"approved_by_alias" text NOT NULL,
	"related_interlock" text,
	"remarks" text,
	"closeout_complete" boolean NOT NULL,
	"completeness_flags" jsonb NOT NULL,
	"breakdown_kind" "breakdown_kind" NOT NULL,
	"notification_lead_hours" numeric(6, 1) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answer_trace" ADD CONSTRAINT "answer_trace_corpus_version_id_corpus_version_id_fk" FOREIGN KEY ("corpus_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_corpus_version_id_corpus_version_id_fk" FOREIGN KEY ("corpus_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_item" ADD CONSTRAINT "bom_item_equipment_tag_equipment_tag_fk" FOREIGN KEY ("equipment_tag") REFERENCES "public"."equipment"("tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_item" ADD CONSTRAINT "bom_item_span_id_span_id_fk" FOREIGN KEY ("span_id") REFERENCES "public"."span"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_match" ADD CONSTRAINT "bom_match_wo_number_work_order_wo_number_fk" FOREIGN KEY ("wo_number") REFERENCES "public"."work_order"("wo_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_match" ADD CONSTRAINT "bom_match_bom_item_id_bom_item_id_fk" FOREIGN KEY ("bom_item_id") REFERENCES "public"."bom_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_match" ADD CONSTRAINT "bom_match_alternative_bom_item_id_bom_item_id_fk" FOREIGN KEY ("alternative_bom_item_id") REFERENCES "public"."bom_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "causal_link" ADD CONSTRAINT "causal_link_from_wo_work_order_wo_number_fk" FOREIGN KEY ("from_wo") REFERENCES "public"."work_order"("wo_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "causal_link" ADD CONSTRAINT "causal_link_to_wo_work_order_wo_number_fk" FOREIGN KEY ("to_wo") REFERENCES "public"."work_order"("wo_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "causal_link" ADD CONSTRAINT "causal_link_equipment_tag_equipment_tag_fk" FOREIGN KEY ("equipment_tag") REFERENCES "public"."equipment"("tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "causal_link" ADD CONSTRAINT "causal_link_span_id_span_id_fk" FOREIGN KEY ("span_id") REFERENCES "public"."span"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunk" ADD CONSTRAINT "chunk_document_revision_id_document_revision_id_fk" FOREIGN KEY ("document_revision_id") REFERENCES "public"."document_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_span_id_span_id_fk" FOREIGN KEY ("span_id") REFERENCES "public"."span"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_version" ADD CONSTRAINT "corpus_version_parent_version_id_corpus_version_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_assessment" ADD CONSTRAINT "coverage_assessment_wo_number_work_order_wo_number_fk" FOREIGN KEY ("wo_number") REFERENCES "public"."work_order"("wo_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_assessment" ADD CONSTRAINT "coverage_assessment_matched_lesson_opl_opl_id_fk" FOREIGN KEY ("matched_lesson") REFERENCES "public"."opl"("opl_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_assessment" ADD CONSTRAINT "coverage_assessment_corpus_version_id_corpus_version_id_fk" FOREIGN KEY ("corpus_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_method" ADD CONSTRAINT "coverage_method_corpus_version_id_corpus_version_id_fk" FOREIGN KEY ("corpus_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_summary" ADD CONSTRAINT "coverage_summary_corpus_version_id_corpus_version_id_fk" FOREIGN KEY ("corpus_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasheet_param" ADD CONSTRAINT "datasheet_param_equipment_tag_equipment_tag_fk" FOREIGN KEY ("equipment_tag") REFERENCES "public"."equipment"("tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasheet_param" ADD CONSTRAINT "datasheet_param_span_id_span_id_fk" FOREIGN KEY ("span_id") REFERENCES "public"."span"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_cluster" ADD CONSTRAINT "debt_cluster_equipment_tag_equipment_tag_fk" FOREIGN KEY ("equipment_tag") REFERENCES "public"."equipment"("tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_cluster" ADD CONSTRAINT "debt_cluster_corpus_version_id_corpus_version_id_fk" FOREIGN KEY ("corpus_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_edge" ADD CONSTRAINT "document_edge_from_document_id_document_id_fk" FOREIGN KEY ("from_document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_edge" ADD CONSTRAINT "document_edge_to_document_id_document_id_fk" FOREIGN KEY ("to_document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_edge" ADD CONSTRAINT "document_edge_source_span_id_span_id_fk" FOREIGN KEY ("source_span_id") REFERENCES "public"."span"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_revision" ADD CONSTRAINT "document_revision_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_revision" ADD CONSTRAINT "document_revision_corpus_version_id_corpus_version_id_fk" FOREIGN KEY ("corpus_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft"."draft_document" ADD CONSTRAINT "draft_document_cluster_id_debt_cluster_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."debt_cluster"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft"."draft_document" ADD CONSTRAINT "draft_document_equipment_tag_equipment_tag_fk" FOREIGN KEY ("equipment_tag") REFERENCES "public"."equipment"("tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft"."draft_document" ADD CONSTRAINT "draft_document_corpus_version_id_corpus_version_id_fk" FOREIGN KEY ("corpus_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft"."draft_document" ADD CONSTRAINT "draft_document_previous_draft_id_draft_document_id_fk" FOREIGN KEY ("previous_draft_id") REFERENCES "draft"."draft_document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft"."draft_document" ADD CONSTRAINT "draft_document_session_scope_session_id_fk" FOREIGN KEY ("session_scope") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft"."draft_field" ADD CONSTRAINT "draft_field_draft_id_draft_document_id_fk" FOREIGN KEY ("draft_id") REFERENCES "draft"."draft_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft"."draft_transition" ADD CONSTRAINT "draft_transition_draft_id_draft_document_id_fk" FOREIGN KEY ("draft_id") REFERENCES "draft"."draft_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_area_code_area_code_fk" FOREIGN KEY ("area_code") REFERENCES "public"."area"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_pid_document_id_document_id_fk" FOREIGN KEY ("pid_document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_result" ADD CONSTRAINT "evaluation_result_run_id_evaluation_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."evaluation_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run" ADD CONSTRAINT "evaluation_run_corpus_version_id_corpus_version_id_fk" FOREIGN KEY ("corpus_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "failure_event" ADD CONSTRAINT "failure_event_wo_number_work_order_wo_number_fk" FOREIGN KEY ("wo_number") REFERENCES "public"."work_order"("wo_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "failure_event" ADD CONSTRAINT "failure_event_equipment_tag_equipment_tag_fk" FOREIGN KEY ("equipment_tag") REFERENCES "public"."equipment"("tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_call" ADD CONSTRAINT "gateway_call_corpus_version_id_corpus_version_id_fk" FOREIGN KEY ("corpus_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrument_tag" ADD CONSTRAINT "instrument_tag_equipment_tag_equipment_tag_fk" FOREIGN KEY ("equipment_tag") REFERENCES "public"."equipment"("tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrity_finding" ADD CONSTRAINT "integrity_finding_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrity_finding" ADD CONSTRAINT "integrity_finding_span_id_span_id_fk" FOREIGN KEY ("span_id") REFERENCES "public"."span"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrity_finding" ADD CONSTRAINT "integrity_finding_corpus_version_id_corpus_version_id_fk" FOREIGN KEY ("corpus_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interlock" ADD CONSTRAINT "interlock_equipment_tag_equipment_tag_fk" FOREIGN KEY ("equipment_tag") REFERENCES "public"."equipment"("tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interlock_row" ADD CONSTRAINT "interlock_row_equipment_tag_equipment_tag_fk" FOREIGN KEY ("equipment_tag") REFERENCES "public"."equipment"("tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interlock_row" ADD CONSTRAINT "interlock_row_span_id_span_id_fk" FOREIGN KEY ("span_id") REFERENCES "public"."span"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opl" ADD CONSTRAINT "opl_document_revision_id_document_revision_id_fk" FOREIGN KEY ("document_revision_id") REFERENCES "public"."document_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opl" ADD CONSTRAINT "opl_equipment_tag_equipment_tag_fk" FOREIGN KEY ("equipment_tag") REFERENCES "public"."equipment"("tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opl_step" ADD CONSTRAINT "opl_step_opl_id_opl_opl_id_fk" FOREIGN KEY ("opl_id") REFERENCES "public"."opl"("opl_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opl_step" ADD CONSTRAINT "opl_step_span_id_span_id_fk" FOREIGN KEY ("span_id") REFERENCES "public"."span"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_derivative" ADD CONSTRAINT "page_derivative_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pid_sidecar" ADD CONSTRAINT "pid_sidecar_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_test" ADD CONSTRAINT "proof_test_wo_number_work_order_wo_number_fk" FOREIGN KEY ("wo_number") REFERENCES "public"."work_order"("wo_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_test" ADD CONSTRAINT "proof_test_equipment_tag_equipment_tag_fk" FOREIGN KEY ("equipment_tag") REFERENCES "public"."equipment"("tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft"."redline_verdict" ADD CONSTRAINT "redline_verdict_draft_id_draft_document_id_fk" FOREIGN KEY ("draft_id") REFERENCES "draft"."draft_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_link" ADD CONSTRAINT "reviewer_link_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeded_chip" ADD CONSTRAINT "seeded_chip_equipment_tag_equipment_tag_fk" FOREIGN KEY ("equipment_tag") REFERENCES "public"."equipment"("tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeded_chip" ADD CONSTRAINT "seeded_chip_trace_id_answer_trace_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."answer_trace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_reviewer_link_id_reviewer_link_id_fk" FOREIGN KEY ("reviewer_link_id") REFERENCES "public"."reviewer_link"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_sandbox" ADD CONSTRAINT "session_sandbox_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_sandbox" ADD CONSTRAINT "session_sandbox_corpus_version_id_corpus_version_id_fk" FOREIGN KEY ("corpus_version_id") REFERENCES "public"."corpus_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft"."sme_note" ADD CONSTRAINT "sme_note_draft_id_draft_document_id_fk" FOREIGN KEY ("draft_id") REFERENCES "draft"."draft_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft"."sme_note" ADD CONSTRAINT "sme_note_field_id_draft_field_id_fk" FOREIGN KEY ("field_id") REFERENCES "draft"."draft_field"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "span" ADD CONSTRAINT "span_document_revision_id_document_revision_id_fk" FOREIGN KEY ("document_revision_id") REFERENCES "public"."document_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "start_permissive" ADD CONSTRAINT "start_permissive_span_id_span_id_fk" FOREIGN KEY ("span_id") REFERENCES "public"."span"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "troubleshooting_row" ADD CONSTRAINT "troubleshooting_row_opl_id_opl_opl_id_fk" FOREIGN KEY ("opl_id") REFERENCES "public"."opl"("opl_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_equipment_tag_equipment_tag_fk" FOREIGN KEY ("equipment_tag") REFERENCES "public"."equipment"("tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_action_server_ts_idx" ON "audit_log" USING btree ("action","server_ts");--> statement-breakpoint
CREATE INDEX "bom_item_equipment_idx" ON "bom_item" USING btree ("equipment_tag");--> statement-breakpoint
CREATE INDEX "causal_link_equipment_idx" ON "causal_link" USING btree ("equipment_tag");--> statement-breakpoint
CREATE INDEX "chunk_text_tsv_gin" ON "chunk" USING gin ("text_tsv");--> statement-breakpoint
CREATE INDEX "chunk_embedding_hnsw" ON "chunk" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "claim_span_idx" ON "claim" USING btree ("span_id");--> statement-breakpoint
CREATE UNIQUE INDEX "corpus_version_one_active" ON "corpus_version" USING btree ("is_active") WHERE "corpus_version"."is_active";--> statement-breakpoint
CREATE INDEX "datasheet_param_equipment_idx" ON "datasheet_param" USING btree ("equipment_tag");--> statement-breakpoint
CREATE UNIQUE INDEX "one_current_revision" ON "document_revision" USING btree ("document_id") WHERE "document_revision"."is_current";--> statement-breakpoint
CREATE INDEX "document_revision_document_idx" ON "document_revision" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "draft_document_state_idx" ON "draft"."draft_document" USING btree ("state");--> statement-breakpoint
CREATE INDEX "draft_document_session_scope_idx" ON "draft"."draft_document" USING btree ("session_scope");--> statement-breakpoint
CREATE INDEX "draft_field_draft_idx" ON "draft"."draft_field" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "draft_transition_draft_idx" ON "draft"."draft_transition" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "gateway_call_role_created_idx" ON "gateway_call" USING btree ("role","created_at");--> statement-breakpoint
CREATE INDEX "instrument_tag_equipment_idx" ON "instrument_tag" USING btree ("equipment_tag");--> statement-breakpoint
CREATE INDEX "integrity_finding_document_idx" ON "integrity_finding" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "integrity_finding_rule_idx" ON "integrity_finding" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "interlock_row_equipment_idx" ON "interlock_row" USING btree ("equipment_tag");--> statement-breakpoint
CREATE INDEX "opl_equipment_idx" ON "opl" USING btree ("equipment_tag");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sme_note_draft_idx" ON "draft"."sme_note" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "span_document_revision_idx" ON "span" USING btree ("document_revision_id");--> statement-breakpoint
CREATE INDEX "work_order_equipment_idx" ON "work_order" USING btree ("equipment_tag");
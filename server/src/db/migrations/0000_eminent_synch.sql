CREATE TYPE "public"."application_status" AS ENUM('draft', 'submitted', 'under_review', 'shortlisted', 'interview', 'approved', 'rejected', 'hired');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('draft', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'leave', 'half_day');--> statement-breakpoint
CREATE TYPE "public"."availability" AS ENUM('available', 'busy', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('trade', 'engineering', 'request', 'other');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('draft', 'active', 'completed', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('LBP', 'USD');--> statement-breakpoint
CREATE TYPE "public"."employment_status" AS ENUM('candidate', 'active', 'on_leave', 'suspended', 'terminated', 'retired');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('labor', 'materials', 'equipment', 'transportation', 'subcontractor', 'miscellaneous');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'partial', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."issue_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('ar', 'en');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('inapp', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."pay_model" AS ENUM('hourly', 'day_rate', 'fixed_work', 'monthly', 'unspecified');--> statement-breakpoint
CREATE TYPE "public"."person_type" AS ENUM('worker', 'technician', 'engineer', 'other');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('planning', 'in_progress', 'on_hold', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."quotation_status" AS ENUM('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'declined', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."quote_item_kind" AS ENUM('labor', 'material', 'equipment', 'other');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('submitted', 'under_review', 'needs_info', 'site_visit', 'estimating', 'quotation_prepared', 'quotation_sent', 'accepted', 'declined', 'expired', 'contracted', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."shift" AS ENUM('morning', 'afternoon', 'full_day', 'night');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'blocked', 'done');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'hr', 'pm', 'accountant', 'engineer', 'worker', 'customer');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'pending');--> statement-breakpoint
CREATE TYPE "public"."worker_payment_type" AS ENUM('advance', 'payment', 'settlement');--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	"actor_id" uuid,
	"event_type" varchar(40) NOT NULL,
	"from_status" varchar(30),
	"to_status" varchar(30),
	"visibility" varchar(20) DEFAULT 'internal' NOT NULL,
	"message_ar" text,
	"message_en" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(30) NOT NULL,
	"access_token_hash" varchar(64) NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"phone" varchar(30) NOT NULL,
	"email" varchar(320),
	"person_type" "person_type" NOT NULL,
	"category_id" uuid,
	"skills" text,
	"experience_years" integer DEFAULT 0 NOT NULL,
	"qualifications" text,
	"languages" varchar(200),
	"governorate" varchar(80),
	"district" varchar(80),
	"town" varchar(120),
	"preferred_locations" text,
	"availability" varchar(60),
	"expected_rate" numeric(18,4),
	"expected_rate_currency" "currency",
	"consent_given" boolean DEFAULT false NOT NULL,
	"status" "application_status" DEFAULT 'submitted' NOT NULL,
	"internal_notes" text,
	"evaluation_score" integer,
	"public_message" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"personnel_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"personnel_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"shift" "shift" DEFAULT 'full_day' NOT NULL,
	"notes" varchar(300),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"personnel_id" uuid NOT NULL,
	"project_id" uuid,
	"work_date" date NOT NULL,
	"status" "attendance_status" DEFAULT 'present' NOT NULL,
	"regular_hours" numeric(5, 2) DEFAULT '0' NOT NULL,
	"overtime_hours" numeric(5, 2) DEFAULT '0' NOT NULL,
	"notes" varchar(300),
	"approval_status" "approval_status" DEFAULT 'draft' NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"actor_email" varchar(320),
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(40),
	"entity_id" varchar(64),
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" varchar(64),
	"request_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "category_kind" NOT NULL,
	"code" varchar(60) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"description_en" text,
	"description_ar" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"co_no" varchar(30) NOT NULL,
	"contract_id" uuid NOT NULL,
	"project_id" uuid,
	"title" varchar(200) NOT NULL,
	"description" text,
	"amount" numeric(18,4) NOT NULL,
	"currency" "currency" NOT NULL,
	"status" varchar(20) DEFAULT 'proposed' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "completion_checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"item" varchar(300) NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_by" uuid,
	"done_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"label" varchar(200) NOT NULL,
	"due_date" date,
	"amount_pct" numeric(5, 2),
	"amount" numeric(18,4),
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_no" varchar(30) NOT NULL,
	"customer_id" uuid NOT NULL,
	"project_id" uuid,
	"quotation_id" uuid,
	"status" "contract_status" DEFAULT 'draft' NOT NULL,
	"amount" numeric(18,4) NOT NULL,
	"currency" "currency" NOT NULL,
	"start_date" date,
	"end_date" date,
	"scope" text,
	"notes" text,
	"document_file_id" uuid,
	"signed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"company" varchar(200),
	"phone" varchar(30),
	"alt_phone" varchar(30),
	"email" varchar(320),
	"language" "locale" DEFAULT 'ar' NOT NULL,
	"address" varchar(300),
	"tax_id" varchar(60),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "doc_counters" (
	"key" varchar(120) PRIMARY KEY NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_currency" "currency" NOT NULL,
	"to_currency" "currency" NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"rate_date" date NOT NULL,
	"source" varchar(120) DEFAULT 'manual' NOT NULL,
	"entered_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rate_positive" CHECK (rate > 0),
	CONSTRAINT "exchange_rate_diff_currency" CHECK (from_currency <> to_currency)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"category" "expense_category" NOT NULL,
	"description" varchar(300) NOT NULL,
	"amount" numeric(18,4) NOT NULL,
	"currency" "currency" NOT NULL,
	"expense_date" date NOT NULL,
	"supplier_id" uuid,
	"receipt_file_id" uuid,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stored_name" varchar(120) NOT NULL,
	"original_name" varchar(300) NOT NULL,
	"mime_type" varchar(160) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"owner_type" varchar(40) DEFAULT 'other' NOT NULL,
	"owner_id" uuid,
	"visibility" varchar(20) DEFAULT 'private' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" varchar(400) NOT NULL,
	"qty" numeric(12, 3) DEFAULT '1' NOT NULL,
	"unit" varchar(30) DEFAULT 'unit' NOT NULL,
	"unit_price" numeric(18,4) NOT NULL,
	"line_total" numeric(18,4) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_no" varchar(30) NOT NULL,
	"customer_id" uuid NOT NULL,
	"project_id" uuid,
	"contract_id" uuid,
	"quotation_id" uuid,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"currency" "currency" NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date,
	"subtotal" numeric(18,4) DEFAULT '0' NOT NULL,
	"tax_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(18,4) DEFAULT '0' NOT NULL,
	"total" numeric(18,4) DEFAULT '0' NOT NULL,
	"paid_total" numeric(18,4) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"kind" varchar(20) DEFAULT 'issue' NOT NULL,
	"severity" "issue_severity" DEFAULT 'medium' NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"to_email" varchar(320),
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"template_key" varchar(80) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"subject" varchar(300),
	"body" text,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" varchar(300),
	"dedupe_key" varchar(160),
	"read_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personnel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_no" varchar(30) NOT NULL,
	"person_type" "person_type" DEFAULT 'worker' NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"photo_file_id" uuid,
	"phone" varchar(30) NOT NULL,
	"alt_phone" varchar(30),
	"email" varchar(320),
	"governorate" varchar(80),
	"district" varchar(80),
	"town" varchar(120),
	"address" varchar(300),
	"category_id" uuid,
	"secondary_skills" text,
	"experience_years" integer DEFAULT 0 NOT NULL,
	"qualifications" text,
	"languages" varchar(200),
	"employment_status" "employment_status" DEFAULT 'candidate' NOT NULL,
	"availability" "availability" DEFAULT 'available' NOT NULL,
	"pay_model" "pay_model" DEFAULT 'unspecified' NOT NULL,
	"rate_amount" numeric(18,4),
	"rate_currency" "currency",
	"hire_date" date,
	"emergency_contact_name" varchar(200),
	"emergency_contact_phone" varchar(30),
	"notes" text,
	"archived_at" timestamp with time zone,
	"merged_into_id" uuid,
	"source_application_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "personnel_experience_range" CHECK (experience_years >= 0 AND experience_years <= 70)
);
--> statement-breakpoint
CREATE TABLE "personnel_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"personnel_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" varchar(40) NOT NULL,
	"field" varchar(60),
	"old_value" text,
	"new_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"title_en" varchar(200) NOT NULL,
	"title_ar" varchar(200) NOT NULL,
	"description_en" text,
	"description_ar" text,
	"category" varchar(120),
	"location" varchar(200),
	"completed_year" integer,
	"cover_file_id" uuid,
	"published" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"personnel_id" uuid,
	"user_id" uuid,
	"role_in_project" varchar(80),
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_no" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"customer_id" uuid,
	"request_id" uuid,
	"description" text,
	"scope" text,
	"governorate" varchar(80),
	"district" varchar(80),
	"town" varchar(120),
	"address" varchar(300),
	"status" "project_status" DEFAULT 'planning' NOT NULL,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"manager_id" uuid,
	"start_date" date,
	"target_end_date" date,
	"actual_end_date" date,
	"contract_amount" numeric(18,4),
	"contract_currency" "currency",
	"budget_amount" numeric(18,4),
	"budget_currency" "currency",
	"warranty_notes" text,
	"archived_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"kind" "quote_item_kind" DEFAULT 'other' NOT NULL,
	"description" varchar(400) NOT NULL,
	"qty" numeric(12, 3) DEFAULT '1' NOT NULL,
	"unit" varchar(30) DEFAULT 'unit' NOT NULL,
	"unit_price" numeric(18,4) NOT NULL,
	"line_total" numeric(18,4) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_no" varchar(30) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"customer_id" uuid NOT NULL,
	"request_id" uuid,
	"project_id" uuid,
	"status" "quotation_status" DEFAULT 'draft' NOT NULL,
	"currency" "currency" NOT NULL,
	"title" varchar(200),
	"scope_of_work" text,
	"assumptions" text,
	"exclusions" text,
	"payment_terms" text,
	"valid_until" date,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"subtotal" numeric(18,4) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(18,4) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(18,4) DEFAULT '0' NOT NULL,
	"total" numeric(18,4) DEFAULT '0' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_no" varchar(30) NOT NULL,
	"invoice_id" uuid,
	"customer_id" uuid NOT NULL,
	"project_id" uuid,
	"amount" numeric(18,4) NOT NULL,
	"currency" "currency" NOT NULL,
	"method" varchar(30) DEFAULT 'cash' NOT NULL,
	"external_ref" varchar(120),
	"received_on" date NOT NULL,
	"notes" varchar(300),
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "request_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_id" uuid,
	"event_type" varchar(40) NOT NULL,
	"from_status" varchar(30),
	"to_status" varchar(30),
	"visibility" varchar(20) DEFAULT 'internal' NOT NULL,
	"message_ar" text,
	"message_en" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(30) NOT NULL,
	"access_token_hash" varchar(64) NOT NULL,
	"customer_id" uuid,
	"contact_name" varchar(200) NOT NULL,
	"phone" varchar(30) NOT NULL,
	"email" varchar(320),
	"company" varchar(200),
	"language" "locale" DEFAULT 'ar' NOT NULL,
	"category_id" uuid,
	"description" text NOT NULL,
	"governorate" varchar(80),
	"district" varchar(80),
	"town" varchar(120),
	"property_type" varchar(60),
	"area_value" numeric(12, 2),
	"area_unit" varchar(10) DEFAULT 'm2' NOT NULL,
	"desired_start" date,
	"deadline" date,
	"budget" numeric(18,4),
	"budget_currency" "currency",
	"preferred_contact" varchar(20) DEFAULT 'phone' NOT NULL,
	"consent_given" boolean DEFAULT false NOT NULL,
	"status" "request_status" DEFAULT 'submitted' NOT NULL,
	"internal_notes" text,
	"assigned_to" uuid,
	"project_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(120) NOT NULL,
	"title_en" varchar(200) NOT NULL,
	"title_ar" varchar(200) NOT NULL,
	"summary_en" text,
	"summary_ar" text,
	"body_en" text,
	"body_ar" text,
	"icon_key" varchar(60) DEFAULT 'tools' NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_id" uuid NOT NULL,
	"csrf_token" varchar(64) NOT NULL,
	"mfa_verified" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" varchar(64),
	"user_agent" varchar(300)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(120) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid,
	"project_id" uuid,
	"scheduled_at" timestamp with time zone NOT NULL,
	"visitor_user_id" uuid,
	"location" varchar(300),
	"status" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"kind" varchar(30) DEFAULT 'supplier' NOT NULL,
	"phone" varchar(30),
	"email" varchar(320),
	"address" varchar(300),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid,
	"title" varchar(200) NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"assignee_personnel_id" uuid,
	"assignee_user_id" uuid,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" varchar(200) NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"role" "user_role" NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_secret" varchar(64),
	"must_change_password" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"personnel_id" uuid,
	"customer_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "worker_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"personnel_id" uuid NOT NULL,
	"project_id" uuid,
	"type" "worker_payment_type" DEFAULT 'payment' NOT NULL,
	"amount" numeric(18,4) NOT NULL,
	"currency" "currency" NOT NULL,
	"paid_on" date NOT NULL,
	"method" varchar(30) DEFAULT 'cash' NOT NULL,
	"reference" varchar(80),
	"notes" varchar(300),
	"status" "approval_status" DEFAULT 'draft' NOT NULL,
	"approved_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completion_checklist" ADD CONSTRAINT "completion_checklist_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_payments" ADD CONSTRAINT "contract_payments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnel_history" ADD CONSTRAINT "personnel_history_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team" ADD CONSTRAINT "project_team_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team" ADD CONSTRAINT "project_team_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team" ADD CONSTRAINT "project_team_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_personnel_id_personnel_id_fk" FOREIGN KEY ("assignee_personnel_id") REFERENCES "public"."personnel"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_payments" ADD CONSTRAINT "worker_payments_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_payments" ADD CONSTRAINT "worker_payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_events_idx" ON "application_events" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_reference_idx" ON "applications" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "applications_category_idx" ON "applications" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "applications_phone_idx" ON "applications" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_unique_person_day" ON "assignments" USING btree ("personnel_id","work_date");--> statement-breakpoint
CREATE INDEX "assignments_project_date_idx" ON "assignments" USING btree ("project_id","work_date");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_unique_person_day" ON "attendance" USING btree ("personnel_id","work_date");--> statement-breakpoint
CREATE INDEX "attendance_project_idx" ON "attendance" USING btree ("project_id","work_date");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_kind_code_idx" ON "categories" USING btree ("kind","code");--> statement-breakpoint
CREATE UNIQUE INDEX "change_orders_no_idx" ON "change_orders" USING btree ("co_no");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_no_idx" ON "contracts" USING btree ("contract_no");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "customers_phone_idx" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "exchange_rates_idx" ON "exchange_rates" USING btree ("from_currency","to_currency","rate_date");--> statement-breakpoint
CREATE INDEX "expenses_project_idx" ON "expenses" USING btree ("project_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "files_stored_name_idx" ON "files" USING btree ("stored_name");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "invoice_items_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_no_idx" ON "invoices" USING btree ("invoice_no");--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "issues_project_idx" ON "issues" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "milestones_project_idx" ON "milestones" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_idx" ON "notifications" USING btree ("dedupe_key") WHERE dedupe_key IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "password_resets_token_idx" ON "password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "personnel_record_no_idx" ON "personnel" USING btree ("record_no");--> statement-breakpoint
CREATE INDEX "personnel_search_idx" ON "personnel" USING btree ("person_type","employment_status");--> statement-breakpoint
CREATE INDEX "personnel_category_idx" ON "personnel" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "personnel_name_idx" ON "personnel" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "personnel_phone_idx" ON "personnel" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "personnel_history_idx" ON "personnel_history" USING btree ("personnel_id");--> statement-breakpoint
CREATE INDEX "project_notes_idx" ON "project_notes" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_team_unique_personnel" ON "project_team" USING btree ("project_id","personnel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_team_unique_user" ON "project_team" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_no_idx" ON "projects" USING btree ("project_no");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_manager_idx" ON "projects" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "projects_customer_idx" ON "projects" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "quotation_items_idx" ON "quotation_items" USING btree ("quotation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_no_version_idx" ON "quotations" USING btree ("quote_no","version");--> statement-breakpoint
CREATE INDEX "quotations_customer_idx" ON "quotations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "quotations_status_idx" ON "quotations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_no_idx" ON "receipts" USING btree ("receipt_no");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_dup_guard_idx" ON "receipts" USING btree ("invoice_id","external_ref") WHERE external_ref IS NOT NULL AND voided_at IS NULL;--> statement-breakpoint
CREATE INDEX "receipts_invoice_idx" ON "receipts" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "request_events_idx" ON "request_events" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requests_reference_idx" ON "requests" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requests_customer_idx" ON "requests" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "services_slug_idx" ON "services" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "site_visits_request_idx" ON "site_visits" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "site_visits_project_idx" ON "site_visits" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_personnel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique_active" ON "users" USING btree ("email") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "worker_payments_personnel_idx" ON "worker_payments" USING btree ("personnel_id");--> statement-breakpoint
CREATE INDEX "worker_payments_project_idx" ON "worker_payments" USING btree ("project_id");
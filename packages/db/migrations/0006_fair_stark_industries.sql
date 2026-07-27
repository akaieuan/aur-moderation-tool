ALTER TABLE "skill_calibrations" ADD COLUMN "skill_version" text;--> statement-breakpoint
ALTER TABLE "skill_calibrations" ADD COLUMN "skipped_incomplete" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_registrations" ADD COLUMN "version" text DEFAULT '0.0.0' NOT NULL;
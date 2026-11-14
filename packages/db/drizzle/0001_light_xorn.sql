CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" jsonb NOT NULL,
	"body" jsonb NOT NULL,
	"link_url" text,
	"link_title" jsonb,
	"platforms" text[] DEFAULT '{"ios","macos"}' NOT NULL,
	"min_build" integer,
	"max_build" integer,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "announcements_starts_at_idx" ON "announcements" USING btree ("starts_at");
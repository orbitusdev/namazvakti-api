CREATE TABLE "cities" (
	"id" text PRIMARY KEY NOT NULL,
	"state_id" text NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"timezone" text NOT NULL,
	"diyanet_id" integer
);
--> statement-breakpoint
CREATE TABLE "city_demand" (
	"city_id" text PRIMARY KEY NOT NULL,
	"last_requested_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"diyanet_id" integer
);
--> statement-breakpoint
CREATE TABLE "prayer_times" (
	"city_id" text NOT NULL,
	"date" date NOT NULL,
	"imsak" text NOT NULL,
	"gunes" text NOT NULL,
	"ogle" text NOT NULL,
	"ikindi" text NOT NULL,
	"aksam" text NOT NULL,
	"yatsi" text NOT NULL,
	"hijri_date" text,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prayer_times_city_id_date_pk" PRIMARY KEY("city_id","date")
);
--> statement-breakpoint
CREATE TABLE "source_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"operation" text NOT NULL,
	"param" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "states" (
	"id" text PRIMARY KEY NOT NULL,
	"country_id" text NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"diyanet_id" integer
);
--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "city_demand" ADD CONSTRAINT "city_demand_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prayer_times" ADD CONSTRAINT "prayer_times_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "states" ADD CONSTRAINT "states_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cities_state_name_idx" ON "cities" USING btree ("state_id","name_normalized");
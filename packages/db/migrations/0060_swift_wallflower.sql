-- Per-channel publishing authorization. Provider tokens are AES-GCM encrypted before persistence.
CREATE TABLE IF NOT EXISTS "platform_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"provider_account_id" text NOT NULL,
	"provider_account_name" text NOT NULL,
	"access_token_encrypted" text,
	"refresh_token_encrypted" text,
	"access_token_expires_at" timestamp,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_connections" ADD CONSTRAINT "platform_connections_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_connections_channel" ON "platform_connections" USING btree ("channel_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_platform_connections_channel_platform" ON "platform_connections" USING btree ("channel_id","platform");

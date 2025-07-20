DROP VIEW "public"."active_users_view";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "slackInviteAt";--> statement-breakpoint
CREATE VIEW "public"."active_users_view" AS (select "id", "uuid", "firstName", "lastName", "email", "password", "permissionLevel", "useExtendedData", "invitedToSlack", "created_at", "deleted_at", "updated_at" from "users" where "users"."deleted_at" is null);
CREATE TABLE `an_groups` (
	`ref` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`abbrev` text NOT NULL,
	`legislature` text NOT NULL,
	`date_start` text,
	`date_end` text,
	`party_id` text
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `claim_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` text NOT NULL,
	`claim` text NOT NULL,
	`theme` text,
	`verdict` text NOT NULL,
	`explanation` text NOT NULL,
	`evidence` text NOT NULL,
	`model` text NOT NULL,
	`checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `document_analyses` (
	`document_id` integer NOT NULL,
	`theme` text NOT NULL,
	`stance` real,
	`confidence` real DEFAULT 0 NOT NULL,
	`summary` text NOT NULL,
	`measures` text NOT NULL,
	`quotes` text NOT NULL,
	`model` text NOT NULL,
	`analyzed_at` text NOT NULL,
	PRIMARY KEY(`document_id`, `theme`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`party_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`mime` text,
	`text` text,
	`pdf_base64` text,
	`sha` text,
	`discovered_by` text,
	`fetched_at` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `documents_party_idx` ON `documents` (`party_id`);--> statement-breakpoint
CREATE TABLE `group_votes` (
	`scrutin_uid` text NOT NULL,
	`group_ref` text NOT NULL,
	`group_abbrev` text,
	`party_id` text,
	`position` text,
	`pour` integer DEFAULT 0 NOT NULL,
	`contre` integer DEFAULT 0 NOT NULL,
	`abstentions` integer DEFAULT 0 NOT NULL,
	`non_votants` integer DEFAULT 0 NOT NULL,
	`members` integer,
	PRIMARY KEY(`scrutin_uid`, `group_ref`)
);
--> statement-breakpoint
CREATE INDEX `group_votes_party_idx` ON `group_votes` (`party_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`message` text,
	`log` text DEFAULT '' NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE TABLE `parties` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`color` text NOT NULL,
	`family` text NOT NULL,
	`lr_index` integer NOT NULL,
	`website` text,
	`an_groups` text NOT NULL,
	`parpol_names` text NOT NULL,
	`senat_groups` text NOT NULL,
	`x_handles` text NOT NULL,
	`leaders` text NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `party_theme_scores` (
	`party_id` text NOT NULL,
	`theme` text NOT NULL,
	`declared_stance` real,
	`declared_confidence` real,
	`voted_stance` real,
	`voted_n` integer DEFAULT 0 NOT NULL,
	`voted_weight` real DEFAULT 0 NOT NULL,
	`senat_stance` real,
	`senat_n` integer DEFAULT 0 NOT NULL,
	`posts_stance` real,
	`posts_n` integer DEFAULT 0 NOT NULL,
	`gap` real,
	`narrative` text,
	`evidence` text,
	`verdict` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`party_id`, `theme`)
);
--> statement-breakpoint
CREATE TABLE `politician_theme_scores` (
	`politician_id` text NOT NULL,
	`theme` text NOT NULL,
	`voted_stance` real,
	`voted_n` integer DEFAULT 0 NOT NULL,
	`posts_stance` real,
	`posts_n` integer DEFAULT 0 NOT NULL,
	`dissent_rate` real,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`politician_id`, `theme`)
);
--> statement-breakpoint
CREATE TABLE `politicians` (
	`id` text PRIMARY KEY NOT NULL,
	`chamber` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`full_name` text NOT NULL,
	`party_id` text,
	`group_ref` text,
	`group_abbrev` text,
	`group_name` text,
	`parpol` text,
	`department` text,
	`circo` text,
	`x_handle` text,
	`role` text,
	`active` integer DEFAULT true NOT NULL,
	`hatvp_url` text,
	`raw_json` text
);
--> statement-breakpoint
CREATE INDEX `politicians_party_idx` ON `politicians` (`party_id`);--> statement-breakpoint
CREATE INDEX `politicians_chamber_idx` ON `politicians` (`chamber`);--> statement-breakpoint
CREATE TABLE `post_analyses` (
	`post_id` text PRIMARY KEY NOT NULL,
	`themes` text NOT NULL,
	`claims` text NOT NULL,
	`tone` text,
	`is_political` integer DEFAULT true NOT NULL,
	`model` text NOT NULL,
	`analyzed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`party_id` text,
	`politician_id` text,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	`url` text,
	`likes` integer DEFAULT 0,
	`reposts` integer DEFAULT 0,
	`replies` integer DEFAULT 0,
	`views` integer DEFAULT 0,
	`source` text DEFAULT 'x-api' NOT NULL,
	`ingested_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `posts_party_idx` ON `posts` (`party_id`);--> statement-breakpoint
CREATE INDEX `posts_handle_idx` ON `posts` (`handle`);--> statement-breakpoint
CREATE INDEX `posts_date_idx` ON `posts` (`created_at`);--> statement-breakpoint
CREATE TABLE `scrutin_analyses` (
	`scrutin_uid` text PRIMARY KEY NOT NULL,
	`primary_theme` text,
	`themes` text NOT NULL,
	`summary` text NOT NULL,
	`stakes` text,
	`is_procedural` integer DEFAULT false NOT NULL,
	`salience` integer DEFAULT 1 NOT NULL,
	`model` text NOT NULL,
	`analyzed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scrutin_analyses_theme_idx` ON `scrutin_analyses` (`primary_theme`);--> statement-breakpoint
CREATE TABLE `scrutins` (
	`uid` text PRIMARY KEY NOT NULL,
	`chamber` text NOT NULL,
	`number` text NOT NULL,
	`legislature` text,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`objet` text,
	`demandeur` text,
	`type_vote` text,
	`sort` text,
	`votants` integer,
	`exprimes` integer,
	`pour` integer,
	`contre` integer,
	`abstentions` integer,
	`url` text,
	`dossier_ref` text,
	`ingested_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scrutins_date_idx` ON `scrutins` (`date`);--> statement-breakpoint
CREATE INDEX `scrutins_chamber_idx` ON `scrutins` (`chamber`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usage_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` text NOT NULL,
	`job_id` text,
	`task` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer NOT NULL,
	`cost_usd` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`scrutin_uid` text NOT NULL,
	`politician_id` text NOT NULL,
	`position` text NOT NULL,
	`par_delegation` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`scrutin_uid`, `politician_id`)
);
--> statement-breakpoint
CREATE INDEX `votes_politician_idx` ON `votes` (`politician_id`);
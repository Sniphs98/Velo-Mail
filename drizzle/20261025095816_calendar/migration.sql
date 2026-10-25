CREATE TABLE `calendar_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`serverUrl` text NOT NULL,
	`username` text NOT NULL,
	`secret` blob NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendars` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`sourceId` integer NOT NULL,
	`url` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`ctag` text,
	CONSTRAINT `fk_calendars_sourceId_calendar_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `calendar_sources`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`calendarId` integer NOT NULL,
	`href` text NOT NULL,
	`etag` text,
	`uid` text NOT NULL,
	`ics` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`location` text,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`allDay` integer DEFAULT false NOT NULL,
	`recurring` integer DEFAULT false NOT NULL,
	`recurUntil` integer,
	CONSTRAINT `fk_events_calendarId_calendars_id_fk` FOREIGN KEY (`calendarId`) REFERENCES `calendars`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendars_source_url` ON `calendars` (`sourceId`,`url`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_calendar_href` ON `events` (`calendarId`,`href`);--> statement-breakpoint
CREATE INDEX `events_calendar_start` ON `events` (`calendarId`,`start`);
ALTER TABLE `message_bodies` ADD `calendar` text;--> statement-breakpoint
ALTER TABLE `message_bodies` ADD `calendarResponse` text;--> statement-breakpoint
CREATE INDEX `events_uid` ON `events` (`uid`);
ALTER TABLE `message_bodies` ADD `attachmentText` text;--> statement-breakpoint
-- Attachment text joins the body column of the search index (see the search
-- migration), so a word in a PDF finds its message.
DROP TRIGGER `message_bodies_fts_insert`;
--> statement-breakpoint
DROP TRIGGER `message_bodies_fts_update`;
--> statement-breakpoint
CREATE TRIGGER `message_bodies_fts_insert` AFTER INSERT ON `message_bodies` BEGIN
	UPDATE `messages_fts`
	SET body = coalesce(new.text, '') || char(10) || coalesce(new.attachmentText, '')
	WHERE rowid = new.messageId;
END;
--> statement-breakpoint
CREATE TRIGGER `message_bodies_fts_update` AFTER UPDATE OF text, attachmentText ON `message_bodies` BEGIN
	UPDATE `messages_fts`
	SET body = coalesce(new.text, '') || char(10) || coalesce(new.attachmentText, '')
	WHERE rowid = new.messageId;
END;

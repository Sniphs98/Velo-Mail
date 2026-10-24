-- Full-text search over subject, sender and body (phase 7). The FTS row's
-- rowid is the message's id; triggers keep it in step with messages and
-- message_bodies. HTML-only mails get their text body extracted when stored.
CREATE VIRTUAL TABLE `messages_fts` USING fts5(
	subject,
	sender,
	body,
	tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `messages_fts_insert` AFTER INSERT ON `messages` BEGIN
	INSERT INTO `messages_fts` (rowid, subject, sender, body)
	VALUES (new.id, new.subject, trim(coalesce(new.fromName, '') || ' ' || coalesce(new.fromAddress, '')), '');
END;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_update` AFTER UPDATE OF subject, fromName, fromAddress ON `messages` BEGIN
	UPDATE `messages_fts`
	SET subject = new.subject,
		sender = trim(coalesce(new.fromName, '') || ' ' || coalesce(new.fromAddress, ''))
	WHERE rowid = new.id;
END;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_delete` AFTER DELETE ON `messages` BEGIN
	DELETE FROM `messages_fts` WHERE rowid = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER `message_bodies_fts_insert` AFTER INSERT ON `message_bodies` BEGIN
	UPDATE `messages_fts` SET body = coalesce(new.text, '') WHERE rowid = new.messageId;
END;
--> statement-breakpoint
CREATE TRIGGER `message_bodies_fts_update` AFTER UPDATE OF text ON `message_bodies` BEGIN
	UPDATE `messages_fts` SET body = coalesce(new.text, '') WHERE rowid = new.messageId;
END;

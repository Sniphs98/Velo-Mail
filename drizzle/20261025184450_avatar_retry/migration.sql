-- The lookup finds more logos now (big home pages, www., mail providers'
-- own mails, DuckDuckGo icons): misses are looked up again.
DELETE FROM `sender_avatars` WHERE `source` = 'none';

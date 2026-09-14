# MongoDB Backup & Restore

Since MongoDB is self-hosted, regular backups are essential.

## Backup (mongodump)

Run the following command to create a backup archive:

```bash
mongodump --db wibby --archive=/path/to/backup/wibby-$(date +%F).archive
```

We recommend a cron job to push this archive to Oracle Cloud Object Storage daily.

## Restore (mongorestore)

To restore from an archive:

```bash
mongorestore --archive=/path/to/backup/wibby-YYYY-MM-DD.archive --drop
```

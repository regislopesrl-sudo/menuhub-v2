-- Add a dedicated App Garcom channel.
-- Existing legacy waiter orders may still be stored as QR with internalNotes.sourceChannel = "waiter_app".
ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'WAITER_APP';

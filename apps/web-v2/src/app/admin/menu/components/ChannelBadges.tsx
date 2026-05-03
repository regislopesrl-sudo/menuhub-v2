import { Badge } from '@/components/ui/Badge';
import type { MenuProduct } from '@/features/menu/menu.mock';
import { CHANNEL_LABELS } from '../menu-view-model';
import styles from '../page.module.css';

export function ChannelBadges({ channels }: { channels?: MenuProduct['channels'] }) {
  return (
    <div className={styles.channelRow}>
      {CHANNEL_LABELS.map((channel) => (
        <Badge key={channel.key} tone={channels?.[channel.key] ? 'success' : 'default'}>
          {channel.label}
        </Badge>
      ))}
    </div>
  );
}

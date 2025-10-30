
import { ReactNode } from 'react';

export type HistoryItemType = 'command' | 'output' | 'system' | 'error';

export interface HistoryItem {
  type: HistoryItemType;
  content: ReactNode;
  id: number;
}

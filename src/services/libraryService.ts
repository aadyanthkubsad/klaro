/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LibraryItem } from '../types';

export const generateId = () => Math.random().toString(36).substring(2, 11);

export const updateLibraryItems = (prev: LibraryItem[], item: Partial<LibraryItem>): LibraryItem[] => {
  const existingIndex = prev.findIndex(i => i.title === item.title);
  
  if (existingIndex !== -1) {
    const updated = [...prev];
    updated[existingIndex] = {
      ...updated[existingIndex],
      progress: Math.min(100, (updated[existingIndex].progress + 10)),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    };
    return updated;
  }

  const newItem: LibraryItem = {
    id: generateId(),
    title: item.title || 'Untitled Knowledge',
    type: item.type as any || 'readwrite',
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    progress: item.progress || Math.floor(Math.random() * 40) + 10,
    contentSnippet: item.contentSnippet || 'No summary available for this learning hub.',
    tags: item.tags || [item.type || 'readwrite', 'saved']
  };
  
  return [newItem, ...prev];
};

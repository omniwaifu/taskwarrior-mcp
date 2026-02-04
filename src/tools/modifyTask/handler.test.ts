import { describe, it, expect, vi, beforeEach } from 'vitest';
import { modifyTaskHandler } from './handler.js';
import * as taskwarrior from '../../utils/taskwarrior.js';
import type { TaskWarriorTask } from '../../types/task.js';

// Mock the taskwarrior module
vi.mock('../../utils/taskwarrior.js', () => ({
  executeTaskWarriorCommandRaw: vi.fn(),
  getTaskByUuid: vi.fn(),
}));

// Helper to create mock tasks with required fields
function createMockTask(overrides: Partial<TaskWarriorTask> = {}): TaskWarriorTask {
  return {
    id: 1,
    uuid: '12345678-1234-1234-1234-123456789abc',
    description: 'Test task',
    status: 'pending' as const,
    entry: '20240101T000000Z',
    ...overrides,
  };
}

describe('modifyTaskHandler', () => {
  const mockUuid = '12345678-1234-1234-1234-123456789abc';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addTags', () => {
    it('should add tags without modifying description', async () => {
      const existingTask = createMockTask({
        description: 'Original description',
      });

      const updatedTask = createMockTask({
        description: 'Original description',
        tags: ['newtag'],
      });

      vi.mocked(taskwarrior.getTaskByUuid)
        .mockResolvedValueOnce(existingTask)
        .mockResolvedValueOnce(updatedTask);

      vi.mocked(taskwarrior.executeTaskWarriorCommandRaw).mockReturnValue('');

      const result = await modifyTaskHandler({
        uuid: mockUuid,
        addTags: ['newtag'],
      });

      // Verify the command was constructed correctly
      const commandArgs = vi.mocked(taskwarrior.executeTaskWarriorCommandRaw).mock.calls[0][0];

      // The command should use tags: syntax, not +tag syntax
      // This is because +tag syntax fails with UUID-based task identification
      expect(commandArgs.join(' ')).toContain('tags:');
      expect(commandArgs.join(' ')).not.toContain('+newtag');

      expect(result.status).toBe('success');
    });

    it('should preserve existing tags when adding new ones', async () => {
      const existingTask = createMockTask({
        tags: ['existing'],
      });

      const updatedTask = createMockTask({
        tags: ['existing', 'newtag'],
      });

      vi.mocked(taskwarrior.getTaskByUuid)
        .mockResolvedValueOnce(existingTask)
        .mockResolvedValueOnce(updatedTask);

      vi.mocked(taskwarrior.executeTaskWarriorCommandRaw).mockReturnValue('');

      await modifyTaskHandler({
        uuid: mockUuid,
        addTags: ['newtag'],
      });

      const commandArgs = vi.mocked(taskwarrior.executeTaskWarriorCommandRaw).mock.calls[0][0];
      const commandString = commandArgs.join(' ');

      // Should include both existing and new tags
      expect(commandString).toContain('tags:');
      expect(commandString).toMatch(/tags:.*existing/);
      expect(commandString).toMatch(/tags:.*newtag/);
    });

    it('should handle multiple new tags', async () => {
      const existingTask = createMockTask();

      const updatedTask = createMockTask({
        tags: ['tag1', 'tag2'],
      });

      vi.mocked(taskwarrior.getTaskByUuid)
        .mockResolvedValueOnce(existingTask)
        .mockResolvedValueOnce(updatedTask);

      vi.mocked(taskwarrior.executeTaskWarriorCommandRaw).mockReturnValue('');

      await modifyTaskHandler({
        uuid: mockUuid,
        addTags: ['tag1', 'tag2'],
      });

      const commandArgs = vi.mocked(taskwarrior.executeTaskWarriorCommandRaw).mock.calls[0][0];
      const commandString = commandArgs.join(' ');

      // Should use tags: syntax with comma-separated values
      expect(commandString).toContain('tags:');
      expect(commandString).toMatch(/tags:tag1,tag2|tags:tag2,tag1/);
    });

    it('should deduplicate when adding a tag that already exists', async () => {
      const existingTask = createMockTask({
        tags: ['existing'],
      });

      vi.mocked(taskwarrior.getTaskByUuid)
        .mockResolvedValueOnce(existingTask)
        .mockResolvedValueOnce(existingTask);

      vi.mocked(taskwarrior.executeTaskWarriorCommandRaw).mockReturnValue('');

      await modifyTaskHandler({
        uuid: mockUuid,
        addTags: ['existing', 'newtag'],
      });

      const commandArgs = vi.mocked(taskwarrior.executeTaskWarriorCommandRaw).mock.calls[0][0];
      const commandString = commandArgs.join(' ');

      // Should not have duplicates
      const tagsMatch = commandString.match(/tags:([^\s]+)/);
      expect(tagsMatch).toBeTruthy();
      const tags = tagsMatch![1].split(',');
      expect(tags.filter(t => t === 'existing').length).toBe(1);
    });
  });

  describe('removeTags', () => {
    it('should remove tags using tags: syntax', async () => {
      const existingTask = createMockTask({
        tags: ['keep', 'remove'],
      });

      const updatedTask = createMockTask({
        tags: ['keep'],
      });

      vi.mocked(taskwarrior.getTaskByUuid)
        .mockResolvedValueOnce(existingTask)
        .mockResolvedValueOnce(updatedTask);

      vi.mocked(taskwarrior.executeTaskWarriorCommandRaw).mockReturnValue('');

      await modifyTaskHandler({
        uuid: mockUuid,
        removeTags: ['remove'],
      });

      const commandArgs = vi.mocked(taskwarrior.executeTaskWarriorCommandRaw).mock.calls[0][0];
      const commandString = commandArgs.join(' ');

      // Should use tags: syntax, not -tag syntax
      expect(commandString).toContain('tags:');
      expect(commandString).not.toContain('-remove');
      expect(commandString).toContain('keep');
      expect(commandString).not.toMatch(/tags:.*remove/);
    });

    it('should clear all tags when removing the last one', async () => {
      const existingTask = createMockTask({
        tags: ['onlytag'],
      });

      const updatedTask = createMockTask({
        tags: [],
      });

      vi.mocked(taskwarrior.getTaskByUuid)
        .mockResolvedValueOnce(existingTask)
        .mockResolvedValueOnce(updatedTask);

      vi.mocked(taskwarrior.executeTaskWarriorCommandRaw).mockReturnValue('');

      await modifyTaskHandler({
        uuid: mockUuid,
        removeTags: ['onlytag'],
      });

      const commandArgs = vi.mocked(taskwarrior.executeTaskWarriorCommandRaw).mock.calls[0][0];
      const commandString = commandArgs.join(' ');

      // Should clear tags with empty tags:
      expect(commandString).toContain('tags:');
    });
  });

  describe('addTags and removeTags together', () => {
    it('should handle both adding and removing tags in one operation', async () => {
      const existingTask = createMockTask({
        tags: ['keep', 'remove'],
      });

      const updatedTask = createMockTask({
        tags: ['keep', 'new'],
      });

      vi.mocked(taskwarrior.getTaskByUuid)
        .mockResolvedValueOnce(existingTask)
        .mockResolvedValueOnce(updatedTask);

      vi.mocked(taskwarrior.executeTaskWarriorCommandRaw).mockReturnValue('');

      await modifyTaskHandler({
        uuid: mockUuid,
        addTags: ['new'],
        removeTags: ['remove'],
      });

      const commandArgs = vi.mocked(taskwarrior.executeTaskWarriorCommandRaw).mock.calls[0][0];
      const commandString = commandArgs.join(' ');

      // Should use tags: syntax with the final computed tags
      expect(commandString).toContain('tags:');
      expect(commandString).toContain('keep');
      expect(commandString).toContain('new');
      expect(commandString).not.toMatch(/tags:.*remove[,\s]|tags:.*remove$/);
    });
  });
});

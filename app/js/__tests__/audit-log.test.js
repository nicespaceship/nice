import { describe, it, expect, beforeEach } from 'vitest';

// AuditLog is loaded globally by setup.js

describe('AuditLog', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should start with no entries', () => {
    const entries = AuditLog.getEntries();
    expect(entries).toHaveLength(0);
  });

  it('should log an entry', () => {
    AuditLog.log('navigation', { path: '/', description: 'Navigated to Home' });
    const entries = AuditLog.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('navigation');
    expect(entries[0].details.path).toBe('/');
  });

  it('should log multiple entries', () => {
    AuditLog.log('navigation', { path: '/' });
    AuditLog.log('agent', { name: 'Nova' });
    AuditLog.log('mission', { title: 'Test Mission' });
    expect(AuditLog.getEntries()).toHaveLength(3);
  });

  it('should return entries in reverse chronological order', () => {
    AuditLog.log('navigation', { description: 'first' });
    AuditLog.log('agent', { description: 'second' });
    const entries = AuditLog.getEntries();
    expect(entries[0].details.description).toBe('second');
    expect(entries[1].details.description).toBe('first');
  });

  it('should filter by action category', () => {
    AuditLog.log('navigation', { path: '/' });
    AuditLog.log('agent', { name: 'Nova' });
    AuditLog.log('navigation', { path: '/agents' });
    const navEntries = AuditLog.getEntries({ action: 'navigation' });
    expect(navEntries).toHaveLength(2);
    const agentEntries = AuditLog.getEntries({ action: 'agent' });
    expect(agentEntries).toHaveLength(1);
  });

  it('should filter by search term', () => {
    AuditLog.log('agent', { description: 'Created agent Nova' });
    AuditLog.log('agent', { description: 'Created agent Atlas' });
    const results = AuditLog.getEntries({ search: 'Nova' });
    expect(results).toHaveLength(1);
    expect(results[0].details.description).toContain('Nova');
  });

  it('should respect limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      AuditLog.log('navigation', { description: `Entry ${i}` });
    }
    const limited = AuditLog.getEntries({ limit: 5 });
    expect(limited).toHaveLength(5);
  });

  it('should enforce max 500 entries (FIFO)', () => {
    for (let i = 0; i < 510; i++) {
      AuditLog.log('navigation', { description: `Entry ${i}` });
    }
    const all = AuditLog.getEntries();
    expect(all.length).toBeLessThanOrEqual(500);
  });

  it('should clear all entries', () => {
    AuditLog.log('navigation', { path: '/' });
    AuditLog.log('agent', { name: 'test' });
    AuditLog.clearEntries();
    expect(AuditLog.getEntries()).toHaveLength(0);
  });

  it('should count entries correctly', () => {
    AuditLog.log('navigation', { path: '/' });
    AuditLog.log('agent', { name: 'test' });
    expect(AuditLog.count()).toBe(2);
  });

  it('should include timestamp and id on entries', () => {
    AuditLog.log('system', { description: 'Test' });
    const entries = AuditLog.getEntries();
    expect(entries[0]).toHaveProperty('id');
    expect(entries[0]).toHaveProperty('timestamp');
    expect(new Date(entries[0].timestamp).getTime()).toBeGreaterThan(0);
  });
});

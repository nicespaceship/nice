/**
 * PromptPanel._detectIntent: which chat messages the panel handles itself
 * (navigation, the Crew Designer) instead of sending them to the model.
 * "project" is an everyday business word, so it must only trigger those
 * when the message clearly asks for one.
 */

import { describe, it, expect } from 'vitest';
import { installViewMocks, loadModule } from './helpers/view-harness.js';

installViewMocks();
loadModule('lib/terminology.js');
loadModule('lib/nav-commands.js');
loadModule('views/prompt-panel.js');

const handledByPanel = (text) => {
  const r = PromptPanel._detectIntent(text);
  return r && (r.isNav || r.commandId === 'open-crew-designer') ? r.commandId : null;
};

describe('PromptPanel._detectIntent', () => {
  it.each([
    'Create a project plan for my bakery launch',
    'Make a project timeline for the kitchen remodel',
    'Build a project budget spreadsheet',
    'Set up a project tracker in Notion',
    'Create a new project proposal for a client',
    'Review my project plan',
    'Can you review this project proposal?',
    'Give me an overview of the project',
    'Preview the project announcement',
    'can you review this code',
    'Stop project creep on the redesign',
  ])('sends "%s" to the model', (text) => {
    expect(handledByPanel(text)).toBeNull();
  });

  it.each([
    ['Set up a project for my business', 'open-crew-designer'],
    ['Create a project', 'open-crew-designer'],
    ['Build me a spaceship for my bakery', 'open-crew-designer'],
    ['Assemble a team to run my salon', 'open-crew-designer'],
    ['show me agents', 'open-agents'],
    ['open settings', 'open-settings'],
    ['go to missions', 'open-missions'],
  ])('handles "%s" itself', (text, commandId) => {
    expect(handledByPanel(text)).toBe(commandId);
  });

  it('seeds the Crew Designer with the business it was asked about', () => {
    expect(PromptPanel._detectIntent('Set up a project for my bakery').params.prompt).toBe('bakery');
  });
});
